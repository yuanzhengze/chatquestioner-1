import { STATE_SENTINEL } from "./turn.js";
import type { TurnOption } from "./turn.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClient {
  stream(messages: ChatMessage[]): AsyncIterable<string>;
}

export const OPENING_MESSAGE =
  "你好！我是 NewBee，你的游戏共创伙伴。做游戏就像捏泥巴，咱们今天不聊代码和规则，" +
  "就从你的一个'脑洞'开始。你脑子里现在有没有冒出一个画面、一种好玩的玩法，" +
  "或者哪怕只是一个想当主角的动物/角色？随便跟我聊聊，我们一起把它变成一个真能玩的游戏！";

export const CONSENT_OPTIONS: TurnOption[] = [
  {
    id: "A",
    label: "是，开始创意引导",
    detail: "是，开始创意引导。用大约 10 轮提问，把创意澄清成一份完整的游戏设计文档。",
  },
  {
    id: "B",
    label: "不用，先不走这个流程",
    detail: "不用，先不走这个流程。不采访，我自己说想法。",
  },
];

export const CONSENT_PROMPT =
  "接下来可以用大约 **10 轮**提问，把创意澄清成一份完整的游戏设计文档，帮你做出更好玩的游戏。要走这步吗？";

/** 用户先说出想法之后，再问要不要走引导。 */
export const CONSENT_AFTER_IDEA = `先记下了你的想法。\n\n${CONSENT_PROMPT}`;

export const DECLINED_ACK =
  "好。你直接说你的想法就行，我记下能确定的部分。";

export function interpretGuidance(text: string): "accepted" | "declined" | null {
  const t = (text || "").trim();
  if (!t) return null;
  if (t === CONSENT_OPTIONS[0].label || t === CONSENT_OPTIONS[0].detail) return "accepted";
  if (t === CONSENT_OPTIONS[1].label || t === CONSENT_OPTIONS[1].detail) return "declined";
  if (/^[Aa]$/.test(t) || /^A\s*[:：.]/.test(t)) return "accepted";
  if (/^[Bb]$/.test(t) || /^B\s*[:：.]/.test(t)) return "declined";
  if (/开始创意引导|要走这步|走引导/.test(t) && !/不/.test(t)) return "accepted";
  if (/不用.*流程|先不走|不走这个|不要引导|别问了/.test(t)) return "declined";
  if (/^是[，,]?开始/.test(t)) return "accepted";
  return null;
}

/** 中途要求先看/生成文档（出带缺口的草稿）。同意门文案里也有「设计文档」，必须先排除。 */
export function wantsDocument(text: string): boolean {
  if (interpretGuidance(text)) return false;
  const t = (text || "").trim();
  if (!t) return false;
  return /写成.*文档|打开预览|看不到.*结果|生成结果|结果页|出稿|给我.*文档|为什么.*(结果|文档)|看不到生成|现在就生成|现在生成|先出.*草稿|出一份草稿|给我看看.*结果|生成一份|生成.*文档|最终.*文档|直接生成|出一份.*文档|输出.*GDD|输出完整|完整的 GDD|生成设计文档|设计文档/i.test(t);
}

/** 用户确认总结 / 要求定稿。未过 completeness 时仍出草稿、继续问，不锁对话。 */
export function wantsFinalize(text: string): boolean {
  if (interpretGuidance(text)) return false;
  const t = (text || "").trim();
  if (!t) return false;
  return /就按这个定稿|可以定稿了|总结得很完美|就按这个吧|就这样定|蓝图已经成型|可以去开发|就此定稿|直接定稿|确认当前|确认.*总结|完美契合|核心概念很完美|正式定稿/i.test(t);
}

/** 用户要看结果：生成、预览、或确认总结。 */
export function wantsPreview(text: string): boolean {
  return wantsDocument(text) || wantsFinalize(text);
}

function optionRequestsPreview(opt: { label?: string; detail?: string }): boolean {
  const t = `${opt.label || ""}\n${opt.detail || ""}`;
  return wantsPreview(t) || /确认总结|生成设计文档|写成设计文档|输出.*GDD|正式定稿/.test(t);
}

export function historyWantsPreview(
  history: ChatMessage[],
  extra?: string,
  lastOptions?: TurnOption[],
): boolean {
  if (extra && wantsPreview(extra)) return true;
  if (extra && lastOptions?.length) {
    const hit = lastOptions.find((o) => o.detail === extra || o.label === extra);
    if (hit && optionRequestsPreview(hit)) return true;
  }
  return history.some((m) => m.role === "user" && wantsPreview(m.content));
}

