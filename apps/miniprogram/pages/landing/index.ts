import { API_BASE, FORGEAX_SITE_URL } from "../../config";

const TERMS = `【开发期占位，非正式法务文本】

NewBee 是 ForgeaX 的前置共创产品。你在对话中提供的想法会被用来生成游戏产品文档（GDD），并可能手动交付给 ForgeaX 继续开发。

使用本小程序即表示你理解：当前为内部开发/体验版本，内容与存储策略尚未定稿。正式上线前将替换为本条款的法务审定版。`;

const PRIVACY = `【开发期占位，非正式法务文本】

开发期默认使用本地后端会话，不绑定微信账号。对话内容会保存在本机开发服务器的会话文件中，仅供联调用。

正式上线前将补充：收集范围、保存期限、第三方共享（如大模型服务）以及你的权利说明。`;

Page({
  data: {
    agreed: false,
    poster: `${API_BASE.replace(/\/$/, "")}/avatar/calm.png`,
    posterFailed: false,
    slogan: "把一句脑洞，聊成一份能做的游戏",
    subline: "ForgeaX 前置共创 · 产出游戏产品文档",
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showLink: false,
    siteUrl: FORGEAX_SITE_URL,
  },

  onPosterError() {
    this.setData({ posterFailed: true });
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  onStart() {
    if (!this.data.agreed) {
      wx.showToast({ title: "请先勾选同意", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/stage/index" });
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
      legalBody: kind === "privacy" ? PRIVACY : TERMS,
    });
  },

  onCloseSheets() {
    this.setData({ showLegal: false, showLink: false });
  },

  noop() {},
});
