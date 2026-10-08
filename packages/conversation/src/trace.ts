import type { ChatMessage, LlmClient, LlmStreamOptions } from "./llm.js";
import type { OptionPhase } from "./state.js";

/**
 * 一轮里该出哪一种卡。interview：采访三选；draft：定稿三选；patch：补丁三选。
 * document：这一轮出或更新文档，不出卡。none：不调模型，宿主直接回话。
 */
export type TurnOutputType = "interview" | "draft" | "patch" | "document" | "none";

export type LlmCallPurpose = "reply" | "repair" | "extract" | "patch";

export interface LlmCallTrace {
  purpose: LlmCallPurpose;
  startMs: number;
  firstTokenMs?: number;
  completeMs: number;
  durationMs: number;
  inputChars: number;
  outputChars: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** 开发环境的单轮耗时记录。不给正式用户看。 */
export interface TurnTrace {
  iterationOrigin?: string;
  currentPhase?: OptionPhase;
  expectedOutputType: TurnOutputType;
  calls: LlmCallTrace[];
  generatedInterview: boolean;
  generatedDraft: boolean;
  generatedPatch: boolean;
  /** 这一轮用整段对话重新抽了一遍整份文档。 */
  generatedDocument: boolean;
  renderedOutputType: TurnOutputType;
  discardedOutputTypes: TurnOutputType[];
  totalDurationMs: number;
}

export function newTurnTrace(): TurnTrace & { t0: number } {
  return {
    t0: Date.now(),
    expectedOutputType: "none",
    calls: [],
    generatedInterview: false,
    generatedDraft: false,
    generatedPatch: false,
    generatedDocument: false,
    renderedOutputType: "none",
    discardedOutputTypes: [],
    totalDurationMs: 0,
  };
}

/** 包一层：记下这次调用的用途、首字和完成时间、输入输出大小。 */
export function tracedLlm(llm: LlmClient, purpose: LlmCallPurpose, trace: TurnTrace & { t0: number }): LlmClient {
  return {
    async *stream(messages: ChatMessage[], opts?: LlmStreamOptions) {
      const start = Date.now();
      const call: LlmCallTrace = {
        purpose,
        startMs: start - trace.t0,
        completeMs: 0,
        durationMs: 0,
        inputChars: messages.reduce((n, m) => n + String(m.content || "").length, 0),
        outputChars: 0,
      };
      trace.calls.push(call);
      try {
        for await (const chunk of llm.stream(messages, {
          ...opts,
          onUsage: (usage) => {
            call.inputTokens = usage.inputTokens;
            call.outputTokens = usage.outputTokens;
            opts?.onUsage?.(usage);
          },
        })) {
          if (call.firstTokenMs === undefined) call.firstTokenMs = Date.now() - trace.t0;
          call.outputChars += chunk.length;
          yield chunk;
        }
      } finally {
        const end = Date.now();
        call.completeMs = end - trace.t0;
        call.durationMs = end - start;
      }
    },
  };
}

export function finishTurnTrace(trace: TurnTrace & { t0: number }): TurnTrace {
  const { t0, ...rest } = trace;
  return { ...rest, totalDurationMs: Date.now() - t0 };
}
