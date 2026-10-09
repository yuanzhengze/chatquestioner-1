import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

type Req = { url: string; method?: string; success?: (res: unknown) => void; fail?: (err: unknown) => void };
type PageDef = Record<string, unknown> & { data: Record<string, unknown> };
type PageInstance = Record<string, any> & { data: Record<string, any> };

const MP = resolve(__dirname, "..");
const req = createRequire(import.meta.url);
const { EXAMPLE_SOURCE, examplePath } = req("../utils/exampleShowcase.js") as {
  EXAMPLE_SOURCE: Array<{ id: string; shareId: string }>;
  examplePath: (shareId: string) => string;
};

const log = {
  requests: [] as Array<{ method: string; url: string }>,
  downloads: [] as string[],
  storageWrites: [] as string[],
  navigations: [] as string[],
};
let respond: (r: Req) => { statusCode: number; data: unknown } = () => ({ statusCode: 404, data: {} });

vi.stubGlobal("wx", {
  getDeviceInfo: () => ({ platform: "devtools" }),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375, windowHeight: 618, screenHeight: 667, pixelRatio: 2 }),
  getMenuButtonBoundingClientRect: () => ({ top: 24, height: 32, left: 281 }),
  setNavigationBarColor() {},
  setBackgroundColor() {},
  showShareMenu() {},
  hideShareMenu() {},
  showToast() {},
  showTabBar() {},
  hideTabBar() {},
  pageScrollTo() {},
  getStorageSync: () => "",
  setStorageSync: (key: string) => { log.storageWrites.push(key); },
  removeStorageSync: (key: string) => { log.storageWrites.push(key); },
  request: (r: Req) => {
    log.requests.push({ method: r.method || "GET", url: r.url });
    const res = respond(r);
    setTimeout(() => r.success && r.success(res), 0);
  },
  downloadFile: (r: { url: string; success?: (res: unknown) => void }) => {
    log.downloads.push(r.url);
    const n = log.downloads.length;
    setTimeout(() => r.success && r.success({ statusCode: 200, tempFilePath: `wxfile://tmp/${n}.png` }), 0);
  },
  navigateTo: (o: { url: string }) => { log.navigations.push(o.url); },
  switchTab: (o: { url: string }) => { log.navigations.push(`switchTab:${o.url}`); },
  env: { USER_DATA_PATH: "wxfile://usr" },
});

const pages: Record<string, PageDef> = {};
let registering = "";
vi.stubGlobal("Page", (def: PageDef) => { pages[registering] = def; });

let LOGO_SRC = "";

beforeAll(async () => {
  LOGO_SRC = (await import("../config")).LOGO_SRC;
  for (const name of ["home", "gdd", "mine", "stage"]) {
    registering = name;
    await import(`../pages/${name}/index.ts`);
  }
});

beforeEach(() => {
  log.requests.length = 0;
  log.downloads.length = 0;
  log.storageWrites.length = 0;
  log.navigations.length = 0;
});

function setPath(obj: Record<string, any>, path: string, value: unknown) {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
}

function instance(def: PageDef): PageInstance {
  const page = { ...def, data: JSON.parse(JSON.stringify(def.data)) } as PageInstance;
  page.setData = (patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch)) setPath(page.data, key, value);
  };
  return page;
}

async function flush() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

/** 从带 bindtap 的那个元素开始，取到与它配对的闭合标签为止。 */
function tapTarget(wxml: string, handler: string): string {
  const at = wxml.indexOf(`bindtap="${handler}"`);
  const start = wxml.lastIndexOf("<view", at);
  const tag = /<\/?view\b[^>]*?(\/)?>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(wxml); m; m = tag.exec(wxml)) {
    if (m[0].startsWith("</")) depth -= 1;
    else if (!m[1]) depth += 1;
    if (depth === 0) return wxml.slice(start, m.index + m[0].length);
  }
  return "";
}

