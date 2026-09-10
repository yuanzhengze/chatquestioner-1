import { createSession, getSession, sendMessage } from "../../utils/api";
import { AvatarDriver } from "../../utils/avatar";
import { API_BASE, FORGEAX_SITE_URL, GDD_DRAFT_KEY } from "../../config";
import type { ChatMessage, StageInfo, TurnOption } from "../../utils/types";

const { gddFromState } = require("../../utils/gdd.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");
const sessionIndex = require("../../utils/sessionIndex.js");

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
    expandedId: "",
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
    hasLast: false,
    showHistory: false,
    historyItems: [] as Array<{ id: string; title: string; current: boolean }>,
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
    this._lastOptions = [] as TurnOption[];
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

    this.refreshIndexHint();
  },

  refreshIndexHint() {
    const idx = sessionIndex.load();
    const cur = sessionIndex.current();
    this.setData({
      hasLast: Boolean(cur && cur.id),
      historyItems: idx.items.map((it: { id: string; title?: string }) => ({
        id: it.id,
        title: it.title || "未命名共创",
        current: Boolean(cur && cur.id === it.id),
      })),
    });
  },

  asOptions(raw: unknown): TurnOption[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((o: { id?: string; label?: string; detail?: string }) =>
      o && typeof o.id === "string" && typeof o.label === "string" && typeof o.detail === "string",
    ) as TurnOption[];
  },

  hasUserSpeech() {
    return this.data.messages.some((m) => m.role === "user" && String(m.content || "").trim());
  },

  rememberSession() {
    const id = this._sessionId;
    if (!id) return;
    const hasUser = this.data.messages.some((m) => m.role === "user" && String(m.content || "").trim());
    if (!hasUser) return;
    sessionIndex.upsert({
      id,
      title: sessionIndex.titleFrom(this._state, this.data.messages),
      updatedAt: Date.now(),
      lastOptions: this._lastOptions || this.data.options || [],
      readyForSynthesis: this._stage?.readyForSynthesis === true,
    });
    this.refreshIndexHint();
  },

  ensureDriver() {
    if (this._driver) return;
    try {
      this._driver = new AvatarDriver((poster, compact) => this.setData({ poster, compact }));
    } catch (_e) {
      this._driver = null;
    }
  },

  resetConversation() {
    this._abort?.();
    this._sessionId = "";
    this._stream = "";
    this._state = null;
    this._stage = null;
    this._synthesisMd = "";
    this._lastOptions = [] as TurnOption[];
    this._warnTick = 0;
    this._typing = false;
    this.setData({
      messages: [{ role: "assistant", content: "正在唤醒 NewBee…" }],
      options: [],
      busy: false,
      error: "",
      stageLabel: "",
      pendingId: "",
      expandedId: "",
      gddMarkdown: "",
      gddTitle: "",
      showGdd: false,
      done: false,
    });
  },

  hydrateFromState(id: string, state: Record<string, unknown>) {
    const history = Array.isArray(state.history) ? state.history : [];
    const messages = history
      .filter((m: { role?: string; content?: string }) => m && (m.role === "user" || m.role === "assistant"))
      .map((m: { role: string; content?: string }) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content || ""),
      }));
    const local = sessionIndex.load().items.find((it: { id: string }) => it.id === id);
    // 服务端有 lastOptions 字段（含空数组）就以它为准，避免本机索引里更早一轮的选项顶上来。
    const options = Array.isArray(state.lastOptions)
      ? this.asOptions(state.lastOptions)
      : this.asOptions(local && local.lastOptions);
    const ready = state.readyForSynthesis === true
      || (!("readyForSynthesis" in state) && local && local.readyForSynthesis === true);
    this._sessionId = id;
    this._state = state;
    this._lastOptions = options;
    this._stage = {
      stage: Number(state.stage) || 0,
      label: "",
      readyForSynthesis: ready,
    };
    // 未出稿时不用 gddFromState 拼半成品，否则会冒充「文档已成形」。
    this._synthesisMd = ready ? gddFromState(state) : "";
    this.setData({
      messages: messages.length ? messages : [{ role: "assistant", content: "正在唤醒 NewBee…" }],
      options,
      busy: false,
      error: "",
      pendingId: "",
      expandedId: "",
    });
    this.refreshResult(ready);
    this.rememberSession();
    this.syncAvatar();
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
    // 只有「已经说过话」的内存会话才直接揭开。没发过言的新共创返回首页后应丢掉，
    // 否则「继续共创」会走进一个未落盘、也不在「已保存」里的空会话。
    if (this._sessionId && this.hasUserSpeech()) {
      this.setData({ entered: true, showHistory: false });
      return;
    }
    if (this._sessionId && !this.hasUserSpeech()) {
      this.resetConversation();
    }
    this.ensureDriver();
    this.setData({ entered: true, showHistory: false });
    if (this.data.hasLast) {
      void this.resumeLast();
    } else {
      this.boot();
    }
  },

  onNewSession() {
    if (!this.data.entered && !this.data.agreed) {
      wx.showToast({ title: "请先勾选同意", icon: "none" });
      return;
    }
    this.resetConversation();
    this.ensureDriver();
    this.setData({ entered: true, showHistory: false });
    this.boot();
  },

  async resumeLast() {
    const cur = sessionIndex.current();
    if (!cur || !cur.id) {
      this.boot();
      return;
    }
    try {
      const state = await getSession(cur.id);
      this.hydrateFromState(cur.id, state);
    } catch (_e) {
      this.boot();
    }
  },

  onBackToGate() {
    if (!this.hasUserSpeech()) this.resetConversation();
    this.setData({
      entered: false,
      showLegal: false,
      showLink: false,
      openingGdd: false,
      showHistory: false,
    });
    this.refreshIndexHint();
  },

  onOpenHistory() {
    this.refreshIndexHint();
    this.setData({ showHistory: true });
  },

  onCloseHistory() {
    this.setData({ showHistory: false });
  },

  onPickSession(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (!this.data.entered && !this.data.agreed) {
      wx.showToast({ title: "请先勾选同意", icon: "none" });
      return;
    }
    this.setData({ showHistory: false, entered: true });
    void this.openSession(id);
  },

  async openSession(id: string) {
    if (id === this._sessionId && this.hasUserSpeech()) return;
    this.ensureDriver();
    try {
      const state = await getSession(id);
      sessionIndex.setCurrent(id);
      this.hydrateFromState(id, state);
      this.refreshIndexHint();
    } catch (_e) {
      wx.showToast({ title: "这条共创找不到了", icon: "none" });
      this.refreshIndexHint();
    }
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

  onToggleOption(e: { detail: { id?: string } }) {
    const id = e.detail?.id;
    if (!id || this.data.busy || this.data.pendingId) return;
    if (this.data.expandedId === id) {
      const opt = this.data.options.find((o) => o.id === id);
      if (opt) this.onChoose({ detail: opt });
      return;
    }
    this.setData({ expandedId: id });
  },

  onCollapseOption(e: { detail: { id?: string } }) {
    const id = e.detail?.id;
    if (!id || this.data.busy || this.data.pendingId) return;
    if (this.data.expandedId === id) this.setData({ expandedId: "" });
  },

  onChoose(e: { detail: TurnOption }) {
    const opt = e.detail;
    if (this.data.busy || this.data.pendingId) return;
    this.setData({ pendingId: opt.id, expandedId: opt.id });
    setTimeout(() => {
      this.setData({ pendingId: "", options: [], expandedId: "" });
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
    this._lastOptions = [];
    this.setData({ busy: true, error: "", options: [], expandedId: "", messages, showGdd: false, done: false });
    this.syncAvatar();

    const { abort } = sendMessage(id, trimmed, {
      onToken: (t) => {
        this._stream += t;
        this.scheduleFlush();
      },
      onState: (s) => {
        this._state = s;
        if (Array.isArray(s.lastOptions)) this._lastOptions = this.asOptions(s.lastOptions);
        this.rememberSession();
        this.syncAvatar();
      },
      onStage: (info) => {
        this._stage = info;
        this.setData({ stageLabel: info.label || "" });
        this.syncAvatar();
      },
      onOptions: (opts) => {
        this.flushNow();
        this._lastOptions = opts || [];
        this.setData({ options: opts || [], expandedId: "" });
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
        if (this._stage) this._stage.readyForSynthesis = ready;
        this.setData({ busy: false }, () => {
          this.refreshResult(ready);
          this.rememberSession();
        });
        this.syncAvatar();
      },
    });
    this._abort = abort;
  },

  refreshResult(readyFromDone?: boolean) {
    const ready = readyFromDone === true || this._stage?.readyForSynthesis === true;
    if (this._stage) this._stage.readyForSynthesis = ready;
    const hasUser = this.data.messages.some((m) => m.role === "user");
    const markdown = ready ? (this._synthesisMd || gddFromState(this._state)) : "";
    const noOptions = (this.data.options?.length ?? 0) === 0;
    // 只有 LLM 明确出稿才出示入口。半成品字段 + 无选项 ≠ 文档已成形。
    const showGdd = hasUser && noOptions && ready && markdown.trim().length > 0;
    const done = showGdd;
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
