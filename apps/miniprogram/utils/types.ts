export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  onSynthesis?: (payload: { gddMarkdown: string }) => void;
  onWarning?: () => void;
  onError?: (message: string) => void;
  onDone?: (readyForSynthesis: boolean) => void;
}
