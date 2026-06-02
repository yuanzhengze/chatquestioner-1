import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { readyToAdvance, nextStage, STAGE_COUNT } from "../src/stages.js";

describe("阶段机", () => {
  it("STAGE_COUNT 为 8（stage 0..7）", () => {
    expect(STAGE_COUNT).toBe(8);
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

  it("nextStage：stage_complete 且字段齐才 +1", () => {
    const s = createInitialState();
    s.stage = 1;
    s.spark = "x";
    expect(nextStage(s, false)).toBe(1);
    expect(nextStage(s, true)).toBe(2);
  });

  it("nextStage：字段不齐则不前进，哪怕 stage_complete", () => {
    const s = createInitialState();
    s.stage = 1; // spark 缺失
    expect(nextStage(s, true)).toBe(1);
  });

  it("nextStage：stage 7 封顶，不再前进", () => {
    const s = createInitialState();
    s.stage = 7;
    s.pitch = "p";
    s.keywordPools.gameplay = ["连接"];
    s.mvpScope.must = ["核心循环"];
    expect(nextStage(s, true)).toBe(7);
  });
});
