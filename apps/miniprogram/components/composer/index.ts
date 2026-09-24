const LINE_H = 22;
const MAX_LINES = 5;

Component({
  properties: {
    busy: { type: Boolean, value: false },
    /** think：思考中。gdd：游戏文档生成中。空：平时。 */
    mode: { type: String, value: "" },
    disabled: { type: Boolean, value: false },
    safeBottom: { type: Number, value: 0 },
    keyboardHeight: { type: Number, value: 0 },
    seed: { type: String, value: "" },
    seedSeq: { type: Number, value: 0 },
  },
  data: {
    value: "",
    focused: false,
    padBottom: 12,
    /** 文字区高度。一行 22px，最多五行 110px，再多在框里滚。 */
    inputH: 22,
  },
  observers: {
    "safeBottom, keyboardHeight"(safeBottom: number, keyboardHeight: number) {
      const extra = keyboardHeight > 0 ? keyboardHeight : safeBottom;
      this.setData({ padBottom: Math.max(12, extra) });
    },
    "seed, seedSeq"(seed: string) {
      this.setData({ value: seed || "", inputH: seed ? this.data.inputH : LINE_H });
    },
  },
  methods: {
    onLine(e: { detail: { lineCount?: number; height?: number } }) {
      const lines = Number(e.detail && e.detail.lineCount) || 1;
      const next = Math.min(MAX_LINES, Math.max(1, lines)) * LINE_H;
      if (next !== this.data.inputH) this.setData({ inputH: next });
    },
    onInput(e: { detail: { value: string } }) {
      if (this.properties.busy) return;
      const value = e.detail.value;
      this.setData({ value });
      this.triggerEvent("draft", { value });
      this.triggerEvent("typing", { typing: this.data.focused && value.trim().length > 0 });
    },
    onFocus() {
      this.setData({ focused: true });
      this.triggerEvent("typing", { typing: this.data.value.trim().length > 0 });
    },
    onBlur() {
      this.setData({ focused: false });
      this.triggerEvent("typing", { typing: false });
    },
    onConfirm() {
      this.submit();
    },
    onSend() {
      this.submit();
    },
    submit() {
      const text = (this.data.value || "").trim();
      if (!text || this.properties.busy || this.properties.disabled) return;
      this.triggerEvent("send", { text });
      this.setData({ value: "", inputH: LINE_H });
      this.triggerEvent("draft", { value: "" });
      this.triggerEvent("typing", { typing: false });
    },
  },
});
