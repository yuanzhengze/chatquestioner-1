import { createSession, getSession, deleteSession, sendMessage, startLinePatch, createShare, getCoverMeta, downloadCover, downloadCoverFile, attachShareCover } from "../../utils/api";
import { AvatarDriver } from "../../utils/avatar";
import { GDD_DRAFT_KEY, GDD_PATCH_KEY, FX_CHROME, LOGO_SRC, API_BASE } from "../../config";
import type { ChatMessage, StageInfo, TurnOption } from "../../utils/types";

const { gddFromState } = require("../../utils/gdd.js");
const { parseGddPreview, coverSlot, recordCard, coverFileMatches } = require("../../utils/gddPreview.js");
const gddExport = require("../../utils/gddExport.js");
const { captureShareCard } = require("../../utils/gddShareCard.js");
const sessionIndex = require("../../utils/sessionIndex.js");
const bridge = require("../../utils/bridge.js");
const legal = require("../../utils/legal.js");
const { applyTabBar } = require("../../utils/tabBar.js");
const {
  attachLiveOptions,
  freezeLiveOptions,
  liveOptions,
  markPending,
  placeGhosts,
  revealGhosts,
  preserveAssistantMeta,
  morphDelta,
  frozenSpacer,
  followPlan,
} = require("../../utils/messageOptions.js");

const WAKING = "正在唤醒 NewBee…";

/** 和 app.wxss 的 --dur-fly 对齐。占位收起、芯片飞行、把尾巴带进屏幕，共用这一段。 */
const FLY_MS = 320;
/** 尾巴露进屏幕时，和可视区底边留的空隙（px）。 */
const TAIL_PAD = 12;
/** 封面轮询和预览页同一节奏。卡片高度不跟着封面变。 */
const COVER_POLL_MS = 2000;
const COVER_POLL_MAX = 90;

function absUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

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
    /** 底部安全区（px）。原先写死 0，有 home 指示条的机型会贴到底。 */
    safeBottom: 0,
    /** 变形进行中：锁输入，但不等于 busy。 */
    picking: false,
    /** think：回答中。gdd：正在编文档。空：可以打字。 */
    composerMode: "",
    optsFreeze: -1,
    optsEase: false,
    optsGone: false,
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
    gddPitch: "",
    gddCoverUrl: "",
    /** pending | ready | failed | empty */
    gddCoverState: "empty",
    gddKicker: "游戏文档已成型",
    gddGo: "打开预览",
    showGdd: false,
    done: false,
    logoSrc: LOGO_SRC,
    openingGdd: false,
    composerSeed: "",
    seedSeq: 0,
    showMenu: false,
    showHistory: false,
    historyItems: [] as Array<{ id: string; title: string; pitch: string; coverUrl: string; hasDoc: boolean; current: boolean }>,
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
    this._coverTimer = 0 as number;
    this._coverTries = 0;
    this._shareId = "";
    this._sharePromise = null as Promise<{ id: string; title: string }> | null;
    this._shareImage = "";
    this._shareImagePromise = null as Promise<string> | null;
    this._shareCardKey = "";
    this._driver = null;
    this._handlingShow = false;
    this._afterConsent = null as null | (() => void);
    this._deleting = false;
    this._histGen = 0;
    this._histCache = {} as Record<string, { title: string; pitch: string; coverUrl: string; hasDoc: boolean; coverPath?: string }>;
    this._choosing = false;
    this._flyTimer = 0 as number;
    this._fromRect = null as Rect;
    this._freeze = -1;
    this._scrollHeld = false;
    this._followed = false;
    /** 当前卡片占了多高。变了才需要重新让空间。 */
    this._dockH = 0;

    this._onKeyboard = (res: { height: number }) => {
      /** 键盘把输入框顶高，滚动区又矮一截；排完版再贴底，最后一条消息才跟得上。 */
      this.setData({ keyboardHeight: res.height || 0 }, () => {
        const stream = this.stream();
        if (stream && typeof stream.stickBottom === "function") stream.stickBottom(true);
      });
      this.syncAvatar();
    };
    try {
      wx.onKeyboardHeightChange(this._onKeyboard);
    } catch (_e) {
      // 无键盘事件也不挡开场白
    }

    this.ensureDriver();
    this.paintChrome();
    this.measureSafeBottom();
  },

  measureSafeBottom() {
    try {
      const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) as {
        screenHeight?: number;
        safeArea?: { bottom?: number };
      };
      const screen = Number(info.screenHeight);
      const bottom = Number(info.safeArea?.bottom);
      const gap = isFinite(screen) && isFinite(bottom) ? Math.max(0, Math.round(screen - bottom)) : 0;
      if (gap > 0) this.setData({ safeBottom: gap });
    } catch (_e) {
      // 取不到就沿用默认留白
    }
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
    this.stopCoverWatch();
    this._shareId = "";
    this._sharePromise = null;
    this._shareImage = "";
    this._shareImagePromise = null;
    this._shareCardKey = "";
    this.setData({
      messages: [{ role: "assistant", content: WAKING }],
      busy: false,
      error: "",
      stageLabel: "",
      gddMarkdown: "",
      gddTitle: "",
      gddPitch: "",
      gddCoverUrl: "",
      gddCoverState: "empty",
      gddKicker: "游戏文档已成型",
      gddGo: "打开预览",
      showGdd: false,
      done: false,
      composerSeed: "",
      seedSeq: this.data.seedSeq + 1,
      showMenu: false,
      showHistory: false,
      composerMode: "",
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
    const switched = id !== this._sessionId;
    if (switched) {
      /** 封面和分享卡归属于会话。换会话时先清掉，否则 refreshResult 会把上一条的封面留给这一条。 */
      this.stopCoverWatch();
      this._shareId = "";
      this._sharePromise = null;
      this._shareImage = "";
      this._shareImagePromise = null;
      this._shareCardKey = "";
    }
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
    const coverReset = switched ? { gddCoverUrl: "", gddCoverState: "empty" } : {};
    this.setData({
      ...coverReset,
      messages: attachLiveOptions(
        messages.length ? messages : [{ role: "assistant", content: WAKING }],
        options,
      ),
      busy: false,
      composerMode: "",
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
      this.setData({ showHistory: false, showMenu: false });
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
    this.setData({ showHistory: false, showMenu: false, showConsent: false, showLegal: false });
    const origin = bridge.entryOrigin();
    if (origin === "mine") bridge.setEntryOrigin("home");
    wx.switchTab({ url: bridge.backTarget(origin) });
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
    if (this._sheetHide) {
      this._sheet = false;
      this._sheetHide = false;
      applyTabBar(wx, true);
      return;
    }
    this._sheet = false;
    this.clearOpenGdd();
    this.paintChrome();
    this.ensureDriver();
    applyTabBar(wx, true);
    void this.consumeHandoff();
  },

  onHide() {
    this.clearOpenGdd();
    /** 去文档预览优先：这是真的离开，不要被分享标记拦住。 */
    if (this._coverTabBar) {
      this._coverTabBar = false;
      this._sheet = false;
      return;
    }
    /**
     * 分享面板和导出文件面板会把页面盖住，微信因此走到 onHide。
     * 这不是离开共创。底栏继续藏着，回来也不重排。
     */
    if (this._sheet) {
      this._sheetHide = true;
      return;
    }
    applyTabBar(wx, false);
  },

  /** 原生分享/导出面板打开前打标，避免 onHide 把底栏放出来。 */
  markSheet() {
    this._sheet = true;
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
      if (pending && pending.from === "mine") bridge.setEntryOrigin("mine");
      else if (pending) bridge.setEntryOrigin("home");
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
    this.setData({ busy: true, composerMode: "think", error: "" });
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
      this.setData({ busy: false, composerMode: "" });
    } catch (_e) {
      this.setData({ busy: false, composerMode: "" });
      wx.showToast({ title: "这一行还进不去", icon: "none" });
    }
  },


  onUnload() {
    this._abort?.();
    this._driver?.destroy();
    if (this._flyTimer) clearTimeout(this._flyTimer);
    if (this._flushTimer) clearTimeout(this._flushTimer);
    if (this._openGddTimer) clearTimeout(this._openGddTimer);
    this.stopCoverWatch();
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
      measureLanding?: (cb: (out: {
        slot: Rect;
        scrollTop: number;
        tailGap: number;
        optsBottom: number | null;
      }) => void) => void;
      scrollTo?: (top: number, animated: boolean) => void;
      scrollEase?: (from: number, to: number, ms: number) => void;
      stickBottom?: (animated: boolean) => void;
      holdScroll?: () => void;
      releaseScroll?: () => void;
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
    this._choosing = false;
    this._fromRect = null;
    this._freeze = -1;
    this._scrollHeld = false;
    this._followed = false;
    const stream = this.stream();
    if (stream && typeof stream.releaseScroll === "function") stream.releaseScroll();
    if (this.data.chipShow || this.data.picking || this.data.optsFreeze >= 0) {
      this.setData({
        picking: false,
        optsFreeze: -1,
        optsEase: false,
        optsGone: false,
        probeText: "",
        chipShow: false,
        chipOn: false,
        chipDx: 0,
        chipDy: 0,
        chipScale: 1,
      });
    }
  },

  onOptsClear() {
    /** 选项节点已经撤掉。放开高度锁不会再把空壳弹回原高，也不改 scrollTop。 */
    if (this.data.optsFreeze < 0 && !this.data.optsEase && !this.data.optsGone) return;
    this.setData({ optsFreeze: -1, optsEase: false, optsGone: false });
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
          this.placeGhost(said, opt.label, freeze);
        });
      },
    );
  },

  /**
   * 真实气泡和「…」先占好最终高度，再量尾巴离屏幕底边还有多远。
   * 收起选项、把露在屏幕外的尾巴带进来，都写进同一次滚动，和芯片飞行同一段。
   */
  placeGhost(said: string, display: string, freeze: number) {
    const stream = this.stream();
    if (stream && typeof stream.holdScroll === "function") stream.holdScroll();
    this._scrollHeld = true;
    this._followed = false;
    this.setData(
      {
        messages: placeGhosts(this.data.messages, said, display),
        optsFreeze: freeze,
        optsGone: false,
        probeText: "",
      },
      () => {
        if (!stream || typeof stream.measureLanding !== "function") {
          this.land(said, display);
          return;
        }
        stream.measureLanding!((out) => {
          const seam = out.slot && out.optsBottom != null ? out.slot.top - out.optsBottom : 0;
          const collapse = freeze + Math.max(0, seam);
          const plan = followPlan(out.scrollTop, collapse, out.tailGap, TAIL_PAD);
          const target = out.slot ? { ...out.slot, top: out.slot.top + plan.shift } : null;
          const delta = morphDelta(this._fromRect, target);
          if (!delta) {
            this.land(said, display);
            return;
          }
          this._followed = true;
          /**
           * 先挂上过渡，再在下一帧收高度和下边距。
           * 同一帧又改 transition 又改 height，微信经常不播，高度会瞬间塌掉。
           * 滚动从这一次量到的 scrollTop 出发，和收起一起走完，落地不再改 scrollTop。
           */
          this.setData({ optsEase: true }, () => {
            this.setData({
              optsFreeze: 0,
              optsGone: true,
              chipOn: true,
              chipDx: delta.dx,
              chipDy: delta.dy,
              chipW: delta.width,
              chipH: delta.height,
              chipScale: 1,
            });
            if (typeof stream.scrollEase === "function") {
              stream.scrollEase(out.scrollTop, plan.scrollTop, FLY_MS);
            } else if (typeof stream.scrollTo === "function") {
              stream.scrollTo(plan.scrollTop, false);
            }
            this._flyTimer = setTimeout(() => {
              this._flyTimer = 0;
              this.land(said, display);
            }, FLY_MS) as unknown as number;
          });
        });
      },
    );
  },

  /** 落地：关掉固定层，让用户气泡显形。不改 scrollTop，滚动已经在飞行里走完。 */
  land(said: string, display: string) {
    this.setData(
      {
        messages: revealGhosts(this.data.messages, "user"),
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

    /** 占位已经在飞行那一段收完了，这里只是把 0 高度的空壳撤掉，并让「…」显形。 */
    const messages = preplaced
      ? freezeLiveOptions(revealGhosts(list))
      : [
        ...freezeLiveOptions(list),
        spoken,
        { role: "assistant" as const, content: "", appear: true },
      ];

    this._freeze = -1;
    this._lastOptions = [];
    this.setData({
      busy: true,
      composerMode: "think",
      picking: false,
      error: "",
      messages,
      probeText: "",
      chipShow: false,
      chipOn: false,
      done: false,
      composerSeed: "",
      seedSeq: this.data.seedSeq + 1,
    }, () => {
      /**
       * 高度锁先留着。选项节点由 observer 撤掉之后才会 onOptsClear 放开。
       * 飞行已经把 scrollTop 走完，这里不再贴底。
       */
      const stream = this.stream();
      const held = this._scrollHeld === true;
      const followed = this._followed === true;
      this._scrollHeld = false;
      this._followed = false;
      if (stream && typeof stream.releaseScroll === "function") stream.releaseScroll();
      if (held && !followed && typeof stream?.stickBottom === "function") stream.stickBottom(false);
    });
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
      onActivity: (kind) => {
        if (kind === "gdd") this.setData({ composerMode: "gdd" });
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
        this.setData({ busy: false, composerMode: "", messages: withOpts }, () => {
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
    const cache = this._histCache || {};
    this.setData({
      historyItems: idx.items.map((it: { id: string; title?: string }) => {
        const prev = cache[it.id];
        return {
          id: it.id,
          title: (prev && prev.title) || it.title || "未命名共创",
          pitch: prev ? prev.pitch : "",
          coverUrl: prev && coverFileMatches(it.id, prev.coverUrl) ? prev.coverUrl : "",
          hasDoc: prev ? prev.hasDoc : false,
          current: it.id === this._sessionId,
        };
      }),
    });
  },

  onOpenHistory() {
    this.refreshIndexHint();
    this.setData({ showHistory: true, showMenu: false });
    this.enrichHistory();
  },

  enrichHistory() {
    const gen = this._histGen + 1;
    this._histGen = gen;
    const items = (sessionIndex.load().items || []) as Array<{ id: string; title?: string }>;
    void Promise.all(items.map((it) => this.loadHistCard(it))).then((cards) => {
      if (gen !== this._histGen) return;
      const keep: Record<string, { title: string; pitch: string; coverUrl: string; hasDoc: boolean; coverPath?: string }> = {};
      cards.forEach((card) => { keep[card.id] = card; });
      this._histCache = keep;
      if (!this.data.showHistory) return;
      this.setData({
        historyItems: cards.map((card) => ({
          id: card.id,
          title: card.title,
          pitch: card.pitch,
          coverUrl: card.coverUrl,
          hasDoc: card.hasDoc,
          current: card.id === this._sessionId,
        })),
      });
    });
  },

  async loadHistCard(it: { id: string; title?: string }) {
    const prev = this._histCache[it.id];
    try {
      const state = await getSession(it.id);
      const card = recordCard(it, state) as { id: string; title: string; pitch: string; hasDoc: boolean; coverPath: string };
      let coverUrl = "";
      if (card.coverPath) {
        if (prev && prev.coverPath === card.coverPath && coverFileMatches(it.id, prev.coverUrl)) coverUrl = prev.coverUrl;
        else {
          try {
            const remote = /^https?:\/\//i.test(card.coverPath) ? card.coverPath : `${API_BASE}${card.coverPath.startsWith("/") ? card.coverPath : `/${card.coverPath}`}`;
            coverUrl = await downloadCoverFile(remote, it.id);
          } catch (_e) {
            coverUrl = "";
          }
        }
      }
      return { id: card.id, title: card.title, pitch: card.pitch, hasDoc: card.hasDoc, coverUrl, coverPath: card.coverPath };
    } catch (_e) {
      if (prev) return { id: it.id, ...prev };
      return { id: it.id, title: it.title || "未命名共创", pitch: "", hasDoc: false, coverUrl: "", coverPath: "" };
    }
  },

  onToggleMenu() {
    this.setData({ showMenu: !this.data.showMenu });
  },

  onCloseMenu() {
    if (this.data.showMenu) this.setData({ showMenu: false });
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
    if (this._histCache) delete this._histCache[id];
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
      showMenu: false,
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
    const preview = showGdd ? parseGddPreview(markdown) : { title: "", pitch: "" };
    const keepCover = showGdd && this.data.gddCoverState === "ready" && Boolean(this.data.gddCoverUrl);
    this.setData({
      gddMarkdown: markdown,
      gddTitle: preview.title,
      gddPitch: preview.pitch,
      showGdd,
      done: false,
      gddKicker: "游戏文档已成型",
      gddGo: "打开预览",
      gddCoverState: showGdd ? (keepCover ? "ready" : (this.data.gddCoverState === "failed" ? "failed" : "pending")) : "empty",
      gddCoverUrl: showGdd && keepCover ? this.data.gddCoverUrl : "",
    }, () => {
      this.dockGdd(showGdd);
      this.syncShareMenu(showGdd);
      if (showGdd) {
        this.prepareDocShare();
        this.watchCover();
      } else {
        this.stopCoverWatch();
      }
    });
  },

  syncShareMenu(on: boolean) {
    try {
      if (on) {
        wx.showShareMenu({ menus: ["shareAppMessage"] });
        wx.hideShareMenu({ menus: ["shareTimeline"] });
      } else {
        wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
      }
    } catch (_e) {
      // 分享菜单失败不挡卡片
    }
  },

  stopCoverWatch() {
    if (this._coverTimer) clearTimeout(this._coverTimer);
    this._coverTimer = 0;
    this._coverWatching = false;
  },

  watchCover() {
    if (!this._sessionId || !this.data.showGdd) return;
    if (this.data.gddCoverState === "ready" && this.data.gddCoverUrl) return;
    if (this._coverWatching) return;
    this._coverWatching = true;
    this._coverTries = 0;
    this.pollCover();
  },

  scheduleCoverPoll() {
    if (this._coverTimer || !this._sessionId || !this.data.showGdd) return;
    if (this._coverTries >= COVER_POLL_MAX) {
      if (this.data.gddCoverState === "pending") this.setData({ gddCoverState: "empty" });
      return;
    }
    this._coverTimer = setTimeout(() => {
      this._coverTimer = 0;
      this._coverTries += 1;
      this.pollCover();
    }, COVER_POLL_MS) as unknown as number;
  },

  pollCover() {
    const id = this._sessionId;
    if (!id || !this.data.showGdd) return;
    void getCoverMeta(id)
      .then((meta) => {
        if (id !== this._sessionId || !this.data.showGdd) return;
        const slot = coverSlot(meta);
        if (slot === "ready") {
          this.stopCoverWatch();
          const remote = absUrl(meta.imageUrl || "");
          void downloadCover(remote)
            .then((local) => {
              if (id !== this._sessionId) return;
              this.setData({ gddCoverUrl: local, gddCoverState: "ready" });
            })
            .catch(() => {
              if (id !== this._sessionId) return;
              this.setData({ gddCoverUrl: remote, gddCoverState: "ready" });
            });
          if (this._shareId) void attachShareCover(this._shareId, id).catch(() => "");
          return;
        }
        if (slot === "failed") {
          this.stopCoverWatch();
          this.setData({ gddCoverUrl: "", gddCoverState: "failed" });
          return;
        }
        if (slot === "empty" && this._coverTries >= 8) {
          this.stopCoverWatch();
          this.setData({ gddCoverUrl: "", gddCoverState: "empty" });
          return;
        }
        if (this.data.gddCoverState !== "pending") this.setData({ gddCoverState: "pending" });
        this.scheduleCoverPoll();
      })
      .catch(() => this.scheduleCoverPoll());
  },

  onCoverImageError() {
    this.setData({ gddCoverUrl: "", gddCoverState: "failed" });
  },

  prepareDocShare() {
    const markdown = this.data.gddMarkdown;
    const title = this.data.gddTitle || "未命名游戏";
    const pitch = this.data.gddPitch || "";
    if (!markdown) return;
    const key = title + "\n" + pitch;
    if (this._shareCardKey !== key) {
      this._shareCardKey = key;
      this._shareImage = "";
      this._shareImagePromise = null;
    }
    void this.startShare().catch(() => "");
    if (!this._shareImagePromise) void this.makeShareCard(title, pitch);
  },

  startShare(): Promise<{ id: string; title: string }> {
    if (this._shareId) return Promise.resolve({ id: this._shareId, title: this.data.gddTitle || "未命名游戏" });
    if (this._sharePromise) return this._sharePromise;
    const markdown = this.data.gddMarkdown;
    const title = this.data.gddTitle || "未命名游戏";
    if (!markdown) return Promise.reject(new Error("empty markdown"));
    this._sharePromise = createShare(markdown, title, {
      model: this._synthesisModel || undefined,
      complete: this._synthesisComplete === true,
      sessionId: this._sessionId || undefined,
    })
      .then((res) => {
        this._shareId = res.id;
        return res;
      })
      .catch((err) => {
        this._sharePromise = null;
        throw err;
      });
    return this._sharePromise;
  },

  makeShareCard(title: string, pitch: string): Promise<string> {
    this._shareImage = "";
    const job = captureShareCard(this, FX_CHROME, LOGO_SRC, title, pitch).then((path: string) => {
      this._shareImage = path;
      return path;
    });
    this._shareImagePromise = job;
    return job;
  },

  sharePayload(shareId: string) {
    const title = this.data.gddTitle || "NewBee 游戏文档";
    const payload: { title: string; path: string; imageUrl?: string } = {
      title,
      path: shareId ? `/pages/gdd/index?s=${shareId}` : "/pages/gdd/index",
    };
    if (this._shareImage) payload.imageUrl = this._shareImage;
    return payload;
  },

  onShareAppMessage() {
    const title = this.data.gddTitle || "NewBee 游戏文档";
    if (!this.data.showGdd || !this.data.gddMarkdown) {
      return { title, path: "/pages/home/index", imageUrl: LOGO_SRC };
    }
    if (!this._shareId) void this.startShare().catch(() => "");
    if (!this._shareImage) void this.makeShareCard(title, this.data.gddPitch || "");
    const payload = this.sharePayload(this._shareId || "");
    if (!payload.imageUrl) payload.imageUrl = LOGO_SRC;
    return payload;
  },

  onExportGdd() {
    this.markSheet();
    gddExport.sendGddFile(this.data.gddTitle, this.data.gddMarkdown);
  },

  /**
   * 卡片占掉的高度由滚动区让出来。setData 回调里布局未必已经变矮，
   * 所以再等一帧量卡片，然后用同一条缓动把尾巴滚进可视区。
   * 高度没变且尾巴已经在里面时，这次滚动是空操作。
   */
  dockGdd(showGdd: boolean) {
    const stream = this.stream();
    if (!stream || typeof stream.stickBottom !== "function") return;
    const measure = (attempt: number) => {
      wx.nextTick(() => {
        if (!showGdd) {
          if (this._dockH) {
            this._dockH = 0;
            stream.stickBottom!(false);
          }
          return;
        }
        this.createSelectorQuery().select("#gdd-dock").boundingClientRect().exec((res: Array<{ height?: number } | null>) => {
          const r = res && res[0];
          const h = r ? Math.round(Number(r.height)) : 0;
          if (!isFinite(h) || h <= 0) {
            if (attempt < 1) measure(attempt + 1);
            return;
          }
          const prev = Number(this._dockH || 0);
          const grew = Math.abs(h - prev) > 1;
          this._dockH = h;
          if (!grew) return;
          stream.stickBottom!(false);
          wx.nextTick(() => stream.stickBottom!(false));
        });
      });
    };
    measure(0);
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
            this._coverTabBar = true;
            wx.navigateTo({
              url: "/pages/gdd/index",
              success: (res) => {
                if (res.eventChannel) res.eventChannel.emit("gddDraft", payload);
              },
              fail: () => {
                this._coverTabBar = false;
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
