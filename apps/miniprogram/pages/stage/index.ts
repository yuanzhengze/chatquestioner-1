import { createSession, sendMessage } from "../../utils/api";
import { AvatarDriver } from "../../utils/avatar";
import { API_BASE, FORGEAX_SITE_URL, GDD_DRAFT_KEY } from "../../config";
import type { ChatMessage, StageInfo, TurnOption } from "../../utils/types";

const { gddFromState } = require("../../utils/gdd.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");

const TERMS = `【开发期占位，非正式法务文本】

NewBee 是 ForgeaX 的前置共创产品。你在对话中提供的想法会被用来生成游戏产品文档（GDD），并可能手动交付给 ForgeaX 继续开发。

使用本小程序即表示你理解：当前为内部开发/体验版本，内容与存储策略尚未定稿。正式上线前将替换为本条款的法务审定版。`;

const PRIVACY = `【开发期占位，非正式法务文本】

开发期默认使用本地后端会话，不绑定微信账号。对话内容会保存在本机开发服务器的会话文件中，仅供联调用。

正式上线前将补充：收集范围、保存期限、第三方共享（如大模型服务）以及你的权利说明。`;

Page({
  data: {
    // 先摆一条占位，避免建会话那一跳里页面是空白，看着像卡住。
    messages: [{ role: "assistant", content: "正在唤醒 NewBee…" }] as ChatMessage[],
    options: [] as TurnOption[],
    busy: false,
    error: "",
    stageLabel: "",
    poster: "",
    compact: false,
    pendingId: "",
    safeBottom: 0,
    keyboardHeight: 0,
    gddMarkdown: "",
    gddTitle: "",
    showGdd: false,
    done: false,

    // 首屏授权门（原独立落地页）
    entered: false,
    agreed: false,
    gatePoster: `${API_BASE.replace(/\/$/, "")}/avatar/calm.png`,
    posterFailed: false,
    slogan: "把一句脑洞，聊成一份能做的游戏",
    subline: "ForgeaX 前置共创 · 产出游戏产品文档",
    showLegal: false,
    legalTitle: "",
    legalBody: "",
    showLink: false,
    siteUrl: FORGEAX_SITE_URL,
    openingGdd: false,
  },

  onLoad() {
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const safeBottom = Math.max(0, (sys.screenHeight || 0) - (sys.safeArea?.bottom || sys.screenHeight || 0));
      this.setData({ safeBottom });
    } catch (_e) {
      this.setData({ safeBottom: 0 });
    }

    this._sessionId = "";
    this._abort = null as null | (() => void);
    this._stream = "";
    this._flushTimer = 0 as number;
    this._state = null as Record<string, unknown> | null;
    this._stage = null as StageInfo | null;
    this._warnTick = 0;
    this._typing = false;
    this._synthesisMd = "";
    this._driver = null;

    this._onKeyboard = (res: { height: number }) => {
      this.setData({ keyboardHeight: res.height || 0, compact: (res.height || 0) > 0 });
      this.syncAvatar();
    };
    try {
      wx.onKeyboardHeightChange(this._onKeyboard);
    } catch (_e) {
      // 无键盘事件也不挡开场白
    }

    // 不在这里建会话：等用户在授权门里点「开始共创」并勾选同意之后再建，
    // 避免未同意就产生会话。
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
    // 从首屏返回后再进：会话已在，只揭开浮层，不重建。
    if (this._sessionId) {
      this.setData({ entered: true });
      return;
    }
    try {
      this._driver = new AvatarDriver((poster, compact) => this.setData({ poster, compact }));
    } catch (_e) {
      this._driver = null;
    }
    this.setData({ entered: true });
    this.boot();
  },

  onBackToGate() {
    this.setData({ entered: false, showLegal: false, showLink: false, openingGdd: false });
  },

  onShow() {
    if (this.data.openingGdd) this.setData({ openingGdd: false });
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

  onUnload() {
    this._abort?.();
    this._driver?.destroy();
    if (this._flushTimer) clearTimeout(this._flushTimer);
    if (this._onKeyboard) wx.offKeyboardHeightChange(this._onKeyboard);
  },

  async boot() {
    try {
      const { id, opening } = await createSession();
      this._sessionId = id;
      this.setData({ messages: [{ role: "assistant", content: opening }] });
      this.syncAvatar();
    } catch (e) {
      this.setData({ error: String(e) });
    }
  },

  onTyping(e: { detail: { typing: boolean } }) {
    this._typing = Boolean(e.detail.typing);
    this.syncAvatar();
  },

  onSend(e: { detail: { text: string } }) {
    void this.send(e.detail.text);
  },

  onChoose(e: { detail: TurnOption }) {
    const opt = e.detail;
    if (this.data.busy || this.data.pendingId) return;
    this.setData({ pendingId: opt.id });
    setTimeout(() => {
      this.setData({ pendingId: "", options: [] });
      void this.send(opt.detail);
    }, 260);
  },

  async send(text: string) {
    const id = this._sessionId;
    if (!id || this.data.busy) return;
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    this._abort?.();
    this._stream = "";
    this._typing = false;

    const messages = [
      ...this.data.messages,
      { role: "user" as const, content: trimmed },
      { role: "assistant" as const, content: "" },
    ];
    this.setData({ busy: true, error: "", options: [], messages, showGdd: false, done: false });
    this.syncAvatar();

    const { abort } = sendMessage(id, trimmed, {
      onToken: (t) => {
        this._stream += t;
        this.scheduleFlush();
      },
      onState: (s) => {
        this._state = s;
        this.syncAvatar();
      },
      onStage: (info) => {
        this._stage = info;
        this.setData({ stageLabel: info.label || "" });
        this.syncAvatar();
      },
      onOptions: (opts) => {
        this.flushNow();
        this.setData({ options: opts || [] });
        this.syncAvatar();
      },
      onSynthesis: (payload) => {
        if (payload.gddMarkdown) this._synthesisMd = payload.gddMarkdown;
      },
      onWarning: () => {
        this._warnTick += 1;
        this.syncAvatar();
      },
      onError: (msg) => this.setData({ error: msg }),
      onDone: (ready) => {
        this.flushNow();
        this.setData({ busy: false }, () => this.refreshResult(ready));
        this.syncAvatar();
      },
    });
    this._abort = abort;
  },

  refreshResult(readyFromDone?: boolean) {
    const ready = readyFromDone === true || this._stage?.readyForSynthesis === true;
    const hasUser = this.data.messages.some((m) => m.role === "user");
    const markdown = this._synthesisMd || gddFromState(this._state);
    const noOptions = (this.data.options?.length ?? 0) === 0;
    const showGdd = hasUser && noOptions && markdown.trim().length > 0;
    const done = showGdd && ready;
    const gddTitle = showGdd ? parseGddPreview(markdown).title : "";
    this.setData({ gddMarkdown: markdown, gddTitle, showGdd, done });
  },

  onOpenGdd() {
    const markdown = this.data.gddMarkdown || "";
    if (this.data.openingGdd) return;
    if (!markdown.trim()) {
      wx.showToast({ title: "文档还没写好", icon: "none" });
      return;
    }
    // 先出加载层再跳：navigateTo 建页在本机模拟器约 1 秒（B16），盖住这段空白。
    // 存储写完再跳，预览页 onLoad 就能立刻读到，减少白屏。
    this.setData({ openingGdd: true }, () => {
      wx.setStorage({
        key: GDD_DRAFT_KEY,
        data: { markdown },
        complete: () => {
          wx.navigateTo({
            url: "/pages/gdd/index",
            success: (res) => {
              if (res.eventChannel) res.eventChannel.emit("gddDraft", { markdown });
            },
            fail: () => this.setData({ openingGdd: false }),
          });
        },
      });
    });
  },

  scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = 0;
      this.flushNow();
    }, 40) as unknown as number;
  },

  flushNow() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = 0;
    }
    const messages = this.data.messages.slice();
    if (messages.length === 0) return;
    messages[messages.length - 1] = { role: "assistant", content: this._stream };
    this.setData({ messages });
    this.syncAvatar();
  },

  syncAvatar() {
    const messages = this.data.messages;
    const last = messages[messages.length - 1];
    this._driver?.sync({
      busy: this.data.busy,
      typing: this._typing && !this.data.busy,
      lastRole: last?.role,
      lastContentLen: last?.content.length ?? 0,
      state: this._state,
      stage: this._stage,
      error: this.data.error || null,
      warnTick: this._warnTick,
      hasOptions: (this.data.options?.length ?? 0) > 0,
      keyboardUp: this.data.keyboardHeight > 0,
    });
  },
});
