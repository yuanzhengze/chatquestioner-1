import { describe, it, expect } from "vitest";
import { emptyGddModel, toGddView, coverPromptFromModel, coverFingerprint, fnv1aHex, stripListNumber } from "../src/index.js";

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
  it("从 GddModel 派生预览，不另起采访字段", () => {
    const v = toGddView(sample());
    expect(v.profile.formatLine).toBe("单人 · 手机 · 2D · 竖屏");
    expect(v.delight).toContain("猫爪");
    expect(v.growthSteps.map((s) => s.id)).toEqual(["near", "after", "unlocks"]);
    expect(v.cover.prompt).toContain("水彩暖色");
    expect(v.cover.prompt).toContain("不要出现任何文字");
    expect(v.cover.prompt).not.toContain("发光料理");
    expect(v.cover.fingerprint).toMatch(/^[0-9a-f]+$/);
    expect(v.gameplayMoments).toEqual([]);
  });

  it("空模型不造假预览", () => {
    const v = toGddView(emptyGddModel());
    expect(v.profile.genres).toEqual([]);
    expect(v.profile.experienceTags).toEqual([]);
    expect(v.profile.formatLine).toBe("");
    expect(v.growthSteps).toEqual([]);
    expect(v.gameplayMoments).toEqual([]);
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

describe("关键瞬间 = 核心机制", () => {
  const bead = "点选摆珠：玩家先选择颜色或珠子类型，再点击图案空位，珠子滑入格子完成填充。";

  it("没有核心机制就不出现", () => {
    expect(toGddView(emptyGddModel()).gameplayMoments).toEqual([]);
    const m = emptyGddModel();
    m.mechanics = ["", "   "];
    expect(toGddView(m).gameplayMoments).toEqual([]);
  });

  it("一条机制一张卡，标题和正文跟原文一致", () => {
    const m = emptyGddModel();
    m.mechanics = [bead];
    const cards = toGddView(m).gameplayMoments;
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("点选摆珠");
    expect(cards[0].description).toBe("玩家先选择颜色或珠子类型，再点击图案空位，珠子滑入格子完成填充。");
    expect(cards[0].id).toBe(fnv1aHex(bead));
  });

  it("三条按优先级原样排列，冒号两侧空格不影响拆分", () => {
    const m = emptyGddModel();
    m.mechanics = [
      "点选摆珠： 玩家先选择颜色",
      "连击奖励:满屏反馈",
      "划线连接",
    ];
    const cards = toGddView(m).gameplayMoments;
    expect(cards.map((c) => c.title)).toEqual(["点选摆珠", "连击奖励", "划线连接"]);
    expect(cards.map((c) => c.description)).toEqual(["玩家先选择颜色", "满屏反馈", ""]);
  });

  it("有几条显示几张，不补齐也不截成 5 张", () => {
    const m = emptyGddModel();
    m.mechanics = ["一：甲", "二：乙", "三：丙", "四：丁", "五：戊", "六：己", "七：庚"];
    const cards = toGddView(m).gameplayMoments;
    expect(cards).toHaveLength(7);
    expect(cards.map((c) => c.title)).toEqual(["一", "二", "三", "四", "五", "六", "七"]);
  });

  it("旧文档只有机制字符串时直接显示", () => {
    const m = emptyGddModel();
    m.mechanics = ["香烟显形", "民俗物件布阵"];
    const cards = toGddView(m).gameplayMoments;
    expect(cards.map((c) => ({ title: c.title, description: c.description }))).toEqual([
      { title: "香烟显形", description: "" },
      { title: "民俗物件布阵", description: "" },
    ]);
  });

  it("改机制后重新生成 View，对应卡跟着变；没改的卡 ID 不变", () => {
    const m = emptyGddModel();
    m.mechanics = [bead, "整理桌面：先把材料摆齐"];
    const before = toGddView(m).gameplayMoments;
    m.mechanics = ["点选摆珠：改成拖拽摆放", "整理桌面：先把材料摆齐"];
    const after = toGddView(m).gameplayMoments;
    expect(after[0].title).toBe("点选摆珠");
    expect(after[0].description).toBe("改成拖拽摆放");
    expect(after[0].id).not.toBe(before[0].id);
    expect(after[1]).toEqual(before[1]);
  });

  it("删掉或换序后，卡的数量和顺序跟机制一致，未改原文的 ID 仍是那一句", () => {
    const m = emptyGddModel();
    m.mechanics = ["甲：一", "乙：二", "丙：三"];
    const first = toGddView(m).gameplayMoments;
    m.mechanics = ["丙：三", "甲：一"];
    const next = toGddView(m).gameplayMoments;
    expect(next.map((c) => c.title)).toEqual(["丙", "甲"]);
    expect(next[0].id).toBe(first[2].id);
    expect(next[1].id).toBe(first[0].id);
  });

  it("同一句重新打开 ID 稳定，重复原文不会共用一个 ID", () => {
    const m = emptyGddModel();
    m.mechanics = ["甲：一", "甲：一"];
    const a = toGddView(m).gameplayMoments;
    const b = toGddView(m).gameplayMoments;
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a[0].id).toBe(fnv1aHex("甲：一"));
    expect(a[1].id).toBe(`${fnv1aHex("甲：一")}-2`);
    expect(a[0].id).not.toBe("0");
    expect(a[1].id).not.toBe("1");
  });
});

describe("stripListNumber", () => {
  it("去掉开头的展示序号，叠了几层去几层", () => {
    expect(stripListNumber("1. 相邻交换：拖动零件")).toBe("相邻交换：拖动零件");
    expect(stripListNumber("1.相邻交换")).toBe("相邻交换");
    expect(stripListNumber("1、相邻交换")).toBe("相邻交换");
    expect(stripListNumber("1) 相邻交换")).toBe("相邻交换");
    expect(stripListNumber("1）相邻交换")).toBe("相邻交换");
    expect(stripListNumber("1．相邻交换")).toBe("相邻交换");
    expect(stripListNumber("（2）相邻交换")).toBe("相邻交换");
    expect(stripListNumber("10. 相邻交换")).toBe("相邻交换");
    expect(stripListNumber("1. 1. 1. 相邻交换")).toBe("相邻交换");
  });

  it("正文里有意义的数字不动", () => {
    expect(stripListNumber("3 秒时间冻结：玩家按住时全场静止")).toBe("3 秒时间冻结：玩家按住时全场静止");
    expect(stripListNumber("1.5 倍速：连击后加速")).toBe("1.5 倍速：连击后加速");
    expect(stripListNumber("3、5、7 号格子会亮")).toBe("3、5、7 号格子会亮");
    expect(stripListNumber("2048 合成：同数合并")).toBe("2048 合成：同数合并");
    expect(stripListNumber("相邻交换：第 1. 步先拖")).toBe("相邻交换：第 1. 步先拖");
  });
});
