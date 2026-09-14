import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { readyToAdvance, nextStage, STAGE_COUNT } from "../src/stages.js";

describe("阶段机", () => {
  it("STAGE_COUNT 为 9（stage 0..8）", () => {
    expect(STAGE_COUNT).toBe(9);
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

  it("stage 2：需 coreEmotion + coreAction + (theme|world) + aesthetic", () => {
    const s = createInitialState();
    s.stage = 2;
    s.coreEmotion = "解压";
    s.coreAction = "连同色猫咪";
    expect(readyToAdvance(s)).toBe(false);
    s.theme = "治愈猫咪";
    s.aesthetic = "水彩绘本";
    expect(readyToAdvance(s)).toBe(true);
  });

  it("stage 7 呈现：presentation 或工程平台+维度", () => {
    const s = createInitialState();
    s.stage = 7;
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

  it("nextStage：stage 8 封顶，不再前进", () => {
    const s = createInitialState();
    s.stage = 8;
    expect(nextStage(s, true)).toBe(8);
  });

  it("nextStage：2–4 / 6–7 没问过就不跳，哪怕字段已齐", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 2;
    s.spark = "x";
    s.coreEmotion = "治愈";
    s.coreAction = "连猫";
    s.theme = "猫咖";
    s.aesthetic = "水彩";
    expect(nextStage(s)).toBe(2);
    s.askedStages = [2];
    expect(nextStage(s)).toBe(3);
  });

  it("nextStage：世界已有则跳过第 5 节，但不会连跳 6/7", () => {
    const s = createInitialState();
    s.guidance = "accepted";
    s.stage = 4;
    s.spark = "x";
    s.juice = ["烟花"];
    s.world = "发光猫咖";
    s.difficulty.ramp = "越来越快";
    s.askedStages = [4];
    expect(nextStage(s)).toBe(6);
  });
});
