import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createInitialState } from "../src/state.js";
import { toGddModel } from "../src/compile.js";
import { renderGdd } from "@cq/gdd";

const { sectionsFromModel } = createRequire(import.meta.url)("../../../apps/miniprogram/utils/gddSections.js") as {
  sectionsFromModel: (model: unknown, complete: boolean) => Array<{ id: string; title: string; lines: string[] }>;
};

function readyState() {
  const s = createInitialState();
  s.stage = 8;
  s.workingTitle = "猫咪连连看";
  s.pitch = "一个关于治愈系猫咪连连看的解压小游戏";
  s.coreFantasy = "成为照顾猫咪的人";
  s.coreExperience = "解压治愈";
  s.loop = { thirtySec: "划线连接同色猫", fiveMin: "凑连击", thirtyMin: "解锁新猫", longTerm: "图鉴收集" };
  s.keywordPools.gameplay = ["连接", "消除"];
  s.differentiator = "踩奶节奏 + 呼噜治愈音效";
  s.references = ["开心消消乐"];
  s.avoidReferences = ["重度肝氪卡牌"];
  s.constitution = ["核心循环：连同色猫消除"];
  s.engineering = {
    dimension: "2D",
    platform: ["mobile"],
    orientation: "Portrait",
    networking: "singleplayer",
    modalities: ["image", "audio"],
    mechanics: [],
    intentTerms: [],
    signatureTerms: [],
  };
  return s;
}

