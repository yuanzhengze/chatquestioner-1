import { API_BASE } from "../config";
import { Utf8StreamDecoder } from "./utf8";
import { shared } from "./shared";
import type { SseHandlers, StageInfo, TurnOption } from "./types";

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
        complete: data.complete === true,
      });
      break;
    case "warning":
      h.onWarning?.();
      break;
    case "error":
      h.onError?.(String(data.message ?? "unknown error"));
      break;
    case "done":
      h.onDone?.(Boolean(data.readyForSynthesis));
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
  extra?: { model?: unknown; complete?: boolean },
): Promise<{ id: string; title: string }> {
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
      },
      timeout: 20000,
      success(res: { statusCode: number; data: unknown }) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && typeof res.data === "object") {
          const body = res.data as { id?: string; title?: string };
          if (body.id) resolve({ id: body.id, title: String(body.title || title || "") });
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
          };
          resolve({
            id: String(body.id || id),
            title: String(body.title || ""),
            markdown: String(body.markdown || ""),
            model: body.model,
            complete: body.complete === true,
            v: typeof body.v === "number" ? body.v : 1,
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

export function sendMessage(
  id: string,
  message: string,
  handlers: SseHandlers,
): { abort: () => void } {
  const decoder = new Utf8StreamDecoder();
  let buffer = "";
  let gotDone = false;
  const onDone = (ready: boolean) => {
    gotDone = true;
    handlers.onDone?.(ready);
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
