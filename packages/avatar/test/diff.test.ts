import { describe, expect, it } from "vitest";
import { diffState, type StateSnapshot } from "../src/index.js";

const empty: StateSnapshot = {};

describe("diffState · 字段 → 语义 emote", () => {
  it("spark 从无到有 → spark-caught", () => {
    expect(diffState(empty, { spark: "猫咪解压" })).toContain("spark-caught");
  });

  it("references 变长 → spark-caught", () => {
    expect(diffState({ references: ["A"] }, { references: ["A", "B"] })).toContain("spark-caught");
  });

  it("coreEmotion 出现 → emotion-resonance", () => {
    expect(diffState(empty, { coreEmotion: "治愈" })).toContain("emotion-resonance");
  });

  it("coreAction 锁定 → confirm", () => {
    expect(diffState(empty, { coreAction: "连接" })).toContain("confirm");
  });

  it("risks 新增 → risk-flag；mvpScope.cut 新增 → cut-scope", () => {
    const r = diffState({ risks: [] }, { risks: ["美术成本高"] });
    expect(r).toContain("risk-flag");
    const c = diffState({ mvpScope: { cut: [] } }, { mvpScope: { cut: ["关卡系统"] } });
    expect(c).toContain("cut-scope");
  });

  it("constitution 新增 → constitution-lock", () => {
    expect(diffState({ constitution: [] }, { constitution: ["核心循环不可改"] })).toContain("constitution-lock");
  });

  it("juice / signatureTerms 新增 → hot-signature", () => {
    expect(diffState({ juice: [] }, { juice: ["命中爆汁"] })).toContain("hot-signature");
    expect(
      diffState({ engineering: { signatureTerms: [] } }, { engineering: { signatureTerms: ["呼噜治愈"] } }),
    ).toContain("hot-signature");
  });

  it("无变化 → 空数组", () => {
    expect(diffState({ spark: "x" }, { spark: "x" })).toEqual([]);
  });

  it("多字段同变：按优先级降序返回", () => {
    const out = diffState(empty, {
      spark: "s",            // spark-caught(40)
      coreAction: "a",       // confirm(25)
      constitution: ["c"],   // constitution-lock(70)
    });
    expect(out).toEqual(["constitution-lock", "spark-caught", "confirm"]);
  });

  it("防御：缺失数组字段不报错", () => {
    expect(() => diffState(empty, empty)).not.toThrow();
  });
});
