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

describe("parseTurnOutput · options", () => {
  it("解析合法的两项 options", () => {
    const raw =
      `共情承接，你更喜欢哪个？\n${STATE_SENTINEL}\n` +
      `{ "state_delta": {}, "stage_complete": false, "options": [` +
      `{"id":"A","label":"信号找同伴","detail":"你是一束信号，找回失联的同伴。"},` +
      `{"id":"B","label":"回声拼真相","detail":"你是最后清醒的人，拼出真相。"}` +
      `] }`;
    const r = parseTurnOutput(raw);
    expect(r.options).toHaveLength(2);
    expect(r.options?.[0]).toEqual({ id: "A", label: "信号找同伴", detail: "你是一束信号，找回失联的同伴。" });
    expect(r.options?.[1].id).toBe("B");
  });

  it("解析三项 / 四项 options", () => {
    const mk = (n: number) => {
      const ids = ["A", "B", "C", "D"].slice(0, n);
      const items = ids.map((id) => `{"id":"${id}","label":"标题${id}","detail":"方向${id}"}`).join(",");
      return `回复\n${STATE_SENTINEL}\n{ "options": [${items}] }`;
    };
    const r3 = parseTurnOutput(mk(3));
    expect(r3.options).toHaveLength(3);
    expect(r3.options?.[2]).toEqual({ id: "C", label: "标题C", detail: "方向C" });
    const r4 = parseTurnOutput(mk(4));
    expect(r4.options).toHaveLength(4);
    expect(r4.options?.[3].id).toBe("D");
  });

  it("无 options 字段时为 undefined", () => {
    const raw = `回复\n${STATE_SENTINEL}\n{ "state_delta": {}, "stage_complete": false }`;
    expect(parseTurnOutput(raw).options).toBeUndefined();
  });

  it("数量越界（0 / 1 / 5）被忽略为 undefined", () => {
    const zero = `回复\n${STATE_SENTINEL}\n{ "options": [] }`;
    expect(parseTurnOutput(zero).options).toBeUndefined();
    const one = `回复\n${STATE_SENTINEL}\n{ "options": [{"id":"A","label":"x","detail":"y"}] }`;
    expect(parseTurnOutput(one).options).toBeUndefined();
    const five = `回复\n${STATE_SENTINEL}\n{ "options": [` +
      ["A","B","C","D","E"].map((id) => `{"id":"${id}","label":"l${id}","detail":"d${id}"}`).join(",") +
      `] }`;
    expect(parseTurnOutput(five).options).toBeUndefined();
  });

  it("缺字段的项使整组被忽略为 undefined", () => {
    const bad = `回复\n${STATE_SENTINEL}\n{ "options": [{"id":"A","label":"x"},{"id":"B","label":"y","detail":"z"}] }`;
    expect(parseTurnOutput(bad).options).toBeUndefined();
  });
});
