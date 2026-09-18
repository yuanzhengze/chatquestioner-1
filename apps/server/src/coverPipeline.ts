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
import type { SessionStore } from "./sessionStore.js";

export interface PublicCover {
  status: CoverStatus;
  fingerprint: string;
  imageUrl?: string;
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
  ) {}

  publicCover(state: ConversationState, sessionId: string): PublicCover {
    harvestIntoState(state);
    scrubUngroundedState(state);
    const model = toGddModel(state);
    const fingerprint = coverFingerprint(model);
    const meta = state.cover;
    if (
      meta?.status === "ready"
      && meta.fingerprint === fingerprint
      && this.covers.has("session", sessionId)
    ) {
      const stamp = meta.generatedAt ? `${fingerprint}.${meta.generatedAt}` : fingerprint;
      return { status: "ready", fingerprint, imageUrl: coverImagePath("session", sessionId, stamp) };
    }
    if (meta?.status === "pending" && meta.fingerprint === fingerprint) {
      return { status: "pending", fingerprint };
    }
    if (meta?.status === "failed" && meta.fingerprint === fingerprint) {
      return { status: "failed", fingerprint };
    }
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
      const stamp = loaded.cover.generatedAt ? `${fingerprint}.${loaded.cover.generatedAt}` : fingerprint;
      return { status: "ready", fingerprint, imageUrl: coverImagePath("session", sessionId, stamp) };
    }

    if (!this.image) {
      loaded.cover = { fingerprint, prompt, status: "failed" };
      await this.store.save(sessionId, loaded);
      return { status: "failed", fingerprint };
    }

    const key = `${sessionId}:${fingerprint}`;
    if (!this.inflight.has(key)) {
      loaded.cover = { fingerprint, prompt, status: "pending" };
      await this.store.save(sessionId, loaded);
      const job = this.run(sessionId, fingerprint, prompt).finally(() => {
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

  private async run(sessionId: string, fingerprint: string, prompt: string): Promise<void> {
    if (!this.image) return;
    try {
      const img = await this.image.generate(prompt);
      this.covers.writeSession(sessionId, img.bytes);
      const latest = await this.store.load(sessionId);
      if (!latest) return;
      const live = normalizeConversationState(structuredClone(latest) as ConversationState);
      harvestIntoState(live);
      scrubUngroundedState(live);
      if (coverFingerprint(toGddModel(live)) !== fingerprint) return;
      latest.cover = { fingerprint, prompt, status: "ready", mime: img.mime, generatedAt: Date.now() };
      await this.store.save(sessionId, latest);
      console.log(`[cover] ready session=${sessionId} bytes=${img.bytes.length} mime=${img.mime}`);
      this.onSessionCoverReady?.(sessionId);
    } catch (err) {
      console.error("[cover] generate failed:", err);
      const latest = await this.store.load(sessionId);
      if (!latest) return;
      if (latest.cover?.fingerprint === fingerprint) {
        latest.cover = { fingerprint, prompt, status: "failed", mime: latest.cover.mime };
        await this.store.save(sessionId, latest);
      }
    }
  }
}
