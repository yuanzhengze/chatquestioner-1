import { API_BASE } from "../config";
import { Utf8StreamDecoder } from "./utf8";
import { shared } from "./shared";
import type { SseHandlers, StageInfo, TurnOption } from "./types";

const { coverFileName, resolveCoverDownload } = require("./gddPreview.js") as {
  coverFileName: (sessionId: string) => string;
  resolveCoverDownload: (
    sessionId: string,
    requestedPath: string,
    result: { filePath?: string; tempFilePath?: string } | null,
  ) => { localPath: string; copyFrom: string };
};

function dispatch(ev: { event: string; data: unknown }, h: SseHandlers): void {
  const data = ev.data as Record<string, unknown>;
  switch (ev.event) {
    case "token":
      h.onToken?.(String(data.text ?? ""));
      break;
    case "state":
      h.onState?.(data);
      break;
    case "stage":
      h.onStage?.(data as unknown as StageInfo);
      break;
    case "options":
      h.onOptions?.((data.options as TurnOption[]) ?? []);
      break;
    case "synthesis":
      h.onSynthesis?.({
        gddMarkdown: String(data.gddMarkdown ?? ""),
        gddModel: data.gddModel,
        gddView: data.gddView,
        complete: data.complete === true,
        draftBar: data.draftBar === true,
      });
      break;
    case "activity":
      h.onActivity?.(String(data.kind ?? ""));
      break;
    case "warning":
      h.onWarning?.();
      break;
    case "error":
      h.onError?.(String(data.message ?? "unknown error"));
      break;
    case "done":
      h.onDone?.(Boolean(data.readyForSynthesis), { openPreview: data.openPreview === true });
      break;
    default:
      break;
  }
}

export function createSession(): Promise<{ id: string; opening: string; options?: TurnOption[] }> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/session`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: {},
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as { id: string; opening: string; options?: TurnOption[] });
        } else {
          reject(new Error(`createSession failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "createSession network error"));
      },
    });
  });
}

export function getSession(id: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/session/${id}`,
      method: "GET",
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          resolve(res.data as Record<string, unknown>);
        } else {
          reject(new Error(`getSession failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "getSession network error"));
      },
    });
  });
}

export function startLinePatch(
  id: string,
  intent: { lineId: string; lineText?: string; sectionId?: string; sectionTitle?: string },
): Promise<{
  reply: string;
  state: Record<string, unknown>;
  gddMarkdown?: string;
  gddModel?: unknown;
  complete?: boolean;
  draftBar?: boolean;
}> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/session/${id}/patch`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: intent,
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          const body = res.data as {
            reply?: string;
            state?: Record<string, unknown>;
            gddMarkdown?: string;
            gddModel?: unknown;
            complete?: boolean;
            draftBar?: boolean;
          };
          resolve({
            reply: String(body.reply || ""),
            state: (body.state && typeof body.state === "object" ? body.state : {}) as Record<string, unknown>,
            gddMarkdown: body.gddMarkdown,
            gddModel: body.gddModel,
            complete: body.complete === true,
            draftBar: body.draftBar === true,
          });
        } else {
          reject(new Error(`startLinePatch failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "startLinePatch network error"));
      },
    });
  });
}

export function deleteSession(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/session/${id}`,
      method: "DELETE",
      timeout: 20000,
      success(res: { statusCode: number }) {
        if (res.statusCode === 204 || res.statusCode === 404 || (res.statusCode >= 200 && res.statusCode < 300)) {
          resolve();
        } else {
          reject(new Error(`deleteSession failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "deleteSession network error"));
      },
    });
  });
}

export function createShare(
  markdown: string,
  title?: string,
  extra?: { model?: unknown; complete?: boolean; sessionId?: string },
): Promise<{ id: string; title: string; coverImageUrl?: string }> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/share`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: {
        markdown,
        title: title || "",
        model: extra && extra.model ? extra.model : undefined,
        complete: extra && extra.complete === true,
        sessionId: extra && extra.sessionId ? extra.sessionId : undefined,
      },
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          const body = res.data as { id?: string; title?: string; coverImageUrl?: string };
          if (body.id) resolve({ id: body.id, title: String(body.title || title || ""), coverImageUrl: body.coverImageUrl });
          else reject(new Error("createShare: missing id"));
        } else {
          reject(new Error(`createShare failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "createShare network error"));
      },
    });
  });
}

