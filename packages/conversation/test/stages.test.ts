import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { readyToAdvance, nextStage, STAGE_COUNT, canSkipStage } from "../src/stages.js";
import { isConcreteInteractionChain } from "@cq/gdd";

describe("阶段机", () => {
  it("STAGE_COUNT 为 11（stage 0..10）", () => {
    expect(STAGE_COUNT).toBe(11);
  });

  it("stage 0 破冰：无门槛，readyToAdvance 恒真", () => {
    const s = createInitialState();
    expect(readyToAdvance(s)).toBe(true);
  });

  it("stage 1 火花：需 spark", () => {
    const s = createInitialState();
    s.stage = 1;
    expect(readyToAdvance(s)).toBe(false);
    s.spark = "想做一只在微波炉里求生的爆米花";
    expect(readyToAdvance(s)).toBe(true);
  });

  it("stage 2：需 coreEmotion + (theme|world) + aesthetic，不再要 coreAction", () => {
    const s = createInitialState();
    s.stage = 2;
    s.coreEmotion = "解压";
    s.coreAction = "连同色猫咪";
    expect(readyToAdvance(s)).toBe(false);
    s.theme = "治愈猫咪";
    s.aesthetic = "水彩绘本";
    expect(readyToAdvance(s)).toBe(true);
  });

  it("stage 3：合格交互链路即可离开，不必三轮", () => {
    const s = createInitialState();
    s.stage = 3;
    expect(readyToAdvance(s)).toBe(false);
    s.interaction.chain = "经营农场";
    expect(isConcreteInteractionChain(s.interaction.chain)).toBe(false);
    expect(readyToAdvance(s)).toBe(false);
    s.interaction.chain = "点击空田 → 选择种子 → 播种 → 作物破土";
    expect(readyToAdvance(s)).toBe(true);
  });

  it("stage 4：头几秒 + 核心爽点", () => {
    const s = createInitialState();
    s.stage = 4;
    s.loop.thirtySec = "一划线就连消";
    expect(readyToAdvance(s)).toBe(false);
    s.coreDelight = "连击时满屏猫爪烟花";
    expect(readyToAdvance(s)).toBe(true);
  });

  it("stage 5 成长：短局可跳", () => {
    const s = createInitialState();
    s.stage = 5;
    expect(readyToAdvance(s)).toBe(false);
    expect(canSkipStage(s, 5)).toBe(false);
    s.loop.fiveMin = "短单局，无长线";
    expect(canSkipStage(s, 5)).toBe(true);
    expect(readyToAdvance(s)).toBe(true);
    const none = createInitialState();
    none.stage = 5;
    none.growth.none = true;
    expect(canSkipStage(none, 5)).toBe(false);
    expect(readyToAdvance(none)).toBe(true);
    none.history = [{ role: "user", content: "做成一次性纯叙事，没有解锁。" }];
    expect(canSkipStage(none, 5)).toBe(true);
  });

  it("stage 9 呈现：presentation 或工程平台+维度", () => {
    const s = createInitialState();
    s.stage = 9;
    expect(readyToAdvance(s)).toBe(false);
    s.engineering.platform = ["mobile"];
    s.engineering.dimension = "2D";
    expect(readyToAdvance(s)).toBe(true);
  });

  it("nextStage：字段齐就前进，不依赖 LLM 的 stage_complete", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 1;
    s.spark = "x";
    expect(nextStage(s, false)).toBe(2);
  });

  it("nextStage：同意门期间不推进", () => {
    const s = createInitialState();
    s.stage = 0;
    expect(s.guidance).toBe("pending");
    expect(nextStage(s, true)).toBe(0);
  });

  it("nextStage：字段不齐则不前进，哪怕 stage_complete", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 1; // spark 缺失
    expect(nextStage(s, true)).toBe(1);
  });

  it("nextStage：stage 10 封顶，不再前进", () => {
    const s = createInitialState();
    s.stage = 10;
    expect(nextStage(s, true)).toBe(10);
  });

  it("nextStage：必问节没问过就不跳，哪怕字段已齐", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 2;
    s.spark = "x";
    s.coreEmotion = "治愈";
    s.theme = "猫咖";
    s.aesthetic = "水彩";
    expect(nextStage(s)).toBe(2);
    s.askedStages = [2];
    expect(nextStage(s)).toBe(3);
  });

  it("nextStage：循环问过且短局则跳过成长，停在美学", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 4;
    s.loop.thirtySec = "一划线就连消";
    s.loop.fiveMin = "短单局，无长线";
    s.coreDelight = "猫爪烟花";
    s.askedStages = [4];
    expect(nextStage(s)).toBe(6);
  });

  it("nextStage：仅 growth.none 不跳过成长", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 4;
    s.loop.thirtySec = "一划线就连消";
    s.coreDelight = "猫爪烟花";
    s.growth.none = true;
    s.askedStages = [4];
    expect(nextStage(s)).toBe(5);
  });

  it("nextStage：世界已有则跳过叙事节，但不会连跳平衡/呈现", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 6;
    s.juice = ["烟花"];
    s.world = "发光猫咖";
    s.askedStages = [6];
    expect(nextStage(s)).toBe(8);
  });
});
