import type { GameDSL, ResolutionResult } from "@cq/dsl";
import type { ConversationState } from "@cq/conversation";

/** SSE 事件名（与 web 端约定一致）。 */
export const SSE_EVENTS = {
  token: "token",
  warning: "warning",
  state: "state",
  stage: "stage",
  synthesis: "synthesis",
  error: "error",
  done: "done",
} as const;

export interface TokenEvent { text: string }
export interface WarningEvent { messages: string[] }
export type StateEvent = ConversationState;
export interface StageEvent { stage: number; label: string; readyForSynthesis: boolean }
export interface SynthesisEvent { gddMarkdown: string; dsl: GameDSL; resolution: ResolutionResult }
export interface ErrorEvent { message: string }
export interface DoneEvent { readyForSynthesis: boolean }

/** POST /api/session 返回 */
export interface CreateSessionResponse { id: string; opening: string }
/** POST /api/session/:id/export 返回 */
export interface ExportResponse { dir: string; gddMarkdown: string; dsl: GameDSL; resolution: ResolutionResult }
