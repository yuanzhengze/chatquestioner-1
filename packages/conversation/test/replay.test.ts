import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { advance } from "../src/advance.js";
import { toGddModel } from "../src/compile.js";
import { STATE_SENTINEL } from "../src/turn.js";
import { scriptedLlm } from "./fixtures/scriptedLlm.js";
import { isComplete, renderGdd } from "@cq/gdd";

const SYS = "（剧本回放系统提示词占位）";
const t = (reply: string, control: object) => `${reply}\n${STATE_SENTINEL}\n${JSON.stringify(control)}`;
const five = (p: string) => [`${p}一`, `${p}二`, `${p}三`, `${p}四`, `${p}五`];

const SCRIPT = [
  t("听起来你想要治愈与解压～", { state_delta: { spark: "治愈系猫咪连连看" }, stage_complete: true }),
  t("朋友玩完会说治愈。主题是治愈猫咪，画面水彩绘本配钢琴。", {
    state_delta: {
      coreEmotion: "治愈", theme: "治愈猫咪", world: "会发光的猫咖", aesthetic: "水彩绘本配钢琴",
      engineering: { dimension: "2D", platform: ["mobile"], orientation: "Portrait", modalities: ["image", "audio", "ui"], genre: "match-3", mechanics: ["drag-connect"], artStyle: "watercolor-cozy", intentTerms: ["猫咪", "连连看"] },
    },
    stage_complete: true,
  }),
  t("划线连同色猫，屏幕立刻呼噜连消。", {
    state_delta: {
      interaction: {
        verb: "划线",
        target: "同色猫",
        feedback: "连消并响起呼噜",
        chain: "划线 → 同色猫 → 连消除并响起呼噜",
      },
      coreAction: "连同色猫",
    },
    stage_complete: true,
  }),
  t("一划线就连消，分数闪光；连错则抖一下。最舍不得删的是满屏猫爪。短单局无长线。", {
    state_delta: {
      loop: { thirtySec: "一划线就连消", fiveMin: "短单局，中循环即一局" },
      reward: "分数闪光",
      failRule: "连错则抖一下",
      coreDelight: "连击时满屏猫爪烟花",
      growth: { none: true },
    },
    stage_complete: true,
  }),
  t("超长连击时满屏猫爪烟花 + 呼噜音效，手感像撸猫一样顺滑。", {
    state_delta: { juice: ["猫爪烟花", "呼噜音效"], gameFeel: "撸猫一样顺滑" },
    stage_complete: true,
  }),
  t("越往后猫越多、配色越接近；失败就想立刻再来一局。", {
    state_delta: { replayMotivation: "立刻再来一局", difficulty: { ramp: "越来越难" } },
    stage_complete: true,
  }),
  t("帮你收个尾：这是一个关于深夜猫咖治愈连连看的解压游戏。在手机上平面玩。暂定名深夜猫咖。", {
    state_delta: {
      workingTitle: "深夜猫咖",
      pitch: "一个关于深夜猫咖治愈连连看的解压游戏",
      forbiddenEmotion: "肝氪焦虑",
      references: ["开心消消乐"],
      avoidReferences: ["重肝氪卡牌"],
      presentation: { where: "手机", dimension: "平面" },
      keywordPools: {
        gameplay: five("玩法"),
        emotion: five("情绪"),
        world: five("世界"),
        visual: five("视觉"),
        narrative: five("叙事"),
        motivation: five("动机"),
      },
    },
    stage_complete: true,
    ready_for_synthesis: true,
  }),
];

describe("剧本回放：治愈系猫咪连连看", () => {
  it("阶段能问到第 10 节；对话里没说过的参考作品不进 GDD", async () => {
    let state = createInitialState();
    state.guidance = "accepted";
    state.stage = 1;
    const userInputs = ["我想做个治愈的小游戏", "连同色猫", "划线连猫", "要爽快的高光", "猫爪烟花", "越来越难", "总结一下吧"];

    let last;
    for (let i = 0; i < SCRIPT.length; i++) {
      last = await advance(state, userInputs[i], { llm: scriptedLlm([SCRIPT[i]]), systemPrompt: SYS });
      state = last.state;
    }

    expect(state.stage).toBe(10);
    expect(isComplete(toGddModel(state))).toBe(false);
    expect(last!.readyForSynthesis).toBe(false);

    const md = renderGdd(toGddModel(state));
    expect(md).toContain("深夜猫咖");
    expect(md).toContain("治愈");
    expect(md).not.toContain("开心消消乐");
    expect(md).toContain("### 核心交互");
    expect(md).toContain("本游戏无独立成长");
  });
});
