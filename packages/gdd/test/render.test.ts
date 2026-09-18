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
  m.interaction = {
    verb: "划线",
    target: "同色猫",
    chain: "划线 → 同色猫 → 连消除并响起呼噜",
    feedback: "呼噜与连消",
  };
  m.coreDelight = "连击时满屏猫爪烟花";
  m.growth = { none: false, unlocks: "解锁新猫", nearGoal: "凑齐连击", afterTenMin: "能开新主题猫咖" };
  m.loop = { micro: "看猫连线", mid: "凑连击", macro: "解锁新猫", longTerm: "" };
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
  m.highlights = ["猫爪烟花"];
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
    contentBoundary: "单机体验，不做人与人的强制社交",
    presentationBoundary: "平面",
    growthRule: "解锁新猫",
    worldRule: "",
    uiRule: "",
    extras: ["失败规则：时间耗尽", "最舍不得删的瞬间：猫爪烟花"],
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
    expect(md).toContain("核心幻想：成为治愈系撸猫大师");
    expect(md).toContain("成长规则：解锁新猫");
    expect(md).not.toContain("失败规则：时间耗尽");
    expect(md).not.toContain("最舍不得删的瞬间：猫爪烟花");
    expect(md).not.toContain("世界观规则");
    expect(md).not.toContain("UI 规则");
    expect(md).toContain("参考作品");
    expect(md).toContain("Onet");
    expect(md).not.toContain("（未写）");
    expect(md).toContain("### 核心交互");
    expect(md).toContain("划线 → 同色猫");
    expect(md).toContain("## 2. How · 怎么玩");
    expect(md).toContain("## 3. Why · 为什么继续玩");
    expect(md).toContain("## 4. Win · Lose");
    expect(md).toContain("### 核心爽点");
    expect(md).toContain("猫爪烟花");
    expect(md).toContain("### 成长与变化");
    const howIdx = md.indexOf("## 2. How · 怎么玩");
    const whyIdx = md.indexOf("## 3. Why · 为什么继续玩");
    const winIdx = md.indexOf("## 4. Win · Lose");
    const delightIdx = md.indexOf("### 核心爽点");
    expect(howIdx).toBeGreaterThan(-1);
    expect(whyIdx).toBeGreaterThan(howIdx);
    expect(delightIdx).toBeGreaterThan(whyIdx);
    expect(md.slice(howIdx, whyIdx)).toContain("### 核心机制");
    expect(md.slice(howIdx, whyIdx)).not.toContain("### 核心游戏循环");
    expect(md.slice(howIdx, whyIdx)).not.toContain("### 核心爽点");
    expect(md.slice(whyIdx, winIdx)).not.toContain("### 核心机制");
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

  it("高光走列表；没写禁止情感和避开就不印未写；空词池整节省略", () => {
    const m = emptyGddModel();
    m.title = "香火未尽";
    m.pitch = "民俗塔防";
    m.highlights = ["天光从门缝渗入", "香烟被照散"];
    m.highlight = "天光从门缝渗入、香烟被照散";
    const md = renderGdd(m);
    expect(md).toContain("- 天光从门缝渗入");
    expect(md).toContain("- 香烟被照散");
    expect(md).not.toContain("禁止情感：");
    expect(md).not.toContain("刻意避开");
    expect(md).not.toContain("### 关键词池");
    expect(md).not.toContain("（待补充）");
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
    m.growth = { none: false, unlocks: "", nearGoal: "", afterTenMin: "" };
    expect(isComplete(m)).toBe(false);
    expect(missingCompleteFields(m)).toContain("content.progression");
  });

  it("短局无独立成长时省略成长细项，仍可定稿", () => {
    const m = completeModel();
    m.growth = { none: true, unlocks: "", nearGoal: "", afterTenMin: "" };
    m.contentFlags.progression = false;
    m.contentDetail.progression = "";
    expect(isComplete(m)).toBe(true);
    const md = renderGdd(m);
    expect(md).toContain("本游戏无独立成长");
    expect(md).not.toContain("眼前目标");
  });
});
