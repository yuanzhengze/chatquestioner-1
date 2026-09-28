Component({
  properties: {
    show: { type: Boolean, value: false },
  },
  methods: {
    onAgree() {
      this.triggerEvent("agree");
    },
    onClose() {
      this.triggerEvent("close");
    },
    onLegal(e: { currentTarget: { dataset: { kind?: string } } }) {
      this.triggerEvent("legal", { kind: e.currentTarget.dataset.kind || "terms" });
    },
    noop() {},
  },
});
