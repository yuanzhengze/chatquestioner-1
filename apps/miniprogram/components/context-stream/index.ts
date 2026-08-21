Component({
  properties: {
    messages: { type: Array, value: [] },
    busy: { type: Boolean, value: false },
  },
  data: {
    lastIndex: 0,
    anchor: "stream-end",
  },
  observers: {
    messages(messages: Array<{ content?: string }>) {
      const lastIndex = Math.max(0, (messages?.length ?? 1) - 1);
      this.setData({ lastIndex, anchor: "" });
      setTimeout(() => this.setData({ anchor: "stream-end" }), 16);
    },
  },
});
