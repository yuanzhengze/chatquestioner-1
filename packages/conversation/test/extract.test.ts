import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { extractDiscussedIntoState, groundedDelta, EXTRACT_PROMPT_TAG } from "../src/extract.js";
import { mergeFillEmpty } from "../src/merge.js";
import { harvestIntoState } from "../src/harvest.js";
import { advance } from "../src/advance.js";
import { STATE_SENTINEL } from "../src/turn.js";
import type { ChatMessage, LlmClient } from "../src/llm.js";

function turn(reply: string, control: object): string {
  return `${reply}\n${STATE_SENTINEL}\n${JSON.stringify(control)}`;
}

describe("groundedDelta", () => {
  it("丢掉对话里没有出处的键，保留原话", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "这局怎么才算到头了呢？" },
      { role: "user", content: "把所有星星收集齐就结束。" },
    ];
    const delta = groundedDelta({
      winRule: "把所有星星收集齐就结束。",
      forbiddenEmotion: "肝氪焦虑",
      presentation: { orientation: "横屏", players: "自己玩" },
    }, history);
    expect(delta.winRule).toContain("星星");
    expect(delta.forbiddenEmotion).toBeUndefined();
    expect(delta.presentation?.orientation).toBeUndefined();
    expect(delta.presentation?.players).toBeUndefined();
  });
});

describe("mergeFillEmpty", () => {
  it("不覆盖已有字段", () => {
    const s = createInitialState();
    s.winRule = "先写下的通关";
    mergeFillEmpty(s, { winRule: "抽取来的通关", pitch: "新 pitch" });
    expect(s.winRule).toBe("先写下的通关");
    expect(s.pitch).toBe("新 pitch");
  });
});

describe("extractDiscussedIntoState", () => {
  it("只把抽取 JSON 里、且对话中出现过的事实填进空位", async () => {
    const s = createInitialState();
    s.history = [
      { role: "assistant", content: "这局怎么才算到头了呢？" },
      { role: "user", content: "把所有星星收集齐就结束。" },
    ];
    const llm: LlmClient = {
      async *stream(messages: ChatMessage[]) {
        expect(messages[0]?.content).toContain(EXTRACT_PROMPT_TAG);
        yield JSON.stringify({
          winRule: "把所有星星收集齐就结束。",
          forbiddenEmotion: "谁也没说过的禁止情感",
        });
      },
    };
    await extractDiscussedIntoState(s, llm);
    expect(s.winRule).toContain("星星");
    expect(s.forbiddenEmotion).toBeFalsy();
  });

  it("overwrite 时用抽取结果覆盖已有字段", async () => {
    const s = createInitialState();
    s.workingTitle = "旧名字";
    s.history = [
      { role: "assistant", content: "暂定名叫旧名字。" },
      { role: "user", content: "改名叫新标题。" },
    ];
    const llm: LlmClient = {
      async *stream(messages: ChatMessage[]) {
        expect(messages[0]?.content).toContain(EXTRACT_PROMPT_TAG);
        expect(messages[1]?.content).toContain("最后一次");
        yield JSON.stringify({ workingTitle: "新标题" });
      },
    };
    await extractDiscussedIntoState(s, llm, { overwrite: true });
    expect(s.workingTitle).toBe("新标题");
  });
});

describe("advance 出文档时走抽取", () => {
  it("问法不像题库原句时，抽取仍能把聊过的通关写进状态", async () => {
    const llm: LlmClient = {
      async *stream(messages: ChatMessage[]) {
        if (messages[0]?.content?.includes(EXTRACT_PROMPT_TAG)) {
          yield JSON.stringify({ winRule: "把所有星星收集齐就结束。" });
          return;
        }
        yield turn("记下了，先出一版草稿。", { state_delta: {} });
      },
    };
    const s = createInitialState();
    s.guidance = "accepted";
    s.spark = "收集星星的休闲游戏";
    s.pitch = "夜间收集星星";
    s.coreEmotion = "解压";
    s.history = [
      { role: "assistant", content: "这局怎么才算到头了呢？" },
      { role: "user", content: "把所有星星收集齐就结束。" },
    ];
    harvestIntoState(s);
    expect(s.winRule).toBeFalsy();
    const res = await advance(s, "现在就生成", { llm, systemPrompt: "SYS" });
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.winRule).toContain("星星");
  });
});
