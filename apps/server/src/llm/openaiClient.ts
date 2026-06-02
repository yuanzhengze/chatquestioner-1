import OpenAI from "openai";
import type { ChatMessage, LlmClient } from "@cq/conversation";

export interface OpenAiOptions {
  baseURL: string;
  apiKey: string;
  model: string;
}

/** 用 OpenAI 兼容客户端（指向 LiteLLM Proxy）实现 LlmClient.stream。 */
export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: OpenAiOptions) {
    this.client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async *stream(messages: ChatMessage[]): AsyncIterable<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });
    for await (const part of completion) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
