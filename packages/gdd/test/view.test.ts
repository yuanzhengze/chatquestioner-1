import { describe, it, expect } from "vitest";
import { emptyGddModel, toGddView, splitInteractionChain, coverPromptFromModel, coverFingerprint } from "../src/index.js";

function sample() {
  const m = emptyGddModel();
  m.title = "猫咪连连看";
  m.pitch = "把同色猫连起来";
  m.coreFantasy = "成为治愈系撸猫大师";
  m.coreEmotion = "治愈";
  m.differentiator = "踩奶节奏的呼噜";
  m.world = "发光猫咖";
  m.aesthetic = "水彩暖色";
  m.coreDelight = "连击时满屏猫爪烟花";
  m.coreAction = "连同色猫";
  m.interaction = {
    verb: "划线",
    target: "同色猫",
    chain: "划线 → 同色猫 → 连消除并响起呼噜",
    feedback: "呼噜与连消",
  };
  m.loop = { micro: "看猫连线", mid: "凑连击", macro: "解锁新猫", longTerm: "" };
  m.presentation = { where: "手机", dimension: "平面", orientation: "竖屏", players: "自己玩", assets: "插画" };
  m.growth = { none: false, unlocks: "解锁新猫", nearGoal: "凑齐连击", afterTenMin: "能开新主题猫咖" };
  m.constitution.coreFantasy = "成为治愈系撸猫大师";
  return m;
}

describe("toGddView", () => {
  it("从 GddModel 派生 DNA、分镜、循环，不另起采访字段", () => {
    const v = toGddView(sample());
    expect(v.dna.map((c) => c.id)).toEqual(["fantasy", "emotion", "diff", "play"]);
    expect(v.dna.find((c) => c.id === "play")?.text).toBe("手机 · 平面");
    expect(v.storyboard.map((f) => f.text)).toEqual(["划线", "同色猫", "连消除并响起呼噜"]);
    expect(v.loopNodes.map((n) => n.id)).toEqual(["micro", "mid", "macro"]);
    expect(v.delight).toContain("猫爪");
    expect(v.growthSteps.map((s) => s.id)).toEqual(["near", "after", "unlocks"]);
    expect(v.cover.prompt).toContain("水彩暖色");
    expect(v.cover.prompt).toContain("不要出现任何文字");
    expect(v.cover.prompt).not.toContain("发光料理");
    expect(v.cover.fingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it("chain 不够两段时用 verb/target/feedback 补帧", () => {
    const m = emptyGddModel();
    m.interaction = { verb: "点击", target: "空田", chain: "种田", feedback: "作物破土" };
    const v = toGddView(m);
    expect(v.storyboard.map((f) => f.title)).toEqual(["主要操作", "操作对象", "即时反馈"]);
  });

  it("空模型不造假芯片和分镜", () => {
    const v = toGddView(emptyGddModel());
    expect(v.dna).toEqual([]);
    expect(v.storyboard).toEqual([]);
    expect(v.loopNodes).toEqual([]);
    expect(v.growthSteps).toEqual([]);
    expect(v.growthNone).toBe(false);
  });

  it("短局无成长细项时 growthNone", () => {
    const m = emptyGddModel();
    m.growth = { none: true, unlocks: "", nearGoal: "", afterTenMin: "" };
    expect(toGddView(m).growthNone).toBe(true);
  });

  it("同一幻想指纹稳定，改美学则变", () => {
    const a = sample();
    const b = sample();
    expect(coverFingerprint(a)).toBe(coverFingerprint(b));
    b.aesthetic = "像素冷色";
    expect(coverFingerprint(a)).not.toBe(coverFingerprint(b));
  });

  it("封面 Prompt 只用已有字段", () => {
    const prompt = coverPromptFromModel(sample());
    expect(prompt).toContain("猫咪连连看");
    expect(prompt).toContain("发光猫咖");
    expect(prompt).not.toMatch(/新角色|新地图|原创武器/);
  });
});

describe("splitInteractionChain", () => {
  it("认识箭头和然后/之后", () => {
    expect(splitInteractionChain("点员工 然后 升级工位 之后 碎片时间")).toEqual([
      "点员工",
      "升级工位",
      "碎片时间",
    ]);
  });
});
