import { createSession, getSession, deleteSession, sendMessage } from "../../utils/api";
import { AvatarDriver } from "../../utils/avatar";
import { GDD_DRAFT_KEY, LOGO_SRC } from "../../config";
import type { ChatMessage, StageInfo, TurnOption } from "../../utils/types";

const { gddFromState } = require("../../utils/gdd.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");
const legal = require("../../utils/legal.js");

const WAKING = "正在唤醒 NewBee…";

Page({
  data: {
    messages: [{ role: "assistant", content: WAKING }] as ChatMessage[],
    options: [] as TurnOption[],
    busy: false,
    error: "",
    stageLabel: "",
    poster: LOGO_SRC,
    compact: false,
    pendingId: "",
    expandedId: "",
    keyboardHeight: 0,
    gddMarkdown: "",
    gddTitle: "",
    gddKicker: "游戏文档已成型",
    gddGo: "打开预览",
    showGdd: false,
    done: false,
    logoSrc: LOGO_SRC,
    openingGdd: false,
    composerSeed: "",
    seedSeq: 0,
    showHistory: false,
    historyItems: [] as Array<{ id: string; title: string; current: boolean }>,
    showConsent: false,
    consentChecked: false,
    showLegal: false,
    legalTitle: "",
    legalBody: "",
  },

  onLoad() {
    this._sessionId = "";
    this._abort = null as null | (() => void);
    this._stream = "";
    this._flushTimer = 0 as number;
    this._state = null as Record<string, unknown> | null;
    this._stage = null as StageInfo | null;
    this._warnTick = 0;
    this._typing = false;
    this._synthesisMd = "";
    this._synthesisModel = null as unknown;
    this._synthesisComplete = false;
    this._lastOptions = [] as TurnOption[];
    this._openGddTimer = 0 as number;
    this._driver = null;
    this._handlingShow = false;
    this._afterConsent = null as null | (() => void);
    this._deleting = false;

    this._onKeyboard = (res: { height: number }) => {
      this.setData({ keyboardHeight: res.height || 0, compact: (res.height || 0) > 0 });
      this.syncAvatar();
    };
    try {
      wx.onKeyboardHeightChange(this._onKeyboard);
    } catch (_e) {
      // 无键盘事件也不挡开场白
    }

    this.ensureDriver();
    this.paintChrome();
  },

  paintChrome() {
    try {
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: "#242424" });
      wx.setBackgroundColor({ backgroundColor: "#0D0D0D", backgroundColorTop: "#242424", backgroundColorBottom: "#0D0D0D" });
    } catch (_e) {
      // 导航栏着色失败不挡进入
    }
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
    this._synthesisModel = null;
    this._synthesisComplete = false;
    this._lastOptions = [] as TurnOption[];
    this._warnTick = 0;
    this._typing = false;
    this.setData({
      messages: [{ role: "assistant", content: WAKING }],
      options: [],
      busy: false,
      error: "",
      stageLabel: "",
      pendingId: "",
      expandedId: "",
      gddMarkdown: "",
      gddTitle: "",
      gddKicker: "游戏文档已成型",
      gddGo: "打开预览",
      showGdd: false,
      done: false,
      composerSeed: "",
      seedSeq: this.data.seedSeq + 1,
      showHistory: false,
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
    const options = Array.isArray(state.lastOptions)
      ? this.asOptions(state.lastOptions)
      : this.asOptions(local && local.lastOptions);
    const ready = state.readyForSynthesis === true
      || (!("readyForSynthesis" in state) && local && local.readyForSynthesis === true);
    const gddComplete = state.gddComplete === true;
    const md = typeof state.gddMarkdown === "string" ? state.gddMarkdown : "";
    const model = state.gddModel && typeof state.gddModel === "object" ? state.gddModel : null;
    this._sessionId = id;
    this._state = state;
    this._lastOptions = options;
    this._stage = {
      stage: Number(state.stage) || 0,
      label: "",
      readyForSynthesis: ready,
    };
    this._synthesisMd = ready ? (md || gddFromState(state)) : "";
    this._synthesisModel = ready ? model : null;
    this._synthesisComplete = gddComplete;
    this.setData({
      messages: messages.length ? messages : [{ role: "assistant", content: WAKING }],
      options,
      busy: false,
      error: "",
      pendingId: "",
      expandedId: "",
    });
    this.refreshResult(ready);
    this.rememberSession();
    this.refreshIndexHint();
    this.syncAvatar();
  },

  onNewSession() {
    this.runAfterConsent(() => {
      this.resetConversation();
      this.ensureDriver();
      this.setData({ showHistory: false });
      void this.boot();
    });
  },

  async resumeLast() {
    const cur = sessionIndex.current();
    if (!cur || !cur.id) {
      await this.boot();
      return;
    }
    try {
      const state = await getSession(cur.id);
      this.hydrateFromState(cur.id, state);
    } catch (_e) {
      await this.boot();
    }
  },

  onBackToHome() {
    this.clearOpenGdd();
    this.setData({ showHistory: false, showConsent: false, showLegal: false });
    wx.switchTab({ url: "/pages/home/index" });
  },

  async openSession(id: string) {
    if (id === this._sessionId && this.hasUserSpeech()) return;
    this.ensureDriver();
    try {
      const state = await getSession(id);
      sessionIndex.setCurrent(id);
      this.hydrateFromState(id, state);
    } catch (_e) {
      wx.showToast({ title: "这条共创找不到了", icon: "none" });
    }
  },

  onShow() {
    this.clearOpenGdd();
    this.paintChrome();
    this.ensureDriver();
    void this.consumeHandoff();
  },

  async consumeHandoff() {
    if (this._handlingShow) return;
    this._handlingShow = true;
    try {
      if (this._sessionId) {
        const idx = sessionIndex.load();
        const still = idx.items.some((it: { id: string }) => it.id === this._sessionId);
        if (!still && this.hasUserSpeech()) this.resetConversation();
      }

      const pending = bridge.takePendingChat();
      if (pending && pending.type === "boot") {
        this.resetConversation();
        await this.boot();
      } else if (pending && pending.type === "resume") {
        await this.resumeLast();
      } else if (pending && pending.type === "open" && pending.id) {
        await this.openSession(String(pending.id));
      } else if (!this._sessionId) {
        await this.boot();
      }

      const prompt = bridge.takePendingPrompt();
      if (prompt) {
        if (this.data.done) {
          this.resetConversation();
          await this.boot();
        }
        this.setData({ composerSeed: prompt, seedSeq: this.data.seedSeq + 1 });
      }
      this.refreshIndexHint();
    } finally {
      this._handlingShow = false;
    }
  },

  onHide() {
    this.clearOpenGdd();
  },

  onUnload() {
    this._abort?.();
    this._driver?.destroy();
    if (this._flushTimer) clearTimeout(this._flushTimer);
    if (this._openGddTimer) clearTimeout(this._openGddTimer);
    if (this._onKeyboard) wx.offKeyboardHeightChange(this._onKeyboard);
  },

  async boot() {
    try {
      const { id, opening } = await createSession();
      this._sessionId = id;
      this._lastOptions = [];
      this.setData({
        messages: [{ role: "assistant", content: opening }],
        options: [],
        expandedId: "",
      });
      this.syncAvatar();
      return true;
    } catch (e) {
      this.setData({ error: String(e) });
      return false;
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
    if (!bridge.loadAgreed()) {
      this.runAfterConsent(() => this.onChoose(e));
      return;
    }
    this.setData({ pendingId: opt.id, expandedId: opt.id });
    setTimeout(() => {
      this.setData({ pendingId: "", options: [], expandedId: "" });
      void this.send(opt.detail);
    }, 260);
  },

  async send(text: string) {
    const trimmed = (text || "").trim();
    if (!trimmed || this.data.busy) return;
    if (!bridge.loadAgreed()) {
      this.setData({ composerSeed: trimmed, seedSeq: this.data.seedSeq + 1 });
      this.runAfterConsent(() => {
        void this.send(trimmed);
      });
      return;
    }
    if (!this._sessionId) {
      const ok = await this.boot();
      if (!ok || !this._sessionId) return;
    }
    const id = this._sessionId;
    if (!id) return;

    this._abort?.();
    this._stream = "";
    this._typing = false;

    const messages = [
      ...this.data.messages,
      { role: "user" as const, content: trimmed },
      { role: "assistant" as const, content: "" },
    ];
    this._lastOptions = [];
    this.setData({
      busy: true,
      error: "",
      options: [],
      expandedId: "",
      messages,
      showGdd: false,
      done: false,
      composerSeed: "",
      seedSeq: this.data.seedSeq + 1,
    });
    this.syncAvatar();

    const { abort } = sendMessage(id, trimmed, {
      onToken: (t) => {
        this._stream += t;
        this.scheduleFlush();
      },
      onState: (s) => {
        this._state = s;
        if (Array.isArray(s.lastOptions)) {
          const opts = this.asOptions(s.lastOptions);
          this._lastOptions = opts;
          this.setData({ options: opts, expandedId: "" });
        }
        const hist = Array.isArray(s.history) ? s.history : [];
        for (let i = hist.length - 1; i >= 0; i--) {
          const m = hist[i] as { role?: string; content?: string };
          if (m && m.role === "assistant" && typeof m.content === "string") {
            /** 已经流到屏幕上的字不能被 history 换掉；只在本轮还没流出时用 history 兜底。 */
            if (!(this._stream || "").trim()) this._stream = m.content;
            break;
          }
        }
        this.flushNow();
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
        if (payload.gddMarkdown) {
          this._synthesisMd = payload.gddMarkdown;
          this._synthesisModel = payload.gddModel || null;
          this._synthesisComplete = payload.complete === true;
        }
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
          this.refreshIndexHint();
        });
        this.syncAvatar();
      },
    });
    this._abort = abort;
  },

  refreshIndexHint() {
    const idx = sessionIndex.load();
    this.setData({
      historyItems: idx.items.map((it: { id: string; title?: string }) => ({
        id: it.id,
        title: it.title || "未命名共创",
        current: it.id === this._sessionId,
      })),
    });
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
    this.setData({ showHistory: false });
    void this.openSession(id);
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
    const wasCurrent = id === this._sessionId;
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
    this.refreshIndexHint();
    if (wasCurrent) {
      this.resetConversation();
      this.ensureDriver();
      await this.boot();
      this.refreshIndexHint();
    }
    this._deleting = false;
    wx.showToast({ title: "已删除", icon: "none" });
  },

  runAfterConsent(fn: () => void) {
    if (bridge.loadAgreed()) {
      fn();
      return;
    }
    this._afterConsent = fn;
    this.setData({
      showConsent: true,
      consentChecked: false,
      showLegal: false,
      showHistory: false,
    });
  },

  onToggleConsent() {
    this.setData({ consentChecked: !this.data.consentChecked });
  },

  onConfirmConsent() {
    if (!this.data.consentChecked) {
      wx.showToast({ title: "请先勾选同意", icon: "none" });
      return;
    }
    bridge.saveAgreed(true);
    this.setData({ showConsent: false, consentChecked: true });
    const next = this._afterConsent;
    this._afterConsent = null;
    if (next) next();
  },

  onCloseConsent() {
    this._afterConsent = null;
    this.setData({ showConsent: false });
  },

  onShowLegal(e: { currentTarget: { dataset: { kind?: string } } }) {
    const kind = e.currentTarget.dataset.kind;
    this.setData({
      showLegal: true,
      legalTitle: kind === "privacy" ? "隐私政策" : "用户协议",
      legalBody: kind === "privacy" ? legal.PRIVACY : legal.TERMS,
    });
  },

  onCloseLegal() {
    this.setData({ showLegal: false });
  },

  noop() {},

  refreshResult(readyFromDone?: boolean) {
    const ready = readyFromDone === true || this._stage?.readyForSynthesis === true;
    if (this._stage) this._stage.readyForSynthesis = ready;
    const hasUser = this.data.messages.some((m) => m.role === "user");
    const markdown = ready ? (this._synthesisMd || gddFromState(this._state)) : "";
    const hasDoc = Boolean(markdown && markdown.trim());
    const showGdd = hasUser && ready && hasDoc;
    const gddTitle = showGdd ? parseGddPreview(markdown).title : "";
    this.setData({
      gddMarkdown: markdown,
      gddTitle,
      showGdd,
      done: false,
      gddKicker: "游戏文档已成型",
      gddGo: "打开预览",
    });
  },

  clearOpenGdd() {
    if (this._openGddTimer) {
      clearTimeout(this._openGddTimer);
      this._openGddTimer = 0;
    }
    if (this.data.openingGdd) this.setData({ openingGdd: false });
  },

  onOpenGdd() {
    const markdown = this.data.gddMarkdown || "";
    if (this.data.openingGdd) return;
    if (!markdown.trim()) {
      wx.showToast({ title: "文档还没写好", icon: "none" });
      return;
    }
    this.setData({ openingGdd: true }, () => {
      this._openGddTimer = setTimeout(() => {
        this._openGddTimer = 0;
        if (!this.data.openingGdd) return;
        this.setData({ openingGdd: false });
        wx.showToast({ title: "打开有点慢，请再点一次", icon: "none" });
      }, 3500) as unknown as number;

      wx.setStorage({
        key: GDD_DRAFT_KEY,
        data: {
          markdown,
          model: this._synthesisModel || null,
          complete: this._synthesisComplete === true,
        },
        complete: () => {
          wx.navigateTo({
            url: "/pages/gdd/index",
            success: (res) => {
              if (res.eventChannel) {
                res.eventChannel.emit("gddDraft", {
                  markdown,
                  model: this._synthesisModel || null,
                  complete: this._synthesisComplete === true,
                });
              }
            },
            fail: () => {
              this.clearOpenGdd();
              wx.showToast({ title: "打不开文档页", icon: "none" });
            },
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
