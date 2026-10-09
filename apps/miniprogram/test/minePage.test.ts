import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const MP = resolve(__dirname, "..");
const req = createRequire(import.meta.url);
const legal = req("../utils/legal.js") as { TERMS: string; PRIVACY: string };

const INDEX_KEY = "nb.sessionIndex";
const storage = new Map<string, unknown>();
const log = { requests: [] as string[], writes: [] as string[], tabs: [] as string[], navs: [] as string[], toasts: [] as string[] };
let sessions: Record<string, unknown> = {};

vi.stubGlobal("wx", {
  getDeviceInfo: () => ({ platform: "devtools" }),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375, windowHeight: 618 }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 281 }),
  setNavigationBarColor() {},
  setBackgroundColor() {},
  showTabBar() {},
  hideTabBar() {},
  showToast: (o: { title: string }) => { log.toasts.push(o.title); },
  getStorageSync: (k: string) => (storage.has(k) ? JSON.parse(JSON.stringify(storage.get(k))) : ""),
  setStorageSync: (k: string, v: unknown) => { log.writes.push(k); storage.set(k, v); },
  removeStorageSync: (k: string) => { log.writes.push(k); storage.delete(k); },
  env: { USER_DATA_PATH: "wxfile://usr" },
  request: (r: { url: string; method?: string; success?: (res: unknown) => void }) => {
    log.requests.push(`${r.method || "GET"} ${r.url.replace(/^https?:\/\/[^/]+/, "")}`);
    const id = (r.url.match(/\/api\/session\/([^/?]+)$/) || [])[1];
    const body = id ? sessions[id] : undefined;
    setTimeout(() => r.success && r.success(body ? { statusCode: 200, data: body } : { statusCode: 404, data: {} }), 0);
  },
  downloadFile: (r: { url: string; filePath?: string; success?: (res: unknown) => void }) => {
    setTimeout(() => r.success && r.success({ statusCode: 200, filePath: r.filePath }), 0);
  },
  switchTab: (o: { url: string }) => { log.tabs.push(o.url); },
  navigateTo: (o: { url: string }) => { log.navs.push(o.url); },
});
let pageDef: any;
vi.stubGlobal("Page", (def: any) => { pageDef = def; });

let LOGO_SRC = "";
beforeAll(async () => {
  LOGO_SRC = (await import("../config")).LOGO_SRC;
  await import("../pages/mine/index.ts");
});

beforeEach(() => {
  storage.clear();
  sessions = {};
  for (const list of Object.values(log)) list.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

function instance() {
  const page: any = { ...pageDef, data: JSON.parse(JSON.stringify(pageDef.data)), _cardCache: {}, _sheetTimer: 0 };
  page.setData = (patch: Record<string, unknown>, cb?: () => void) => {
    Object.assign(page.data, patch);
    if (cb) cb();
  };
  return page;
}

async function flush() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
}

function doc(name: string, pitch: string) {
  return `# ${name}\n\n> 一句话 Pitch：${pitch}\n`;
}

/** 从带指定属性的元素开始，取到与它配对的闭合标签为止。 */
function block(wxml: string, marker: string, tagName = "view"): string {
  const at = wxml.indexOf(marker);
  if (at < 0) return "";
  const start = wxml.lastIndexOf(`<${tagName}`, at);
  const tag = new RegExp(`<\\/?${tagName}\\b[^>]*?(\\/)?>`, "g");
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(wxml); m; m = tag.exec(wxml)) {
    if (m[0].startsWith("</")) depth -= 1;
    else if (!m[1]) depth += 1;
    if (depth === 0) return wxml.slice(start, m.index + m[0].length);
  }
  return "";
}

const WXML = () => readFileSync(join(MP, "pages/mine/index.wxml"), "utf8");

