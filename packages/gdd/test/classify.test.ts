import { describe, expect, it } from "vitest";
import { emptyGddModel, mentionIsNegated, profileFingerprint, validateClassification } from "../src/index.js";

function model() {
  return emptyGddModel();
}

describe("分类否定", () => {
  it("不恐怖不能留下恐怖，正向恐怖可以", () => {
    expect(mentionIsNegated("整体孤独、神秘，但不做恐怖惊吓。", "恐怖")).toBe(true);
    expect(mentionIsNegated("核心体验就是恐怖逃生。", "恐怖")).toBe(false);
    const denied = model();
    denied.constitution.contentBoundary = "不做恐怖惊吓";
    denied.coreAction = "和影子一起解谜";
    const corpus = `内容边界：${denied.constitution.contentBoundary}\n核心动作：${denied.coreAction}`;
    const result = validateClassification(corpus, {
      genres: [{ tagId: 1667, evidence: "文中出现不恐怖", confidence: 0.9, fields: ["内容边界"] }],
      tags: [{ tagId: 1664, evidence: "玩家反复和影子一起解谜", confidence: 0.9, fields: ["核心动作"] }],
    });
    expect(result.genres.map((row) => row.label)).not.toContain("恐怖");
    expect(result.filtered.some((row) => row.reason.includes("否定"))).toBe(true);
    const allowed = validateClassification("核心体验：恐怖逃生", {
      genres: [{ tagId: 1667, evidence: "核心体验就是恐怖逃生", confidence: 0.86, fields: ["核心体验"] }],
      tags: [],
    });
    expect(allowed.genres.map((row) => row.label)).toContain("恐怖");
  });

  it("不以战斗为核心、不做经营、不做多人、没有装备，都不能当成正向标签", () => {
    const corpus = [
      "内容边界：不以战斗为核心。不做复杂经营。不做多人社交。没有装备成长。",
    ].join("\n");
    const result = validateClassification(corpus, {
      genres: [
        { tagId: 12472, evidence: "不做复杂经营", confidence: 0.8, fields: ["内容边界"] },
      ],
      tags: [
        { tagId: 3993, evidence: "不以战斗为核心", confidence: 0.8, fields: ["内容边界"] },
        { tagId: 3859, evidence: "不做多人社交", confidence: 0.8, fields: ["内容边界"] },
        { tagId: 4236, evidence: "没有装备成长，所以不是刷宝", confidence: 0.8, fields: ["内容边界"] },
      ],
    });
    expect(result.genres).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.filtered.map((row) => row.label)).toEqual(expect.arrayContaining(["战斗", "经营", "刷宝"]));
  });

  it("未知标签、低信心和超限会被滤掉，并且不发明休闲", () => {
    const result = validateClassification("核心机制：解谜", {
      genres: [
        { tagId: 999999, evidence: "自造类型", confidence: 0.9 },
        { tagId: 1664, evidence: "核心就是解谜", confidence: 0.2 },
        { tagId: 1664, evidence: "反复解谜", confidence: 0.9, fields: ["核心机制"] },
        { tagId: 1665, evidence: "核心是三消", confidence: 0.88 },
        { tagId: 597, evidence: "也有休闲", confidence: 0.4 },
        { tagId: 9, evidence: "还有策略", confidence: 0.7 },
      ],
      tags: [],
    });
    expect(result.genres.map((row) => row.label)).not.toContain("休闲");
    expect(result.genres.length).toBeLessThanOrEqual(3);
    expect(result.filtered.some((row) => row.reason.includes("不在 Steam"))).toBe(true);
    expect(result.filtered.some((row) => row.reason.includes("信心不足"))).toBe(true);
  });

  it("分类指纹跟玩法字段走，空形态不猜", () => {
    const a = model();
    a.mechanics = ["解谜"];
    const b = model();
    b.mechanics = ["解谜"];
    const c = model();
    c.mechanics = ["射击"];
    expect(profileFingerprint(a)).toBe(profileFingerprint(b));
    expect(profileFingerprint(a)).not.toBe(profileFingerprint(c));
  });
});
