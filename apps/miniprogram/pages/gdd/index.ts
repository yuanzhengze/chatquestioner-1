import { GDD_DRAFT_KEY } from "../../config";

const { mdToHtml } = require("../../utils/md.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");

Page({
  data: {
    title: "",
    pitch: "",
    must: [] as string[],
    cut: [] as string[],
    html: "",
    plain: "",
    empty: true,
    ready: false,
  },

  _markdown: "",
  _applied: false,

  onLoad() {
    const ch = this.getOpenerEventChannel();
    if (ch && typeof ch.on === "function") {
      ch.on("gddDraft", (payload: { markdown?: string }) => {
        this.applyMarkdown(payload && payload.markdown);
      });
    }
    // eventChannel 已送到就别再读缓存：跳转后才异步补写，缓存里可能是上一份文档。
    if (!this._applied) this.applyFromStorage();
  },

  applyFromStorage() {
    try {
      const draft = wx.getStorageSync(GDD_DRAFT_KEY) as { markdown?: string } | "";
      const markdown = draft && typeof draft === "object" ? draft.markdown : "";
      if (markdown) this.applyMarkdown(markdown);
    } catch (_e) {
      // 读缓存失败时等 eventChannel
    }
  },

  applyMarkdown(raw?: string) {
    const markdown = String(raw || "").trim();
    if (!markdown) {
      this._markdown = "";
      this.setData({ ready: true, empty: true, title: "", pitch: "", must: [], cut: [], html: "", plain: "" });
      return;
    }
    const meta = parseGddPreview(markdown);
    let html = "";
    try {
      html = mdToHtml(markdown);
    } catch (_e) {
      html = "";
    }
    this._markdown = markdown;
    this._applied = true;
    this.setData({
      ready: true,
      empty: false,
      title: meta.title || "未命名游戏",
      pitch: meta.pitch || "",
      must: meta.must || [],
      cut: meta.cut || [],
      html,
      plain: markdown,
    });
  },

  onCoverTap() {
    wx.showToast({ title: "封面生图稍后接入", icon: "none" });
  },

  onCopy() {
    const md = this._markdown;
    if (!md) return;
    wx.setClipboardData({
      data: md,
      success() {
        wx.showToast({ title: "已复制 GDD", icon: "success" });
      },
    });
  },
});
