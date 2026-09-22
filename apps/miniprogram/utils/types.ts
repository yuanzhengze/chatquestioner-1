export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** 气泡上要显示的字。点选项时显示 label，content 仍是发给宿主的 detail 全文。 */
  display?: string;
  options?: TurnOption[];
  optionsLive?: boolean;
  pendingId?: string;
  /** 这一轮问过方向，问句要加衬底。选项冻结后仍然保留。 */
  tintAsk?: boolean;
  /** 变形飞行期间占位但不显形。 */
  ghost?: boolean;
  /** 空助手气泡该显形了（出「…」）。 */
  appear?: boolean;
}

export interface TurnOption {
  id: string;
  label: string;
  detail: string;
}

export interface StageInfo {
  stage: number;
  label: string;
  readyForSynthesis: boolean;
}

export interface SseHandlers {
  onToken?: (text: string) => void;
  onState?: (state: Record<string, unknown>) => void;
  onStage?: (info: StageInfo) => void;
  onOptions?: (options: TurnOption[]) => void;
  onSynthesis?: (payload: { gddMarkdown: string; gddModel?: unknown; gddView?: unknown; complete?: boolean; draftBar?: boolean }) => void;
  onActivity?: (kind: string) => void;
  onWarning?: () => void;
  onError?: (message: string) => void;
  onDone?: (readyForSynthesis: boolean, extra?: { openPreview?: boolean }) => void;
}
