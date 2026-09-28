import { FORGEAX_SITE_URL, FX_CHROME, LOGO_SRC } from "../../config";

const legal = require("../../utils/legal.js");
const { applyTabBar } = require("../../utils/tabBar.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");

const IDEAS = [
  { id: "i1", text: "做一个晚上只能玩十分钟的解压游戏" },
  { id: "i2", text: "两个角色共用一个血条的合作动作" },
  { id: "i3", text: "用上班通勤当地图的城市探索" },
  { id: "i4", text: "玩家是地下城里的家具，要逃避冒险者" },
];

const CASES = [
  { id: "c1", title: "夜班便利店", pitch: "你在便利店值夜班，客人全是过期的自己。" },
  { id: "c2", title: "退款勇者", pitch: "通关后发现游戏能退款，但世界会跟着消失。" },
  { id: "c3", title: "阳台天气", pitch: "阳台上的植物决定明天全城的天气。" },
];

Page({
  data: {
    logoSrc: LOGO_SRC,
    gatePoster: LOGO_SRC,
    posterFailed: false,
    subline: "ForgeaX 前置共创 · 产出游戏产品文档",
    agreed: false,
    hasLast: false,
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showLink: false,
    showConsent: false,
    siteUrl: FORGEAX_SITE_URL,
    ideas: IDEAS,
    cases: CASES,
    screen: 0,
  },

  _afterConsent: null as null | (() => void),
  _agreeLock: false,

  onLoad() {
    try {
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: FX_CHROME.canvas });
      wx.setBackgroundColor({ backgroundColor: FX_CHROME.canvas, backgroundColorTop: FX_CHROME.canvas, backgroundColorBottom: FX_CHROME.canvas });
    } catch (_e) {
      // 导航栏着色失败不挡进入
    }
  },

  onShow() {
    applyTabBar(wx, false);
    const cur = sessionIndex.current();
    this.setData({
      agreed: bridge.loadAgreed(),
      hasLast: Boolean(cur && cur.id),
    });
  },

  onScreenChange(e: { detail: { current?: number } }) {
    const screen = Number(e.detail.current) || 0;
    if (screen !== this.data.screen) this.setData({ screen });
  },

  onSeeExamples() {
    if (this.data.screen !== 1) this.setData({ screen: 1 });
  },

  onSeeCover() {
    if (this.data.screen !== 0) this.setData({ screen: 0 });
  },

  onPosterError() {
    this.setData({ posterFailed: true });
  },

  onToggleAgree() {
    const agreed = !bridge.loadAgreed();
    bridge.saveAgreed(agreed);
    this.setData({ agreed });
  },

  gate(next: () => void) {
    if (bridge.loadAgreed()) {
      next();
      return;
    }
    this._afterConsent = next;
    this.setData({ showConsent: true, showLegal: false, showLink: false });
  },

  onAgreeConsent() {
    if (this._agreeLock) return;
    this._agreeLock = true;
    bridge.saveAgreed(true);
    const next = this._afterConsent;
    this._afterConsent = null;
    this.setData({ agreed: true, showConsent: false });
    this._agreeLock = false;
    if (next) next();
  },

  onCloseConsent() {
    this._afterConsent = null;
    this.setData({ showConsent: false });
  },

  onConsentLegal(e: { detail?: { kind?: string } }) {
    this.onShowLegal({ currentTarget: { dataset: { kind: e.detail && e.detail.kind } } });
  },

  onStart() {
    this.gate(() => {
      bridge.setEntryOrigin("home");
      bridge.setPendingChat({ type: this.data.hasLast ? "resume" : "boot" });
      bridge.goChat();
    });
  },

  onNewSession() {
    this.gate(() => {
      bridge.setEntryOrigin("home");
      bridge.setPendingChat({ type: "boot" });
      bridge.goChat();
    });
  },

  onUseIdea(e: { currentTarget: { dataset: { text?: string } } }) {
    const text = e.currentTarget.dataset.text;
    if (!text) return;
    this.gate(() => {
      bridge.setEntryOrigin("home");
      bridge.setPendingPrompt(text);
      bridge.goChat();
    });
  },

  onUseCase(e: { currentTarget: { dataset: { pitch?: string; title?: string } } }) {
    const title = e.currentTarget.dataset.title || "";
    const pitch = e.currentTarget.dataset.pitch || "";
    const text = [title, pitch].filter(Boolean).join("：");
    if (!text) return;
    this.gate(() => {
      bridge.setEntryOrigin("home");
      bridge.setPendingPrompt(text);
      bridge.goChat();
    });
  },

  onOpenLink() {
    this.setData({ showLink: true, showLegal: false });
  },

  onCopyLink() {
    wx.setClipboardData({
      data: this.data.siteUrl,
      success: () => wx.showToast({ title: "已复制链接", icon: "success" }),
    });
  },

  onShowLegal(e: { currentTarget: { dataset: { kind?: string } } }) {
    const kind = e.currentTarget.dataset.kind;
    this.setData({
      showLegal: true,
      showLink: false,
      legalTitle: kind === "privacy" ? "隐私政策" : "用户协议",
      legalBody: kind === "privacy" ? legal.PRIVACY : legal.TERMS,
    });
  },

  onCloseSheets() {
    this.setData({ showLegal: false, showLink: false });
  },

  noop() {},
});