describe("「我的」共创记录", () => {
  it("标题是「共创记录」，没有「我的」和装饰短线；记录在框内纵向滚动，标题在滚动框外", () => {
    const wxml = WXML();
    expect(wxml).toContain('<view class="section-title">共创记录</view>');
    expect(wxml).not.toContain("我的共创记录");
    expect(wxml).not.toContain("section-bar");
    const scroller = block(wxml, 'class="records', "scroll-view");
    expect(scroller.startsWith("<scroll-view")).toBe(true);
    expect(scroller).toMatch(/\sscroll-y\s/);
    expect(scroller).toContain('wx:for="{{historyItems}}"');
    expect(scroller).toContain('bindtap="onOpenRecord"');
    expect(scroller).not.toContain("section-title");
    expect(scroller).toContain("historyItems.length > 2 ? 'capped' : ''");
  });

  it("按 sessionIndex 的内容时间顺序显示；不显示更新时间，但排序用的时间字段原样保留、展示时不写本机记录", async () => {
    storage.set(INDEX_KEY, {
      currentId: "",
      items: [
        { id: "a", title: "甲", updatedAt: 200, contentUpdatedAt: 200 },
        { id: "c", title: "丙", updatedAt: 100 },
        { id: "b", title: "乙", updatedAt: 50, contentUpdatedAt: 300 },
      ],
    });
    sessions = {
      a: { gddMarkdown: doc("甲游戏", "甲的一句话"), gddView: { cover: { status: "ready", imageUrl: "/api/session/a/cover" } } },
      b: { gddMarkdown: doc("乙游戏", "乙的一句话"), gddView: { cover: { status: "ready", imageUrl: "/api/session/b/cover" } } },
      c: {},
    };
    const before = JSON.stringify(storage.get(INDEX_KEY));
    const page = instance();
    page.onLoad();
    page.onShow();
    await flush();

    const items = page.data.historyItems as Array<Record<string, unknown>>;
    expect(items.map((it) => it.id)).toEqual(["b", "a", "c"]);
    expect(items[0]).toMatchObject({ title: "乙游戏", pitch: "乙的一句话" });
    expect(String(items[0].coverUrl)).toContain("nb-cover-b.png");
    expect(items.every((it) => !("time" in it))).toBe(true);
    expect(WXML()).not.toMatch(/更新于|item\.time/);
    expect(log.writes).toEqual([]);
    expect(JSON.stringify(storage.get(INDEX_KEY))).toBe(before);
    const kept = (storage.get(INDEX_KEY) as { items: Array<{ id: string; contentUpdatedAt?: number; updatedAt?: number }> }).items;
    expect(kept.find((it) => it.id === "b")).toMatchObject({ contentUpdatedAt: 300, updatedAt: 50 });
  });

  it("文档改过的旧封面（stale）照常显示", async () => {
    storage.set(INDEX_KEY, { currentId: "", items: [{ id: "s", title: "旧", updatedAt: 1 }] });
    sessions = { s: { gddMarkdown: doc("旧封面", "改过文档"), gddView: { cover: { status: "stale", imageUrl: "/api/session/s/cover?f=1" } } } };
    const page = instance();
    page.onShow();
    await flush();
    expect(page.data.historyItems[0].coverUrl).toContain("nb-cover-s.png");
  });

  it("整行就是点击目标：封面、游戏名、一句话都在里面；点一下沿用原来的进入方式", () => {
    const row = block(WXML(), 'bindtap="onOpenRecord"');
    for (const part of ["{{item.coverUrl}}", "{{item.title}}", "{{item.pitch}}", 'data-id="{{item.id}}"']) {
      expect(row).toContain(part);
    }
    expect(row.match(/bindtap=|catchtap=/g)).toHaveLength(1);

    storage.set(INDEX_KEY, { currentId: "", items: [{ id: "a", title: "甲", updatedAt: 200, contentUpdatedAt: 200 }] });
    const page = instance();
    page.onOpenRecord({ currentTarget: { dataset: { id: "a" } } });
    expect(storage.get("nb.pendingChat")).toEqual({ type: "open", id: "a", from: "mine" });
    expect(storage.get("nb.entryOrigin")).toBe("mine");
    expect(log.tabs).toEqual(["/pages/stage/index"]);
    const idx = storage.get(INDEX_KEY) as { items: Array<{ contentUpdatedAt?: number; updatedAt?: number }> };
    expect(idx.items[0]).toMatchObject({ contentUpdatedAt: 200, updatedAt: 200 });
  });

  it("没有记录时显示轻量空状态，开始共创交给共创页新开一条、返回仍回「我的」", async () => {
    const page = instance();
    page.onShow();
    await flush();
    expect(page.data.historyItems).toEqual([]);
    expect(block(WXML(), 'bindtap="onStartCocreate"')).toContain("开始共创");
    expect(WXML()).toContain("还没有共创记录");
    expect(WXML()).toContain("从一个脑洞开始吧");
    page.onStartCocreate();
    expect(storage.get("nb.pendingChat")).toEqual({ type: "boot", from: "mine" });
    expect(log.tabs).toEqual(["/pages/stage/index"]);
  });
});

