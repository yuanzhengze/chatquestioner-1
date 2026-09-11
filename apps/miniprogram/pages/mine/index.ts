import { FORGEAX_SITE_URL, GDD_DRAFT_KEY, LOGO_SRC } from "../../config";
import { deleteSession } from "../../utils/api";

const legal = require("../../utils/legal.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");

Page({
  data: {
    logoSrc: LOGO_SRC,
    siteUrl: FORGEAX_SITE_URL,
    historyItems: [] as Array<{ id: string; title: string; current: boolean }>,
    histOpen: false,
    histListHeight: 480,
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showAbout: false,
  },

  _deleting: false,

  onLoad() {
    try {
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: "#0D0D0D" });
      wx.setBackgroundColor({ backgroundColor: "#0D0D0D", backgroundColorTop: "#0D0D0D", backgroundColorBottom: "#0D0D0D" });
    } catch (_e) {
      // 导航栏着色失败不挡进入
    }
  },

  onShow() {
    this.refreshList();
  },

  refreshList() {
    const idx = sessionIndex.load();
    const cur = sessionIndex.current();
    const historyItems = idx.items.map((it: { id: string; title?: string }) => ({
      id: it.id,
      title: it.title || "未命名共创",
      current: Boolean(cur && cur.id === it.id),
    }));
    const count = historyItems.length;
    const histListHeight = Math.min(Math.max(count, 1), 5) * 96;
    this.setData({
      historyItems,
      histListHeight,
      histOpen: count === 0 ? false : this.data.histOpen,
    });
  },

  onToggleHist() {
    this.setData({ histOpen: !this.data.histOpen });
  },

  onPickSession(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    sessionIndex.setCurrent(id);
    bridge.setPendingChat({ type: "open", id });
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
      confirmColor: "#F26A6A",
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
