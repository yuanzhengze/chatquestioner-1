import { API_BASE, GDD_DRAFT_KEY, GDD_PATCH_KEY, LOGO_SRC } from "../../config";
import { attachShareCover, createShare, downloadCover, getCoverMeta, getShare, requestCover } from "../../utils/api";

const { mdToHtml } = require("../../utils/md.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");
const { sectionsFromModel } = require("../../utils/gddSections.js");
const { toGddView } = require("../../utils/gddView.js");
const { shareGddMarkdown } = require("../../utils/gddExport.js");

/** 微信分享图建议 5:4，避免不设 imageUrl 时退回整页截屏。 */
const SHARE_W = 500;
const SHARE_H = 400;

function absUrl(path: string): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}

/** gpt-image-2 出一张约 2MB 图经常要 1–3 分钟，不能按 30 秒放弃。 */
const COVER_POLL_MS = 2000;
const COVER_POLL_MAX = 90;

function wrapText(
  ctx: { measureText: (t: string) => { width: number } },
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const lines: string[] = [];
  let line = "";
  for (const ch of raw) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) {
        line = "";
        break;
      }
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    if (raw.length > last.length) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function fillRoundRect(
  ctx: {
    beginPath: () => void;
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    moveTo: (x: number, y: number) => void;
    arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
    closePath: () => void;
    fill: () => void;
  },
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  ctx.fill();
}

function drawShareCard(
  ctx: {
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      addColorStop: (o: number, c: string) => void;
    };
    fillRect: (x: number, y: number, w: number, h: number) => void;
    beginPath: () => void;
    arc: (x: number, y: number, r: number, a0: number, a1: number) => void;
    fill: () => void;
    fillText: (t: string, x: number, y: number) => void;
    measureText: (t: string) => { width: number };
    drawImage?: (img: unknown, x: number, y: number, w: number, h: number) => void;
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    moveTo: (x: number, y: number) => void;
    arcTo: (x1: number, y1: number, x2: number, y2: number, r: number) => void;
    closePath: () => void;
    fillStyle: unknown;
    font: string;
    globalAlpha: number;
  },
  title: string,
  pitch: string,
  logo: unknown | null,
) {
  ctx.fillStyle = "#0D0D0D";
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);

  ctx.fillStyle = "#D4FF48";
  ctx.fillRect(0, 0, SHARE_W, 6);

  ctx.fillStyle = "#D4FF48";
  fillRoundRect(ctx, 28, 28, 132, 36, 4);
  ctx.fillStyle = "#0D0D0D";
  ctx.font = "20px sans-serif";
  ctx.fillText("游戏文档", 48, 53);

  if (logo && typeof ctx.drawImage === "function") {
    ctx.drawImage(logo, SHARE_W - 116, 20, 88, 88);
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 40px sans-serif";
  const titleLines = wrapText(ctx, title || "未命名游戏", SHARE_W - 56, 3);
  let y = 128;
  for (const ln of titleLines) {
    ctx.fillText(ln, 28, y);
    y += 50;
  }

  if (pitch) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.60)";
    ctx.font = "22px sans-serif";
    const pitchLines = wrapText(ctx, pitch, SHARE_W - 56, 2);
    y += 8;
    for (const ln of pitchLines) {
      ctx.fillText(ln, 28, y);
      y += 32;
    }
  }

  ctx.fillStyle = "#D4FF48";
  ctx.font = "20px sans-serif";
  ctx.fillText("NewBee × ForgeaX", 28, SHARE_H - 36);
}

function loadShareLogo(canvas: { createImage?: () => { src: string; onload: (() => void) | null; onerror: (() => void) | null } }): Promise<unknown | null> {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.createImage !== "function") {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (img: unknown | null) => {
      if (done) return;
      done = true;
      resolve(img);
    };
    const timer = setTimeout(() => finish(null), 800);
    const img = canvas.createImage();
    img.onload = () => {
      clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    img.src = LOGO_SRC;
  });
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
      wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: "#0D0D0D" });
      wx.setBackgroundColor({ backgroundColor: "#0D0D0D", backgroundColorTop: "#0D0D0D", backgroundColorBottom: "#0D0D0D" });
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
    if (this._fromShare) return;
    if (!this._applied) this.applyFromStorage();
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
    const job = new Promise<string>((resolve) => {
      const draw = (attempt: number) => {
        this.createSelectorQuery()
          .select("#shareCard")
          .fields({ node: true, size: true })
          .exec((res) => {
            const canvas = res && res[0] && res[0].node;
            if (!canvas) {
              if (attempt < 1) {
                setTimeout(() => draw(attempt + 1), 80);
                return;
              }
              resolve("");
              return;
            }
            const info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const dpr = Number(info.pixelRatio) || 2;
            canvas.width = SHARE_W * dpr;
            canvas.height = SHARE_H * dpr;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve("");
              return;
            }
            ctx.scale(dpr, dpr);
            void loadShareLogo(canvas).then((logo) => {
              drawShareCard(ctx, title, pitch, logo);
              wx.canvasToTempFilePath({
                canvas,
                fileType: "jpg",
                quality: 0.92,
                success: (r) => {
                  this._shareImage = r.tempFilePath;
                  resolve(r.tempFilePath);
                },
                fail: () => resolve(""),
              });
            });
          });
      };
      wx.nextTick(() => draw(0));
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
    if (this._fromShare) return { title, path: "/pages/gdd/index" };
    if (this._shareId && this._shareImage) return this.sharePayload(this._shareId);
    if (!this._markdown) return { title, path: "/pages/gdd/index" };
    return {
      title,
      path: "/pages/gdd/index",
      promise: Promise.all([
        this.startShare(),
        this._shareImagePromise || this.makeShareCard(this.data.title, this.data.pitch),
      ]).then(([res]) => this.sharePayload(res.id)),
    };
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
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ expandedId: this.data.expandedId === id ? "" : id });
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
    const markdown = this._markdown;
    if (!String(markdown || "").trim()) {
      wx.showToast({ title: "还没有文档可导出", icon: "none" });
      return;
    }
    const failToast = () => {
      wx.showToast({ title: "文件没发出去，可以先复制全文", icon: "none" });
    };
    const result = shareGddMarkdown({
      title: this.data.title,
      markdown,
      userDataPath: wx.env.USER_DATA_PATH,
      writeFileSync: (filePath: string, data: string, encoding: string) => {
        wx.getFileSystemManager().writeFileSync(filePath, data, encoding);
      },
      shareFileMessage: (opts: {
        filePath: string;
        fileName: string;
        success: () => void;
        fail: (err: unknown) => void;
      }) => {
        wx.shareFileMessage(opts);
      },
      onFail: failToast,
      onUnsupported: () => {
        wx.showToast({ title: "模拟器发不了，请用真机", icon: "none" });
      },
    });
    if (!result.ok && result.reason === "empty") {
      wx.showToast({ title: "还没有文档可导出", icon: "none" });
    }
  },

  onTryCoCreate() {
    wx.switchTab({ url: "/pages/home/index" });
  },
});