export function getShare(id: string): Promise<{
  id: string;
  title: string;
  markdown: string;
  model?: unknown;
  complete?: boolean;
  v?: number;
  coverImageUrl?: string;
}> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/share/${id}`,
      method: "GET",
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          const body = res.data as {
            id?: string;
            title?: string;
            markdown?: string;
            model?: unknown;
            complete?: boolean;
            v?: number;
            coverImageUrl?: string;
          };
          resolve({
            id: String(body.id || id),
            title: String(body.title || ""),
            markdown: String(body.markdown || ""),
            model: body.model,
            complete: body.complete === true,
            v: typeof body.v === "number" ? body.v : 1,
            coverImageUrl: body.coverImageUrl,
          });
        } else {
          reject(new Error(`getShare failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "getShare network error"));
      },
    });
  });
}

export function getCoverMeta(sessionId: string): Promise<{ status: string; imageUrl?: string }> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/session/${sessionId}/cover?meta=1`,
      method: "GET",
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.data && typeof res.data === "object") {
          const body = res.data as { status?: string; imageUrl?: string };
          resolve({ status: String(body.status || "idle"), imageUrl: body.imageUrl });
          return;
        }
        reject(new Error(`getCoverMeta failed: ${res.statusCode}`));
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "getCoverMeta network error"));
      },
    });
  });
}

export function requestCover(sessionId: string): Promise<{ status: string; imageUrl?: string }> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/session/${sessionId}/cover`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: {},
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          const body = res.data as { status?: string; imageUrl?: string };
          resolve({ status: String(body.status || "idle"), imageUrl: body.imageUrl });
        } else {
          reject(new Error(`requestCover failed: ${res.statusCode}`));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "requestCover network error"));
      },
    });
  });
}

/** 微信 <image> 直连本机 HTTP 大图经常不显示；先 downloadFile 再喂本地路径。 */
export function downloadCover(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("empty cover url"));
      return;
    }
    wx.downloadFile({
      url,
      timeout: 60000,
      success(res: { statusCode: number; tempFilePath?: string }) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath);
        else reject(new Error(`downloadCover ${res.statusCode}`));
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "downloadCover network error"));
      },
    });
  });
}

/** 只给记录列表用。共创页单张封面仍走 downloadCover，这里不改那条路径。 */
export function downloadCoverFile(url: string, sessionId: string): Promise<string> {
  const name = coverFileName(sessionId);
  const filePath = name ? `${wx.env.USER_DATA_PATH}/${name}` : "";
  return new Promise((resolve, reject) => {
    if (!url || !filePath) {
      reject(new Error("empty cover url"));
      return;
    }
    wx.downloadFile({
      url,
      filePath,
      timeout: 60000,
      success(res: { statusCode: number; filePath?: string; tempFilePath?: string }) {
        if (res.statusCode !== 200) {
          reject(new Error(`downloadCover ${res.statusCode}`));
          return;
        }
        const picked = resolveCoverDownload(sessionId, filePath, res);
        if (!picked.localPath) {
          reject(new Error("downloadCover missing session file"));
          return;
        }
        if (!picked.copyFrom) {
          resolve(picked.localPath);
          return;
        }
        try {
          const fs = wx.getFileSystemManager();
          const bytes = fs.readFileSync(picked.copyFrom);
          fs.writeFileSync(picked.localPath, bytes);
          resolve(picked.localPath);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("downloadCover copy failed"));
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "downloadCover network error"));
      },
    });
  });
}

export function attachShareCover(shareId: string, sessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/api/share/${shareId}/cover`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: { sessionId },
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          const body = res.data as { imageUrl?: string };
          resolve(String(body.imageUrl || ""));
        } else {
          resolve("");
        }
      },
      fail(err: { errMsg?: string }) {
        reject(new Error(err.errMsg || "attachShareCover network error"));
      },
    });
  });
}

export function sendMessage(
  id: string,
  message: string,
  handlers: SseHandlers,
): { abort: () => void } {
  const decoder = new Utf8StreamDecoder();
  let buffer = "";
  let gotDone = false;
  const onDone = (ready: boolean, extra?: { openPreview?: boolean }) => {
    gotDone = true;
    handlers.onDone?.(ready, extra);
  };

  const task = wx.request({
    url: `${API_BASE}/api/session/${id}/message`,
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: { message },
    enableChunked: true,
    dataType: "text",
    timeout: 180000,
    success() {
      if (!gotDone) onDone(false);
    },
    fail(err: { errMsg?: string }) {
      if (/abort/i.test(err.errMsg || "")) return;
      handlers.onError?.(err.errMsg || "sendMessage failed");
      if (!gotDone) onDone(false);
    },
  });

  const wrapped: SseHandlers = { ...handlers, onDone };

  task.onChunkReceived((res: { data: ArrayBuffer }) => {
    buffer += decoder.push(res.data);
    const parsed = shared.parseSseEvents(buffer);
    buffer = parsed.rest;
    for (const ev of parsed.events) dispatch(ev, wrapped);
  });

  return { abort: () => task.abort() };
}
