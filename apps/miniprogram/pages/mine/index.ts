import { API_BASE, BRAND_WORDMARK_SRC, FORGEAX_SITE_URL, FX_CHROME, GDD_DRAFT_KEY, LOGO_SRC, MINE_HERO_SRC } from "../../config";
import { deleteSession, downloadCoverFile, getSession } from "../../utils/api";

const legal = require("../../utils/legal.js");
const { applyTabBar } = require("../../utils/tabBar.js");
const { capsuleInset } = require("../../utils/capsule.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");
const { recordCard, coverFileMatches } = require("../../utils/gddPreview.js");
const { SLOGAN } = require("../../utils/brandCopy.js");

/** 抽屉进出时长，与 app.wxss 的 --dur-panel 一致。 */
const SHEET_MS = 280;

function absUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

type IndexItem = { id: string; title?: string };

type HistCard = {
  id: string;
  title: string;
  pitch: string;
  hasDoc: boolean;
  coverUrl: string;
};

Page({
  data: {
    logoSrc: LOGO_SRC,
    wordmarkSrc: BRAND_WORDMARK_SRC,
    heroSrc: MINE_HERO_SRC,
    heroFailed: false,
    navTop: 0,
    navHeight: 32,
    capsuleRight: 0,
    slogan: SLOGAN,
    siteUrl: FORGEAX_SITE_URL,
    historyItems: [] as HistCard[],
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showAbout: false,
    sheetIn: false,
  },

  _deleting: false,
  _listGen: 0,
  _cardCache: {} as Record<string, HistCard & { coverPath?: string }>,
  _sheetTimer: 0 as number,

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
  },

  onShow() {
    applyTabBar(wx, false);
    this.refreshList();
  },

  onUnload() {
    if (this._sheetTimer) clearTimeout(this._sheetTimer);
  },

  onHeroError() {
    this.setData({ heroFailed: true });
  },

  refreshList() {
    const gen = this._listGen + 1;
    this._listGen = gen;
    /** 和共创页历史侧栏同一个顺序：sessionIndex 按内容更新时间排。 */
    const items = (sessionIndex.load().items || []) as IndexItem[];
    this.paintCached(items);
    void Promise.all(items.map((it) => this.loadCard(it))).then((cards) => {
      if (gen !== this._listGen) return;
      const keep: Record<string, HistCard & { coverPath?: string }> = {};
      cards.forEach((card) => {
        const prev = this._cardCache[card.id];
        if (prev && prev.coverPath && prev.coverPath === card.coverPath && coverFileMatches(card.id, prev.coverUrl)) {
          card.coverUrl = prev.coverUrl;
        }
        keep[card.id] = card;
      });
      this._cardCache = keep;
      if (this.sameCards(this.data.historyItems, cards)) return;
      this.setData({ historyItems: cards.map((card) => this.publicCard(card)) });
    });
  },

  publicCard(card: HistCard): HistCard {
    return { id: card.id, title: card.title, pitch: card.pitch, hasDoc: card.hasDoc, coverUrl: card.coverUrl };
  },

  sameCards(prev: HistCard[], next: HistCard[]) {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
      const a = prev[i];
      const b = next[i];
      if (a.id !== b.id || a.title !== b.title || a.pitch !== b.pitch || a.hasDoc !== b.hasDoc || a.coverUrl !== b.coverUrl) return false;
    }
    return true;
  },

  paintCached(items: IndexItem[]) {
    const painted: HistCard[] = items.map((it) => {
      const cached = this._cardCache[it.id];
      if (cached) return this.publicCard(cached);
      return { id: it.id, title: it.title || "未命名共创", pitch: "", hasDoc: false, coverUrl: "" };
    });
    if (this.sameCards(this.data.historyItems, painted)) return;
    this.setData({ historyItems: painted });
  },

  async loadCard(it: IndexItem): Promise<HistCard & { coverPath?: string }> {
    try {
      const state = await getSession(it.id);
      const card = recordCard(it, state) as { id: string; title: string; pitch: string; hasDoc: boolean; coverPath?: string };
      const prev = this._cardCache[it.id];
      let coverUrl = "";
      if (card.coverPath) {
        if (prev && prev.coverPath === card.coverPath && coverFileMatches(it.id, prev.coverUrl)) coverUrl = prev.coverUrl;
        else {
          try {
            coverUrl = await downloadCoverFile(absUrl(card.coverPath), it.id);
          } catch (_e) {
            coverUrl = "";
          }
        }
      }
      return { id: card.id, title: card.title, pitch: card.pitch, hasDoc: card.hasDoc, coverUrl, coverPath: card.coverPath };
    } catch (_e) {
      const prev = this._cardCache[it.id];
      if (prev) return prev;
      return { id: it.id, title: it.title || "未命名共创", pitch: "", hasDoc: false, coverUrl: "" };
    }
  },

  onOpenRecord(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (id) this.enterSession(id);
  },

  enterSession(id: string) {
    bridge.setEntryOrigin("mine");
    sessionIndex.setCurrent(id);
    bridge.setPendingChat({ type: "open", id, from: "mine" });
    bridge.goChat();
  },

  /** 没有记录时的入口，和首页「开始共创」同一条：交给共创页新开一条，返回仍回「我的」。 */
  onStartCocreate() {
    bridge.setEntryOrigin("mine");
    bridge.setPendingChat({ type: "boot", from: "mine" });
    bridge.goChat();
  },

  /** 长按一条记录删除，确认和删除接口沿用原来的。 */
  onDeleteSession(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (!id || this._deleting) return;
    const item = this.data.historyItems.find((it) => it.id === id);
    const name = item && item.title ? item.title : "这条共创";
    wx.showModal({
      title: "删除这条共创？",
      content: `「${name}」会从记录里去掉，不能再打开。已经分享出去的文档还在。`,
      confirmText: "删除",
      confirmColor: "#FFADB3",
      success: (res) => {
        if (res.confirm) void this.deleteRecord(id);
      },
    });
  },

  async deleteRecord(id: string) {
    if (!id || this._deleting) return;
    this._deleting = true;
    try {
      await deleteSession(id);
    } catch (_e) {
      this._deleting = false;
      wx.showToast({ title: "删除没成功，请再试", icon: "none" });
      return;
    }
    delete this._cardCache[id];
    sessionIndex.remove(id);
    try {
      wx.removeStorageSync(GDD_DRAFT_KEY);
    } catch (_e) {
      // 清预览草稿失败不挡删除
    }
    this.refreshList();
    this._deleting = false;
    wx.showToast({ title: "已删除", icon: "none" });
  },

  onShowLegal(e: { currentTarget: { dataset: { kind?: string } } }) {
    const kind = e.currentTarget.dataset.kind;
    this.openSheet({
      showLegal: true,
      showAbout: false,
      legalTitle: kind === "privacy" ? "隐私政策" : "用户协议",
      legalBody: kind === "privacy" ? legal.PRIVACY : legal.TERMS,
    });
  },

  onOpenAbout() {
    this.openSheet({ showAbout: true, showLegal: false });
  },

  /** 先挂上抽屉（遮罩透明、抽屉在屏幕下方），下一帧再加 in：遮罩淡入、抽屉从底部滑入。 */
  openSheet(patch: { showLegal: boolean; showAbout: boolean; legalTitle?: string; legalBody?: string }) {
    if (this._sheetTimer) clearTimeout(this._sheetTimer);
    this.setData({ ...patch, sheetIn: false }, () => {
      this._sheetTimer = setTimeout(() => {
        this._sheetTimer = 0;
        this.setData({ sheetIn: true });
      }, 30) as unknown as number;
    });
  },

  onSettings() {
    wx.showToast({ title: "设置功能即将开放", icon: "none" });
  },

  onCopyLink() {
    wx.setClipboardData({
      data: this.data.siteUrl,
      success: () => wx.showToast({ title: "已复制链接", icon: "success" }),
    });
  },

  /** 去掉 in：抽屉滑出、遮罩同步淡出；动画结束再卸载。卸载前遮罩一直在，点击不会穿透。 */
  onCloseSheets() {
    if (!this.data.showLegal && !this.data.showAbout) return;
    if (!this.data.sheetIn && !this._sheetTimer) return;
    if (this._sheetTimer) clearTimeout(this._sheetTimer);
    this.setData({ sheetIn: false });
    this._sheetTimer = setTimeout(() => {
      this._sheetTimer = 0;
      this.setData({ showLegal: false, showAbout: false });
    }, SHEET_MS) as unknown as number;
  },

  noop() {},
});
