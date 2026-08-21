const raw = require("../lib/shared.js");

/** esbuild CJS 在部分小程序运行时会挂在 .default 上，这里兼容两种形态。 */
export const shared = (raw && raw.parseSseEvents ? raw : raw?.default) as {
  parseSseEvents: (buffer: string) => { events: Array<{ event: string; data: unknown }>; rest: string };
  initialView: (baseline?: string) => { baseline: string; emote: string | null; queue: string[] };
  reduce: (view: unknown, signal: unknown) => { baseline: string; emote: string | null; queue: string[] };
  lifecycle: (baseline: string) => unknown;
  emote: (e: string) => unknown;
  emoteEnd: () => unknown;
  bindingFor: (state: string) => { primitive: string };
  assetUrls: (primitive: string, base?: string) => { poster: string };
  deriveBaseline: (input: {
    busy: boolean;
    typing: boolean;
    lastRole?: "user" | "assistant";
    lastContentLen: number;
  }) => string;
  deriveStageEmotes: (prev: number | null, next: number) => string[];
  diffState: (prev: Record<string, unknown>, next: Record<string, unknown>) => string[];
};
