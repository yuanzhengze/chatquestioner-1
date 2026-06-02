import { describe, it, expect } from "vitest";
import { parseTurnOutput, STATE_SENTINEL } from "../src/turn.js";

describe("parseTurnOutput", () => {
  it("拆出 reply 与控制块", () => {
    const raw =
      `所以你想要的是「治愈 + 解压」。我脑子里冒出两个方向……你更喜欢哪个？\n` +
      `${STATE_SENTINEL}\n` +
      `{ "state_delta": { "coreEmotion": "治愈", "engineering": { "dimension": "2D" } }, "stage_complete": true, "ready_for_synthesis": false }`;
    const r = parseTurnOutput(raw);
    expect(r.reply.startsWith("所以你想要的是")).toBe(true);
    expect(r.reply.includes(STATE_SENTINEL)).toBe(false);
    expect(r.control.stateDelta.coreEmotion).toBe("治愈");
    expect(r.control.stateDelta.engineering?.dimension).toBe("2D");
    expect(r.control.stageComplete).toBe(true);
    expect(r.control.readyForSynthesis).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("容忍 JSON 外包 ```json 代码栅栏", () => {
    const raw = `回复正文\n${STATE_SENTINEL}\n\`\`\`json\n{ "state_delta": {}, "stage_complete": false }\n\`\`\``;
    const r = parseTurnOutput(raw);
    expect(r.warnings).toEqual([]);
    expect(r.control.stageComplete).toBe(false);
  });

  it("无 sentinel：reply 取全文，控制块为空 + 告警（不推进）", () => {
    const r = parseTurnOutput("纯人话，没有状态块");
    expect(r.reply).toBe("纯人话，没有状态块");
    expect(r.control.stateDelta).toEqual({});
    expect(r.control.stageComplete).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("控制块 JSON 损坏：保留 reply，控制块为空 + 告警", () => {
    const raw = `回复\n${STATE_SENTINEL}\n{ 这不是合法 JSON `;
    const r = parseTurnOutput(raw);
    expect(r.reply).toBe("回复");
    expect(r.control.stateDelta).toEqual({});
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
