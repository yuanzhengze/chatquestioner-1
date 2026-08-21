import { API_BASE } from "../config";
import { shared } from "./shared";

export interface AvatarView {
  baseline: string;
  emote: string | null;
  queue: string[];
}

const EMOTE_MS = 1200;
const avatarBase = `${API_BASE.replace(/\/$/, "")}/avatar`;

export class AvatarDriver {
  view: AvatarView = shared.initialView("idle");
  poster = posterOf(this.view);
  private prevState: Record<string, unknown> | null = null;
  private prevStage: number | null = null;
  private hadOptions = false;
  private lastWarn = 0;
  private timer = 0;
  private keyboardUp = false;
  private onChange: (poster: string, compact: boolean) => void;

  constructor(onChange: (poster: string, compact: boolean) => void) {
    this.onChange = onChange;
    this.emit();
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  sync(input: {
    busy: boolean;
    typing: boolean;
    lastRole?: "user" | "assistant";
    lastContentLen: number;
    state: Record<string, unknown> | null;
    stage: { stage: number } | null;
    error: string | null;
    warnTick: number;
    hasOptions: boolean;
    keyboardUp: boolean;
  }): void {
    this.dispatch(shared.lifecycle(shared.deriveBaseline({
      busy: input.busy,
      typing: input.typing,
      lastRole: input.lastRole,
      lastContentLen: input.lastContentLen,
    })));

    if (input.state) {
      const prev = this.prevState;
      this.prevState = input.state;
      if (prev) {
        for (const e of shared.diffState(prev, input.state)) this.dispatch(shared.emote(e));
      }
    }

    if (input.stage) {
      for (const e of shared.deriveStageEmotes(this.prevStage, input.stage.stage)) {
        this.dispatch(shared.emote(e));
      }
      this.prevStage = input.stage.stage;
    }

    if (input.hasOptions && !this.hadOptions) this.dispatch(shared.emote("idea-feed"));
    this.hadOptions = input.hasOptions;

    if (input.error) this.dispatch(shared.emote("error"));
    if (input.warnTick > this.lastWarn) this.dispatch(shared.emote("parse-warning"));
    this.lastWarn = input.warnTick;
    this.keyboardUp = input.keyboardUp;

    this.emit();
  }

  private dispatch(signal: unknown): void {
    const hadEmote = this.view.emote;
    this.view = shared.reduce(this.view, signal);
    if (this.view.emote && this.view.emote !== hadEmote) this.armEmote();
  }

  private armEmote(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.dispatch(shared.emoteEnd());
      this.emit();
    }, EMOTE_MS) as unknown as number;
  }

  private emit(): void {
    this.poster = posterOf(this.view);
    this.onChange(this.poster, this.keyboardUp);
  }
}

function posterOf(view: AvatarView): string {
  const state = view.emote ?? view.baseline;
  const primitive = shared.bindingFor(state).primitive;
  return shared.assetUrls(primitive, avatarBase).poster;
}