describe("「我的」顶部和功能区", () => {
  it("品牌和头像用正式 Logo，用户名和一句话是固定占位", () => {
    expect(pageDef.data.logoSrc).toBe(LOGO_SRC);
    const wxml = WXML();
    expect(wxml).toContain("创意玩家");
    expect(wxml).toContain("让脑洞，慢慢长成一个世界。");
    expect(wxml).toMatch(/class="avatar-logo" src="\{\{logoSrc\}\}"/);
  });

  it("协议、隐私、关于仍打开原来的内容，抽屉先挂上再滑入，关闭时先滑出再卸载", () => {
    vi.useFakeTimers();
    const page = instance();
    page.onShowLegal({ currentTarget: { dataset: { kind: "terms" } } });
    expect(page.data).toMatchObject({ showLegal: true, sheetIn: false, legalTitle: "用户协议", legalBody: legal.TERMS });
    vi.advanceTimersByTime(40);
    expect(page.data.sheetIn).toBe(true);

    page.onCloseSheets();
    expect(page.data).toMatchObject({ showLegal: true, sheetIn: false });
    vi.advanceTimersByTime(300);
    expect(page.data.showLegal).toBe(false);

    page.onShowLegal({ currentTarget: { dataset: { kind: "privacy" } } });
    vi.advanceTimersByTime(40);
    expect(page.data).toMatchObject({ showLegal: true, sheetIn: true, legalTitle: "隐私政策", legalBody: legal.PRIVACY });
    page.onCloseSheets();
    vi.advanceTimersByTime(300);

    page.onOpenAbout();
    vi.advanceTimersByTime(40);
    expect(page.data).toMatchObject({ showAbout: true, showLegal: false, sheetIn: true });
    page.onCloseSheets();
    vi.advanceTimersByTime(300);
    expect(page.data).toMatchObject({ showAbout: false, sheetIn: false });

    const wxml = WXML();
    expect(wxml).toContain(`wx:if="{{showLegal}}" class="mask {{sheetIn ? 'in' : ''}}" catchtap="onCloseSheets"`);
    expect(wxml).toContain(`wx:if="{{showAbout}}" class="mask {{sheetIn ? 'in' : ''}}" catchtap="onCloseSheets"`);
  });

  it("功能区四个入口都在同一列表；设置没有正式功能时只给轻量提示，不跳空白页", () => {
    const wxml = WXML();
    for (const [icon, label] of [["icon-terms", "用户协议"], ["icon-privacy", "隐私政策"], ["icon-about", "关于 ForgeaX"], ["icon-settings", "设置"]]) {
      expect(wxml).toContain(`/images/mine/${icon}.png`);
      expect(wxml).toContain(`<view class="row-label">${label}</view>`);
      expect(existsSync(join(MP, `images/mine/${icon}.png`))).toBe(true);
    }
    const page = instance();
    page.onSettings();
    expect(log.toasts).toEqual(["设置功能即将开放"]);
    expect(log.navs).toEqual([]);
    expect(log.tabs).toEqual([]);
  });

  it("没有任何登录或账号逻辑", () => {
    const files = readdirSync(join(MP, "pages/mine")).map((name) => readFileSync(join(MP, "pages/mine", name), "utf8")).join("\n");
    expect(files).not.toMatch(/wx\.login|getUserProfile|getUserInfo|chooseAvatar|nickname|openid|userId|登录/i);
    expect(pageDef.onLogin).toBeUndefined();
  });

  it("底部 TabBar 配置和图标没变：首页 / 共创 / 我的", () => {
    const app = JSON.parse(readFileSync(join(MP, "app.json"), "utf8")) as {
      tabBar: { list: Array<{ pagePath: string; text: string; iconPath: string; selectedIconPath: string }> };
    };
    expect(app.tabBar.list.map((t) => [t.pagePath, t.text])).toEqual([
      ["pages/home/index", "首页"],
      ["pages/stage/index", "共创"],
      ["pages/mine/index", "我的"],
    ]);
    for (const t of app.tabBar.list) {
      expect(existsSync(join(MP, t.iconPath))).toBe(true);
      expect(existsSync(join(MP, t.selectedIconPath))).toBe(true);
    }
  });
});
