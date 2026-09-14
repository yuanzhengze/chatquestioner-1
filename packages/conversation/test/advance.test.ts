import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { advance } from "../src/advance.js";
import { STATE_SENTINEL } from "../src/turn.js";
import { scriptedLlm } from "./fixtures/scriptedLlm.js";
import { CONSENT_OPTIONS, CONSENT_AFTER_IDEA, DECLINED_ACK } from "../src/llm.js";
import { isComplete, isSubstantive } from "@cq/gdd";
import { toGddModel } from "../src/compile.js";

const SYS = "（测试用系统提示词占位）";

function turn(reply: string, control: object): string {
  return `${reply}\n${STATE_SENTINEL}\n${JSON.stringify(control)}`;
}

function accepted(s = createInitialState()) {
  s.guidance = "accepted" as const;
  return s;
}

describe("advance", () => {
  it("pending 未点选项时不调 LLM，回提醒和两选项", async () => {
    let calls = 0;
    const llm = {
      async *stream() {
        calls += 1;
        yield "should not run";
      },
    };
    const tokens: string[] = [];
    const res = await advance(createInitialState(), "我想做猫咪游戏", {
      llm, systemPrompt: SYS, onToken: (t) => tokens.push(t),
    });
    expect(calls).toBe(0);
    expect(res.reply).toBe(CONSENT_AFTER_IDEA);
    expect(tokens.join("")).toBe(CONSENT_AFTER_IDEA);
    expect(res.options).toEqual(CONSENT_OPTIONS);
    expect(res.state.guidance).toBe("pending");
    expect(res.readyForSynthesis).toBe(false);
  });

  it("先说想法再点「是」，第二轮才调 LLM", async () => {
    let calls = 0;
    const llm = {
      async *stream() {
        calls += 1;
        yield turn("画面很酷，最想抓住哪一块？", { state_delta: { spark: "猫咪游戏" }, stage_complete: true });
      },
    };
    const afterIdea = await advance(createInitialState(), "我想做猫咪游戏", { llm, systemPrompt: SYS });
    expect(calls).toBe(0);
    expect(afterIdea.options).toHaveLength(2);
    const afterYes = await advance(afterIdea.state, CONSENT_OPTIONS[0].label, { llm, systemPrompt: SYS });
    expect(calls).toBe(1);
    expect(afterYes.state.guidance).toBe("accepted");
    expect(afterYes.state.spark).toBe("猫咪游戏");
    expect(afterYes.readyForSynthesis).toBe(false);
  });

  it("点「是」后进入引导并调用 LLM", async () => {
    const llm = scriptedLlm([
      turn("听起来很治愈！最想先抓住哪张画面？", {
        state_delta: { spark: "治愈系猫咪连连看" },
        stage_complete: true,
      }),
    ]);
    const res = await advance(createInitialState(), CONSENT_OPTIONS[0].label, {
      llm, systemPrompt: SYS,
    });
    expect(res.state.guidance).toBe("accepted");
    expect(res.reply).toContain("治愈");
    expect(res.state.spark).toBe("治愈系猫咪连连看");
  });

  it("点「否」后不调 LLM，之后自由抽取", async () => {
    let calls = 0;
    const idle = {
      async *stream() {
        calls += 1;
        yield turn("记下了。", { state_delta: { spark: "自由脑洞" } });
      },
    };
    const declined = await advance(createInitialState(), CONSENT_OPTIONS[1].label, {
      llm: idle, systemPrompt: SYS,
    });
    expect(calls).toBe(0);
    expect(declined.state.guidance).toBe("declined");
    expect(declined.reply).toBe(DECLINED_ACK);

    const extracted = await advance(declined.state, "我想做深夜猫咖连连看", {
      llm: idle, systemPrompt: SYS,
    });
    expect(calls).toBe(1);
    expect(extracted.state.spark).toBe("自由脑洞");
  });

  it("合并 state_delta、推进阶段、记录历史，并流式回放 reply", async () => {
    const llm = scriptedLlm([
      turn("听起来你想要治愈和解压！你更想连猫还是连甜点？", {
        state_delta: { spark: "治愈系猫咪连连看" },
        stage_complete: true,
      }),
    ]);
    const tokens: string[] = [];
    const state0 = accepted();
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

  it("readyForSynthesis 由代码完整度决定，不信 LLM 那一比特", async () => {
    const llm = scriptedLlm([
      turn("先收个尾。", {
        state_delta: {},
        ready_for_synthesis: true,
      }),
    ]);
    const res = await advance(accepted(), "差不多了", { llm, systemPrompt: SYS });
    expect(res.readyForSynthesis).toBe(false);
    expect(res.state.readyForSynthesis).toBe(false);
    expect(res.state.lastOptions).toEqual([]);
  });

  it("无 sentinel：不合并字段；缺口仍在则停在当前阶段", async () => {
    const llm = scriptedLlm(["纯人话，没有状态块"]);
    const s = accepted();
    s.stage = 2;
    s.spark = "x";
    const res = await advance(s, "嗯", { llm, systemPrompt: SYS });
    expect(res.state.stage).toBe(2);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("无 sentinel 时 onToken 拼接 == 完整 reply（不漏结尾回扣字符）", async () => {
    const llm = scriptedLlm(["这是一段没有状态块的纯人话回复内容内容内容内容"]);
    const tokens: string[] = [];
    const res = await advance(accepted(), "hi", {
      llm, systemPrompt: SYS, onToken: (t) => tokens.push(t),
    });
    expect(tokens.join("")).toBe(res.reply);
  });

  it("把解析出的 options 放进结果", async () => {
    const llm = scriptedLlm([
      turn("你更喜欢哪个？", {
        state_delta: {},
        options: [
          { id: "A", label: "a", detail: "da" },
          { id: "B", label: "b", detail: "db" },
        ],
      }),
    ]);
    const res = await advance(accepted(), "嗨", { llm, systemPrompt: SYS });
    expect(res.options).toHaveLength(2);
    expect(res.options?.[0].id).toBe("A");
    expect(res.state.lastOptions).toEqual(res.options);
    expect(res.state.readyForSynthesis).toBe(false);
  });

  it("同意后把第一条想法写入 spark，并跳过火花阶段", async () => {
    const llm = scriptedLlm([
      turn("你要的解压更靠近哪一种？", {
        state_delta: {},
        options: [
          { id: "A", label: "治愈踩奶", detail: "呼噜和暖光慢慢铺满" },
          { id: "B", label: "宣泄拆家", detail: "拍飞杯子碎得越响越爽" },
        ],
      }),
    ]);
    const afterIdea = await advance(createInitialState(), "我想做解压的猫咪游戏", { llm, systemPrompt: SYS });
    const afterYes = await advance(afterIdea.state, CONSENT_OPTIONS[0].label, { llm, systemPrompt: SYS });
    expect(afterYes.state.spark).toBe("我想做解压的猫咪游戏");
    expect(afterYes.state.stage).toBe(2);
    expect(afterYes.options).toHaveLength(2);
  });

  it("旧会话没有 guidance 字段时，已有用户发言则视为已同意", async () => {
    const llm = scriptedLlm([
      turn("继续。", { state_delta: { spark: "旧档续聊" } }),
    ]);
    const s = createInitialState();
    delete (s as { guidance?: string }).guidance;
    s.history.push({ role: "user", content: "以前说过" });
    const res = await advance(s, "接着聊", { llm, systemPrompt: SYS });
    expect(res.state.guidance).toBe("accepted");
    expect(res.state.spark).toBe("旧档续聊");
  });

  it("用户中途要生成且已有实质内容时，出草稿并保留选项", async () => {
    const llm = scriptedLlm([
      turn("先看一版带缺口的草稿。", {
        state_delta: {},
        options: [
          { id: "A", label: "更解压", detail: "节奏再慢一点" },
          { id: "B", label: "更刺激", detail: "节奏再快一点" },
        ],
      }),
    ]);
    const s = accepted();
    s.spark = "猫咪帝国";
    s.pitch = "猫RTS";
    s.coreEmotion = "反差萌";
    const res = await advance(s, "现在就生成", { llm, systemPrompt: SYS });
    expect(isSubstantive(toGddModel(res.state))).toBe(true);
    expect(isComplete(toGddModel(res.state))).toBe(false);
    expect(res.state.gddComplete).toBe(false);
    expect(res.readyForSynthesis).toBe(true);
    expect(res.options).toHaveLength(2);
    expect(res.state.lastOptions).toHaveLength(2);
  });

  it("确认总结并要求生成最终文档时，未过完整度也出草稿", async () => {
    const llm = scriptedLlm([
      turn("蓝图已经记下了。", { state_delta: {} }),
    ]);
    const s = accepted();
    s.spark = "九龙城寨开火焦虑";
    s.coreEmotion = "压抑";
    s.pitch = "城寨幽鸣";
    const res = await advance(
      s,
      "确认当前的总结完美契合心中构想，直接生成最终的设计文档。",
      { llm, systemPrompt: SYS },
    );
    expect(isComplete(toGddModel(res.state))).toBe(false);
    expect(res.state.gddComplete).toBe(false);
    expect(res.readyForSynthesis).toBe(true);
  });

  it("助手已出口头概念总结、用户还没点确认时，不出草稿", async () => {
    const llm = scriptedLlm([
      turn("> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。", {
        state_delta: {},
        options: [
          { id: "A", label: "确认总结，生成设计文档", detail: "就按这个定稿，写成设计文档。" },
          { id: "B", label: "我还要再加点新设定", detail: "核心对，但还想改一块。" },
        ],
      }),
    ]);
    const s = accepted();
    s.spark = "九龙城寨开火焦虑";
    s.coreEmotion = "压抑";
    const res = await advance(s, "继续", { llm, systemPrompt: SYS });
    expect(res.state.workingTitle).toBe("城寨：风水魇");
    expect(isComplete(toGddModel(res.state))).toBe(false);
    expect(res.readyForSynthesis).toBe(false);
    expect(res.options).toHaveLength(2);
  });

  it("点方向 A 确认生成后才出草稿", async () => {
    const llm = scriptedLlm([
      turn("记下了，按这份蓝图出草稿。", { state_delta: {} }),
    ]);
    const s = accepted();
    s.spark = "九龙城寨";
    s.coreEmotion = "压抑";
    s.pitch = "风水魇";
    s.lastOptions = [
      { id: "A", label: "确认总结，生成设计文档", detail: "就按这个写进完整设计文档，保留风水城寨。" },
      { id: "B", label: "我还要再加点新设定", detail: "先不生成，再改一块。" },
    ];
    const res = await advance(s, s.lastOptions[0].detail, { llm, systemPrompt: SYS });
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.gddComplete).toBe(false);
  });

  it("一次写满字段也只推进一节，不会跳过未问的 6/7", async () => {
    const llm = scriptedLlm([
      turn("朋友玩完会用哪个词形容？", {
        state_delta: {
          coreEmotion: "治愈",
          coreAction: "连同色猫",
          theme: "猫咖",
          aesthetic: "水彩",
          loop: { thirtySec: "划线连猫" },
          reward: "分数闪光",
          failRule: "连错扣时",
          juice: ["烟花"],
          world: "发光猫咖",
          difficulty: { ramp: "猫变多" },
          presentation: { where: "手机", dimension: "平面" },
        },
      }),
    ]);
    const s = accepted();
    s.stage = 2;
    s.spark = "猫咪连连看";
    const res = await advance(s, "都给你了", { llm, systemPrompt: SYS });
    expect(res.state.askedStages).toContain(2);
    expect(res.state.stage).toBe(3);
  });
});
