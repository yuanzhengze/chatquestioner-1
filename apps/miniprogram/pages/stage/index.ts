import { createSession, getSession, deleteSession, sendMessage, startLinePatch } from "../../utils/api";
import { AvatarDriver } from "../../utils/avatar";
import { GDD_DRAFT_KEY, GDD_PATCH_KEY, FX_CHROME, LOGO_SRC } from "../../config";
import type { ChatMessage, StageInfo, TurnOption } from "../../utils/types";

const { gddFromState } = require("../../utils/gdd.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");
const legal = require("../../utils/legal.js");
const {
  attachLiveOptions,
  freezeLiveOptions,
  liveOptions,
  markPending,
  placeGhosts,
  revealGhosts,
  wakeThinking,
  preserveAssistantMeta,
  morphDelta,
  frozenSpacer,
} = require("../../utils/messageOptions.js");

const WAKING = "正在唤醒 NewBee…";

/** 和 app.wxss 的 --dur-fly / --dur-panel 对齐。 */
const FLY_MS = 320;
const SETTLE_MS = 280;

type Rect = { left: number; top: number; width: number; height: number } | null;

function optionsArePatch(opts: TurnOption[]): boolean {
  const blob = (opts || []).map((o) => `${o.label}\n${o.detail}`).join("\n");
  return /应用这些改动/.test(blob) && /再改改说法/.test(blob);
}

