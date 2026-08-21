import { createSession, sendMessage } from "../../utils/api";
import { AvatarDriver } from "../../utils/avatar";
import type { ChatMessage, StageInfo, TurnOption } from "../../utils/types";

const { gddFromState } = require("../../utils/gdd.js");

Page({
  data: {
    messages: [] as ChatMessage[],
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
    showGdd: false,
    done: false,
  },

  onLoad() {
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const safeBottom = Math.max(0, (sys.screenHeight || 0) - (sys.safeArea?.bottom || sys.screenHeight || 0));
    this.setData({ safeBottom });

    this._sessionId = "";
    this._abort = null as null | (() => void);
    this._stream = "";
    this._flushTimer = 0 as number;
    this._state = null as Record<string, unknown> | null;
    this._stage = null as StageInfo | null;
    this._warnTick = 0;
    this._typing = false;
    this._synthesisMd = "";
    this._driver = new AvatarDriver((poster, compact) => this.setData({ poster, compact }));

    this._onKeyboard = (res: { height: number }) => {
      this.setData({ keyboardHeight: res.height || 0, compact: (res.height || 0) > 0 });
      this.syncAvatar();
    };
    wx.onKeyboardHeightChange(this._onKeyboard);

    this.boot();
  },

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
    this.setData({ gddMarkdown: markdown, showGdd, done });
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