describe("toGddModel", () => {
  it("把 state 映射成可渲染的 GddModel", () => {
    const m = toGddModel(readyState());
    expect(m.title).toBe("猫咪连连看");
    expect(m.loop).toEqual({
      micro: "划线连接同色猫",
      mid: "凑连击",
      macro: "解锁新猫",
      longTerm: "图鉴收集",
    });
    expect(m.references).toEqual({ borrow: ["开心消消乐"], avoid: ["重度肝氪卡牌"] });
    expect(m.constitution.extras).toContain("核心循环：连同色猫消除");
    expect(m.presentation.where).toBe("手机");
    expect(m.presentation.dimension).toBe("平面");
  });

  it("缺字段时给安全默认，不抛异常", () => {
    const m = toGddModel(createInitialState());
    expect(m.title).toBe("未命名游戏");
    expect(m.loop).toEqual({ micro: "", mid: "", macro: "", longTerm: "" });
    expect(m.pitch).toBe("");
  });

  it("pitch 空时回退到 spark；world 空时回退到 theme", () => {
    const s = createInitialState();
    s.spark = "解压的猫咪游戏";
    s.theme = "治愈猫咖";
    const m = toGddModel(s);
    expect(m.pitch).toBe("解压的猫咪游戏");
    expect(m.world).toBe("治愈猫咖");
  });

  it("把「第一人称视角」从在哪玩里拿掉，不当成电脑/手机", () => {
    const s = createInitialState();
    s.presentation.where = "第一人称受限视角";
    s.presentation.dimension = "3D";
    const m = toGddModel(s);
    expect(m.presentation.where).toBe("");
    expect(m.presentation.dimension).toBe("3D");
  });

  it("工程信号缺失不影响 GDD 产出（灵感引导不依赖维度/引擎/平台）", () => {
    const s = readyState();
    s.engineering = {
      platform: [], modalities: [], mechanics: [], intentTerms: [], signatureTerms: [],
    };
    const m = toGddModel(s);
    expect(m.title).toBe("猫咪连连看");
    expect(m.pitch).not.toBe("");
  });

  it("content.progression 空时用 loop.longTerm 填", () => {
    const s = createInitialState();
    s.loop.longTerm = "从后院打到市中心";
    s.content.flags.progression = true;
    expect(toGddModel(s).contentDetail.progression).toBe("从后院打到市中心");
  });

  it("聊过的动作/通关/失败回档写进中循环、宏循环和重玩，不留（未写）", () => {
    const s = createInitialState();
    s.coreAction = "风水定住扭曲走廊";
    s.winRule = "带着真相逃出城寨";
    s.failRule = "直接死亡回到存档点";
    s.aesthetic = "红灯笼与漏电霓虹";
    s.avoidReferences = ["过于复杂的背包管理"];
    const m = toGddModel(s);
    expect(m.loop.mid).toBe("风水定住扭曲走廊");
    expect(m.loop.macro).toBe("带着真相逃出城寨");
    expect(m.replayMotivation).toContain("存档");
    expect(m.presentation.assets).toContain("红灯笼");
    expect(m.constitution.contentBoundary).toContain("背包");
  });

  it("在哪玩里的键鼠/PC 归一成电脑，视角词不能当平台", () => {
    const s = createInitialState();
    s.presentation.where = "键鼠操作，方便精准点击";
    expect(toGddModel(s).presentation.where).toBe("电脑");
  });

  it("主要资产写成字符串数组时仍能编译和渲染，不抛 trim", () => {
    const s = createInitialState();
    s.spark = "生日鹅派对逃亡";
    (s.presentation as { assets: unknown }).assets = [
      "3D大鹅模型与多套搞怪皮肤",
      "夸张软体物理效果",
      "动感派对BGM",
    ];
    const m = toGddModel(s);
    expect(m.presentation.assets).toContain("3D大鹅模型");
    expect(m.presentation.assets).toContain("派对BGM");
    expect(() => renderGdd(m)).not.toThrow();
    expect(renderGdd(m)).toContain("3D大鹅模型");
  });

  it("近义机制折叠到最多 6 条，短句被长句吃掉", () => {
    const s = createInitialState();
    s.mechanics = [
      "摆放香炉、纸钱、符咒、供品",
      "香炉",
      "纸钱",
      "符咒",
      "供品",
      "护香",
      "香烟显形：香烟是辨认纸人与活人的关键",
      "香火显形：香烟是判断活人、纸人和邪祟路径的关键信息源，香火稳定时信息可靠，香火乱时宅内空间开始撒谎。",
      "供桌布置：香炉、纸钱、符咒、供品需要摆到关键位置形成组合",
      "放置",
      "路径判断",
    ];
    const m = toGddModel(s);
    expect(m.mechanics.length).toBeGreaterThan(0);
    expect(m.mechanics.length).toBeLessThanOrEqual(6);
    expect(m.mechanics.some((x) => x === "香炉")).toBe(false);
    expect(m.mechanics.some((x) => x.includes("香火显形") || x.includes("香烟显形"))).toBe(true);
    expect(m.mechanics.some((x) => x.includes("供桌布置") || x.includes("摆放香炉"))).toBe(true);
  });

  it("词池不拿正文回填，只留短词；句子进不了池", () => {
    const s = createInitialState();
    s.coreAction = "左半屏拖食材，右半屏指挥伙计";
    s.loop.thirtySec = "把白菜划进锅里";
    s.mechanics = ["魔药式研发：拖拽食材入锅"];
    s.keywordPools.gameplay = ["塔防", "策略", "反复把香炉、纸钱摆到关键位置，通过正确组合拖慢邪祟"];
    s.keywordPools.emotion = ["压迫、紧张、绝望中的精准计算：每一波都像香快烧完。"];
    const m = toGddModel(s);
    expect(m.keywordPools.gameplay).toEqual(["塔防", "策略"]);
    expect(m.keywordPools.emotion).toEqual([]);
    expect(m.keywordPools.gameplay.join()).not.toContain("左半屏");
  });

  it("幻想与身份重复时不拼出。。；长线单独一行；一起玩则开多人章", () => {
    const s = createInitialState();
    s.coreFantasy = "化身为热血厨神兼铁腕掌柜，完成从破产到美食街霸主的逆袭。";
    s.playerIdentity = "热血厨神兼铁腕掌柜";
    s.loop.thirtyMin = "签下高利贷，在极限施压下还债。";
    s.loop.longTerm = "不断扩建酒楼，最终买下整条美食街登顶排行榜。";
    s.presentation.players = "要和别人一起";
    s.pitch = "排行榜与好友偷师的横版热血模拟经营";
    s.world = "夸张漫画风美食街";
    s.coreAction = "拖食材入锅";
    const m = toGddModel(s);
    expect(m.playerIdentity).toBe("");
    expect(`${m.coreFantasy}${m.playerIdentity}`).not.toContain("。。");
    expect(m.loop.macro).toContain("高利贷");
    expect(m.loop.longTerm).toContain("买下整条美食街");
    expect(m.content).toBe("夸张漫画风美食街");
    expect(m.content).not.toContain("拖食材入锅");
    expect(m.contentFlags.multiplayer).toBe(true);
    expect(m.contentDetail.multiplayer).toMatch(/排行榜|偷师/);
    const md = renderGdd(m);
    expect(md).toContain("长线：");
    expect(md).toContain("买下整条美食街");
    expect(md).toContain("### 多人");
    expect(md).not.toContain("关键词池");
    expect(md).not.toContain("禁止情感：");
  });
});

describe("sectionsFromModel", () => {
  it("高光分行、空词池不出卡、多人进内容章", () => {
    const s = createInitialState();
    s.workingTitle = "发光食堂";
    s.pitch = "好友偷师与食神排行榜";
    s.juice = ["金色巨龙", "金色巨龙幻影与满屏速度线", "汁水飞溅"];
    s.presentation.players = "要和别人一起";
    s.keywordPools.gameplay = ["左半屏手指拖拽划动离谱食材入锅并观察反应；右半屏狂点屏幕"];
    const m = toGddModel(s);
    const sections = sectionsFromModel(m, false);
    const ids = sections.map((x) => x.id);
    expect(ids).not.toContain("pools");
    const world = sections.find((x) => x.id === "world");
    expect(world?.lines.some((l) => l.includes("金色巨龙"))).toBe(true);
    expect(world?.lines.join("、")).not.toMatch(/金色巨龙、金色巨龙/);
    const content = sections.find((x) => x.id === "content");
    expect(content?.lines.some((l) => l.includes("多人"))).toBe(true);
    const what = sections.find((x) => x.id === "what");
    expect(what?.lines.join("")).not.toContain("禁止情感");
  });
});
