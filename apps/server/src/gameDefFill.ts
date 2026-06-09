import type { ChatMessage, ConversationState, LlmClient } from "@cq/conversation";
import { FillSchema, synthesize, renderGoalOptionsForPrompt, type SynthesizeResult } from "@cq/orchestrator";

/** goal 可选项由能力清单（capabilities.ts）驱动，避免清单/prompt 漂移（spec D4）。 */
export const FILL_SYSTEM = `你是游戏编排助手。基于给定的游戏概念，只输出一个 JSON 对象描述一个 match-3（三消）关卡，不要任何解释文字。
JSON 形如：
{
  "tiles": ["元素1","元素2","元素3"],   // 3~7 个，取自游戏的美术/主题词
  "size": [8, 8],                        // 棋盘宽高，6~10
  "goal": <见下>,
  "tuning": { "minLine": 3, "moves": 25, "comboMult": 1.5 }  // 可选
}
${renderGoalOptionsForPrompt()}
请按游戏概念的主题意象，从上面三种玩法里挑最贴切的一种。
只输出 JSON，不要 markdown 以外的文字。`;

/** 从对话状态拼出给 LLM 的填充提示。 */
export function buildFillPrompt(state: ConversationState): string {
  const e = state.engineering;
  const lines = [
    `游戏标题：${state.workingTitle ?? state.theme ?? "未命名"}`,
    `主题/世界：${state.theme ?? ""} ${state.world ?? ""}`.trim(),
    `美术风格：${e.artStyle ?? ""}`,
    `核心幻想：${state.coreFantasy ?? ""}`,
    `关键词（视觉）：${state.keywordPools.visual.join("、")}`,
    `关键词（玩法）：${state.keywordPools.gameplay.join("、")}`,
    `signature：${e.signatureTerms.join("、")}`,
    `intent：${e.intentTerms.join("、")}`,
  ];
  return `请为下面这个 match-3 游戏概念生成关卡 JSON：\n${lines.join("\n")}`;
}

/** 累积流式分片为完整字符串。 */
async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

/** 剥掉 ```json 围栏 / 截取首尾花括号，得到可 JSON.parse 的子串。 */
export function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

/**
 * 调 LLM 产 GameDefFill，解析容错 + 一次重试。
 * 解析/校验失败累计两轮后回 fill-parse-error / fill-invalid；成功则交 synthesize。
 */
export async function produceGameDef(llm: LlmClient, state: ConversationState): Promise<SynthesizeResult> {
  const base: ChatMessage[] = [
    { role: "system", content: FILL_SYSTEM },
    { role: "user", content: buildFillPrompt(state) },
  ];

  let lastRaw = "";
  let lastIssues: string[] = [];
  let lastFailure: "parse" | "invalid" | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: ChatMessage[] =
      attempt === 0
        ? base
        : [...base, { role: "user", content: "上一次输出无法解析为合法 JSON 关卡，请严格只输出符合格式的 JSON。" }];

    lastRaw = await collect(llm.stream(messages));

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(lastRaw));
    } catch {
      lastFailure = "parse";
      continue;
    }

    const r = FillSchema.safeParse(parsed);
    if (!r.success) {
      lastFailure = "invalid";
      lastIssues = r.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`);
      continue;
    }

    return synthesize(state, r.data);
  }

  if (lastFailure === "invalid") {
    return { def: null, diagnostics: [{ kind: "fill-invalid", issues: lastIssues }] };
  }
  return { def: null, diagnostics: [{ kind: "fill-parse-error", raw: lastRaw }] };
}
