import type { ChatMessage, LlmClient } from "@cq/conversation";

/** 顺序流出脚本里的整轮文本（含 reply + <<<STATE>>> + JSON）；分片产出。 */
export function fakeLlm(rawTurns: string[]): LlmClient {
  let i = 0;
  return {
    async *stream(_m: ChatMessage[]): AsyncIterable<string> {
      const raw = rawTurns[i] ?? "";
      i += 1;
      for (let p = 0; p < raw.length; p += 16) yield raw.slice(p, p + 16);
    },
  };
}

/** 总是抛错的 LLM，用于 error 事件测试。 */
export function throwingLlm(message = "llm boom"): LlmClient {
  return {
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<string> {
      throw new Error(message);
    },
  };
}
