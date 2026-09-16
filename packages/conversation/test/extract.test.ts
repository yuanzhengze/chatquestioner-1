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
  it("允许把采访润色成文档用语，没出现过的作品名仍丢掉", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "这局怎么才算到头了呢？" },
      { role: "user", content: "把所有星星收集齐就结束。" },
    ];
    const delta = groundedDelta({
      winRule: "收集齐全部星星即可通关。",
      forbiddenEmotion: "肝氪焦虑",
      references: ["旅行青蛙"],
      presentation: { orientation: "横屏" },
      constitutionFields: {
        contentBoundary: "围绕摘星收集，不扩展未讨论的系统",
        presentationBoundary: "按已确认的游玩方式呈现",
      },
    }, history);
    expect(delta.winRule).toContain("星星");
    expect(delta.forbiddenEmotion).toBeUndefined();
    expect(delta.presentation?.orientation).toBe("横屏");
    expect(delta.constitutionFields?.contentBoundary).toContain("摘星");
    expect(delta.references).toBeUndefined();
  });

  it("丢掉对话里没出现过的参考作品", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "想做手账里种种田的解压游戏。" },
      { role: "assistant", content: "种田时最想抓住哪一种安静？" },
    ];
    const delta = groundedDelta({
      spark: "手账里种种田的解压游戏",
      references: ["旅行青蛙", "动物森友会"],
      avoidReferences: ["星露谷硬核打工"],
    }, history);
    expect(delta.spark).toContain("手账");
    expect(delta.references).toBeUndefined();
    expect(delta.avoidReferences).toBeUndefined();
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
  it("抽取可以把采访润色进字段，仍丢掉没出现的作品名", async () => {
    const s = createInitialState();
    s.history = [
      { role: "assistant", content: "这局怎么才算到头了呢？" },
      { role: "user", content: "把所有星星收集齐就结束。" },
    ];
    const llm: LlmClient = {
      async *stream(messages: ChatMessage[]) {
        expect(messages[0]?.content).toContain(EXTRACT_PROMPT_TAG);
        yield JSON.stringify({
          winRule: "收集齐全部星星即可通关。",
          references: ["旅行青蛙"],
          constitutionFields: {
            contentBoundary: "围绕摘星，不扩展未讨论的系统",
            presentationBoundary: "按已确认的方式呈现",
          },
        });
      },
    };
    await extractDiscussedIntoState(s, llm);
    expect(s.winRule).toContain("星星");
    expect(s.references).toEqual([]);
    expect(s.constitutionFields.contentBoundary).toContain("摘星");
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

  it("overwrite 时 mechanics / juice 替换而不是往历史上叠", async () => {
    const s = createInitialState();
    s.mechanics = ["香炉", "纸钱", "符咒", "供品", "放置"];
    s.juice = ["天光渗入", "香烟被照散", "天光从门缝渗进来"];
    s.history = [
      { role: "assistant", content: "最常做的动作是什么？" },
      { role: "user", content: "摆香炉纸钱符咒，靠香烟分清活人。" },
    ];
    const llm: LlmClient = {
      async *stream(messages: ChatMessage[]) {
        expect(messages[0]?.content).toMatch(/3–6/);
        expect(messages[0]?.content).toMatch(/3–5/);
        yield JSON.stringify({
          mechanics: ["香烟显形", "民俗物件布阵", "护香救人封门三选"],
          juice: ["第一声鸡鸣，天光从门缝渗入"],
        });
      },
    };
    await extractDiscussedIntoState(s, llm, { overwrite: true });
    expect(s.mechanics).toEqual(["香烟显形", "民俗物件布阵", "护香救人封门三选"]);
    expect(s.juice).toEqual(["第一声鸡鸣，天光从门缝渗入"]);
  });
});

describe("advance 首次定稿覆盖 spark 占位", () => {
  it("第一次生成也覆盖首句占住的 pitch / 幻想 / 内容边界", async () => {
    const spark = "我想做一个类似于沙威玛的模拟经营小游戏";
    const llm: LlmClient = {
      async *stream(messages: ChatMessage[]) {
        if (messages[0]?.content?.includes(EXTRACT_PROMPT_TAG)) {
          expect(messages[1]?.content).toContain("最后一次");
          yield JSON.stringify({
            pitch: "深夜食堂画风的日料微操模拟器，备菜治愈、开店满头大汗。",
            coreExperience: "进货备菜治愈，营业时双手微操打连击。",
            coreFantasy: "在暖黄吧台当寿司主厨，用丝滑微操喂饱大胃王。",
            playerIdentity: "日料店老板兼主厨",
            constitutionFields: {
              coreFantasy: "在暖黄吧台当寿司主厨，用丝滑微操喂饱大胃王。",
              contentBoundary: "单机微操经营，不做联机社交，不叠养成数值。",
              presentationBoundary: "手机横屏，能转视角的立体。",
            },
          });
          return;
        }
        yield turn("记下了，先出一版草稿。", { state_delta: {} });
      },
    };
    const s = createInitialState();
    s.guidance = "accepted";
    s.spark = spark;
    s.pitch = spark;
    s.coreExperience = spark;
    s.coreFantasy = spark;
    s.constitutionFields.coreFantasy = spark;
    s.constitutionFields.contentBoundary = "内容围绕已确认的核心循环，不扩展未讨论的系统";
    s.stage = 10;
    s.history = [
      { role: "user", content: spark },
      { role: "assistant", content: "店里最常做的一件事是什么？" },
      { role: "user", content: "滑拉生鱼片、拖拽到饭团上，画圈倒酱油。" },
    ];
    const res = await advance(s, "现在就生成", { llm, systemPrompt: "SYS" });
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.pitch).toContain("日料微操");
    expect(res.state.pitch).not.toBe(spark);
    expect(res.state.coreExperience).toContain("连击");
    expect(res.state.coreFantasy).toContain("寿司主厨");
    expect(res.state.constitutionFields.coreFantasy).toContain("寿司主厨");
    expect(res.state.constitutionFields.contentBoundary).toMatch(/单机|联机|养成/);
    expect(res.state.constitutionFields.contentBoundary).not.toContain("不扩展未讨论的系统");
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
    s.stage = 10;
    s.history = [
      { role: "user", content: "收集星星的休闲游戏，夜间收集星星，解压。" },
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
