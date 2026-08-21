export { parseSseEvents } from "../../web/src/sse.ts";
export type { SseEvent } from "../../web/src/sse.ts";

export {
  initialView,
  reduce,
  lifecycle,
  emote,
  emoteEnd,
  bindingFor,
  assetUrls,
} from "../../../packages/avatar/src/index.ts";

export type { AvatarView, AvatarSignal } from "../../../packages/avatar/src/index.ts";
export type { BaselineState, EmoteState } from "../../../packages/avatar/src/index.ts";
export type { StateSnapshot } from "../../../packages/avatar/src/index.ts";

export { deriveBaseline, deriveStageEmotes, diffState } from "../../web/src/avatar/derive.ts";
