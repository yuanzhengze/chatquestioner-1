import {
  harvestIntoState,
  normalizeConversationState,
  scrubUngroundedState,
  toGddModel,
  type ConversationState,
} from "@cq/conversation";
import {
  gameplayImageFingerprint,
  gameplayImagePrompt,
  gameplayMomentsFromModel,
  presentGameplayStatus,
  rebindGameplayLineup,
  visualBibleFingerprint,
  type GameplayImageStatus,
  type GameplayMoment,
  type GddModel,
} from "@cq/gdd";
import type { GameplayStore } from "./gameplayStore.js";
import type { ImageGenerator } from "./imageClient.js";
import type { ImageGenerationQueue } from "./imageQueue.js";
import type { SessionMutex } from "./sessionMutex.js";
import type { SessionStore } from "./sessionStore.js";

export interface PublicGameplayItem {
  mechanicId: string;
  fingerprint: string;
  imageFingerprint?: string;
  /** 这一次生成的时间。内容指纹不变时，用它区分新文件。 */
  revision?: string;
  status: GameplayImageStatus;
  imageUrl?: string;
  error?: string;
}

export interface PublicGameplay {
  visualBibleFingerprint: string;
  items: PublicGameplayItem[];
}

interface Job {
  sessionId: string;
  mechanicId: string;
  fingerprint: string;
  prompt: string;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function gameplayImagePath(sessionId: string, mechanicId: string, stamp?: string): string {
  const q = stamp ? `?f=${encodeURIComponent(stamp)}` : "";
  return `/api/session/${sessionId}/gameplay/${mechanicId}${q}`;
}

export class GameplayPipeline {
  constructor(
    private readonly store: SessionStore,
    private readonly files: GameplayStore,
    private readonly image: ImageGenerator | null,
    private readonly queue: ImageGenerationQueue,
    private readonly gameplaySize: string,
    private readonly lock: SessionMutex,
  ) {}

  async list(sessionId: string): Promise<PublicGameplay | null> {
    return this.lock.run(sessionId, async () => {
      const loaded = await this.store.load(sessionId);
      if (!loaded) return null;
      const model = this.modelOf(loaded);
      const images = this.reconcile(sessionId, loaded, model);
      loaded.gameplayImages = images;
      await this.store.save(sessionId, loaded);
      return this.publish(sessionId, model, images);
    });
  }

  async startAll(sessionId: string): Promise<PublicGameplay | null> {
    return this.lock.run(sessionId, async () => {
      const loaded = await this.store.load(sessionId);
      if (!loaded) return null;
      const model = this.modelOf(loaded);
      const images = this.reconcile(sessionId, loaded, model);
      const bibleFp = visualBibleFingerprint(model);
      const fresh: Array<{ moment: GameplayMoment; fingerprint: string }> = [];
      for (const moment of gameplayMomentsFromModel(model)) {
        const currentFp = gameplayImageFingerprint(moment, bibleFp);
        const record = images.items[moment.id];
        const status = presentGameplayStatus(record, this.files.has(sessionId, moment.id), currentFp);
        if (status === "ready" || status === "pending" || status === "queued" || status === "stale" || status === "failed") continue;
        images.items[moment.id] = { mechanicId: moment.id, fingerprint: currentFp, status: "queued" };
        fresh.push({ moment, fingerprint: currentFp });
      }
      loaded.gameplayImages = images;
      await this.store.save(sessionId, loaded);
      for (const item of fresh) {
        this.enqueue(sessionId, item.moment, item.fingerprint, gameplayImagePrompt(model, item.moment), 1);
      }
      return this.publish(sessionId, model, images);
    });
  }

