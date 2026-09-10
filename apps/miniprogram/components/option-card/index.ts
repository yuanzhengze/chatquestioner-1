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
    expanded: { type: Boolean, value: false },
  },
  data: {
    shown: "",
    kicker: "",
    labelText: "",
    alt: "",
  },
  observers: {
    "option, index"(option: { id?: string; label?: string; detail?: string }, index: number) {
      const id = option?.id ?? "";
      const label = option?.label ?? "";
      const detail = stripMd(option?.detail ?? "");
      this.setData({
        kicker: LABEL_TAG[id] ?? id,
        labelText: label || detail,
        shown: detail || label,
        alt: index % 2 === 1 ? "alt" : "",
      });
    },
  },
  methods: {
    optionId() {
      return (this.properties.option as { id?: string })?.id || "";
    },
    onToggle() {
      if (this.properties.disabled) return;
      this.triggerEvent("toggle", { id: this.optionId() });
    },
    onChevron() {
      if (this.properties.disabled) return;
      const id = this.optionId();
      if (this.properties.expanded) {
        this.triggerEvent("collapse", { id });
        return;
      }
      this.triggerEvent("toggle", { id });
    },
  },
});
