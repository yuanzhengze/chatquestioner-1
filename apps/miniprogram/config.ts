/**
 * 小程序 API 根地址的唯一入口。会话、补丁、封面、玩法图、分享、分类都用 API_BASE。
 * 开发者工具用 127.0.0.1。真机开发版用 config.local.js 的 LAN_API_BASE（该文件不进 Git）。
 * 正式版和体验版用 PRODUCTION_API_BASE，不回退到局域网。
 * 封面和玩法图由服务端返回相对路径，再在这里拼上 API_BASE。
 */
const { resolveApiBase } = require("./configBase.js") as {
  resolveApiBase: (input: {
    platform?: string;
    envVersion?: string;
    lanBase?: string;
    productionBase?: string;
    devtoolsBase?: string;
  }) => { base: string; where: "devtools" | "device" | "production" };
};

/** 正式版、体验版的 HTTPS API。域名确定前留空，不会改去连开发机。 */
export const PRODUCTION_API_BASE = "";

const DEVTOOLS_API_BASE = "http://127.0.0.1:8420";

type WxRuntime = {
  getDeviceInfo?: () => { platform?: string };
  getSystemInfoSync?: () => { platform?: string };
  getAccountInfoSync?: () => { miniProgram?: { envVersion?: string } };
};

function readLanBase(): string {
  try {
    const local = require("./config.local.js") as { LAN_API_BASE?: string };
    return typeof local.LAN_API_BASE === "string" ? local.LAN_API_BASE.trim() : "";
  } catch (_e) {
    return "";
  }
}

function readRuntime(): { platform: string; envVersion: string } {
  let wxapi: WxRuntime | undefined;
  try {
    wxapi = wx as WxRuntime;
  } catch (_e) {
    wxapi = undefined;
  }
  let platform = "";
  let envVersion = "";
  if (!wxapi) return { platform, envVersion };
  try {
    if (typeof wxapi.getDeviceInfo === "function") platform = String(wxapi.getDeviceInfo().platform || "");
  } catch (_e) {
    platform = "";
  }
  if (!platform && typeof wxapi.getSystemInfoSync === "function") {
    try {
      platform = String(wxapi.getSystemInfoSync().platform || "");
    } catch (_e) {
      platform = "";
    }
  }
  try {
    envVersion = String(wxapi.getAccountInfoSync?.().miniProgram?.envVersion || "");
  } catch (_e) {
    envVersion = "";
  }
  return { platform, envVersion };
}

const runtime = readRuntime();
const resolved = resolveApiBase({
  platform: runtime.platform,
  envVersion: runtime.envVersion,
  lanBase: readLanBase(),
  productionBase: PRODUCTION_API_BASE,
  devtoolsBase: DEVTOOLS_API_BASE,
});

export const API_BASE = resolved.base;
export const API_WHERE = resolved.where;

function devLogEnabled(): boolean {
  return runtime.envVersion === "develop" || runtime.envVersion === "";
}

/** 开发版启动时打一行，正式版和体验版不打。 */
export function logApiBase(): void {
  if (!devLogEnabled()) return;
  if (API_WHERE === "device" && !API_BASE) {
    console.log("API_BASE: (empty) (device) 请在 config.local.js 填写 LAN_API_BASE");
    return;
  }
  console.log(`API_BASE: ${API_BASE} (${API_WHERE})`);
}

/** 开发版请求失败时打出当前根地址。正式用户看不到这行。 */
export function noteDevNetworkFail(err?: { errMsg?: string }): void {
  if (!devLogEnabled()) return;
  const msg = String(err?.errMsg || "");
  if (/abort/i.test(msg)) return;
  console.log(`API_BASE: ${API_BASE || "(empty)"} (${API_WHERE}) request failed: ${msg || "network fail"}`);
}

/** 导航栏 / Tab / canvas 不能写 CSS 变量。对照 forgeax-codex-design-system.html 的 dark 语义。 */
export const FX_CHROME = {
  canvas: "#1A1C1F",
  sidebar: "#222326",
  raised: "#292A2D",
  brand: "#C5DD78",
  brandOn: "#1A1C1F",
  text: "#EDEDED",
  textSecondary: "#C7C7C8",
  primaryBg: "#EDEDED",
  primaryFg: "#1A1C1F",
} as const;

/** ForgeaX 开源组织入口。小程序未配业务域名时不能 web-view，阶段 1 用复制链接。 */
export const FORGEAX_SITE_URL = "https://github.com/ForgeaX-Games";

/** 聊天页把 GDD Markdown 交给独立预览页（过长不宜走 URL query）。 */
export const GDD_DRAFT_KEY = "nb.gddDraft";

/** 预览点手风琴一句后，点右侧 ✎ 回到同一条共创改这一处。 */
export const GDD_PATCH_KEY = "nb.gddPatch";

/** 本机会话索引（D17）。只存 id/标题/时间，正文在服务端 data/sessions。 */
export const SESSION_INDEX_KEY = "nb.sessionIndex";

/**
 * 正式 ForgeaX Logo，全站品牌图形只读这一份：首页品牌行、助手头像、加载 / 空状态、记录占位、文档署名、分享卡。
 * 透明底，颜色和比例保持原稿；各处只换容器大小，不改 Logo 本身。
 */
export const LOGO_SRC = "/images/brand/forgeax-logo.png";

/** 首页品牌行的 ForgeAX 英文字标（方案一），深底反白版。 */
export const BRAND_WORDMARK_SRC = "/images/home/brand-wordmark.png";

/** 首页 Hero 背景位。临时图，换图只换这个文件；构图按「左侧压暗放文字、右侧主体」取景。 */
export const HOME_HERO_SRC = "/images/home/hero.jpg";

/** 「我的」顶部氛围图位：铺满品牌区和头像区，在「共创记录」标题处渐隐进页面底色；原图不改。 */
export const MINE_HERO_SRC = "/images/mine/hero.jpg";

/** 首页协议勾选。拆成 Tab 后必须落盘，共创发送时读取。 */
export const AGREED_KEY = "nb.agreed";

/** 首页示例预填到共创输入框。switchTab 不能带 query。 */
export const PENDING_PROMPT_KEY = "nb.pendingPrompt";

/** 首页/我的交给共创页的动作：boot / resume / open。 */
export const PENDING_CHAT_KEY = "nb.pendingChat";
