Component({
  properties: {
    src: { type: String, value: "" },
    compact: { type: Boolean, value: false },
    /** 顶栏那枚小标记：只占一个图标的位置，仍由同一套状态机驱动。 */
    mark: { type: Boolean, value: false },
  },
});
