import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createInitialState } from "@cq/conversation";
import { Repository } from "../src/repository.js";
import { createTestRepo } from "../src/testing.js";

let repo: Repository;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ repo, close } = await createTestRepo());
});
afterEach(async () => {
  await close();
});

function readyState() {
  const s = createInitialState();
  s.workingTitle = "三消糖果";
  s.pitch = "三消糖果消除小游戏";
  s.engineering = {
    dimension: "2D", engine: "pixijs", platform: ["mobile"],
    modalities: ["image"], genre: "match-3", mechanics: ["swap-match"],
    artStyle: "cartoon", intentTerms: ["消除"], signatureTerms: [],
  };
  return s;
}

describe("Repository sessions", () => {
  it("create / load / save round-trip", async () => {
    const id = await repo.createSession(createInitialState());
    expect(await repo.loadSession(id)).not.toBeNull();
    const s = readyState();
    await repo.saveSession(id, s);
    const loaded = await repo.loadSession(id);
    expect(loaded?.workingTitle).toBe("三消糖果");
  });

  it("createSessionWithId 幂等（onConflictDoNothing）", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    await repo.createSessionWithId(id, createInitialState());
    const s = readyState();
    // 第二次同 id：不应覆盖
    await repo.createSessionWithId(id, s);
    const loaded = await repo.loadSession(id);
    expect(loaded?.workingTitle).toBeUndefined();
  });

  it("listSessionSummaries 含 artifactCount", async () => {
    const id = await repo.createSession(readyState());
    await repo.createArtifact({
      sessionId: id, state: readyState(), gddMarkdown: "# GDD",
      dsl: { schema_version: "0.2", constraints: { platform: ["mobile"], dimension: "2D", engine: "pixijs", networking: "singleplayer" }, mechanics: [], modalities: [], intent_terms: [], signature_terms: [], mvp_scope: { must: [], cut: [] } } as any,
      resolution: { template: { primary: "match3-base" } } as any,
      gamedef: null,
    });
    const sums = await repo.listSessionSummaries();
    const row = sums.find((r) => r.id === id);
    expect(row?.artifactCount).toBe(1);
  });
});

describe("Repository artifacts", () => {
  it("createArtifact 版本自增 + 卡片抽取", async () => {
    const id = await repo.createSession(readyState());
    const base = {
      sessionId: id, state: readyState(), gddMarkdown: "# GDD 三消糖果",
      dsl: { schema_version: "0.2", constraints: { platform: ["mobile"], dimension: "2D", engine: "pixijs", networking: "singleplayer" }, genre: "match-3", mechanics: [], modalities: [], intent_terms: [], signature_terms: [], mvp_scope: { must: [], cut: [] } } as any,
      resolution: { template: { primary: "match3-base" } } as any,
      gamedef: null,
    };
    const a1 = await repo.createArtifact(base);
    const a2 = await repo.createArtifact(base);
    expect(a1.version).toBe(1);
    expect(a2.version).toBe(2);
    expect(a1.cardSummary.title).toBe("三消糖果");
    expect(a1.cardSummary.genre).toBe("match-3");

    const cards = await repo.listArtifactCards();
    expect(cards.length).toBe(2);
    const detail = await repo.getArtifact(a1.id);
    expect(detail?.gddMarkdown).toContain("三消糖果");
  });
});
