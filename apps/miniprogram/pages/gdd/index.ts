import { API_BASE, FX_CHROME, GDD_DRAFT_KEY, GDD_PATCH_KEY, LOGO_SRC } from "../../config";
import { attachShareCover, createShare, downloadCover, downloadGameplayFile, getCoverMeta, getGameplay, getSession, getShare, requestCover, requestGameplay, requestGameplayOne } from "../../utils/api";

const { mdToHtml } = require("../../utils/md.js");
const { parseGddPreview, fullDocBody } = require("../../utils/gddPreview.js");
const { sectionsFromModel } = require("../../utils/gddSections.js");
const { toGddView } = require("../../utils/gddView.js");
const gddExport = require("../../utils/gddExport.js");
const { captureShareCard } = require("../../utils/gddShareCard.js");

const ACCORDION_MS = 200;
const FULL_DOC_MS = 220;

function absUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

/** gpt-image-2 出一张约 2MB 图经常要 1–3 分钟，不能按 30 秒放弃。 */
const COVER_POLL_MS = 2000;
const COVER_POLL_MAX = 90;
const GAMEPLAY_POLL_MS = 2000;
const GAMEPLAY_POLL_MAX = 450;

type MomentCard = {
  id: string;
  title: string;
  description: string;
  imageStatus: "idle" | "queued" | "pending" | "ready" | "failed" | "stale";
  localUrl: string;
  remoteUrl: string;
  imageFingerprint: string;
  revision: string;
};

function blankMoments(items: Array<{ id: string; title: string; description: string }>): MomentCard[] {
  return (items || []).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    imageStatus: "idle",
    localUrl: "",
    remoteUrl: "",
    imageFingerprint: "",
    revision: "",
  }));
}

