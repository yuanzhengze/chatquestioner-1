import { describe, it, expect } from "vitest";
import { emptyGddModel, isComplete, isSubstantive, missingCompleteFields, renderGdd } from "../src/index.js";

function five(p: string): string[] {
  return [`${p}一`, `${p}二`, `${p}三`, `${p}四`, `${p}五`];
}

function completeModel() {
  const m = emptyGddModel();
  m.title = "猫咪连连看";
  m.pitch = "一个关于把同色猫咪连起来解压的游戏。";
  m.coreExperience = "极度解压、被治愈";
  m.coreEmotion = "治愈";
  m.forbiddenEmotion = "肝氪焦虑";
  m.coreFantasy = "成为治愈系撸猫大师";
  m.playerIdentity = "猫咖店长";
  m.differentiator = "踩奶节奏的呼噜反馈";
  m.references = { borrow: ["Onet"], avoid: ["硬核计时压力"] };
  m.coreAction = "连同色猫";
  m.loop = { micro: "看猫连线", mid: "凑连击", macro: "解锁新猫" };
  m.mechanics = ["划线连接", "连击奖励"];
  m.reward = "分数闪光";
  m.winRule = "达到目标分";
  m.loseRule = "时间耗尽";
  m.replayMotivation = "就差一点再来一局";
  m.world = "发光猫咖";
  m.narrative = "夜班店长";
  m.aesthetic = "水彩暖色";
  m.gameFeel = "撸猫顺滑";
  m.highlight = "猫爪烟花";
  m.keywordPools = {
    gameplay: five("玩法"),
    emotion: five("情绪"),
    world: five("世界"),
    visual: five("视觉"),
    narrative: five("叙事"),
    motivation: five("动机"),
  };
  m.constitution = {
    coreFantasy: "成为治愈系撸猫大师",
    coreLoop: "看猫连线",
    artRule: "水彩暖色",
    contentBoundary: "",
    presentationBoundary: "平面",
    extras: ["核心幻想：治愈撸猫"],
  };
  m.presentation = { where: "手机", dimension: "平面", orientation: "竖屏", players: "自己玩", assets: "插画 / 音乐音效" };
  m.difficulty = { ramp: "猫变多", firstMinutes: "轻松上手", fatigue: "配色太近时换主题" };
  return m;
}

describe("renderGdd", () => {
  it("renders a markdown doc containing the pitch and constitution", () => {
    const md = renderGdd(completeModel());
    expect(md).toContain("# 猫咪连连看");
    expect(md).toContain("一个关于把同色猫咪连起来解压的游戏。");
    expect(md).toContain("## 游戏宪法");
    expect(md).toContain("核心幻想：治愈撸猫");
    expect(md).toContain("参考作品");
    expect(md).toContain("Onet");
    expect(md).not.toContain("（未写）");
  });

  it("renders all six keyword pools", () => {
    const md = renderGdd(completeModel());
    for (const label of ["玩法", "情绪", "世界观", "视觉", "叙事", "玩家动机"]) {
      expect(md).toContain(label);
    }
  });

  it("草稿缺项用（未写）而不是待补充", () => {
    const md = renderGdd(emptyGddModel());
    expect(md).toContain("（未写）");
    expect(md).not.toContain("（待补充）");
  });

  it("assets 误成数组时仍渲染，不抛 trim", () => {
    const m = emptyGddModel();
    (m.presentation as { assets: unknown }).assets = ["3D大鹅模型", "派对BGM"];
    expect(() => renderGdd(m)).not.toThrow();
    expect(renderGdd(m)).toContain("3D大鹅模型");
  });
});

describe("complete gate", () => {
  it("empty model is not substantive and not complete", () => {
    const m = emptyGddModel();
    expect(isSubstantive(m)).toBe(false);
    expect(isComplete(m)).toBe(false);
    expect(missingCompleteFields(m).length).toBeGreaterThan(0);
  });

  it("filled model passes completeness", () => {
    const m = completeModel();
    expect(isSubstantive(m)).toBe(true);
    expect(isComplete(m)).toBe(true);
    expect(missingCompleteFields(m)).toEqual([]);
  });

  it("asks.md 最低标准还不够定稿，必须过 completeness.md", () => {
    const m = emptyGddModel();
    m.pitch = "猫咪连连看";
    m.coreEmotion = "治愈";
    m.coreAction = "连同色猫";
    m.loop.micro = "划线连接";
    m.reward = "分数闪光";
    m.loseRule = "连错扣时间";
    m.aesthetic = "水彩绘本";
    m.world = "发光猫咖";
    m.presentation.where = "手机";
    m.presentation.dimension = "平面";
    m.difficulty.ramp = "猫变多";
    expect(isComplete(m)).toBe(false);
    expect(missingCompleteFields(m).length).toBeGreaterThan(0);
  });

  it("content.flags 亮了但没写章节正文，挡定稿", () => {
    const m = completeModel();
    m.contentFlags.progression = true;
    m.contentDetail.progression = "";
    expect(isComplete(m)).toBe(false);
    expect(missingCompleteFields(m)).toContain("content.progression");
  });
});