  async startOne(sessionId: string, mechanicId: string): Promise<PublicGameplay | null> {
    if (!SAFE_ID.test(mechanicId)) return null;
    return this.lock.run(sessionId, async () => {
      const loaded = await this.store.load(sessionId);
      if (!loaded) return null;
      const model = this.modelOf(loaded);
      const images = this.reconcile(sessionId, loaded, model);
      const moment = gameplayMomentsFromModel(model).find((item) => item.id === mechanicId);
      if (!moment) {
        loaded.gameplayImages = images;
        await this.store.save(sessionId, loaded);
        return this.publish(sessionId, model, images);
      }
      const currentFp = gameplayImageFingerprint(moment, visualBibleFingerprint(model));
      const status = presentGameplayStatus(images.items[moment.id], this.files.has(sessionId, moment.id), currentFp);
      if (status !== "pending" && status !== "queued") {
        images.items[moment.id] = { mechanicId: moment.id, fingerprint: currentFp, status: "queued" };
        loaded.gameplayImages = images;
        await this.store.save(sessionId, loaded);
        this.enqueue(sessionId, moment, currentFp, gameplayImagePrompt(model, moment), 2);
      } else {
        loaded.gameplayImages = images;
        await this.store.save(sessionId, loaded);
      }
      return this.publish(sessionId, model, images);
    });
  }

  private enqueue(sessionId: string, moment: GameplayMoment, fingerprint: string, prompt: string, priority: number): void {
    const job: Job = { sessionId, mechanicId: moment.id, fingerprint, prompt };
    this.queue.enqueue({
      id: `gameplay:${sessionId}:${moment.id}:${fingerprint}`,
      priority,
      run: () => this.execute(job),
    });
  }

  private async execute(job: Job): Promise<void> {
    let proceed = false;
    await this.lock.run(job.sessionId, async () => {
      const loaded = await this.store.load(job.sessionId);
      if (!loaded) return;
      const model = this.modelOf(loaded);
      const images = this.reconcile(job.sessionId, loaded, model);
      const moment = gameplayMomentsFromModel(model).find((item) => item.id === job.mechanicId);
      const currentFp = moment ? gameplayImageFingerprint(moment, visualBibleFingerprint(model)) : "";
      if (!moment || currentFp !== job.fingerprint) {
        loaded.gameplayImages = images;
        await this.store.save(job.sessionId, loaded);
        return;
      }
      const existing = images.items[moment.id];
      if (existing?.status === "pending" && existing.fingerprint === job.fingerprint) {
        loaded.gameplayImages = images;
        await this.store.save(job.sessionId, loaded);
        return;
      }
      if (!this.image) {
        images.items[moment.id] = {
          mechanicId: moment.id,
          fingerprint: job.fingerprint,
          status: "failed",
          error: "未配置生图",
        };
        loaded.gameplayImages = images;
        await this.store.save(job.sessionId, loaded);
        return;
      }
      images.items[moment.id] = {
        mechanicId: moment.id,
        fingerprint: job.fingerprint,
        status: "pending",
      };
      loaded.gameplayImages = images;
      await this.store.save(job.sessionId, loaded);
      proceed = true;
    });

    if (!proceed || !this.image) return;
    let generated: { bytes: Buffer; mime: "image/png" | "image/jpeg" | "image/webp" } | null = null;
    let error = "";
    try {
      generated = await this.image.generate(job.prompt, { size: this.gameplaySize });
    } catch (err) {
      error = err instanceof Error ? err.message : "generate failed";
    }

    await this.lock.run(job.sessionId, async () => {
      const loaded = await this.store.load(job.sessionId);
      if (!loaded) return;
      const model = this.modelOf(loaded);
      const images = this.reconcile(job.sessionId, loaded, model);
      const moment = gameplayMomentsFromModel(model).find((item) => item.id === job.mechanicId);
      const record = images.items[job.mechanicId];
      if (!moment || !record || record.fingerprint !== job.fingerprint || record.status !== "pending") {
        loaded.gameplayImages = images;
        await this.store.save(job.sessionId, loaded);
        return;
      }
      if (!generated) {
        images.items[job.mechanicId] = {
          ...record,
          status: "failed",
          error: error.slice(0, 200) || "generate failed",
        };
      } else {
        this.files.write(job.sessionId, job.mechanicId, generated.bytes);
        const currentFp = gameplayImageFingerprint(moment, visualBibleFingerprint(model));
        images.items[job.mechanicId] = {
          mechanicId: job.mechanicId,
          fingerprint: job.fingerprint,
          status: currentFp === job.fingerprint ? "ready" : "stale",
          mime: generated.mime,
          generatedAt: Date.now(),
        };
        console.log(`[gameplay] ${images.items[job.mechanicId].status} session=${job.sessionId} mechanic=${job.mechanicId} bytes=${generated.bytes.length}`);
      }
      loaded.gameplayImages = images;
      await this.store.save(job.sessionId, loaded);
    });
  }

