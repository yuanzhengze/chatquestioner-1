import { STATE_SENTINEL } from "./turn.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 引擎对 LLM 的唯一依赖：流式返回 assistant 文本分片（OpenAI 兼容 delta）。 */
export interface LlmClient {
  stream(messages: ChatMessage[]): AsyncIterable<string>;
}

/** stage 0 破冰开场白（对齐 prompts/newbee.system.md [F3] 阶段 0），无需调用 LLM。 */
export const OPENING_MESSAGE =
  "你好！我是 NewBee，你的游戏共创伙伴。做游戏就像捏泥巴，咱们今天不聊代码和规则，" +
  "就从你的一个'脑洞'开始。你脑子里现在有没有冒出一个画面、一种好玩的玩法，" +
  "或者哪怕只是一个想当主角的动物/角色？随便跟我聊聊，我们一起把它变成一个真能玩的游戏！";

/** 追加在系统提示词之后的机器指令：约束每轮输出为「人话回复 + 哨兵 + JSON 状态块」。 */
export const TURN_DIRECTIVE = `
[机器输出协议 —— 严格遵守，用户永远看不到本段约束]

每一轮，你必须依次输出两部分：

1) 面向用户的人话回复（遵循上文 [F2] 三步：共情承接 → 动态投喂 2 个定制创意 → 单步收敛提问）。
   绝不在这部分出现任何 JSON、字段名或英文键名。

2) 另起一行，输出哨兵 ${STATE_SENTINEL}，紧接着输出**一个 JSON 对象**（可裸写或包在 \`\`\`json 代码块里），形如：

${STATE_SENTINEL}
{
  "state_delta": { /* 本轮新识别或更新的字段（camelCase），只填你有把握的，没把握的不要编 */ },
  "stage_complete": false,        // 本阶段关键信息是否已聊清
  "ready_for_synthesis": false,   // 是否可进入收敛（关键工程信号都已明确）
  "options": [                    // 可选：本轮给用户的两个方向，省略则本轮无选项
    { "id": "A", "label": "≤8字短标题", "detail": "一句话方向描述" },
    { "id": "B", "label": "≤8字短标题", "detail": "一句话方向描述" }
  ]
}

state_delta 允许的键（全部可选）：
- 体验/叙事：spark, references[], avoidReferences[], coreEmotion, coreFantasy, coreAction,
  theme, world, narrative, playerIdentity, aesthetic, gameFeel, juice[]
- 循环/平衡：loop{thirtySec,fiveMin,thirtyMin,longTerm}, reward, failRule, difficultyCurve, replayMotivation
- 收敛产物：workingTitle, pitch, coreExperience, differentiator, risks[], mvpScope{must[],cut[]},
  keywordPools{gameplay[],emotion[],world[],visual[],narrative[],motivation[]}, constitution[]
- 工程信号（供 DSL 翻译，能确定才填）：engineering{
    dimension("2D"|"3D"), engine("pixijs"|"threejs"|"phaser"|"canvas"|"dom"),
    platform[("PC"|"mobile"|"web")], orientation("Landscape"|"Portrait"), networking("singleplayer"|"multiplayer"),
    modalities[("image"|"audio"|"ui"|"3d"|"pixel"|"sidescroller"|"narrative"|"video")],
    genre, mechanics[], artStyle, intentTerms[], signatureTerms[]
  }

规则：
- 只有当 dimension、engine、platform 三者都已明确，才允许把 ready_for_synthesis 设为 true。
- 信息不全时把 stage_complete / ready_for_synthesis 设为 false，本轮按协议回环补问，绝不编造工程信号。
- options 要么恰好 2 项（id 固定 "A"/"B"，各含非空 label 与 detail），要么整体省略（破冰或纯开放问题时省略）。
- 当本轮给了 options 时，面向用户的人话回复里【不要】再展开两个方向的描述，只保留共情承接与那一个收敛提问；方向描述只放进 options 的 detail。
`.trim();
