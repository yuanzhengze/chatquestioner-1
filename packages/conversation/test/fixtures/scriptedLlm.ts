import type { ChatMessage, LlmClient } from "../../src/llm.js";

/** 按脚本逐分片流出预设的每轮原始输出（含 reply + 哨兵 + JSON）。 */
export function scriptedLlm(rawTurns: string[]): LlmClient {
  let i = 0;
  return {
    async *stream(_messages: ChatMessage[]): AsyncIterable<string> {
      const raw = rawTurns[i] ?? "";
      i += 1;
      for (let p = 0; p < raw.length; p += 12) {
        yield raw.slice(p, p + 12);
      }
    },
  };
}
