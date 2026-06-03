import type { AvatarState, BaselineState, EmoteState } from "./states.js";

/** 状态 → 艺术原语 id + 播放方式。这是「状态逻辑 ↔ 素材」的解耦层（docs/06 §2.2/§6）。
 *  换自研 IP：只需替换 /avatar 下的同名原语素材，本表零改动。 */
export interface PrimitiveBinding {
  primitive: string;
  loop: boolean;
}

const BASELINE_BINDINGS: Record<BaselineState, PrimitiveBinding> = {
  idle: { primitive: "calm", loop: true },
  listening: { primitive: "watching", loop: true },
  thinking: { primitive: "thinking", loop: true },
  speaking: { primitive: "talking", loop: true },
  building: { primitive: "flex", loop: true },
};

const EMOTE_BINDINGS: Record<EmoteState, PrimitiveBinding> = {
  "spark-caught": { primitive: "starstruck", loop: false },
  "emotion-resonance": { primitive: "warm-hug", loop: false },
  "deep-love": { primitive: "love", loop: false },
  "curious-probe": { primitive: "inspect", loop: false },
  "idea-feed": { primitive: "point", loop: false },
  confirm: { primitive: "ok", loop: false },
  "hot-signature": { primitive: "fire", loop: false },
  "stage-up": { primitive: "clap", loop: false },
  "constitution-lock": { primitive: "seal", loop: false },
  synthesis: { primitive: "party", loop: false },
  "risk-flag": { primitive: "grimace", loop: false },
  "cut-scope": { primitive: "no-gesture", loop: false },
  "parse-warning": { primitive: "shrug", loop: false },
  error: { primitive: "facepalm", loop: false },
  stuck: { primitive: "persevere", loop: false },
  handoff: { primitive: "wave", loop: false },
  "build-success": { primitive: "raise", loop: false },
  "build-fail": { primitive: "bandage", loop: false },
};

export const STATE_PRIMITIVE: Record<AvatarState, PrimitiveBinding> = {
  ...BASELINE_BINDINGS,
  ...EMOTE_BINDINGS,
};

export function bindingFor(state: AvatarState): PrimitiveBinding {
  return STATE_PRIMITIVE[state];
}

export interface AssetUrls {
  webm: string;
  hevc: string;
  poster: string;
}

/** 按约定从原语 id 推导三件套 URL（base 默认对应 vite public 的 /avatar）。 */
export function assetUrls(primitive: string, base = "/avatar"): AssetUrls {
  const b = base.replace(/\/$/, "");
  return {
    webm: `${b}/${primitive}.webm`,
    hevc: `${b}/${primitive}.mov`,
    poster: `${b}/${primitive}.png`,
  };
}
