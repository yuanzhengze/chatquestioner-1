Component({
  properties: {
    busy: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    safeBottom: { type: Number, value: 0 },
    keyboardHeight: { type: Number, value: 0 },
  },
  data: {
    value: "",
    focused: false,
    padBottom: 12,
  },
  observers: {
    "safeBottom, keyboardHeight"(safeBottom: number, keyboardHeight: number) {
      const extra = keyboardHeight > 0 ? keyboardHeight : safeBottom;
      this.setData({ padBottom: Math.max(12, extra) });
    },
  },
  methods: {
    onInput(e: { detail: { value: string } }) {
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
      this.setData({ value: "" });
      this.triggerEvent("draft", { value: "" });
      this.triggerEvent("typing", { typing: false });
    },
  },
});
