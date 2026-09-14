import type { ChatMessage, LlmClient } from "../../src/llm.js";
import { EXTRACT_PROMPT_TAG } from "../../src/extract.js";

/** 按脚本逐分片流出预设的每轮原始输出（含 reply + 哨兵 + JSON）。 */
export function scriptedLlm(rawTurns: string[]): LlmClient {
  let i = 0;
  return {
    async *stream(messages: ChatMessage[]): AsyncIterable<string> {
      if (messages[0]?.content?.includes(EXTRACT_PROMPT_TAG)) {
        yield "{}";
        return;
      }
      const raw = rawTurns[i] ?? "";
      i += 1;
      for (let p = 0; p < raw.length; p += 12) {
        yield raw.slice(p, p + 12);
      }
    },
  };
}
