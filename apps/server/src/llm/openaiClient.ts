import OpenAI from "openai";
import type { ChatMessage, LlmClient, LlmStreamOptions } from "@cq/conversation";

export interface OpenAiOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  /** 开发环境耗时记录用：向上游要 token 用量。生产不开。 */
  reportUsage?: boolean;
}

/** 用 OpenAI 兼容客户端（指向 LiteLLM Proxy）实现 LlmClient.stream。 */
export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly reportUsage: boolean;

  constructor(opts: OpenAiOptions) {
    this.client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey, timeout: 120_000 });
    this.model = opts.model;
    this.reportUsage = opts.reportUsage === true;
  }

  async *stream(messages: ChatMessage[], opts?: LlmStreamOptions): AsyncIterable<string> {
    const wantUsage = Boolean(opts?.onUsage) && this.reportUsage;
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(wantUsage ? { stream_options: { include_usage: true } } : {}),
    });
    for await (const part of completion) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) yield delta;
      if (part.usage && opts?.onUsage) {
        opts.onUsage({ inputTokens: part.usage.prompt_tokens, outputTokens: part.usage.completion_tokens });
      }
    }
  }
}
