const LABEL_TAG: Record<string, string> = {
  A: "方向 A",
  B: "方向 B",
  C: "方向 C",
  D: "方向 D",
};

function stripMd(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .trim();
}

Component({
  properties: {
    option: { type: Object, value: {} },
    phase: { type: String, value: "" },
    disabled: { type: Boolean, value: false },
    index: { type: Number, value: 0 },
  },
  data: {
    shown: "",
    done: false,
    tag: "",
    alt: "",
  },
  lifetimes: {
    attached() {
      this._tw = 0;
      this._full = "";
      this._count = 0;
      this._key = "";
    },
    detached() {
      this.clearTw();
    },
  },
  observers: {
    "option, index"(option: { id?: string; label?: string; detail?: string }, index: number) {
      const id = option?.id ?? "";
      const label = option?.label ?? "";
      const detail = option?.detail ?? "";
      const key = `${id}:${detail}`;
      const tag = `${LABEL_TAG[id] ?? id} · ${label}`;
      this.setData({ tag, alt: index % 2 === 1 ? "alt" : "" });
      if (this._key === key) return;
      this._key = key;
      this.startTw(stripMd(detail));
    },
  },
  methods: {
    clearTw() {
      if (this._tw) {
        clearInterval(this._tw);
        this._tw = 0;
      }
    },
    startTw(text: string) {
      this.clearTw();
      this._full = text;
      this._count = 0;
      this.setData({ shown: "", done: text.length === 0 });
      if (!text) return;
      this._tw = setInterval(() => {
        this._count += 1;
        const done = this._count >= this._full.length;
        this.setData({ shown: this._full.slice(0, this._count), done });
        if (done) this.clearTw();
      }, 28) as unknown as number;
    },
    onTap() {
      if (this.properties.disabled) return;
      if (!this.data.done) {
        this.clearTw();
        this.setData({ shown: this._full, done: true });
        return;
      }
      this.triggerEvent("choose", this.properties.option);
    },
  },
});
