import { API_BASE, BRAND_WORDMARK_SRC, FX_CHROME, HOME_HERO_SRC, LOGO_SRC } from "../../config";
import { downloadCover, getShare } from "../../utils/api";

const legal = require("../../utils/legal.js");
const { applyTabBar } = require("../../utils/tabBar.js");
const { capsuleInset } = require("../../utils/capsule.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");
const { SLOGAN_LINES } = require("../../utils/brandCopy.js");
const { EXAMPLE_SOURCE, exampleCard, exampleColumns, examplePath } = require("../../utils/exampleShowcase.js");

type ExampleCard = { id: string; shareId: string; title: string; pitch: string; coverRemote: string; cover: string; tall: boolean };
type ExampleCol = { key: string; items: ExampleCard[] };

/** 快照还没回来时先占好双列封面位，首屏高度不跳。 */
function placeholderCols(): ExampleCol[] {
  return exampleColumns(
    EXAMPLE_SOURCE.map((s: { id: string }) => ({ id: s.id, shareId: "", title: "", pitch: "", coverRemote: "", cover: "", tall: false })),
  );
}

Page({
  data: {
    heroSrc: HOME_HERO_SRC,
    heroFailed: false,
    markSrc: LOGO_SRC,
    wordmarkSrc: BRAND_WORDMARK_SRC,
    navTop: 0,
    navHeight: 32,
    capsuleRight: 0,
    sloganLines: SLOGAN_LINES,
    subline: "从一句脑洞聊起，在对话里把想法聊清楚，收成一份游戏产品文档。",
    hasLast: false,
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showConsent: false,
    exampleCols: placeholderCols(),
  },

  _afterConsent: null as null | (() => void),
  _agreeLock: false,
  _examples: "idle" as "idle" | "loading" | "ready" | "failed",

  onLoad() {
    try {
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: FX_CHROME.canvas });
      wx.setBackgroundColor({ backgroundColor: FX_CHROME.canvas, backgroundColorTop: FX_CHROME.canvas, backgroundColorBottom: FX_CHROME.canvas });
    } catch (_e) {
      // 导航栏着色失败不挡进入
    }
    let win = null;
    let menu = null;
    try {
      win = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (_e) {
      win = null;
    }
    try {
      menu = wx.getMenuButtonBoundingClientRect();
    } catch (_e) {
      menu = null;
    }
    const inset = capsuleInset(win, menu);
    this.setData({ navTop: inset.top, navHeight: inset.height, capsuleRight: inset.right });
    void this.loadExamples();
  },

  onShow() {
    applyTabBar(wx, false);
    const cur = sessionIndex.current();
    this.setData({ hasLast: Boolean(cur && cur.id) });
    if (this._examples === "failed") void this.loadExamples();
  },

  /** 示例只读分享快照：GET 快照和封面，不碰会话、历史和排序。 */
  async loadExamples() {
    if (this._examples === "loading" || this._examples === "ready") return;
    this._examples = "loading";
    const cards = await Promise.all(
      EXAMPLE_SOURCE.map((source: { id: string; shareId: string }) =>
        getShare(source.shareId)
          .then((snap) => exampleCard(source, snap) as ExampleCard | null)
          .catch(() => null),
      ),
    );
    const ready = cards.filter(Boolean) as ExampleCard[];
    this._examples = ready.length ? "ready" : "failed";
    const cols = exampleColumns(ready) as ExampleCol[];
    this.setData({ exampleCols: cols });
    cols.forEach((col, c) => {
      col.items.forEach((card, r) => {
        if (!card.coverRemote) return;
        const remote = /^https?:\/\//i.test(card.coverRemote) ? card.coverRemote : `${API_BASE}${card.coverRemote}`;
        const key = `exampleCols[${c}].items[${r}].cover`;
        void downloadCover(remote)
          .then((local) => this.setData({ [key]: local }))
          .catch(() => this.setData({ [key]: remote }));
      });
    });
  },

  onOpenExample(e: { currentTarget: { dataset: { share?: string } } }) {
    const shareId = e.currentTarget.dataset.share;
    if (!shareId) return;
    wx.navigateTo({ url: examplePath(shareId) });
  },

  onHeroError() {
    this.setData({ heroFailed: true });
  },

  gate(next: () => void) {
    if (bridge.loadAgreed()) {
      next();
      return;
    }
    this._afterConsent = next;
    this.setData({ showConsent: true, showLegal: false });
  },

  onAgreeConsent() {
    if (this._agreeLock) return;
    this._agreeLock = true;
    bridge.saveAgreed(true);
    const next = this._afterConsent;
    this._afterConsent = null;
    this.setData({ showConsent: false });
    this._agreeLock = false;
    if (next) next();
  },

  onCloseConsent() {
    this._afterConsent = null;
    this.setData({ showConsent: false });
  },

  onConsentLegal(e: { detail?: { kind?: string } }) {
    const kind = e.detail && e.detail.kind;
    this.setData({
      showLegal: true,
      legalTitle: kind === "privacy" ? "隐私政策" : "用户协议",
      legalBody: kind === "privacy" ? legal.PRIVACY : legal.TERMS,
    });
  },

  onCloseLegal() {
    this.setData({ showLegal: false });
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

  noop() {},
});
