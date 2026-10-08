import {
  harvestIntoState,
  normalizeConversationState,
  scrubUngroundedState,
  toGddModel,
  type ConversationState,
} from "@cq/conversation";
import {
  coverFingerprint,
  coverPromptFromModel,
  isSubstantive,
  toGddView,
  type CoverStatus,
  type GddModel,
  type GddView,
} from "@cq/gdd";
import type { CoverStore } from "./coverStore.js";
import type { ImageGenerator } from "./imageClient.js";
import type { ImageGenerationQueue } from "./imageQueue.js";
import type { SessionMutex } from "./sessionMutex.js";
import type { SessionStore } from "./sessionStore.js";

export interface PublicCover {
  status: CoverStatus;
  fingerprint: string;
  imageUrl?: string;
}

/** 盘上这张图的版本。旧会话没有 generatedAt 时退回它的指纹。 */
export function coverFileStamp(meta: ConversationState["cover"]): string {
  if (meta?.generatedAt) return String(meta.generatedAt);
  return meta?.fingerprint || "cover";
}

export function coverImagePath(kind: "session" | "share", id: string, fingerprint?: string): string {
  const q = fingerprint ? `?f=${encodeURIComponent(fingerprint)}` : "";
  return kind === "session" ? `/api/session/${id}/cover${q}` : `/api/share/${id}/cover${q}`;
}

/** 会话里一旦有过封面（成功/失败/已有文件），compile 不再自动生图。 */
export function shouldAutoEnsureCover(
  state: ConversationState,
  hasFile: boolean,
): boolean {
  const status = state.cover?.status;
  if (status === "ready" || status === "failed") return false;
  if (hasFile) return false;
  return true;
}

export class CoverPipeline {
  private readonly inflight = new Map<string, Promise<void>>();
  onSessionCoverReady?: (sessionId: string) => void;

  constructor(
    private readonly store: SessionStore,
    private readonly covers: CoverStore,
    private readonly image: ImageGenerator | null,
    private readonly queue: ImageGenerationQueue,
    private readonly lock: SessionMutex,
  ) {}

  /**
   * 封面属于会话。盘上有图就给图：文档改了只是 stale，重画中和重画失败也先留着旧图。
   * 地址只跟这张图本身走（generatedAt），同一张图换状态不换地址。
   */
  publicCover(state: ConversationState, sessionId: string): PublicCover {
    harvestIntoState(state);
    scrubUngroundedState(state);
    const model = toGddModel(state);
    const fingerprint = coverFingerprint(model);
    const meta = state.cover;
    const imageUrl = this.covers.has("session", sessionId)
      ? coverImagePath("session", sessionId, coverFileStamp(meta))
      : undefined;
    if (meta?.fingerprint === fingerprint) {
      if (meta.status === "ready" && imageUrl) return { status: "ready", fingerprint, imageUrl };
      if (meta.status === "pending") return { status: "pending", fingerprint, imageUrl };
      if (meta.status === "failed") return { status: "failed", fingerprint, imageUrl };
    }
    if (imageUrl) return { status: "stale", fingerprint, imageUrl };
    return { status: "idle", fingerprint };
  }

  viewFor(model: GddModel, state: ConversationState, sessionId: string): GddView {
    return toGddView(model, this.publicCover(state, sessionId));
  }

  schedule(sessionId: string): void {
    if (!this.image) return;
    void this.ensure(sessionId).catch((err) => {
      console.error("[cover] schedule failed:", err);
    });
  }

  async ensure(sessionId: string, opts?: { force?: boolean }): Promise<PublicCover> {
    return this.lock.run(sessionId, () => this.ensureLocked(sessionId, opts));
  }

  private async ensureLocked(sessionId: string, opts?: { force?: boolean }): Promise<PublicCover> {
    const loaded = await this.store.load(sessionId);
    if (!loaded) return { status: "idle", fingerprint: "" };
    const state = normalizeConversationState(structuredClone(loaded) as ConversationState);
    harvestIntoState(state);
    scrubUngroundedState(state);
    const model = toGddModel(state);
    if (!isSubstantive(model)) return { status: "idle", fingerprint: coverFingerprint(model) };

    const fingerprint = coverFingerprint(model);
    const prompt = coverPromptFromModel(model);
    if (
      !opts?.force
      && loaded.cover?.status === "ready"
      && loaded.cover.fingerprint === fingerprint
      && this.covers.has("session", sessionId)
    ) {
      return { status: "ready", fingerprint, imageUrl: coverImagePath("session", sessionId, coverFileStamp(loaded.cover)) };
    }

    /** mime 和 generatedAt 描述的是盘上那张图，换状态时不能丢。 */
    const file = { mime: loaded.cover?.mime, generatedAt: loaded.cover?.generatedAt };
    if (!this.image) {
      loaded.cover = { fingerprint, prompt, status: "failed", ...file };
      await this.store.save(sessionId, loaded);
      return { status: "failed", fingerprint };
    }

    const key = `${sessionId}:${fingerprint}`;
    if (!this.inflight.has(key)) {
      loaded.cover = { fingerprint, prompt, status: "pending", ...file };
      await this.store.save(sessionId, loaded);
      const jobId = `cover:${sessionId}:${fingerprint}`;
      const job = new Promise<void>((resolve) => {
        const accepted = this.queue.enqueue({
          id: jobId,
          priority: 0,
          run: async () => {
            try {
              await this.generateCover(sessionId, fingerprint, prompt);
            } finally {
              resolve();
            }
          },
        });
        if (!accepted) resolve();
      }).finally(() => {
        this.inflight.delete(key);
      });
      this.inflight.set(key, job);
    }
    return { status: "pending", fingerprint };
  }

  copyToShare(sessionId: string, shareId: string): string | undefined {
    if (!this.covers.copySessionToShare(sessionId, shareId)) return undefined;
    return coverImagePath("share", shareId);
  }

  private async generateCover(sessionId: string, fingerprint: string, prompt: string): Promise<void> {
    if (!this.image) return;
    try {
      const img = await this.image.generate(prompt);
      this.covers.writeSession(sessionId, img.bytes);
      await this.lock.run(sessionId, async () => {
        const latest = await this.store.load(sessionId);
        if (!latest) return;
        const live = normalizeConversationState(structuredClone(latest) as ConversationState);
        harvestIntoState(live);
        scrubUngroundedState(live);
        const generatedAt = Date.now();
        /** 盘上已经换成这张新图了。文档在画图期间又改了，就记成这一版的 ready，对外是 stale。 */
        if (!latest.cover || latest.cover.fingerprint === fingerprint) {
          latest.cover = { fingerprint, prompt, status: "ready", mime: img.mime, generatedAt };
        } else {
          latest.cover = { ...latest.cover, mime: img.mime, generatedAt };
        }
        await this.store.save(sessionId, latest);
        if (coverFingerprint(toGddModel(live)) !== fingerprint) return;
        console.log(`[cover] ready session=${sessionId} bytes=${img.bytes.length} mime=${img.mime}`);
        this.onSessionCoverReady?.(sessionId);
      });
    } catch (err) {
      console.error("[cover] generate failed:", err);
      await this.lock.run(sessionId, async () => {
        const latest = await this.store.load(sessionId);
        if (!latest) return;
        if (latest.cover?.fingerprint === fingerprint) {
          latest.cover = { ...latest.cover, fingerprint, prompt, status: "failed" };
          await this.store.save(sessionId, latest);
        }
      });
    }
  }
}
