import { GDD_DRAFT_KEY, LOGO_SRC } from "../../config";
import { createShare, getShare } from "../../utils/api";

const { mdToHtml } = require("../../utils/md.js");
const { parseGddPreview } = require("../../utils/gddPreview.js");

/** 微信分享图建议 5:4，避免不设 imageUrl 时退回整页截屏。 */
const SHARE_W = 500;
const SHARE_H = 400;

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
    must: [] as string[],
    cut: [] as string[],
    html: "",
    plain: "",
    empty: true,
    ready: false,
    fromShare: false,
    logoSrc: LOGO_SRC,
  },

  _markdown: "",
  _applied: false,
  _waitTimer: 0 as number,
  _shareId: "",
  _fromShare: false,
  _sharePromise: null as Promise<{ id: string; title: string }> | null,
  _shareImage: "",
  _shareImagePromise: null as Promise<string> | null,

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
      ch.on("gddDraft", (payload: { markdown?: string }) => {
        this.applyMarkdown(payload && payload.markdown);
      });
    }
    if (!this._applied) this.applyFromStorage();
    this._waitTimer = setTimeout(() => {
      this._waitTimer = 0;
      if (this._applied) return;
      this.applyFromStorage();
      if (!this._applied) this.applyMarkdown("");
    }, 1200) as unknown as number;
  },

  onShow() {
    if (this._fromShare) return;
    if (!this._applied) this.applyFromStorage();
  },

  onUnload() {
    if (this._waitTimer) clearTimeout(this._waitTimer);
  },

  async loadShare(id: string) {
    try {
      const snap = await getShare(id);
      this.applyMarkdown(snap.markdown);
    } catch (_e) {
      this._shareId = "";
      this.applyMarkdown("");
      wx.showToast({ title: "这份分享找不到了", icon: "none" });
    }
  },

  applyFromStorage() {
    try {
      const draft = wx.getStorageSync(GDD_DRAFT_KEY) as { markdown?: string } | "";
      const markdown = draft && typeof draft === "object" ? draft.markdown : "";
      if (markdown) this.applyMarkdown(markdown);
    } catch (_e) {
      // 读缓存失败时等 eventChannel / 超时
    }
  },

  applyMarkdown(raw?: string) {
    const markdown = String(raw || "").trim();
    if (!markdown) {
      this._markdown = "";
      this._applied = true;
      this._shareImage = "";
      this._shareImagePromise = null;
      this.setData({ ready: true, empty: true, title: "", pitch: "", must: [], cut: [], html: "", plain: "" });
      return;
    }
    const meta = parseGddPreview(markdown);
    let html = "";
    try {
      html = mdToHtml(markdown);
    } catch (_e) {
      html = "";
    }
    const title = meta.title || "未命名游戏";
    const pitch = meta.pitch || "";
    this._markdown = markdown;
    this._applied = true;
    this.setData({
      ready: true,
      empty: false,
      title,
      pitch,
      must: meta.must || [],
      cut: meta.cut || [],
      html,
      plain: markdown,
    });
    if (!this._fromShare) {
      void this.startShare();
      void this.makeShareCard(title, pitch);
    }
  },

  startShare(): Promise<{ id: string; title: string }> {
    if (this._shareId) {
      return Promise.resolve({ id: this._shareId, title: this.data.title || "未命名游戏" });
    }
    if (this._sharePromise) return this._sharePromise;
    const markdown = this._markdown;
    const title = this.data.title || "未命名游戏";
    if (!markdown) return Promise.reject(new Error("empty markdown"));
    this._sharePromise = createShare(markdown, title)
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

  onCoverTap() {
    wx.showToast({ title: "封面生图稍后接入", icon: "none" });
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

  onTryCoCreate() {
    wx.reLaunch({ url: "/pages/stage/index" });
  },
});
