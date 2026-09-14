import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { toGddModel } from "../src/compile.js";
import { renderGdd } from "@cq/gdd";

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
    });
    expect(m.references).toEqual({ borrow: ["开心消消乐"], avoid: ["重度肝氪卡牌"] });
    expect(m.constitution.extras).toContain("核心循环：连同色猫消除");
    expect(m.presentation.where).toBe("手机");
    expect(m.presentation.dimension).toBe("平面");
  });

  it("缺字段时给安全默认，不抛异常", () => {
    const m = toGddModel(createInitialState());
    expect(m.title).toBe("未命名游戏");
    expect(m.loop).toEqual({ micro: "", mid: "", macro: "" });
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
});
