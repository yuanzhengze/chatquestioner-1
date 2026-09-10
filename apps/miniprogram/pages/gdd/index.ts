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
  _waitTimer: 0 as number,

  onLoad() {
    const ch = this.getOpenerEventChannel();
    if (ch && typeof ch.on === "function") {
      ch.on("gddDraft", (payload: { markdown?: string }) => {
        this.applyMarkdown(payload && payload.markdown);
      });
    }
    if (!this._applied) this.applyFromStorage();
    // eventChannel 可能晚于 onLoad，缓存也可能还没写完。最多等一会儿，不要永远转圈。
    this._waitTimer = setTimeout(() => {
      this._waitTimer = 0;
      if (this._applied) return;
      this.applyFromStorage();
      if (!this._applied) this.applyMarkdown("");
    }, 1200) as unknown as number;
  },

  onShow() {
    if (!this._applied) this.applyFromStorage();
  },

  onUnload() {
    if (this._waitTimer) clearTimeout(this._waitTimer);
  },

  applyFromStorage() {
    try {
      const draft = wx.getStorageSync(GDD_DRAFT_KEY) as { markdown?: string } | "";
      const markdown = draft && typeof draft === "object" ? draft.markdown : "";
      if (markdown) this.applyMarkdown(markdown);
    } catch (_e) {
      // 读缓存失败时等 eventChannel / 超时
    }
  },

  applyMarkdown(raw?: string) {
    const markdown = String(raw || "").trim();
    if (!markdown) {
      this._markdown = "";
      this._applied = true;
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
