import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { toGddModel, toGameDsl } from "../src/compile.js";

function readyState() {
  const s = createInitialState();
  s.stage = 7;
  s.workingTitle = "猫咪连连看";
  s.pitch = "一个关于治愈系猫咪连连看的解压小游戏";
  s.coreFantasy = "成为照顾猫咪的人";
  s.coreExperience = "解压治愈";
  s.loop = { thirtySec: "划线连接同色猫", fiveMin: "凑连击", thirtyMin: "解锁新猫", longTerm: "图鉴收集" };
  s.keywordPools.gameplay = ["连接", "消除"];
  s.differentiator = "踩奶节奏 + 呼噜治愈音效";
  s.references = ["开心消消乐"];
  s.avoidReferences = ["重度肝氪卡牌"];
  s.risks = ["关卡产能"];
  s.mvpScope = { must: ["核心连接循环", "计分"], cut: ["关卡编辑器"] };
  s.constitution = ["核心循环：连同色猫消除"];
  s.engineering = {
    dimension: "2D",
    engine: "pixijs",
    platform: ["mobile"],
    orientation: "Portrait",
    networking: "singleplayer",
    modalities: ["image", "audio", "ui"],
    genre: "match-3",
    mechanics: ["drag-connect", "踩奶节奏"], // 后者未命中枚举 → 回退 intent_terms
    artStyle: "watercolor-cozy",
    intentTerms: ["猫咪", "连连看"],
    signatureTerms: ["呼噜治愈"],
  };
  return s;
}

describe("toGddModel", () => {
  it("把 state 映射成可渲染的 GddModel", () => {
    const m = toGddModel(readyState());
    expect(m.title).toBe("猫咪连连看");
    expect(m.coreLoop).toEqual(["划线连接同色猫", "凑连击", "解锁新猫", "图鉴收集"]);
    expect(m.references).toEqual({ borrow: ["开心消消乐"], avoid: ["重度肝氪卡牌"] });
    expect(m.mvp.must).toContain("计分");
    expect(m.constitution.length).toBeGreaterThan(0);
  });

  it("缺字段时给安全默认，不抛异常", () => {
    const m = toGddModel(createInitialState());
    expect(m.title).toBe("未命名游戏");
    expect(m.coreLoop).toEqual([]);
    expect(m.pitch).toBe("");
  });
});

describe("toGameDsl", () => {
  it("工程信号齐全 → 产出可校验 DSL；自由词回退进 intent_terms", () => {
    const { dsl, missing } = toGameDsl(readyState());
    expect(missing).toEqual([]);
    expect(dsl).not.toBeNull();
    expect(dsl!.constraints).toMatchObject({ dimension: "2D", engine: "pixijs", platform: ["mobile"] });
    expect(dsl!.genre).toBe("match-3");
    expect(dsl!.mechanics).toEqual(["drag-connect"]);   // 命中枚举
    expect(dsl!.art_style).toBe("watercolor-cozy");
    expect(dsl!.intent_terms).toContain("猫咪");
    expect(dsl!.intent_terms).toContain("踩奶节奏");      // 未命中机制 → 回退
  });

  it("缺 dimension/engine/platform → dsl=null 且 missing 列出", () => {
    const s = createInitialState();
    const { dsl, missing } = toGameDsl(s);
    expect(dsl).toBeNull();
    expect(missing).toEqual(["dimension", "engine", "platform"]);
  });
});
