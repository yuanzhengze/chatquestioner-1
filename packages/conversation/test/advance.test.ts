import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { advance } from "../src/advance.js";
import { STATE_SENTINEL } from "../src/turn.js";
import { scriptedLlm } from "./fixtures/scriptedLlm.js";
import { CONSENT_OPTIONS, CONSENT_AFTER_IDEA, DECLINED_ACK, CONVERGENCE_OPTIONS, PATCH_OPTIONS } from "../src/llm.js";
import { isComplete, isSubstantive, renderGdd } from "@cq/gdd";
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
        yield turn("画面很酷，最想抓住哪一块？", {
          state_delta: { spark: "猫咪游戏" },
          stage_complete: true,
          options: [
            { id: "A", label: "治愈踩奶", detail: "呼噜和暖光慢慢铺满" },
            { id: "B", label: "宣泄拆家", detail: "拍飞杯子碎得越响越爽" },
          ],
        });
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
        options: [
          { id: "A", label: "暖光猫咖", detail: "夜里店里只剩呼噜声" },
          { id: "B", label: "雨巷躲猫", detail: "撑伞穿过湿漉漉的巷子" },
        ],
      }),
    ]);
    const res = await advance(createInitialState(), CONSENT_OPTIONS[0].label, {
      llm, systemPrompt: SYS,
    });
    expect(res.state.guidance).toBe("accepted");
    expect(res.reply).toContain("治愈");
    expect(res.state.spark).toBeFalsy();
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
    expect(extracted.state.spark).toBe("我想做深夜猫咖连连看");
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
    expect(res.state.spark).toBe("我想做个治愈的小游戏");
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
    expect(res.state.spark).toBe("以前说过");
  });

  it("用户中途要生成且已有实质内容时，出草稿、当轮不弹选项、仍停在采访", async () => {
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
    s.history = [{ role: "user", content: "猫咪帝国，猫RTS，反差萌" }];
    const res = await advance(s, "现在就生成", { llm, systemPrompt: SYS });
    expect(isSubstantive(toGddModel(res.state))).toBe(true);
    expect(isComplete(toGddModel(res.state))).toBe(false);
    expect(res.state.gddComplete).toBe(false);
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.gddDraftBar).toBe(true);
    expect(res.options).toBeUndefined();
    expect(res.state.optionPhase).toBe("interview");
  });

  it("中途出草稿后下一轮仍给采访方向，不跳定稿三选", async () => {
    const llm = scriptedLlm([
      turn("先看草稿。", { state_delta: {} }),
      turn("朋友玩完会用哪个词形容？", {
        state_delta: {},
        options: [
          { id: "A", label: "解压", detail: "像被踩奶" },
          { id: "B", label: "紧张", detail: "刚玩完还在抖" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 2;
    s.spark = "猫咪帝国";
    s.pitch = "猫RTS";
    s.coreEmotion = "反差萌";
    s.history = [{ role: "user", content: "猫咪帝国，猫RTS，反差萌" }];
    const draft = await advance(s, "现在就生成", { llm, systemPrompt: SYS });
    expect(draft.readyForSynthesis).toBe(true);
    expect(draft.state.optionPhase).toBe("interview");
    const next = await advance(draft.state, "继续问", { llm, systemPrompt: SYS });
    expect(next.readyForSynthesis).toBe(true);
    expect(next.options).toHaveLength(2);
    expect(next.options?.[0].label).toContain("解压");
    expect(next.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(next.state.optionPhase).toBe("interview");
  });

  it("对话里没出现的参考作品不能进文档", async () => {
    const llm = scriptedLlm([
      turn("记下了，先出一版草稿。", {
        state_delta: { references: ["旅行青蛙"], avoidReferences: ["星露谷硬核打工"] },
      }),
    ]);
    const s = accepted();
    s.spark = "纸片农场";
    s.pitch = "手账里种种田";
    s.history = [{ role: "user", content: "纸片农场，手账里种种田" }];
    const res = await advance(s, "现在就生成", { llm, systemPrompt: SYS });
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.references).toEqual([]);
    expect(res.state.avoidReferences).toEqual([]);
    const md = renderGdd(toGddModel(res.state));
    expect(md).not.toContain("旅行青蛙");
    expect(md).not.toContain("星露谷");
  });

  it("采访润色进字段后可以离开核心体验节，不要求原话逐字出现", async () => {
    const llm = scriptedLlm([
      turn("记下了。接下来头几秒玩家在干什么？", {
        state_delta: {
          coreEmotion: "开箱时的惊喜感",
          coreAction: "点洞口把长鹅拔出来",
          world: "南极冰山",
          aesthetic: "微缩手办质感",
        },
      }),
    ]);
    const s = accepted();
    s.stage = 2;
    s.spark = "南极冰山钓长鹅";
    const res = await advance(s, "继续", { llm, systemPrompt: SYS });
    expect(res.state.coreEmotion).toContain("惊喜");
    expect(res.state.askedStages).toContain(2);
    expect(res.state.stage).toBe(3);
  });

  it("出稿当轮不弹选项；用户再打字后卡片回来，气泡里的 A/B 原文保留", async () => {
    const llm = scriptedLlm([
      turn("先看草稿。", { state_delta: {} }),
      turn(
        "在这个大屏幕上，玩家们具体是怎么互相干扰的？\n\n" +
          "A. **实时大乱斗**：大家同屏各自拔自己的鹅。\n" +
          "B. **轮流坐庄受刑**：聚光灯一次只打在一个人身上。",
        {
          state_delta: {},
          options: [
            { id: "A", label: "实时大乱斗", detail: "大家同屏各自拔自己的鹅。" },
            { id: "B", label: "轮流坐庄受刑", detail: "聚光灯一次只打在一个人身上。" },
          ],
        },
      ),
      turn("记下了这一块。", { state_delta: {} }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "猫咪帝国";
    s.pitch = "猫RTS";
    s.coreEmotion = "反差萌";
    s.summaryEligibleFrom = 0;
    s.history = [
      { role: "user", content: "猫咪帝国，猫RTS，反差萌" },
      { role: "assistant", content: "> 📌 **暂定名**：《猫RTS》\n> 📌 **一句话亮点**：猫咪帝国" },
    ];
    s.lastOptions = CONVERGENCE_OPTIONS.map((o) => ({ ...o }));
    const draft = await advance(s, CONVERGENCE_OPTIONS[0].detail, { llm, systemPrompt: SYS });
    expect(draft.readyForSynthesis).toBe(true);
    expect(draft.options).toBeUndefined();
    const next = await advance(draft.state, "干扰怎么表现？", { llm, systemPrompt: SYS });
    expect(next.readyForSynthesis).toBe(true);
    expect(next.options).toHaveLength(2);
    expect(next.options?.[0].label).toContain("实时大乱斗");
    expect(next.reply).toContain("怎么互相干扰");
    expect(next.reply).toContain("实时大乱斗");
    const fork = await advance(next.state, next.options![0].detail, { llm, systemPrompt: SYS });
    expect(fork.options).toEqual(CONVERGENCE_OPTIONS);
    expect(fork.readyForSynthesis).toBe(true);
  });

  it("已有文档后再改设定，state_delta 覆盖旧值并重编文档门", async () => {
    const llm = scriptedLlm([
      turn("先看草稿。", { state_delta: {} }),
      turn("记下了，名字换成新标题。", {
        state_delta: { workingTitle: "新标题" },
        options: [
          { id: "A", label: "再加强干扰", detail: "干扰更狠一点" },
          { id: "B", label: "再加强盲盒", detail: "隐藏款更多" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "猫咪帝国";
    s.pitch = "猫RTS";
    s.coreEmotion = "反差萌";
    s.workingTitle = "旧名字";
    s.history = [{ role: "user", content: "猫咪帝国，猫RTS，反差萌，暂定名旧名字" }];
    const draft = await advance(s, "现在就生成", { llm, systemPrompt: SYS });
    expect(draft.readyForSynthesis).toBe(true);
    expect(draft.state.workingTitle).toBe("旧名字");
    const next = await advance(draft.state, "名字改成新标题", { llm, systemPrompt: SYS });
    expect(next.state.workingTitle).toBe("新标题");
    expect(next.readyForSynthesis).toBe(true);
    expect(next.options).toHaveLength(2);
  });

  it("引导模式 JSON 和人话都没有选项时，宿主重试一次直到有卡片", async () => {
    let calls = 0;
    const llm = {
      async *stream(messages: { role?: string; content?: string }[]) {
        if (messages[0]?.content?.includes("[GDD_EXTRACT_V1]")) {
          yield "{}";
          return;
        }
        calls += 1;
        if (calls === 1) {
          yield turn("你更喜欢哪个？", { state_delta: {} });
          return;
        }
        yield turn("你更喜欢哪个？", {
          state_delta: {},
          options: [
            { id: "A", label: "信号找同伴", detail: "找回失联的同伴" },
            { id: "B", label: "回声拼真相", detail: "拼出真相" },
          ],
        });
      },
    };
    const res = await advance(accepted(), "继续", { llm, systemPrompt: SYS });
    expect(calls).toBe(2);
    expect(res.options).toHaveLength(2);
    expect(res.options?.[0].label).toContain("信号找同伴");
    expect(res.reply).toContain("你更喜欢哪个");
  });

  it("纠偏补卡时不换已流出的人话，即使第二遍写了另一段", async () => {
    const tokens: string[] = [];
    const llm = scriptedLlm([
      turn("你更喜欢哪个？", { state_delta: {} }),
      turn("巷战更想要哪种压迫？", {
        state_delta: {},
        options: [
          { id: "A", label: "巷窄到擦肩", detail: "墙皮蹭掉一层灰。" },
          { id: "B", label: "楼上传来脚步", detail: "先听见人再看见人。" },
        ],
      }),
    ]);
    const res = await advance(accepted(), "继续", {
      llm, systemPrompt: SYS, onToken: (t) => tokens.push(t),
    });
    expect(tokens.join("")).toContain("你更喜欢哪个");
    expect(tokens.join("")).not.toContain("巷战");
    expect(res.reply).toContain("你更喜欢哪个");
    expect(res.reply).not.toContain("巷战");
    expect(res.options?.[0].label).toContain("巷窄");
  });

  it("采访轮缺方向时让模型按纪律补卡，第二次仍缺则再补，不由宿主代写卡片", async () => {
    const llm = scriptedLlm([
      turn("> ❓ 你希望视听氛围偏向哪种感觉？", { state_delta: {} }),
      turn("> ❓ 你希望视听氛围偏向哪种感觉？", { state_delta: {} }),
      turn("> ❓ 你希望视听氛围偏向哪种感觉？", {
        state_delta: {},
        options: [
          { id: "A", label: "粗豪美漫爆屏", detail: "火星和金币像美漫一样满屏炸开。" },
          { id: "B", label: "市井烟火夜摊", detail: "铁锅滋啦、深夜摊的热气和收银叮叮。" },
          { id: "C", label: "赛博霓虹后厨", detail: "机械臂颠勺，霓虹扫过热油。" },
        ],
      }),
    ]);
    const res = await advance(accepted(), "请给我选项", { llm, systemPrompt: SYS });
    expect(res.options).toHaveLength(3);
    expect(res.options?.[0].label).toContain("粗豪美漫");
    expect(res.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(res.options?.some((o) => /最过瘾|留一点呼吸|来个反差/.test(o.label))).toBe(false);
    expect(res.state.optionPhase).toBe("interview");
    expect(res.readyForSynthesis).toBe(false);
  });

  it("出文档前 JSON 没给 options 时，从人话 A/B 收回卡片，气泡原文不动", async () => {
    const llm = scriptedLlm([
      turn(
        "你更想要哪种？\n\n" +
          "A. **全程隐藏，最后开箱**：拔的时候只能看到鹅头。\n" +
          "B. **实时拔出，当场眼红**：每踩中一次就往上窜。",
        { state_delta: {} },
      ),
    ]);
    const res = await advance(accepted(), "继续", { llm, systemPrompt: SYS });
    expect(res.state.readyForSynthesis).toBe(false);
    expect(res.options).toHaveLength(2);
    expect(res.options?.[0].label).toContain("全程隐藏");
    expect(res.options?.[1].label).toContain("实时拔出");
    expect(res.reply).toContain("你更想要哪种");
    expect(res.reply).toMatch(/A\.\s*\*\*全程隐藏/);
  });

  it("确认总结并要求生成最终文档时，未过完整度也出草稿", async () => {
    const llm = scriptedLlm([
      turn("蓝图已经记下了。", { state_delta: {} }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "九龙城寨开火焦虑";
    s.coreEmotion = "压抑";
    s.pitch = "城寨幽鸣";
    s.history = [
      { role: "user", content: "九龙城寨开火焦虑，压抑，城寨幽鸣" },
      {
        role: "assistant",
        content: "> 📌 **暂定游戏名**：《城寨幽鸣》\n> 📌 **一句话亮点**：开火即逃亡。",
      },
    ];
    const res = await advance(
      s,
      "确认当前的总结完美契合心中构想，直接生成最终的设计文档。",
      { llm, systemPrompt: SYS },
    );
    expect(isComplete(toGddModel(res.state))).toBe(false);
    expect(res.state.gddComplete).toBe(false);
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.gddDraftBar).toBe(false);
  });

  it("第 10 节且本轮写出合格概念总结时，给出定稿三选", async () => {
    const llm = scriptedLlm([
      turn("> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。", {
        state_delta: { workingTitle: "城寨：风水魇" },
        options: [
          { id: "A", label: "确认总结，生成设计文档", detail: "就按这个定稿，写成设计文档。" },
          { id: "B", label: "我还要再加点新设定", detail: "核心对，但还想改一块。" },
          { id: "C", label: "城寨风水更阴", detail: "巷战更潮湿、更听得见脚步。" },
          { id: "D", label: "开火即逃亡更狠", detail: "枪响之后只剩跑。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "九龙城寨开火焦虑";
    s.coreEmotion = "压抑";
    const res = await advance(s, "继续", { llm, systemPrompt: SYS });
    expect(res.state.workingTitle).toBe("城寨：风水魇");
    expect(isComplete(toGddModel(res.state))).toBe(false);
    expect(res.readyForSynthesis).toBe(false);
    expect(res.options).toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("convergence");
  });

  it("总结后若还问新内容，人话原样保留并给定稿三选，且未点定稿不出文档", async () => {
    const llm = scriptedLlm([
      turn(
        "独自一人在电脑前，沉浸感拉满。\n\n" +
          "> 📌 蓝图已经成型！让我来做个概念总结：\n" +
          "> **暂定游戏名**：《破晓求生：机械遗迹》\n" +
          "> **一句话亮点**：沙盘荒岛上白天解谜、夜晚逃跑。\n\n" +
          "> ❓ 作为最后一个拼图，当玩家探明了所有神庙后，你希望这个等待救援的故事最终走向什么样的大结局？",
        { state_delta: { workingTitle: "破晓求生：机械遗迹" } },
      ),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "荒岛求生";
    s.coreEmotion = "紧张";
    s.pitch = "沙盘荒岛";
    const res = await advance(s, "键鼠一个人玩", { llm, systemPrompt: SYS });
    expect(res.options).toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("convergence");
    expect(res.reply).toContain("破晓求生：机械遗迹");
    expect(res.reply).toContain("大结局");
    expect(res.readyForSynthesis).toBe(false);
    expect(res.state.history.at(-1)?.content).toContain("破晓求生：机械遗迹");
  });

  it("未到第 10 节时历史里的合格总结也不换三选、不跳节", async () => {
    const llm = scriptedLlm([
      turn("界面要不要做？", {
        state_delta: {},
        options: [
          { id: "A", label: "无UI", detail: "全靠场景提示。" },
          { id: "B", label: "意识流", detail: "脑内独白当提示。" },
          { id: "C", label: "伪纪录片", detail: "字幕和画外音。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 7;
    s.optionPhase = "interview";
    s.spark = "三十夜荒野";
    s.history = [
      { role: "user", content: CONSENT_OPTIONS[0].label },
      {
        role: "assistant",
        content: "我们已经把核心骨架拼全了。\n> 📌 **《木板与喘息》**（暂定）\n> **核心体验**：三十夜。\n❓ 蓝图已经基本成型！",
      },
    ];
    const res = await advance(s, "先不定", { llm, systemPrompt: SYS });
    expect(res.readyForSynthesis).toBe(false);
    expect(res.options?.[0].label).toContain("无UI");
    expect(res.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("interview");
    expect(res.state.stage).toBe(7);
  });

  it("第 7 节本轮写出合格总结时出定稿三选，人话保留，不跳到第 10 节", async () => {
    const llm = scriptedLlm([
      turn(
        "> 📌 **暂定名**：《极简超市：禅意收纳》\n> **一句话亮点**：严丝合缝收纳。\n\n> ❓ 礼盒订单更像俄罗斯方块还是盲盒？",
        {
          state_delta: { workingTitle: "极简超市：禅意收纳" },
          options: [
            { id: "A", label: "空间嵌合式", detail: "在礼盒里反复旋转嵌合。" },
            { id: "B", label: "视觉强迫症式", detail: "按颜色渐变排列。" },
            { id: "C", label: "盲盒打包式", detail: "按标签挑商品装箱。" },
          ],
        },
      ),
    ]);
    const s = accepted();
    s.stage = 7;
    s.optionPhase = "interview";
    s.spark = "超市收纳";
    s.presentation.where = "电脑";
    const res = await advance(s, "流水线平移视角", { llm, systemPrompt: SYS });
    expect(res.options).toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("convergence");
    expect(res.reply).toContain("极简超市：禅意收纳");
    expect(res.reply).toContain("礼盒订单");
    expect(res.state.stage).toBe(7);
    expect(res.readyForSynthesis).toBe(false);
  });

  it("第 7 节本轮写出合格总结时不纠偏成采访，人话保留并出三选", async () => {
    const tokens: string[] = [];
    const llm = scriptedLlm([
      turn("> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。", {
        state_delta: { workingTitle: "城寨：风水魇" },
      }),
      turn("巷战更想要哪种压迫？", {
        state_delta: {},
        options: [
          { id: "A", label: "巷窄到擦肩", detail: "墙皮蹭掉一层灰。" },
          { id: "B", label: "楼上传来脚步", detail: "先听见人再看见人。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 7;
    s.spark = "九龙城寨";
    const res = await advance(s, "继续", { llm, systemPrompt: SYS, onToken: (t) => tokens.push(t) });
    expect(tokens.join("")).toContain("城寨：风水魇");
    expect(res.reply).toContain("城寨：风水魇");
    expect(res.reply).toContain("开火即逃亡");
    expect(res.reply).not.toContain("巷战");
    expect(res.options).toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("convergence");
    expect(res.state.stage).toBe(7);
    expect(res.readyForSynthesis).toBe(false);
  });

  it("本轮人话是提问时出对应方向卡，不因历史里已有总结而改成三选", async () => {
    const llm = scriptedLlm([
      turn("界面要不要做？", {
        state_delta: {},
        options: [
          { id: "A", label: "无UI", detail: "全靠场景提示。" },
          { id: "B", label: "意识流", detail: "脑内独白当提示。" },
          { id: "C", label: "伪纪录片", detail: "字幕和画外音。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.optionPhase = "interview";
    s.spark = "三十夜荒野";
    s.summaryEligibleFrom = 0;
    s.history = [
      { role: "user", content: CONSENT_OPTIONS[0].label },
      {
        role: "assistant",
        content: "我们已经把核心骨架拼全了。\n> 📌 **《木板与喘息》**（暂定）\n> **核心体验**：三十夜。",
      },
    ];
    const res = await advance(s, "先不定", { llm, systemPrompt: SYS });
    expect(res.reply).toContain("界面要不要做");
    expect(res.options?.[0].label).toContain("无UI");
    expect(res.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("interview");
  });

  it("历史里已有总结但本轮流出的是提问时，缺卡只补方向、不换成三选、不换人话", async () => {
    const tokens: string[] = [];
    const llm = scriptedLlm([
      turn("界面要不要做？", { state_delta: {} }),
      turn("巷战更想要哪种压迫？", {
        state_delta: {},
        options: [
          { id: "A", label: "无UI", detail: "全靠场景提示。" },
          { id: "B", label: "意识流", detail: "脑内独白当提示。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.optionPhase = "interview";
    s.spark = "三十夜荒野";
    s.summaryEligibleFrom = 0;
    s.history = [
      { role: "user", content: CONSENT_OPTIONS[0].label },
      {
        role: "assistant",
        content: "我们已经把核心骨架拼全了。\n> 📌 **《木板与喘息》**（暂定）\n> **核心体验**：三十夜。",
      },
    ];
    const res = await advance(s, "先不定", {
      llm, systemPrompt: SYS, onToken: (t) => tokens.push(t),
    });
    expect(tokens.join("")).toContain("界面要不要做");
    expect(tokens.join("")).not.toContain("巷战");
    expect(res.reply).toContain("界面要不要做");
    expect(res.options?.[0].label).toContain("无UI");
    expect(res.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("interview");
  });

  it("已到第 10 节但还没有合格总结时，JSON 定稿项也不换卡，仍出设计选项", async () => {
    const llm = scriptedLlm([
      turn("咱们的游戏骨架已经非常清晰了！你希望玩家主要在什么设备上玩？", {
        state_delta: {},
        options: [
          { id: "A", label: "就按这个定稿，写成设计文档", detail: "就按这个定稿，写成设计文档。" },
          { id: "B", label: "核心对，但要改某一块", detail: "核心对，但要改某一块。" },
          { id: "C", label: "手机竖屏一个人玩", detail: "通勤时用触屏搜刮。" },
          { id: "D", label: "电脑键鼠硬核操作", detail: "大屏看深海层次。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.optionPhase = "interview";
    s.spark = "收集建造生存";
    const res = await advance(s, "上强度就这样", { llm, systemPrompt: SYS });
    expect(res.options).toHaveLength(2);
    expect(res.options?.[0].label).toContain("手机");
    expect(res.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("interview");
    expect(res.readyForSynthesis).toBe(false);
  });

  it("引导答了很多轮但还没有概念总结、也没到第 10 节时，仍出设计选项", async () => {
    const llm = scriptedLlm([
      turn("再问一个界面？", {
        state_delta: {},
        options: [
          { id: "A", label: "无UI", detail: "全靠场景。" },
          { id: "B", label: "血条", detail: "传统 HUD。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 7;
    s.optionPhase = "interview";
    s.history = [{ role: "user", content: CONSENT_OPTIONS[0].label }];
    for (let i = 0; i < 9; i++) {
      s.history.push({ role: "assistant", content: `问${i}？` });
      s.history.push({ role: "user", content: `答${i}，就按这个感觉。` });
    }
    const res = await advance(s, "答九，就按这个感觉。", { llm, systemPrompt: SYS });
    expect(res.options).toHaveLength(2);
    expect(res.options?.[0].label).toContain("无UI");
    expect(res.options).not.toEqual(CONVERGENCE_OPTIONS);
    expect(res.state.optionPhase).toBe("interview");
    expect(res.readyForSynthesis).toBe(false);
  });

  it("点方向 A 确认生成后才出草稿", async () => {
    const llm = scriptedLlm([
      turn("记下了，按这份蓝图出草稿。", { state_delta: {} }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "九龙城寨";
    s.coreEmotion = "压抑";
    s.pitch = "风水魇";
    s.history = [
      { role: "user", content: "九龙城寨，压抑，风水魇" },
      {
        role: "assistant",
        content: "> 📌 **暂定名**：《城寨：风水魇》\n> 📌 **一句话亮点**：开火即逃亡。",
      },
    ];
    s.lastOptions = [
      { id: "A", label: "确认总结，生成设计文档", detail: "就按这个写进完整设计文档，保留风水城寨。" },
      { id: "B", label: "我还要再加点新设定", detail: "先不生成，再改一块。" },
    ];
    const res = await advance(s, s.lastOptions[0].detail, { llm, systemPrompt: SYS });
    expect(res.readyForSynthesis).toBe(true);
    expect(res.state.gddComplete).toBe(false);
    expect(res.state.gddDraftBar).toBe(false);
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
        options: [
          { id: "A", label: "紧张到手心出汗", detail: "刚玩完还在抖" },
          { id: "B", label: "极度解压", detail: "像被踩奶" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 2;
    s.spark = "猫咪连连看";
    const res = await advance(s, "都给你了", { llm, systemPrompt: SYS });
    expect(res.state.askedStages).toContain(2);
    expect(res.state.stage).toBe(3);
    expect(res.state.stage).toBeLessThan(6);
  });

  it("进入收敛后由宿主给出定稿/改一块/再挖挖；改一块先出设计选项，选完再回到三选", async () => {
    const llm = scriptedLlm([
      turn("蓝图可以落盘了。", {
        state_delta: {},
        options: [
          { id: "A", label: "不该出现的方向", detail: "采访选项应被换成收敛三选" },
          { id: "B", label: "另一个不该出现", detail: "宿主会覆盖" },
        ],
      }),
      turn("想改哪一块？", {
        state_delta: {},
        options: [
          { id: "A", label: "把互坑再写狠一点", detail: "干扰键随时打断心跳。" },
          { id: "B", label: "把盲盒再写满一点", detail: "隐藏款发光霓虹灯管。" },
        ],
      }),
      turn("互坑这一块记下了。", { state_delta: { mechanics: ["干扰键随时打断心跳"] } }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "天鹅颈";
    s.pitch = "潮玩拔鹅";
    s.coreEmotion = "紧张";
    s.presentation.where = "电视";
    s.presentation.dimension = "立体";
    s.askedStages = [2, 3, 4, 5, 6, 7, 8, 9];
    s.summaryEligibleFrom = 0;
    s.history = [
      {
        role: "assistant",
        content: "> 📌 **暂定名**：《天鹅颈刺客》\n> 📌 **一句话亮点**：潮玩拔鹅。",
      },
    ];
    const conv = await advance(s, "呈现就这样", { llm, systemPrompt: SYS });
    expect(conv.options).toEqual(CONVERGENCE_OPTIONS);
    expect(conv.state.optionPhase).toBe("convergence");
    expect(conv.readyForSynthesis).toBe(false);

    const sup = await advance(conv.state, CONVERGENCE_OPTIONS[1].detail, { llm, systemPrompt: SYS });
    expect(sup.state.optionPhase).toBe("supplement");
    expect(sup.options).toHaveLength(2);
    expect(sup.options?.[0].label).toContain("互坑");
    expect(sup.options?.some((o) => /定稿/.test(o.label))).toBe(false);

    const back = await advance(sup.state, sup.options![0].detail, { llm, systemPrompt: SYS });
    expect(back.options).toEqual(CONVERGENCE_OPTIONS);
    expect(back.state.optionPhase).toBe("convergence");
  });

  it("收敛点定稿当轮不弹卡；之后开口先给设计选项", async () => {
    const llm = scriptedLlm([
      turn("文档落盘了。", { state_delta: {} }),
      turn("标题怎么定？", {
        state_delta: { workingTitle: "新标题" },
        options: [
          { id: "A", label: "就叫新标题", detail: "短、好记。" },
          { id: "B", label: "加个副标题", detail: "新标题：在逃顶流。" },
        ],
      }),
    ]);
    const s = accepted();
    s.stage = 10;
    s.spark = "天鹅颈";
    s.pitch = "潮玩拔鹅";
    s.coreEmotion = "紧张";
    s.optionPhase = "convergence";
    s.lastOptions = CONVERGENCE_OPTIONS.map((o) => ({ ...o }));
    s.history = [
      { role: "user", content: "天鹅颈，潮玩拔鹅，紧张" },
      { role: "assistant", content: "> 📌 **暂定名**：《天鹅颈刺客》\n> 📌 **一句话亮点**：潮玩拔鹅。" },
    ];
    s.summaryEligibleFrom = 0;
    const gen = await advance(s, CONVERGENCE_OPTIONS[0].detail, { llm, systemPrompt: SYS });
    expect(gen.readyForSynthesis).toBe(true);
    expect(gen.options).toBeUndefined();
    expect(gen.state.optionPhase).toBe("awaitingEdit");

    const edit = await advance(gen.state, "名字改成新标题", { llm, systemPrompt: SYS });
    expect(edit.state.workingTitle).toBe("新标题");
    expect(edit.readyForSynthesis).toBe(true);
    expect(edit.options).toHaveLength(2);
    expect(edit.state.optionPhase).toBe("supplement");
  });

  it("补丁轮不写字段，点应用才写且不出定稿三选", async () => {
    let calls = 0;
    const llm = {
      async *stream() {
        calls += 1;
        yield turn("将改：核心动作 → 点击空田种菜。", {
          state_delta: { coreAction: "点击空田种菜", workingTitle: "偷改名", coreEmotion: "不该动" },
          affected_lines: ["coreAction"],
        });
      },
    };
    const s = accepted();
    s.coreAction = "点击空田播种";
    s.coreEmotion = "开火焦虑";
    s.readyForSynthesis = true;
    s.optionPhase = "convergence";
    s.lastOptions = CONVERGENCE_OPTIONS.map((o) => ({ ...o }));
    s.history = [{ role: "assistant", content: "先看文档。" }];
    const { beginLinePatch } = await import("../src/patch.js");
    beginLinePatch(s, { lineId: "coreAction", lineText: "核心动作：点击空田播种", sectionTitle: "怎么玩" });

    const asked = await advance(s, "改成种菜", { llm, systemPrompt: SYS });
    expect(calls).toBe(1);
    expect(asked.state.coreAction).toBe("点击空田播种");
    expect(asked.state.workingTitle).toBeUndefined();
    expect(asked.options).toEqual(PATCH_OPTIONS);
    expect(asked.state.optionPhase).toBe("patch");
    expect(asked.openPreview).toBeUndefined();
    expect(asked.reply).toContain("文档里会改这些地方");
    expect(asked.reply).toContain("核心动作");
    expect(asked.reply).not.toMatch(/手风琴/);

    const applied = await advance(asked.state, PATCH_OPTIONS[0].detail, { llm, systemPrompt: SYS });
    expect(calls).toBe(1);
    expect(applied.state.coreAction).toBe("点击空田种菜");
    expect(applied.state.workingTitle).toBeUndefined();
    expect(applied.state.coreEmotion).toBe("开火焦虑");
    expect(applied.patchCommitted).toBe(true);
    expect(applied.openPreview).toBe(true);
    expect(applied.state.optionPhase).toBe("awaitingEdit");
    expect(applied.options || []).toEqual([]);
    expect(applied.state.lastOptions || []).toEqual([]);
  });

  it("取消不写；再改改仍停在补丁相", async () => {
    const llm = scriptedLlm([
      turn("将改核心动作。", { state_delta: { coreAction: "种菜" }, affected_lines: ["coreAction"] }),
    ]);
    const s = accepted();
    s.coreAction = "播种";
    s.optionPhase = "interview";
    s.history = [{ role: "assistant", content: "继续问。" }];
    const { beginLinePatch } = await import("../src/patch.js");
    beginLinePatch(s, { lineId: "coreAction", lineText: "核心动作：播种", sectionTitle: "怎么玩" });
    const listed = await advance(s, "改成种菜", { llm, systemPrompt: SYS });
    expect(listed.state.coreAction).toBe("播种");

    const tweaked = await advance(listed.state, PATCH_OPTIONS[1].detail, { llm, systemPrompt: SYS });
    expect(tweaked.state.coreAction).toBe("播种");
    expect(tweaked.state.optionPhase).toBe("patch");
    expect(tweaked.openPreview).toBeUndefined();
    expect(tweaked.options || []).toEqual([]);

    const listed2 = {
      ...listed.state,
      lastOptions: PATCH_OPTIONS.map((o) => ({ ...o })),
      optionPhase: "patch" as const,
      patchContext: listed.state.patchContext,
    };
    const cancelled = await advance(listed2, PATCH_OPTIONS[2].detail, { llm, systemPrompt: SYS });
    expect(cancelled.state.coreAction).toBe("播种");
    expect(cancelled.openPreview).toBe(true);
    expect(cancelled.patchCommitted).toBeUndefined();
    expect(cancelled.state.optionPhase).toBe("interview");
  });
});