Page({
  data: {
    messages: [{ role: "assistant", content: WAKING }] as ChatMessage[],
    busy: false,
    error: "",
    stageLabel: "",
    poster: LOGO_SRC,
    keyboardHeight: 0,
    /** 变形进行中：锁输入，但不等于 busy。 */
    picking: false,
    optsFreeze: -1,
    probeText: "",
    chipShow: false,
    chipOn: false,
    chipLabel: "",
    chipDetail: "",
    chipLeft: 0,
    chipTop: 0,
    chipW: 0,
    chipH: 0,
    chipDx: 0,
    chipDy: 0,
    chipScale: 1,
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
    this._synthesisDraftBar = false;
    this._lastOptions = [] as TurnOption[];
    this._openGddTimer = 0 as number;
    this._driver = null;
    this._handlingShow = false;
    this._afterConsent = null as null | (() => void);
    this._deleting = false;
    this._choosing = false;
    this._flyTimer = 0 as number;
    this._settleTimer = 0 as number;
    this._fromRect = null as Rect;
    this._freeze = -1;

    this._onKeyboard = (res: { height: number }) => {
      this.setData({ keyboardHeight: res.height || 0 });
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
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: FX_CHROME.raised });
      wx.setBackgroundColor({ backgroundColor: FX_CHROME.canvas, backgroundColorTop: FX_CHROME.raised, backgroundColorBottom: FX_CHROME.canvas });
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
      lastOptions: this._lastOptions && this._lastOptions.length
        ? this._lastOptions
        : liveOptions(this.data.messages),
      readyForSynthesis: this._stage?.readyForSynthesis === true,
    });
  },

  ensureDriver() {
    if (this._driver) return;
    try {
      /** 收进顶栏后尺寸固定，状态机只再驱动画面本身。 */
      this._driver = new AvatarDriver((poster) => this.setData({ poster }));
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
    this._synthesisDraftBar = false;
    this._lastOptions = [] as TurnOption[];
    this._warnTick = 0;
    this._typing = false;
    this.clearMorph();
    this.setData({
      messages: [{ role: "assistant", content: WAKING }],
      busy: false,
      error: "",
      stageLabel: "",
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
    this._synthesisMd = ready ? (md || gddFromState(state) || this._synthesisMd) : "";
    this._synthesisModel = ready ? (model || this._synthesisModel) : null;
    this._synthesisComplete = gddComplete;
    this._synthesisDraftBar = state.gddDraftBar === true || state.draftBar === true;
    this.clearMorph();
    this.setData({
      messages: attachLiveOptions(
        messages.length ? messages : [{ role: "assistant", content: WAKING }],
        options,
      ),
      busy: false,
      error: "",
    });
    this.refreshResult(ready, options);
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

      await this.consumePatchIntent();

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

  takePatchIntent(): {
    sessionId: string;
    lineId: string;
    lineText: string;
    sectionId: string;
    sectionTitle: string;
  } | null {
    try {
      const raw = wx.getStorageSync(GDD_PATCH_KEY) as {
        sessionId?: string;
        lineId?: string;
        lineText?: string;
        sectionId?: string;
        sectionTitle?: string;
      } | "";
      wx.removeStorageSync(GDD_PATCH_KEY);
      if (!raw || typeof raw !== "object" || !raw.lineId) return null;
      return {
        sessionId: String(raw.sessionId || ""),
        lineId: String(raw.lineId || ""),
        lineText: String(raw.lineText || ""),
        sectionId: String(raw.sectionId || ""),
        sectionTitle: String(raw.sectionTitle || ""),
      };
    } catch (_e) {
      return null;
    }
  },

  async consumePatchIntent() {
    const intent = this.takePatchIntent();
    if (!intent || !intent.lineId) return;
    if (intent.sessionId && intent.sessionId !== this._sessionId) {
      await this.openSession(intent.sessionId);
    }
    if (!this._sessionId || (intent.sessionId && intent.sessionId !== this._sessionId)) {
      wx.showToast({ title: "这条共创打不开了", icon: "none" });
      return;
    }
    this.setData({ busy: true, error: "" });
    try {
      const res = await startLinePatch(this._sessionId, intent);
      if (res.state && Object.keys(res.state).length) {
        this.hydrateFromState(this._sessionId, {
          ...res.state,
          gddMarkdown: res.gddMarkdown || res.state.gddMarkdown,
          gddModel: res.gddModel || res.state.gddModel,
          gddComplete: res.complete === true || res.state.gddComplete === true,
          gddDraftBar: res.draftBar === true || res.state.gddDraftBar === true || res.state.draftBar === true,
        });
      }
      this.setData({ busy: false });
    } catch (_e) {
      this.setData({ busy: false });
      wx.showToast({ title: "这一行还进不去", icon: "none" });
    }
  },

  onHide() {
    this.clearOpenGdd();
  },

  onUnload() {
    this._abort?.();
    this._driver?.destroy();
    if (this._flyTimer) clearTimeout(this._flyTimer);
    if (this._settleTimer) clearTimeout(this._settleTimer);
    if (this._flushTimer) clearTimeout(this._flushTimer);
    if (this._openGddTimer) clearTimeout(this._openGddTimer);
    if (this._onKeyboard) wx.offKeyboardHeightChange(this._onKeyboard);
  },

  async boot() {
    try {
      const { id, opening } = await createSession();
      this._sessionId = id;
      this._lastOptions = [];
      this.clearMorph();
      this.setData({
        messages: [{ role: "assistant", content: opening }],
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

  stream() {
    return this.selectComponent("#ctx-stream") as {
      measureProbe?: (cb: (height: number) => void) => void;
      measureSlot?: (cb: (rect: Rect) => void) => void;
      stickBottom?: (animated: boolean) => void;
    } | null;
  },

  asRect(raw: { left?: number; top?: number; width?: number; height?: number } | null | undefined): Rect {
    if (!raw) return null;
    const left = Number(raw.left);
    const top = Number(raw.top);
    const width = Number(raw.width);
    const height = Number(raw.height);
    if (![left, top, width, height].every((n) => isFinite(n)) || width <= 0 || height <= 0) return null;
    return { left, top, width, height };
  },

  clearMorph() {
    if (this._flyTimer) {
      clearTimeout(this._flyTimer);
      this._flyTimer = 0;
    }
    if (this._settleTimer) {
      clearTimeout(this._settleTimer);
      this._settleTimer = 0;
    }
    this._choosing = false;
    this._fromRect = null;
    this._freeze = -1;
    if (this.data.chipShow || this.data.picking || this.data.optsFreeze >= 0 || this.data.tailSpace >= 0) {
      this.setData({
        picking: false,
        optsFreeze: -1,
        optsShift: 0,
        tailSpace: -1,
        probeText: "",
        chipShow: false,
        chipOn: false,
        chipDx: 0,
        chipDy: 0,
        chipScale: 1,
      });
    }
  },

  /**
   * 点了方向。选中的这张卡交给固定层，从原位飞到真实用户气泡上；
   * 其余就地淡出。量不到坐标就退回老路径直接发送，动画绝不能挡住说话。
   */
  onStreamChoose(e: { detail: { option?: TurnOption; from?: Rect; box?: Rect } }) {
    const opt = e.detail && e.detail.option;
    if (!opt || this.data.busy || this._choosing) return;
    if (!bridge.loadAgreed()) {
      this.runAfterConsent(() => this.onStreamChoose(e));
      return;
    }
    /** 放进气泡的和发出去的必须是同一个串，否则防重复消息那一步会判失败。 */
    const said = String(opt.detail || opt.label || "").trim();
    if (!said) return;
    this._choosing = true;

    const from = this.asRect(e.detail.from);
    const box = this.asRect(e.detail.box);
    const stream = this.stream();
    if (!from || !box || !stream || typeof stream.measureProbe !== "function") {
      void this.send(said, { display: opt.label });
      return;
    }

    this._fromRect = from;
    this.setData(
      {
        picking: true,
        messages: markPending(this.data.messages, opt.id),
        probeText: opt.label,
        chipShow: true,
        chipOn: false,
        chipLabel: opt.label,
        chipDetail: opt.detail && opt.detail !== opt.label ? opt.detail : "",
        chipLeft: from.left,
        chipTop: from.top,
        chipW: from.width,
        chipH: from.height,
        chipDx: 0,
        chipDy: 0,
        chipScale: 0.98,
      },
      () => {
        stream.measureProbe!((insertH) => {
          const freeze = frozenSpacer(box.height, insertH);
          if (freeze < 0) {
            void this.send(said, { display: opt.label });
            return;
          }
          this._freeze = freeze;
          this.placeGhost(said, opt.label, freeze, insertH);
        });
      },
    );
  },

  /**
   * 真实气泡先进列表但不显形，同一次 setData 里把选项块压掉同样的高度、内容反向平移。
   * 内容总高不变 → scroll-view 不钳制 → 飞行期间列表一动不动，落点因此量一次就恒定。
   */
  placeGhost(said: string, display: string, freeze: number, shift: number) {
    const stream = this.stream();
    this.setData(
      {
        messages: placeGhosts(this.data.messages, said, display),
        optsFreeze: freeze,
        optsShift: shift,
        probeText: "",
      },
      () => {
        if (!stream || typeof stream.measureSlot !== "function") {
          this.land(said, display);
          return;
        }
        stream.measureSlot!((slot) => {
          const delta = morphDelta(this._fromRect, slot);
          if (!delta) {
            this.land(said, display);
            return;
          }
          this.setData({
            chipOn: true,
            chipDx: delta.dx,
            chipDy: delta.dy,
            chipW: delta.width,
            chipH: delta.height,
            chipScale: 1,
          });
          this._flyTimer = setTimeout(() => {
            this._flyTimer = 0;
            this.land(said, display);
          }, FLY_MS) as unknown as number;
        });
      },
    );
  },

  /** 落地：同一帧关掉固定层、让真实气泡显形，位置分毫不差。 */
  land(said: string, display: string) {
    this.setData(
      {
        messages: revealGhosts(this.data.messages),
        chipShow: false,
        chipOn: false,
      },
      () => {
        this._flyTimer = setTimeout(() => {
          this._flyTimer = 0;
          void this.send(said, { preplaced: true, display });
        }, 60) as unknown as number;
      },
    );
  },

  async send(text: string, morph?: { preplaced?: boolean; display?: string }) {
    const trimmed = (text || "").trim();
    if (!trimmed || this.data.busy) {
      this.clearMorph();
      return;
    }
    if (!bridge.loadAgreed()) {
      this.clearMorph();
      this.setData({ composerSeed: trimmed, seedSeq: this.data.seedSeq + 1 });
      this.runAfterConsent(() => {
        void this.send(trimmed, morph);
      });
      return;
    }
    if (!this._sessionId) {
      const ok = await this.boot();
      if (!ok || !this._sessionId) {
        this.clearMorph();
        return;
      }
    }
    const id = this._sessionId;
    if (!id) {
      this.clearMorph();
      return;
    }

    this._abort?.();
    this._stream = "";
    this._typing = false;
    this._choosing = false;
    this._fromRect = null;
    if (this._flyTimer) {
      clearTimeout(this._flyTimer);
      this._flyTimer = 0;
    }

    const list = this.data.messages;
    const last = list[list.length - 1];
    const prior = list[list.length - 2];
    /** 变形已经把这两条放进列表了，再插一遍就成了重复消息。 */
    const preplaced = morph?.preplaced === true
      && Boolean(last) && last.role === "assistant" && !last.content
      && Boolean(prior) && prior.role === "user" && prior.content === trimmed;

    const spoken: ChatMessage = { role: "user", content: trimmed };
    if (morph && morph.display) spoken.display = morph.display;

    const messages = preplaced
      ? freezeLiveOptions(wakeThinking(list))
      : [
        ...freezeLiveOptions(list),
        spoken,
        { role: "assistant" as const, content: "", appear: true },
      ];

    /** 选项块撤场，它让出的高度交给尾部占位，下一帧再收 0，对话顺着滚落。 */
    const tail = preplaced && this._freeze > 0 ? this._freeze : -1;
    this._freeze = -1;
    this._lastOptions = [];
    this.setData(
      {
        busy: true,
        picking: false,
        error: "",
        messages,
        optsFreeze: -1,
        optsShift: 0,
        tailSpace: tail,
        probeText: "",
        chipShow: false,
        chipOn: false,
        showGdd: false,
        done: false,
        composerSeed: "",
        seedSeq: this.data.seedSeq + 1,
      },
      () => {
        if (tail <= 0) return;
        this._settleTimer = setTimeout(() => {
          this.setData({ tailSpace: 0 });
          this._settleTimer = setTimeout(() => {
            this._settleTimer = 0;
            this.setData({ tailSpace: -1 }, () => {
              const stream = this.stream();
              if (stream && typeof stream.stickBottom === "function") stream.stickBottom(true);
            });
          }, SETTLE_MS) as unknown as number;
        }, 16) as unknown as number;
      },
    );
    this.syncAvatar();

    const { abort } = sendMessage(id, trimmed, {
      onToken: (t) => {
        this._stream += t;
        this.scheduleFlush();
      },
      onState: (s) => {
        this._state = s;
        if (typeof s.gddDraftBar === "boolean") this._synthesisDraftBar = s.gddDraftBar === true;
        else if (typeof s.draftBar === "boolean") this._synthesisDraftBar = s.draftBar === true;
        if (Array.isArray(s.lastOptions)) {
          this._lastOptions = this.asOptions(s.lastOptions);
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
        const flushed = this.flushNow();
        if (Array.isArray(s.lastOptions)) {
          this.setData({ messages: attachLiveOptions(flushed, this._lastOptions) });
          this.refreshResult(this._stage?.readyForSynthesis === true, this._lastOptions);
        }
        this.rememberSession();
        this.syncAvatar();
      },
      onStage: (info) => {
        this._stage = info;
        this.setData({ stageLabel: info.label || "" });
        this.syncAvatar();
      },
      onOptions: (opts) => {
        const flushed = this.flushNow();
        this._lastOptions = opts || [];
        this.setData({ messages: attachLiveOptions(flushed, this._lastOptions) });
        this.refreshResult(this._stage?.readyForSynthesis === true, this._lastOptions);
        this.syncAvatar();
      },
      onSynthesis: (payload) => {
        if (payload.gddMarkdown) {
          this._synthesisMd = payload.gddMarkdown;
          if (payload.gddModel) this._synthesisModel = payload.gddModel;
          this._synthesisComplete = payload.complete === true;
          this._synthesisDraftBar = payload.draftBar === true;
        }
      },
      onWarning: () => {
        this._warnTick += 1;
        this.syncAvatar();
      },
      onError: (msg) => this.setData({ error: msg }),
      onDone: (ready, extra) => {
        const flushed = this.flushNow();
        if (this._stage) this._stage.readyForSynthesis = ready;
        const withOpts = this._lastOptions.length
          ? attachLiveOptions(flushed, this._lastOptions)
          : flushed;
        this.setData({ busy: false, messages: withOpts }, () => {
          this.refreshResult(ready, this._lastOptions);
          this.rememberSession();
          this.refreshIndexHint();
          if (extra && extra.openPreview) this.onOpenGdd();
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
      confirmColor: "#FFADB3",
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

  refreshResult(readyFromDone?: boolean, optionList?: TurnOption[]) {
    const ready = readyFromDone === true || this._stage?.readyForSynthesis === true;
    if (this._stage) this._stage.readyForSynthesis = ready;
    const hasUser = this.data.messages.some((m) => m.role === "user");
    const markdown = ready ? (this._synthesisMd || gddFromState(this._state)) : "";
    const hasDoc = Boolean(markdown && markdown.trim());
    const opts = optionList || this._lastOptions || liveOptions(this.data.messages) || [];
    const showGdd = hasUser && ready && hasDoc && !optionsArePatch(opts);
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
    const markdown = this.data.gddMarkdown || this._synthesisMd || "";
    if (this.data.openingGdd) return;
    if (!markdown.trim() && !this._sessionId) {
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

      const go = (payload: {
        markdown: string;
        model: unknown;
        complete: boolean;
        draftBar: boolean;
        sessionId: string;
      }) => {
        if (!payload.markdown.trim()) {
          this.clearOpenGdd();
          wx.showToast({ title: "文档还没写好", icon: "none" });
          return;
        }
        wx.setStorage({
          key: GDD_DRAFT_KEY,
          data: payload,
          complete: () => {
            wx.navigateTo({
              url: "/pages/gdd/index",
              success: (res) => {
                if (res.eventChannel) res.eventChannel.emit("gddDraft", payload);
              },
              fail: () => {
                this.clearOpenGdd();
                wx.showToast({ title: "打不开文档页", icon: "none" });
              },
            });
          },
        });
      };

      const local = {
        markdown,
        model: this._synthesisModel || null,
        complete: this._synthesisComplete === true,
        draftBar: this._synthesisDraftBar === true,
        sessionId: this._sessionId || "",
      };
      if (!this._sessionId) {
        go(local);
        return;
      }
      void getSession(this._sessionId)
        .then((state) => {
          const md = typeof state.gddMarkdown === "string" && state.gddMarkdown.trim()
            ? String(state.gddMarkdown)
            : local.markdown;
          const model = state.gddModel && typeof state.gddModel === "object"
            ? state.gddModel
            : local.model;
          if (md) this._synthesisMd = md;
          if (model) this._synthesisModel = model;
          if (typeof state.gddComplete === "boolean") this._synthesisComplete = state.gddComplete === true;
          if (typeof state.gddDraftBar === "boolean") this._synthesisDraftBar = state.gddDraftBar === true;
          else if (typeof state.draftBar === "boolean") this._synthesisDraftBar = state.draftBar === true;
          go({
            markdown: md,
            model,
            complete: this._synthesisComplete === true,
            draftBar: this._synthesisDraftBar === true,
            sessionId: this._sessionId || "",
          });
        })
        .catch(() => go(local));
    });
  },

  scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = 0;
      this.flushNow();
    }, 40) as unknown as number;
  },

  flushNow(): ChatMessage[] {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = 0;
    }
    const messages = this.data.messages.slice();
    if (messages.length === 0) return messages;
    const last = messages[messages.length - 1];
    /** 末条是用户刚说的那句时不能覆盖，否则这句会被回复吃掉。 */
    if (last.role === "user") messages.push({ role: "assistant", content: this._stream });
    else messages[messages.length - 1] = preserveAssistantMeta(last, this._stream);
    this.setData({ messages });
    this.syncAvatar();
    return messages;
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
      hasOptions: liveOptions(this.data.messages).length > 0,
      keyboardUp: this.data.keyboardHeight > 0,
    });
  },
});