Page({
  data: {
    title: "",
    pitch: "",
    html: "",
    plain: "",
    empty: true,
    ready: false,
    fromShare: false,
    logoSrc: LOGO_SRC,
    draft: false,
    sections: [] as Array<{ id: string; title: string; lines: Array<{ id: string; text: string }> }>,
    expandedId: "constitution",
    coverUrl: "",
    coverPending: false,
    profileGenres: [] as string[],
    profileTags: [] as string[],
    profileFormat: "",
    gameplayMoments: [] as MomentCard[],
    selectedLineId: "",
    lineActionsOn: false,
    fullDocOpen: false,
    fullDocH: "0px",
    fullDocMeasure: false,
    fullDocSnap: false,
    fullDocSettled: false,
  },

  _markdown: "",
  _model: null as unknown,
  _complete: false,
  _applied: false,
  _waitTimer: 0 as number,
  _shareId: "",
  _fromShare: false,
  _sharePromise: null as Promise<{ id: string; title: string }> | null,
  _shareImage: "",
  _shareImagePromise: null as Promise<string> | null,
  _sessionId: "",
  _coverTimer: 0 as number,
  _coverTries: 0,
  _coverRegen: false,
  _coverRemote: "",
  _gpTimer: 0 as number,
  _gpTries: 0,
  _gpLocal: {} as Record<string, string>,
  _fullDocGen: 0,
  _fullDocSettle: 0,
  _profileTimer: 0 as number,
  _profileTries: 0,

  onLoad(query: { s?: string }) {
    try {
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: FX_CHROME.canvas });
      wx.setBackgroundColor({ backgroundColor: FX_CHROME.canvas, backgroundColorTop: FX_CHROME.canvas, backgroundColorBottom: FX_CHROME.canvas });
    } catch (_e) {
      // 导航栏着色失败不挡打开
    }
    const shareId = query && query.s ? String(query.s) : "";
    if (shareId) {
      this._shareId = shareId;
      this._fromShare = true;
      this.setData({ fromShare: true });
      wx.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
      void this.loadShare(shareId);
      return;
    }

    wx.showShareMenu({ menus: ["shareAppMessage"] });
    wx.hideShareMenu({ menus: ["shareTimeline"] });

    const ch = this.getOpenerEventChannel();
    if (ch && typeof ch.on === "function") {
      ch.on("gddDraft", (payload: { markdown?: string; model?: unknown; complete?: boolean; draftBar?: boolean; sessionId?: string }) => {
        this.applyPayload(payload);
      });
    }
    if (!this._applied) this.applyFromStorage();
    this._waitTimer = setTimeout(() => {
      this._waitTimer = 0;
      if (this._applied) return;
      this.applyFromStorage();
      if (!this._applied) this.applyPayload({});
    }, 1200) as unknown as number;
  },

  onShow() {
    if (this._sheetHide) {
      this._sheet = false;
      this._sheetHide = false;
      this.restoreSheetScroll();
      return;
    }
    this._sheet = false;
    if (this._fromShare) return;
    if (!this._applied) this.applyFromStorage();
    else this.refreshGameplay(true);
  },

  onHide() {
    if (this._sheet) this._sheetHide = true;
  },

  onPageScroll(e: { scrollTop?: number }) {
    const top = Number(e.scrollTop) || 0;
    if (this._sheet && top < 2 && this._sheetScroll > 30) {
      this.restoreSheetScroll();
      return;
    }
    if (!this._sheet) this._sheetScroll = top;
  },

  markSheet() {
    this._sheet = true;
  },

  restoreSheetScroll() {
    const top = Number(this._sheetScroll) || 0;
    if (top <= 0) return;
    wx.pageScrollTo({ scrollTop: top, duration: 0 });
  },

  onUnload() {
    if (this._waitTimer) clearTimeout(this._waitTimer);
    if (this._lineActTimer) clearTimeout(this._lineActTimer);
    if (this._lineViewTimer) clearTimeout(this._lineViewTimer);
    this.clearFullDocSettle();
    this.stopCoverWatch();
    this.stopGameplayWatch();
    this.stopProfileWatch();
  },

  async loadShare(id: string) {
    try {
      const snap = await getShare(id);
      this.applyPayload({
        markdown: snap.markdown,
        model: snap.model,
        complete: snap.complete,
        coverImageUrl: snap.coverImageUrl,
      });
    } catch (_e) {
      this._shareId = "";
      this.applyPayload({});
      wx.showToast({ title: "这份分享找不到了", icon: "none" });
    }
  },

  applyFromStorage() {
    try {
      const draft = wx.getStorageSync(GDD_DRAFT_KEY) as {
        markdown?: string;
        model?: unknown;
        complete?: boolean;
        draftBar?: boolean;
        sessionId?: string;
      } | "";
      if (draft && typeof draft === "object" && draft.markdown) this.applyPayload(draft);
    } catch (_e) {
      // 读缓存失败时等 eventChannel / 超时
    }
  },

  applyPayload(payload?: {
    markdown?: string;
    model?: unknown;
    complete?: boolean;
    draftBar?: boolean;
    sessionId?: string;
    coverImageUrl?: string;
  }) {
    this.clearFullDocSettle();
    const markdown = String((payload && payload.markdown) || "").trim();
    const model = payload && payload.model && typeof payload.model === "object" ? payload.model : null;
    const complete = payload && payload.complete === true;
    const draftBar = payload && payload.draftBar === true;
    this._sessionId = payload && payload.sessionId ? String(payload.sessionId) : this._sessionId;
    this.stopCoverWatch();
    this.stopGameplayWatch();
    this._gpLocal = {};
    this._coverRemote = "";
    if (!markdown) {
      this._markdown = "";
      this._model = null;
      this._complete = false;
      this._applied = true;
      this._shareImage = "";
      this._shareImagePromise = null;
      this.setData({
        ready: true,
        empty: true,
        title: "",
        pitch: "",
        html: "",
        plain: "",
        draft: false,
        sections: [],
        expandedId: "constitution",
        coverUrl: "",
        coverPending: false,
        profileGenres: [],
        profileTags: [],
        profileFormat: "",
        gameplayMoments: [],
        selectedLineId: "",
        lineActionsOn: false,
        fullDocOpen: false,
        fullDocH: "0px",
        fullDocMeasure: false,
        fullDocSnap: false,
        fullDocSettled: false,
      });
      return;
    }
    const meta = parseGddPreview(markdown);
    const docBody = fullDocBody(markdown);
    let html = "";
    try {
      html = docBody ? mdToHtml(docBody) : "";
    } catch (_e) {
      html = "";
    }
    const view = toGddView(model || {});
    const title = view.title || meta.title || "未命名游戏";
    const pitch = view.pitch || meta.pitch || "";
    let sections: Array<{ id: string; title: string; lines: Array<{ id: string; text: string }> }> = [];
    try {
      sections = sectionsFromModel(model, complete) as Array<{ id: string; title: string; lines: Array<{ id: string; text: string }> }>;
    } catch (_e) {
      sections = [];
    }
    const profile = view.profile || { genres: [], experienceTags: [], formatLine: "" };
    this._markdown = markdown;
    this._model = model;
    this._complete = complete;
    this._applied = true;
    this.setData({
      ready: true,
      empty: false,
      title,
      pitch,
      html,
      plain: html ? "" : docBody,
      draft: draftBar,
      sections,
      expandedId: sections.length ? sections[0].id : "",
      coverUrl: "",
      coverPending: false,
      profileGenres: [],
      profileTags: [],
      profileFormat: profile.formatLine || "",
      gameplayMoments: blankMoments(view.gameplayMoments || []),
      selectedLineId: "",
      lineActionsOn: false,
      fullDocOpen: false,
      fullDocH: "0px",
      fullDocMeasure: false,
      fullDocSnap: false,
      fullDocSettled: false,
    });
    if (this._fromShare) {
      const shareCover = payload && payload.coverImageUrl ? String(payload.coverImageUrl) : "";
      if (shareCover) this.revealCover(shareCover);
      return;
    }
    void this.startShare();
    void this.makeShareCard(title, pitch);
    this.startCoverWatch();
    this.refreshGameplay(true);
    this.startProfileWatch();
  },

  stopProfileWatch() {
    if (this._profileTimer) clearTimeout(this._profileTimer);
    this._profileTimer = 0;
  },

  startProfileWatch() {
    if (this._fromShare || !this._sessionId) return;
    this.stopProfileWatch();
    this._profileTries = 0;
    this.pollProfile();
  },

  pollProfile() {
    const id = this._sessionId;
    if (!id || this._fromShare) return;
    void getSession(id).then((state) => {
      if (id !== this._sessionId) return;
      const cls = state.gameClassification as {
        status?: string;
        genres?: Array<{ label?: string }>;
        tags?: Array<{ label?: string }>;
        debug?: { error?: string; filtered?: unknown };
      } | undefined;
      if (cls && cls.status === "ready") {
        this.setData({
          profileGenres: (cls.genres || []).map((row) => String(row.label || "")).filter(Boolean),
          profileTags: (cls.tags || []).map((row) => String(row.label || "")).filter(Boolean),
        });
        return;
      }
      if (cls && cls.status === "failed") return;
      this._profileTries += 1;
      if (this._profileTries > 40) return;
      this._profileTimer = setTimeout(() => this.pollProfile(), 2000) as unknown as number;
    }).catch(() => {
      this._profileTries += 1;
      if (this._profileTries > 40) return;
      this._profileTimer = setTimeout(() => this.pollProfile(), 2000) as unknown as number;
    });
  },

  startShare(): Promise<{ id: string; title: string }> {
    if (this._shareId) {
      return Promise.resolve({ id: this._shareId, title: this.data.title || "未命名游戏" });
    }
    if (this._sharePromise) return this._sharePromise;
    const markdown = this._markdown;
    const title = this.data.title || "未命名游戏";
    if (!markdown) return Promise.reject(new Error("empty markdown"));
    this._sharePromise = createShare(markdown, title, {
      model: this._model || undefined,
      complete: this._complete === true,
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
    const title = this.data.title || "NewBee 游戏文档";
    const payload: { title: string; path: string; imageUrl?: string } = {
      title,
      path: shareId ? `/pages/gdd/index?s=${shareId}` : "/pages/gdd/index",
    };
    if (this._shareImage) payload.imageUrl = this._shareImage;
    return payload;
  },

  onShareAppMessage() {
    const title = this.data.title || "NewBee 游戏文档";
    if (this._fromShare || !this._markdown) return { title, path: "/pages/gdd/index", imageUrl: LOGO_SRC };
    if (!this._shareId) void this.startShare().catch(() => "");
    if (!this._shareImage) void this.makeShareCard(title, this.data.pitch || "");
    const payload = this.sharePayload(this._shareId || "");
    if (!payload.imageUrl) payload.imageUrl = LOGO_SRC;
    return payload;
  },

  onCoverError() {
    this._coverRemote = "";
    this.setData({ coverUrl: "", coverPending: false });
  },

  /** 下载完再原位换图。同一张图不重复下载，正在显示的旧图在新图到手前不清空。 */
  revealCover(remote: string) {
    const url = absUrl(remote);
    if (!url || url === this._coverRemote) return;
    this._coverRemote = url;
    void downloadCover(url)
      .then((local) => {
        if (this._coverRemote === url) this.setData({ coverUrl: local });
      })
      .catch(() => {
        if (this._coverRemote === url) this.setData({ coverUrl: url });
      });
  },

  stopCoverWatch() {
    if (this._coverTimer) {
      clearTimeout(this._coverTimer);
      this._coverTimer = 0;
    }
    this._coverTries = 0;
  },

  stopGameplayWatch() {
    if (this._gpTimer) {
      clearTimeout(this._gpTimer);
      this._gpTimer = 0;
    }
    this._gpTries = 0;
  },

  refreshGameplay(ensure = false) {
    if (this._fromShare || !this._sessionId || !this.data.gameplayMoments.length) return;
    const sessionId = this._sessionId;
    const task = ensure ? requestGameplay(sessionId) : getGameplay(sessionId);
    void task
      .then((pub) => this.applyGameplay(sessionId, pub.items || []))
      .catch(() => {
        if (ensure) this.refreshGameplay(false);
      });
  },

  applyGameplay(sessionId: string, items: Array<{ mechanicId?: string; status?: string; imageUrl?: string; imageFingerprint?: string; fingerprint?: string; revision?: string }>) {
    if (sessionId !== this._sessionId) return;
    const byId: Record<string, { status: MomentCard["imageStatus"]; imageUrl: string; imageFingerprint: string; revision: string }> = {};
    items.forEach((item) => {
      const id = String(item.mechanicId || "");
      if (!id) return;
      const status = item.status;
      const imageStatus: MomentCard["imageStatus"] = status === "queued" || status === "pending" || status === "ready" || status === "failed" || status === "stale" ? status : "idle";
      byId[id] = {
        status: imageStatus,
        imageUrl: String(item.imageUrl || ""),
        imageFingerprint: String(item.imageFingerprint || item.fingerprint || ""),
        revision: String(item.revision || ""),
      };
    });
    const next = this.data.gameplayMoments.map((moment) => {
      const remote = byId[moment.id];
      if (!remote) {
        return { ...moment, imageStatus: "idle" as const, localUrl: "", remoteUrl: "", imageFingerprint: "", revision: "" };
      }
      const key = `${moment.id}|${remote.revision}`;
      const cached = remote.revision && moment.revision === remote.revision ? (this._gpLocal[key] || moment.localUrl || "") : "";
      return {
        ...moment,
        imageStatus: remote.status,
        remoteUrl: remote.imageUrl,
        imageFingerprint: remote.imageFingerprint,
        revision: remote.revision,
        localUrl: cached,
      };
    });
    const busy = next.some((moment) => moment.imageStatus === "pending" || moment.imageStatus === "queued");
    this.setData({ gameplayMoments: next });
    next.forEach((moment) => {
      if ((moment.imageStatus !== "ready" && moment.imageStatus !== "stale") || !moment.remoteUrl || moment.localUrl || !moment.revision) return;
      const key = `${moment.id}|${moment.revision}`;
      void downloadGameplayFile(absUrl(moment.remoteUrl), sessionId, moment.id, moment.revision)
        .then((local) => {
          if (sessionId !== this._sessionId) return;
          this._gpLocal[key] = local;
          const cards = this.data.gameplayMoments.map((card) => card.id === moment.id && card.revision === moment.revision
            ? { ...card, localUrl: local }
            : card);
          this.setData({ gameplayMoments: cards });
        })
        .catch(() => {
          // 下载失败先留占位或旧图，下次打开再试
        });
    });
    if (busy) this.scheduleGameplayPoll();
    else this.stopGameplayWatch();
  },

  scheduleGameplayPoll() {
    if (this._fromShare || !this._sessionId || this._gpTimer) return;
    if (this._gpTries >= GAMEPLAY_POLL_MAX) return;
    this._gpTimer = setTimeout(() => {
      this._gpTimer = 0;
      this._gpTries += 1;
      this.refreshGameplay(false);
    }, GAMEPLAY_POLL_MS) as unknown as number;
  },

  onRegenGameplay(e: { currentTarget: { dataset: { id?: string } } }) {
    const mechanicId = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "");
    if (this._fromShare || !this._sessionId || !mechanicId) return;
    const current = this.data.gameplayMoments.find((moment) => moment.id === mechanicId);
    if (!current || current.imageStatus === "pending" || current.imageStatus === "queued") return;
    void requestGameplayOne(this._sessionId, mechanicId)
      .then(() => this.refreshGameplay(false))
      .catch(() => {
        wx.showToast({ title: "这一张还没开始重画", icon: "none" });
      });
  },

  onPreviewGameplay(e: { currentTarget: { dataset: { url?: string } } }) {
    const url = String((e.currentTarget.dataset && e.currentTarget.dataset.url) || "");
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  startCoverWatch() {
    if (this._fromShare || !this._sessionId) return;
    this._coverRegen = false;
    this.setData({ coverPending: true });
    void getCoverMeta(this._sessionId)
      .then((meta) => this.applyCoverMeta(meta))
      .catch(() => this.scheduleCoverPoll());
  },

  scheduleCoverPoll() {
    if (this._fromShare || !this._sessionId) return;
    if (this._coverTimer) return;
    if (this._coverTries >= COVER_POLL_MAX) {
      this.setData({ coverPending: false });
      return;
    }
    this._coverTimer = setTimeout(() => {
      this._coverTimer = 0;
      this._coverTries += 1;
      void getCoverMeta(this._sessionId)
        .then((meta) => this.applyCoverMeta(meta))
        .catch(() => this.scheduleCoverPoll());
    }, COVER_POLL_MS) as unknown as number;
  },

  applyCoverMeta(meta: { status: string; imageUrl?: string }) {
    if (meta.imageUrl) this.revealCover(meta.imageUrl);
    if (meta.status === "ready" && meta.imageUrl) {
      this.stopCoverWatch();
      this._coverRegen = false;
      this.setData({ coverPending: false });
      if (this._shareId && this._sessionId) {
        void attachShareCover(this._shareId, this._sessionId).catch(() => "");
      }
      return;
    }
    /** 文档改过、封面没重画：旧图继续显示，不自动重画。 */
    if (meta.status === "stale") {
      this.stopCoverWatch();
      this._coverRegen = false;
      this.setData({ coverPending: false });
      return;
    }
    if (meta.status === "failed") {
      this.stopCoverWatch();
      if (this._coverRegen) {
        wx.showToast({ title: "封面没生成，文档还在", icon: "none" });
      }
      this._coverRegen = false;
      this.setData({ coverPending: false });
      return;
    }
    if (meta.status === "idle" && !this._coverRegen) {
      if (this._coverTries >= 8) {
        this.stopCoverWatch();
        this.setData({ coverPending: false });
        return;
      }
      this.setData({ coverPending: false });
      this.scheduleCoverPoll();
      return;
    }
    this.setData({ coverPending: true });
    this.scheduleCoverPoll();
  },

  onRegenCover() {
    if (this.data.fromShare || this.data.coverPending || !this._sessionId) return;
    this._coverRegen = true;
    this.stopCoverWatch();
    this._coverTries = 0;
    this.setData({ coverPending: true });
    void requestCover(this._sessionId)
      .then((meta) => this.applyCoverMeta(meta))
      .catch(() => {
        this._coverRegen = false;
        this.setData({ coverPending: false });
        wx.showToast({ title: "封面没生成，文档还在", icon: "none" });
      });
  },

  onToggleSection(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "");
    if (!id) return;
    const prev = String(this.data.expandedId || "");
    const next = prev === id ? "" : id;
    if (!next) {
      this.setData({ expandedId: "", selectedLineId: "", lineActionsOn: false });
      return;
    }
    this.scrollAccordionTo(prev, next);
  },

  /** 切到另一块时，按「上一块收回后」的位置把新标题滚进视野，避免视角停在长模块展开后的底部。 */
  scrollAccordionTo(prevId: string, nextId: string) {
    const q = wx.createSelectorQuery();
    q.selectViewport().scrollOffset();
    q.select(`#gdd-sec-${nextId}`).boundingClientRect();
    if (prevId) {
      q.select(`#gdd-sec-${prevId}`).boundingClientRect();
      q.select(`#gdd-fold-${prevId}`).boundingClientRect();
    }
    q.exec((res: Array<{ scrollTop?: number; top?: number; height?: number } | null>) => {
      const scrollTop = Number((res && res[0] && res[0].scrollTop) || 0);
      const nextRect = res && res[1];
      if (!nextRect || typeof nextRect.top !== "number") {
        this.setData({ expandedId: nextId, selectedLineId: "", lineActionsOn: false });
        return;
      }
      let lift = 0;
      if (prevId) {
        const prevRect = res[2];
        const prevFold = res[3];
        if (prevRect && prevFold && nextRect.top > (prevRect.top || 0)) {
          lift = Number(prevFold.height || 0);
        }
      }
      const padding = 8;
      const target = Math.max(0, scrollTop + nextRect.top - lift - padding);
      this.setData({ expandedId: nextId, selectedLineId: "", lineActionsOn: false });
      wx.pageScrollTo({ scrollTop: target, duration: ACCORDION_MS });
    });
  },

  onSelectLine(e: { currentTarget: { dataset: { id?: string } } }) {
    if (this.data.fromShare) return;
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "").trim();
    if (!id) return;
    if (this.data.selectedLineId === id) {
      this.onCancelLine();
      return;
    }
    if (this._lineActTimer) {
      clearTimeout(this._lineActTimer);
      this._lineActTimer = 0;
    }
    if (this._lineViewTimer) {
      clearTimeout(this._lineViewTimer);
      this._lineViewTimer = 0;
    }
    this.setData({ selectedLineId: id, lineActionsOn: false }, () => {
      wx.nextTick(() => {
        if (this.data.selectedLineId !== id) return;
        this.setData({ lineActionsOn: true });
        if (this._lineViewTimer) clearTimeout(this._lineViewTimer);
        /** 等操作条的高度过渡结束再量，量的是展开后的真实位置。 */
        this._lineViewTimer = setTimeout(() => {
          this._lineViewTimer = 0;
          this.keepLineInView(id);
        }, 200) as unknown as number;
      });
    });
  },

  /**
   * 只在选中行或操作条超出可视区时，滚动刚好把它们拉回来。
   * 窗口高度用 getWindowInfo，不用 viewport 的 bottom：页面滚过之后那个 bottom 会变小，
   * 按它算会把选中行顶出屏幕。
   */
  keepLineInView(id: string) {
    if (this.data.selectedLineId !== id || !this.data.lineActionsOn) return;
    const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const winH = Number(info.windowHeight) || 0;
    if (!winH) return;
    const q = wx.createSelectorQuery();
    q.selectViewport().scrollOffset();
    q.select(".card-line.on").boundingClientRect();
    q.select(".line-actions.on").boundingClientRect();
    q.exec((res: Array<{ scrollTop?: number; top?: number; bottom?: number } | null>) => {
      if (this.data.selectedLineId !== id || !this.data.lineActionsOn) return;
      const offset = res && res[0];
      const line = res && res[1];
      const bar = res && res[2];
      if (!offset || !line || typeof line.top !== "number") return;
      const scrollTop = Number(offset.scrollTop) || 0;
      const barBottom = bar && typeof bar.bottom === "number" ? bar.bottom : line.bottom;
      let delta = 0;
      if (typeof barBottom === "number" && barBottom > winH) {
        delta = barBottom - winH + 8;
      }
      if (line.top - delta < 0) {
        delta = line.top;
      }
      if (delta < -scrollTop) delta = -scrollTop;
      if (Math.abs(delta) <= 2) return;
      wx.pageScrollTo({ scrollTop: scrollTop + delta, duration: 200 });
    });
  },

  onCancelLine() {
    if (!this.data.selectedLineId) return;
    if (this._lineActTimer) clearTimeout(this._lineActTimer);
    if (this._lineViewTimer) {
      clearTimeout(this._lineViewTimer);
      this._lineViewTimer = 0;
    }
    const id = this.data.selectedLineId;
    /** 描边和操作条都看 lineActionsOn，一起开始退场。selectedLineId 只留到动画结束，避免操作条被提前卸掉。 */
    this.setData({ lineActionsOn: false });
    this._lineActTimer = setTimeout(() => {
      this._lineActTimer = 0;
      if (this.data.selectedLineId === id && !this.data.lineActionsOn) {
        this.setData({ selectedLineId: "" });
      }
    }, 200) as unknown as number;
  },

  onPatchLine(e: {
    currentTarget: {
      dataset: { id?: string; text?: string; section?: string; title?: string };
    };
  }) {
    if (this.data.fromShare) return;
    const lineId = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "").trim();
    if (!lineId || !this._sessionId) return;
    try {
      wx.setStorageSync(GDD_PATCH_KEY, {
        sessionId: this._sessionId,
        lineId,
        lineText: String((e.currentTarget.dataset && e.currentTarget.dataset.text) || ""),
        sectionId: String((e.currentTarget.dataset && e.currentTarget.dataset.section) || ""),
        sectionTitle: String((e.currentTarget.dataset && e.currentTarget.dataset.title) || ""),
      });
    } catch (_err) {
      wx.showToast({ title: "这一行还进不去", icon: "none" });
      return;
    }
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: "/pages/stage/index" });
      },
    });
  },

  onToggleFullDoc(e: { currentTarget: { dataset: { edge?: string } } }) {
    const edge = String((e.currentTarget.dataset && e.currentTarget.dataset.edge) || "");
    if (this.data.fullDocOpen) {
      this.collapseFullDoc(edge);
      return;
    }
    this.expandFullDoc();
  },

  clearFullDocSettle() {
    if (this._fullDocSettle) {
      clearTimeout(this._fullDocSettle);
      this._fullDocSettle = 0;
    }
  },

  expandFullDoc() {
    const gen = ++this._fullDocGen;
    this.clearFullDocSettle();
    const open = (h: number) => {
      if (gen !== this._fullDocGen) return;
      this.setData({ fullDocMeasure: false, fullDocSnap: true, fullDocSettled: false, fullDocOpen: false, fullDocH: "0px" }, () => {
        wx.nextTick(() => {
          if (gen !== this._fullDocGen) return;
          const height = h > 0 ? `${h}px` : "auto";
          this.setData({ fullDocSnap: false, fullDocOpen: true, fullDocH: height, fullDocSettled: height === "auto" }, () => {
            this.settleFullDoc(gen, 0);
          });
        });
      });
    };
    this.setData({ fullDocMeasure: true, fullDocSettled: false }, () => {
      wx.nextTick(() => {
        if (gen !== this._fullDocGen) return;
        wx.createSelectorQuery().select("#gdd-full-body").boundingClientRect().exec((res: Array<{ height?: number } | null>) => {
          if (gen !== this._fullDocGen) return;
          const h = Math.ceil(Number(res && res[0] ? res[0].height : 0));
          if (h > 0) {
            open(h);
            return;
          }
          wx.nextTick(() => {
            if (gen !== this._fullDocGen) return;
            wx.createSelectorQuery().select("#gdd-full-body").boundingClientRect().exec((again: Array<{ height?: number } | null>) => {
              open(Math.ceil(Number(again && again[0] ? again[0].height : 0)));
            });
          });
        });
      });
    });
  },

  /**
   * 展开动画用的像素高度经常小于 rich-text 排完后的高度。
   * 可见后再量一次；仍然偏小就放开成 auto，避免 overflow 把文末裁掉。
   */
  settleFullDoc(gen: number, pass: number) {
    this.clearFullDocSettle();
    this._fullDocSettle = setTimeout(() => {
      this._fullDocSettle = 0;
      if (gen !== this._fullDocGen || !this.data.fullDocOpen) return;
      wx.createSelectorQuery().select("#gdd-full-body").boundingClientRect().exec((res: Array<{ height?: number } | null>) => {
        if (gen !== this._fullDocGen || !this.data.fullDocOpen) return;
        const h = Math.ceil(Number(res && res[0] ? res[0].height : 0));
        const current = this.data.fullDocH === "auto" ? h : parseInt(this.data.fullDocH, 10) || 0;
        if (pass < 1 && h > current + 2) {
          this.setData({ fullDocSettled: false, fullDocH: `${h}px` }, () => this.settleFullDoc(gen, pass + 1));
          return;
        }
        this.setData({ fullDocH: "auto", fullDocSettled: true });
      });
    }, FULL_DOC_MS) as unknown as number;
  },

  /**
   * 收起前先把 auto 锁回真实像素，才能播高度动画。
   * 摘要在正文上面，位置不随收起变化，所以滚回的是收起前量到的头部。
   */
  collapseFullDoc(_edge: string) {
    const gen = ++this._fullDocGen;
    this.clearFullDocSettle();
    const q = wx.createSelectorQuery();
    q.selectViewport().scrollOffset();
    q.select("#gdd-full-head").boundingClientRect();
    q.select("#gdd-full-fold").boundingClientRect();
    q.exec((res: Array<{ scrollTop?: number; top?: number; height?: number } | null>) => {
      if (gen !== this._fullDocGen || !this.data.fullDocOpen) return;
      const offset = res && res[0];
      const head = res && res[1];
      const fold = res && res[2];
      const scrollTop = Number(offset && offset.scrollTop) || 0;
      const headTop = head && typeof head.top === "number" ? head.top : 0;
      const foldH = Math.ceil(Number(fold && fold.height) || 0);
      const target = Math.max(0, scrollTop + headTop - 12);
      const startClose = () => {
        if (gen !== this._fullDocGen) return;
        this.setData({
          fullDocSnap: false,
          fullDocMeasure: false,
          fullDocSettled: false,
          fullDocOpen: false,
          fullDocH: "0px",
        });
        wx.pageScrollTo({ scrollTop: target, duration: FULL_DOC_MS });
      };
      if (foldH <= 0) {
        startClose();
        return;
      }
      this.setData({
        fullDocSnap: true,
        fullDocSettled: false,
        fullDocOpen: true,
        fullDocH: `${foldH}px`,
      }, () => wx.nextTick(startClose));
    });
  },

  onCopy() {
    const md = this._markdown;
    if (!md) return;
    wx.setClipboardData({
      data: md,
      success() {
        wx.showToast({ title: "已复制 GDD", icon: "success" });
      },
    });
  },

  onExportFile() {
    if (this._fromShare) return;
    this.markSheet();
    gddExport.sendGddFile(this.data.title, this._markdown);
  },

  onTryCoCreate() {
    wx.switchTab({ url: "/pages/home/index" });
  },
});
