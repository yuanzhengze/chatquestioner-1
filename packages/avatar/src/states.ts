/**
 * 状态全集（对齐 docs/06 §4 五层）。
 * - baseline：持续态，loop 循环播放，反映「NewBee 现在在干嘛」。
 * - emote：瞬时情绪，one-shot 播完回落，反映「刚刚发生了一件有意义的事」。
 */

export type BaselineState =
  | "idle"        // 待机：会话就绪 / done 后无动作
  | "listening"   // 倾听：用户正在输入
  | "thinking"    // 构思：send 后、首 token 未到
  | "speaking"    // 回应：token 流式输出中
  | "building";   // 施工中：forgeax production/coding（Layer 5）

export type EmoteState =
  // L2 语义识别
  | "spark-caught"        // 抓到火花：spark/references 出现
  | "emotion-resonance"   // 情感共鸣：coreEmotion/coreFantasy 出现
  | "deep-love"           // 深度打动：coreExperience / 情绪关键词丰满
  | "curious-probe"       // 好奇追问：本轮无新字段、仅在追问
  | "idea-feed"           // 投喂创意：进入投喂桥段
  | "confirm"             // 点头确认：coreAction 锁定
  | "hot-signature"       // 高光信号：signatureTerms/juice 新增
  // L3 阶段与收敛
  | "stage-up"            // 阶段推进
  | "constitution-lock"   // 锁定宪法：constitution 新增
  | "synthesis"           // 收敛达成：synthesis 事件
  // L4 纪律/告警/异常
  | "risk-flag"           // 暴露风险：risks 新增
  | "cut-scope"           // 主动裁剪：mvpScope.cut 新增
  | "parse-warning"       // 解析告警：warning 事件
  | "error"               // 出错：error 事件
  | "stuck"               // 卡壳兜底：DSL 不完整 / 久不收敛
  // L5 forgeax 下游
  | "handoff"             // 交接：export 成功
  | "build-success"       // 构建成功
  | "build-fail";         // 构建失败

export type AvatarState = BaselineState | EmoteState;

/** 同一轮多个 emote 竞争时，数值高者胜（docs/06 §5.3）。 */
export const EMOTE_PRIORITY: Record<EmoteState, number> = {
  synthesis: 100,
  "build-success": 95,
  error: 90,
  "build-fail": 88,
  "stage-up": 80,
  handoff: 78,
  "constitution-lock": 70,
  "risk-flag": 60,
  "cut-scope": 55,
  "parse-warning": 50,
  stuck: 48,
  "spark-caught": 40,
  "deep-love": 38,
  "hot-signature": 36,
  "emotion-resonance": 30,
  confirm: 25,
  "curious-probe": 20,
  "idea-feed": 15,
};

/** 「终结性」emote：独占当轮，立即抢占当前 emote 并清空队列。 */
const MAJOR_EMOTES: ReadonlySet<EmoteState> = new Set<EmoteState>([
  "synthesis",
  "error",
  "build-success",
  "build-fail",
]);

export function isMajorEmote(e: EmoteState): boolean {
  return MAJOR_EMOTES.has(e);
}

export function emotePriority(e: EmoteState): number {
  return EMOTE_PRIORITY[e];
}