export const TURN_DIRECTIVE = `
[机器输出协议 —— 严格遵守，用户永远看不到本段约束]

每一轮，你必须依次输出两部分：

1) 面向用户的人话回复。引导模式下遵循共情承接 → 动态投喂 2~3 个定制创意 → 单步收敛提问。
   闲聊用普通文本，行内重点用 **加粗**，重点整段用首行带 💡/❓/📌 的 > 引用块。
   绝不在这部分出现任何 JSON、字段名或英文键名。

2) 另起一行，输出哨兵 ${STATE_SENTINEL}，紧接着输出**一个 JSON 对象**（可裸写或包在 \`\`\`json 代码块里）。

state_delta 允许的键（全部可选，只填有把握的）：
- 体验：spark, references[], avoidReferences[], coreEmotion, forbiddenEmotion, coreFantasy, coreAction,
  theme, world, narrative, playerIdentity, aesthetic, gameFeel, juice[]
- 循环：loop{thirtySec,fiveMin,thirtyMin,longTerm}, reward, failRule, winRule, mechanics[],
  difficultyCurve, replayMotivation, difficulty{ramp,firstMinutes,fatigue}
- 呈现：presentation{where,dimension,orientation,players,assets}
- 内容：content{overview,levels,boss,progression,multiplayer,flags{levels,boss,progression,multiplayer}}
- 收敛：workingTitle, pitch, coreExperience, differentiator,
  keywordPools{gameplay[],emotion[],world[],visual[],narrative[],motivation[]},
  constitutionFields{coreFantasy,coreLoop,artRule,contentBoundary,presentationBoundary,extras[]}
- 工程线索（能确定才填，不做出稿门槛）：engineering{dimension,platform[],orientation,networking,modalities[],genre,mechanics[],artStyle}

规则：
- ready_for_synthesis 由系统根据完整度计算，你可以给建议值，但不要为了凑 true 去编造字段。
- 信息不全时 stage_complete 为 false，引导模式下按缺口补问，绝不编造。能确定的字段必须写入 state_delta。
- 引导模式：每轮 JSON options 给 2–3 个实质设计方向（需要第四个时也可以，但必须也是可玩方向），id 依次 "A"/"B"/"C"（/"D"），各含非空 label 与 detail。禁止只在人话里写方向。
- 禁止把「我有其他更好的想法 / 我有别的想法 / 或者你有其他更有趣的 / 自己输入 / 直接告诉我你的脑洞 / Other」做成选项。用户打字框就是开放口。
- 自由输入模式（用户不走引导）不要 options。
- 当本轮给了 options 时，人话里不要再展开两个方向的描述，只保留共情与那一个收敛提问。
- 本轮只写当前节相关字段。怎么知道自己做得好 → reward；失误麻烦 → failRule；怎样算赢 → winRule；在哪玩 → presentation.where；平面还是立体 → presentation.dimension。
- 进入收敛节之前：禁止在人话里给暂定游戏名、一句话亮点/Pitch、概念总结、「可以定稿了」「蓝图已经成型」「去开发吧」。阶段小结最多两句复述，然后问本节那一个问题。完整度缺口还在就继续问，不要总结。
- 人话一旦出现「暂定游戏名 / 概念总结 / 一句话亮点」，同一轮 state_delta 必须写入 workingTitle、pitch、coreExperience、loop.fiveMin、differentiator、mechanics（≥2）、winRule。不要只写在人话里。口头总结这一轮宿主还不出文档，等用户点「确认总结 / 生成设计文档」。
- 用户点「确认总结，生成设计文档」或说「现在就生成 / 出一份草稿 / 直接生成最终的设计文档」：宿主会出带缺口的草稿。把人话总结里已有的暂定名、Pitch、循环、差异化写入 state_delta。你仍要继续问缺口，不要宣布结束、不要说去开发。
- 用户选定稿后：对照完整度缺口写入 pitch / workingTitle / forbiddenEmotion / differentiator / references / avoidReferences / mechanics（≥2）/ winRule / keywordPools（六类各 ≥5，从已确认意象拆，禁止生造同义词凑数）/ constitutionFields / presentation。缺哪项就先问哪项，不要假装已经定稿。
- 禁止对用户说「系统马上弹卡片 / 请稍等几秒会弹出结果页」。结果入口由宿主根据完整度显示，你承诺也不会出现。
`.trim();
