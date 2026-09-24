import { FORGEAX_SITE_URL, FX_CHROME, GDD_DRAFT_KEY, LOGO_SRC, API_BASE } from "../../config";
import { deleteSession, downloadCoverFile, getSession } from "../../utils/api";

const legal = require("../../utils/legal.js");
const { applyTabBar } = require("../../utils/tabBar.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");
const { recordCard, listViewportHeight, coverFileMatches } = require("../../utils/gddPreview.js");

function absUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

type HistCard = {
  id: string;
  title: string;
  pitch: string;
  hasDoc: boolean;
  coverUrl: string;
  action: "view" | "continue";
};

Page({
  data: {
    logoSrc: LOGO_SRC,
    siteUrl: FORGEAX_SITE_URL,
    historyItems: [] as HistCard[],
    histOpen: false,
    histScrollPx: 0,
    histPanelPx: 0,
    pickedId: "",
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showAbout: false,
  },

  _deleting: false,
  _listGen: 0,
  _cardCache: {} as Record<string, HistCard & { coverPath?: string }>,

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
    this.refreshList();
  },

  refreshList() {
    const gen = this._listGen + 1;
    this._listGen = gen;
    const items = (sessionIndex.load().items || []) as Array<{ id: string; title?: string }>;
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
      const picked = cards.some((card) => card.id === this.data.pickedId) ? this.data.pickedId : "";
      if (this.sameCards(this.data.historyItems, cards) && this.data.pickedId === picked) return;
      this.setData({ historyItems: cards, pickedId: picked }, () => this.fitHistScroll(false));
    });
  },

  sameCards(prev: HistCard[], next: HistCard[]) {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
      const a = prev[i];
      const b = next[i];
      if (a.id !== b.id || a.title !== b.title || a.pitch !== b.pitch || a.hasDoc !== b.hasDoc || a.coverUrl !== b.coverUrl || a.action !== b.action) return false;
    }
    return true;
  },

  paintCached(items: Array<{ id: string; title?: string }>) {
    const painted: HistCard[] = items.map((it) => {
      const cached = this._cardCache[it.id];
      if (cached) {
        return { id: cached.id, title: cached.title, pitch: cached.pitch, hasDoc: cached.hasDoc, coverUrl: cached.coverUrl, action: cached.action };
      }
      return { id: it.id, title: it.title || "未命名共创", pitch: "", hasDoc: false, coverUrl: "", action: "continue" as const };
    });
    const known = painted.every((card) => Boolean(this._cardCache[card.id]));
    const picked = painted.some((card) => card.id === this.data.pickedId) ? this.data.pickedId : "";
    if (known && this.sameCards(this.data.historyItems, painted) && this.data.pickedId === picked) return;
    this.setData({
      historyItems: painted,
      histOpen: painted.length === 0 ? false : this.data.histOpen,
      pickedId: picked,
    }, () => {
      if (known && this.data.histScrollPx > 0) return;
      this.fitHistScroll(true);
    });
  },

  async loadCard(it: { id: string; title?: string }): Promise<HistCard & { coverPath?: string }> {
    try {
      const state = await getSession(it.id);
      const card = recordCard(it, state) as HistCard & { coverPath?: string };
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
      return { id: card.id, title: card.title, pitch: card.pitch, hasDoc: card.hasDoc, action: card.action, coverUrl, coverPath: card.coverPath };
    } catch (_e) {
      const prev = this._cardCache[it.id];
      if (prev) return prev;
      return { id: it.id, title: it.title || "未命名共创", pitch: "", hasDoc: false, coverUrl: "", action: "continue" };
    }
  },

  fitHistScroll(force: boolean, done?: () => void) {
    const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const winH = Number(info.windowHeight) || 0;
    const finish = () => { if (done) done(); };
    if (this.data.historyItems.length === 0) {
      this.createSelectorQuery().select("#hist-empty").boundingClientRect().exec((res: Array<{ height?: number } | null>) => {
        const next = Math.ceil(Number(res && res[0] ? res[0].height : 0));
        const clip = next > 0 ? next + 1 : 0;
        if (clip > 0 && Math.abs(clip - Number(this.data.histPanelPx || 0)) > 1) this.setData({ histPanelPx: clip }, finish);
        else finish();
      });
      return;
    }
    const width = Number(info.windowWidth) || 375;
    const guess = listViewportHeight(this.data.historyItems.length * 220 * (width / 750), winH);
    const apply = (scroll: number, panel: number, cb?: () => void) => {
      const patch: { histScrollPx?: number; histPanelPx?: number } = {};
      if (Math.abs(scroll - Number(this.data.histScrollPx || 0)) > 1) patch.histScrollPx = scroll;
      const clip = panel > 0 ? panel + 1 : 0;
      if (Math.abs(clip - Number(this.data.histPanelPx || 0)) > 1) patch.histPanelPx = clip;
      if (patch.histScrollPx || patch.histPanelPx) this.setData(patch, cb);
      else if (cb) cb();
    };
    const measure = () => {
      this.createSelectorQuery().select("#hist-measure").boundingClientRect().exec((res: Array<{ height?: number } | null>) => {
        const content = res && res[0] ? Number(res[0].height) : 0;
        const next = listViewportHeight(content, winH);
        if (next > 0) apply(next, next);
      });
    };
    if (force || this.data.histScrollPx <= 0) apply(guess, guess, () => { finish(); wx.nextTick(measure); });
    else { finish(); wx.nextTick(measure); }
  },

  onToggleHist() {
    if (this.data.histOpen) {
      this.setData({ histOpen: false });
      return;
    }
    const open = () => this.setData({ histOpen: true }, () => wx.nextTick(() => this.fitHistScroll(false)));
    if (this.data.histPanelPx > 0) {
      open();
      return;
    }
    this.fitHistScroll(true, open);
  },

  onPickCard(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.pickedId !== id) {
      this.setData({ pickedId: id });
      return;
    }
    this.enterSession(id);
  },

  onRecordAction(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (id) this.enterSession(id);
  },

  enterSession(id: string) {
    bridge.setEntryOrigin("mine");
    sessionIndex.setCurrent(id);
    bridge.setPendingChat({ type: "open", id, from: "mine" });
    bridge.goChat();
  },

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
    if (this.data.pickedId === id) this.setData({ pickedId: "" });
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
    this.setData({
      showLegal: true,
      showAbout: false,
      legalTitle: kind === "privacy" ? "隐私政策" : "用户协议",
      legalBody: kind === "privacy" ? legal.PRIVACY : legal.TERMS,
    });
  },

  onOpenAbout() {
    this.setData({ showAbout: true, showLegal: false });
  },

  onCopyLink() {
    wx.setClipboardData({
      data: this.data.siteUrl,
      success: () => wx.showToast({ title: "已复制链接", icon: "success" }),
    });
  },

  onSettings() {
    wx.showToast({ title: "设置尚未接入", icon: "none" });
  },

  onLogin() {
    wx.showToast({ title: "开发期不绑定微信账号", icon: "none" });
  },

  onCloseSheets() {
    this.setData({ showLegal: false, showAbout: false });
  },

  noop() {},
});
