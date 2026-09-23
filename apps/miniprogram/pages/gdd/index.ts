import { API_BASE, FX_CHROME, GDD_DRAFT_KEY, GDD_PATCH_KEY, LOGO_SRC } from "../../config";
import { attachShareCover, createShare, downloadCover, getCoverMeta, getShare, requestCover } from "../../utils/api";

const { mdToHtml } = require("../../utils/md.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");
const { sectionsFromModel } = require("../../utils/gddSections.js");
const { toGddView } = require("../../utils/gddView.js");
const gddExport = require("../../utils/gddExport.js");
const { captureShareCard } = require("../../utils/gddShareCard.js");

const ACCORDION_MS = 200;

function absUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

/** gpt-image-2 出一张约 2MB 图经常要 1–3 分钟，不能按 30 秒放弃。 */
const COVER_POLL_MS = 2000;
const COVER_POLL_MAX = 90;

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
    dna: [] as Array<{ id: string; label: string; text: string }>,
    dnaOpen: "",
    dnaFull: "",
    storyboard: [] as Array<{ title: string; text: string }>,
    storyIndex: 0,
    frameTitle: "",
    frameText: "",
    loopNodes: [] as Array<{ id: string; label: string; text: string }>,
    loopOpen: "",
    loopText: "",
    selectedLineId: "",
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
    this.stopCoverWatch();
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
    const markdown = String((payload && payload.markdown) || "").trim();
    const model = payload && payload.model && typeof payload.model === "object" ? payload.model : null;
    const complete = payload && payload.complete === true;
    const draftBar = payload && payload.draftBar === true;
    this._sessionId = payload && payload.sessionId ? String(payload.sessionId) : this._sessionId;
    this.stopCoverWatch();
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
        dna: [],
        dnaOpen: "",
        dnaFull: "",
        storyboard: [],
        storyIndex: 0,
        frameTitle: "",
        frameText: "",
        loopNodes: [],
        loopOpen: "",
        loopText: "",
        selectedLineId: "",
      });
      return;
    }
    const meta = parseGddPreview(markdown);
    let html = "";
    try {
      html = mdToHtml(markdown);
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
    const storyboard = view.storyboard || [];
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
      plain: markdown,
      draft: draftBar,
      sections,
      expandedId: sections.length ? sections[0].id : "",
      coverUrl: "",
      coverPending: false,
      dna: view.dna || [],
      dnaOpen: "",
      dnaFull: "",
      storyboard,
      storyIndex: 0,
      frameTitle: storyboard[0] ? storyboard[0].title : "",
      frameText: storyboard[0] ? storyboard[0].text : "",
      loopNodes: view.loopNodes || [],
      loopOpen: "",
      loopText: "",
      selectedLineId: "",
    });
    if (this._fromShare) {
      const shareCover = payload && payload.coverImageUrl ? String(payload.coverImageUrl) : "";
      if (shareCover) this.revealCover(shareCover);
      return;
    }
    void this.startShare();
    void this.makeShareCard(title, pitch);
    this.startCoverWatch();
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
    this.setData({ coverUrl: "", coverPending: false });
  },

  revealCover(remote: string) {
    const url = absUrl(remote);
    if (!url) {
      this.setData({ coverPending: false });
      return;
    }
    this.setData({ coverPending: true });
    void downloadCover(url)
      .then((local) => {
        this.setData({ coverUrl: local, coverPending: false });
      })
      .catch(() => {
        this.setData({ coverUrl: url, coverPending: false });
      });
  },

  stopCoverWatch() {
    if (this._coverTimer) {
      clearTimeout(this._coverTimer);
      this._coverTimer = 0;
    }
    this._coverTries = 0;
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
    if (meta.status === "ready" && meta.imageUrl) {
      this.stopCoverWatch();
      this._coverRegen = false;
      this.revealCover(meta.imageUrl);
      if (this._shareId && this._sessionId) {
        void attachShareCover(this._shareId, this._sessionId).catch(() => "");
      }
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

  onDnaTap(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.dnaOpen === id) {
      this.setData({ dnaOpen: "", dnaFull: "" });
      return;
    }
    const chip = (this.data.dna || []).find((c) => c.id === id);
    this.setData({ dnaOpen: id, dnaFull: chip ? chip.text : "" });
  },

  onNextFrame() {
    const frames = this.data.storyboard || [];
    if (frames.length < 2) return;
    const next = (this.data.storyIndex + 1) % frames.length;
    this.setData({
      storyIndex: next,
      frameTitle: frames[next].title,
      frameText: frames[next].text,
    });
  },

  onLoopTap(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.loopOpen === id) {
      this.setData({ loopOpen: "", loopText: "" });
      return;
    }
    const node = (this.data.loopNodes || []).find((n) => n.id === id);
    this.setData({ loopOpen: id, loopText: node ? node.text : "" });
  },

  onToggleSection(e: { currentTarget: { dataset: { id?: string } } }) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "");
    if (!id) return;
    const prev = String(this.data.expandedId || "");
    const next = prev === id ? "" : id;
    if (!next) {
      this.setData({ expandedId: "", selectedLineId: "" });
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
        this.setData({ expandedId: nextId, selectedLineId: "" });
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
      this.setData({ expandedId: nextId, selectedLineId: "" });
      wx.pageScrollTo({ scrollTop: target, duration: ACCORDION_MS });
    });
  },

  onSelectLine(e: { currentTarget: { dataset: { id?: string } } }) {
    if (this.data.fromShare) return;
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || "").trim();
    if (!id) return;
    this.setData({ selectedLineId: this.data.selectedLineId === id ? "" : id });
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