  private modelOf(state: ConversationState): GddModel {
    const copy = normalizeConversationState(structuredClone(state));
    harvestIntoState(copy);
    scrubUngroundedState(copy);
    return toGddModel(copy);
  }

  private bag(state: ConversationState): NonNullable<ConversationState["gameplayImages"]> {
    if (!state.gameplayImages) state.gameplayImages = { lineup: [], items: {} };
    if (!state.gameplayImages.items) state.gameplayImages.items = {};
    if (!Array.isArray(state.gameplayImages.lineup)) state.gameplayImages.lineup = [];
    return state.gameplayImages;
  }

  private reconcile(sessionId: string, state: ConversationState, model: GddModel): NonNullable<ConversationState["gameplayImages"]> {
    const images = this.bag(state);
    const moments = gameplayMomentsFromModel(model);
    const currentIds = moments.map((moment) => moment.id);
    const moves = rebindGameplayLineup(images.lineup, currentIds, Object.keys(images.items));
    for (const move of moves) {
      const prev = images.items[move.from];
      if (!prev || images.items[move.to]) continue;
      this.files.copy(sessionId, move.from, move.to);
      images.items[move.to] = { ...prev, mechanicId: move.to, status: "stale" };
      delete images.items[move.from];
      this.files.remove(sessionId, move.from);
    }
    images.lineup = currentIds;
    return images;
  }

  /**
   * 只读：用会话里已有的玩法图记录和文件，按 publish 同一套规则给出每张图的状态和地址。
   * 不对账、不落盘、不排队、不生图。分享快照 / 首页示例用，地址由调用方换成快照自己的路径。
   */
  peek(
    sessionId: string,
    state: ConversationState,
    model: GddModel,
    imageUrl: (mechanicId: string, revision: string) => string,
  ): PublicGameplay {
    const images = {
      lineup: state.gameplayImages?.lineup || [],
      items: state.gameplayImages?.items || {},
    };
    return this.publish(sessionId, model, images, imageUrl);
  }

  private publish(
    sessionId: string,
    model: GddModel,
    images: NonNullable<ConversationState["gameplayImages"]>,
    imageUrl: (mechanicId: string, revision: string) => string = (mechanicId, revision) =>
      gameplayImagePath(sessionId, mechanicId, revision),
  ): PublicGameplay {
    const bibleFp = visualBibleFingerprint(model);
    const items = gameplayMomentsFromModel(model).map((moment) => {
      const record = images.items[moment.id];
      const fingerprint = gameplayImageFingerprint(moment, bibleFp);
      const hasFile = this.files.has(sessionId, moment.id);
      const status = presentGameplayStatus(record, hasFile, fingerprint);
      const revision = record?.generatedAt ? String(record.generatedAt) : "";
      const showImage = (status === "ready" || status === "stale") && hasFile;
      return {
        mechanicId: moment.id,
        fingerprint,
        imageFingerprint: record?.fingerprint,
        revision,
        status,
        imageUrl: showImage ? imageUrl(moment.id, revision) : undefined,
        error: status === "failed" ? record?.error : undefined,
      };
    });
    return { visualBibleFingerprint: bibleFp, items };
  }
}

