import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { advance } from "../src/advance.js";
import { STATE_SENTINEL } from "../src/turn.js";
import { scriptedLlm } from "./fixtures/scriptedLlm.js";

const SYS = "（测试用系统提示词占位）";

function turn(reply: string, control: object): string {
  return `${reply}\n${STATE_SENTINEL}\n${JSON.stringify(control)}`;
}

describe("advance", () => {
  it("合并 state_delta、推进阶段、记录历史，并流式回放 reply", async () => {
    const llm = scriptedLlm([
      turn("听起来你想要治愈和解压！你更想连猫还是连甜点？", {
        state_delta: { spark: "治愈系猫咪连连看" },
        stage_complete: true,
      }),
    ]);
    const tokens: string[] = [];
    const state0 = createInitialState();
    state0.stage = 1;

    const res = await advance(state0, "我想做个治愈的小游戏", {
      llm, systemPrompt: SYS, onToken: (t) => tokens.push(t),
    });

    expect(res.reply).toContain("治愈");
    expect(res.reply).not.toContain(STATE_SENTINEL);
    expect(tokens.join("")).not.toContain(STATE_SENTINEL);
    expect(res.state.spark).toBe("治愈系猫咪连连看");
    expect(res.state.stage).toBe(2);
    expect(res.state.history.at(-2)).toMatchObject({ role: "user" });
    expect(res.state.history.at(-1)).toMatchObject({ role: "assistant" });
    expect(state0.stage).toBe(1);
  });

  it("readyForSynthesis 需 LLM 标志 + DSL 工程信号齐全", async () => {
    const llm = scriptedLlm([
      turn("先收个尾。", {
        state_delta: { engineering: { dimension: "2D" } },
        ready_for_synthesis: true,
      }),
    ]);
    const res = await advance(createInitialState(), "差不多了", { llm, systemPrompt: SYS });
    expect(res.readyForSynthesis).toBe(false);
  });

  it("无 sentinel：不推进阶段并携带 warning", async () => {
    const llm = scriptedLlm(["纯人话，没有状态块"]);
    const s = createInitialState();
    s.stage = 1;
    s.spark = "x";
    const res = await advance(s, "嗯", { llm, systemPrompt: SYS });
    expect(res.state.stage).toBe(1);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
