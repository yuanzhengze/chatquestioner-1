import { describe, it, expect } from "vitest";
import { createInitialState, type LlmClient } from "@cq/conversation";
import { extractJson, produceGameDef } from "../src/gameDefFill.js";

function scripted(raws: string[]): LlmClient {
  let i = 0;
  return {
    async *stream() {
      const raw = raws[i++] ?? "";
      yield raw;
    },
  };
}

function match3State() {
  const s = createInitialState();
  s.workingTitle = "猫咪消消乐";
  s.engineering.genre = "match-3";
  return s;
}

const goodFill = JSON.stringify({
  tiles: ["猫爪", "毛线", "铃铛"], size: [8, 8], goal: { kind: "score", target: 5000 },
});

describe("extractJson", () => {
  it("剥掉 ```json 围栏", () => {
    expect(extractJson("前言\n```json\n{\"a\":1}\n```\n尾巴")).toBe('{"a":1}');
  });
  it("无围栏时截取首尾花括号", () => {
    expect(extractJson('噪声 {"a":1} 噪声')).toBe('{"a":1}');
  });
});

describe("produceGameDef", () => {
  it("一次成功 → 产出 def、零诊断", async () => {
    const r = await produceGameDef(scripted([goodFill]), match3State());
    expect(r.def).not.toBeNull();
    expect(r.diagnostics).toEqual([]);
  });

  it("首轮坏 JSON、次轮好 JSON → 重试后成功", async () => {
    const r = await produceGameDef(scripted(["这不是JSON", goodFill]), match3State());
    expect(r.def).not.toBeNull();
  });

  it("两轮都坏 JSON → fill-parse-error", async () => {
    const r = await produceGameDef(scripted(["坏", "还是坏"]), match3State());
    expect(r.def).toBeNull();
    expect(r.diagnostics[0].kind).toBe("fill-parse-error");
  });

  it("JSON 合法但 schema 非法（两轮）→ fill-invalid", async () => {
    const bad = JSON.stringify({ tiles: [], size: [8, 8], goal: { kind: "score", target: 1000 } });
    const r = await produceGameDef(scripted([bad, bad]), match3State());
    expect(r.def).toBeNull();
    expect(r.diagnostics[0].kind).toBe("fill-invalid");
  });
});