describe("首页示例卡片", () => {
  it("封面、游戏名、一句话都在同一个可点击的卡片里，卡片内没有别的点击目标", () => {
    const card = tapTarget(readFileSync(join(MP, "pages/home/index.wxml"), "utf8"), "onOpenExample");
    expect(card).toContain("{{item.cover}}");
    expect(card).toContain("{{item.title}}");
    expect(card).toContain("{{item.pitch}}");
    expect(card).toContain('data-share="{{item.shareId}}"');
    expect(card.match(/bindtap=|catchtap=/g)).toHaveLength(1);
  });

  it("双列读分享快照填卡片，整张点开进只读示例文档；全程只读请求、不写本机记录", async () => {
    respond = (r) => {
      const m = r.url.match(/\/api\/share\/([^/?]+)$/);
      const i = m ? EXAMPLE_SOURCE.findIndex((s) => s.shareId === m[1]) : -1;
      if (i < 0) return { statusCode: 404, data: {} };
      return {
        statusCode: 200,
        data: {
          id: m![1],
          markdown: `# 文档${i}\n\n> 一句话 Pitch：文档一句话${i}`,
          model: { title: `游戏${i}`, pitch: `一句话${i}` },
          v: 2,
          coverImageUrl: `/api/share/${m![1]}/cover`,
        },
      };
    };
    const page = instance(pages.home);
    page.onLoad();
    page.onShow();
    await flush();

    expect(page.data.markSrc).toBe(LOGO_SRC);
    const cols = page.data.exampleCols as Array<{ items: Array<Record<string, string>> }>;
    expect(cols).toHaveLength(2);
    const cards = cols.flatMap((col) => col.items);
    expect(cards).toHaveLength(EXAMPLE_SOURCE.length);
    for (const card of cards) {
      expect(card.title).toMatch(/^游戏\d$/);
      expect(card.pitch).toMatch(/^一句话\d$/);
      expect(card.cover).toMatch(/^wxfile:\/\/tmp\//);
    }
    expect(log.requests.length).toBe(EXAMPLE_SOURCE.length);
    expect(log.requests.every((r) => r.method === "GET" && /\/api\/share\/[^/]+$/.test(r.url))).toBe(true);
    expect(log.downloads.every((url) => /\/api\/share\/[^/]+\/cover$/.test(url))).toBe(true);

    page.onOpenExample({ currentTarget: { dataset: { share: cards[0].shareId } } });
    expect(log.navigations).toEqual([examplePath(cards[0].shareId)]);
    expect(log.storageWrites).toEqual([]);
  });
});

describe("品牌 Logo", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return ["test", "node_modules", "images"].includes(name) ? [] : sourceFiles(p);
      return /\.(ts|js|wxml|wxss|json)$/.test(name) ? [p] : [];
    });
  }

  it("正式 Logo 是透明底方图；旧机器人文件已移除，代码里不再引用", () => {
    const file = join(MP, LOGO_SRC);
    expect(existsSync(file)).toBe(true);
    const png = readFileSync(file);
    expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20));
    expect(png[25]).toBe(6);
    expect(existsSync(join(MP, "images/forgeax-logo.png"))).toBe(false);
    const stale = sourceFiles(MP).filter((p) => readFileSync(p, "utf8").includes("/images/forgeax-logo.png"));
    expect(stale).toEqual([]);
  });

  it("首页品牌行、共创助手、我的、游戏文档都读同一份 Logo", async () => {
    const { AvatarDriver } = await import("../utils/avatar");
    const driver = new AvatarDriver(() => {});
    expect(driver.poster).toBe(LOGO_SRC);
    driver.destroy();
    expect(pages.home.data.markSrc).toBe(LOGO_SRC);
    expect(pages.stage.data.poster).toBe(LOGO_SRC);
    expect(pages.stage.data.logoSrc).toBe(LOGO_SRC);
    expect(pages.mine.data.logoSrc).toBe(LOGO_SRC);
    expect(pages.gdd.data.logoSrc).toBe(LOGO_SRC);
  });
});
