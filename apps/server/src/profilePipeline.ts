import {
  normalizeConversationState,
  toGddModel,
  type LlmClient,
} from "@cq/conversation";
import {
  classificationCorpus,
  classificationMessages,
  isSubstantive,
  parseModelJson,
  profileFingerprint,
  validateClassification,
  type KeptTag,
} from "@cq/gdd";
import type { SessionMutex } from "./sessionMutex.js";
import type { SessionStore } from "./sessionStore.js";

async function complete(llm: LlmClient, messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
  let out = "";
  for await (const chunk of llm.stream(messages)) out += chunk;
  return out;
}

function clip(raw: string): string {
  return raw.length > 4000 ? raw.slice(0, 4000) : raw;
}

export class ProfilePipeline {
  private readonly running = new Set<string>();

  constructor(
    private readonly store: SessionStore,
    private readonly llm: LlmClient,
    private readonly lock: SessionMutex,
  ) {}

  schedule(sessionId: string): void {
    if (this.running.has(sessionId)) return;
    this.running.add(sessionId);
    void this.run(sessionId).catch((err) => {
      console.error("[profile] failed", err instanceof Error ? err.message : err);
    }).finally(() => {
      this.running.delete(sessionId);
    });
  }

  private async run(sessionId: string): Promise<void> {
    const loaded = await this.lock.run(sessionId, () => this.store.load(sessionId));
    if (!loaded) return;
    const state = normalizeConversationState(loaded);
    const model = toGddModel(state);
    if (!isSubstantive(model)) return;
    const fingerprint = profileFingerprint(model);
    const current = state.gameClassification;
    if (current && current.fingerprint === fingerprint && current.status === "ready") return;
    await this.lock.run(sessionId, async () => {
      const fresh = normalizeConversationState((await this.store.load(sessionId)) || state);
      fresh.gameClassification = {
        fingerprint,
        status: "pending",
        source: "model",
        genres: fresh.gameClassification?.fingerprint === fingerprint ? fresh.gameClassification.genres : [],
        tags: fresh.gameClassification?.fingerprint === fingerprint ? fresh.gameClassification.tags : [],
        debug: { retried: false, filtered: [] },
      };
      await this.store.save(sessionId, fresh);
    });

    const corpus = classificationCorpus(model);
    let raw = "";
    let retryRaw = "";
    let retried = false;
    try {
      raw = await complete(this.llm, classificationMessages(corpus));
      let validated = validateClassification(corpus, parseModelJson(raw));
      if (!validated.genres.length) {
        retried = true;
        const why = validated.filtered.map((row) => `${row.label || row.tagId}:${row.reason}`).join("；");
        retryRaw = await complete(this.llm, classificationMessages(corpus, `上一次没有留下类型。被拒绝：${why || "没有合法类型"}。请重新选择，仍然不要发明标签，也不要因为否定句选择被否定的类型。`));
        const second = validateClassification(corpus, parseModelJson(retryRaw));
        validated = {
          genres: second.genres,
          tags: second.tags.length ? second.tags : validated.tags,
          filtered: [...validated.filtered, ...second.filtered],
        };
      }
      await this.lock.run(sessionId, async () => {
        const fresh = normalizeConversationState((await this.store.load(sessionId)) || state);
        if (profileFingerprint(toGddModel(fresh)) !== fingerprint) return;
        fresh.gameClassification = {
          fingerprint,
          status: "ready",
          source: "model",
          genres: validated.genres,
          tags: validated.tags,
          debug: {
            retried,
            raw: clip(raw),
            retryRaw: retryRaw ? clip(retryRaw) : undefined,
            filtered: validated.filtered,
          },
          generatedAt: Date.now(),
        };
        await this.store.save(sessionId, fresh);
      });
      console.log(`[profile] ready session=${sessionId} genres=${validated.genres.length} tags=${validated.tags.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.lock.run(sessionId, async () => {
        const fresh = normalizeConversationState((await this.store.load(sessionId)) || state);
        if (profileFingerprint(toGddModel(fresh)) !== fingerprint) return;
        fresh.gameClassification = {
          fingerprint,
          status: "failed",
          source: "model",
          genres: [],
          tags: [],
          debug: { retried, raw: raw ? clip(raw) : undefined, retryRaw: retryRaw ? clip(retryRaw) : undefined, filtered: [], error: message.slice(0, 200) },
          generatedAt: Date.now(),
        };
        await this.store.save(sessionId, fresh);
      });
      console.error(`[profile] failed session=${sessionId}`);
    }
  }
}
