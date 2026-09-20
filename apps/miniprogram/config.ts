/**
 * 开发期 API 根地址。
 * - 模拟器：127.0.0.1 即可
 * - 真机：改成电脑的局域网 IP，例如 http://192.168.1.8:8420
 * 封面图也走这个根（/api/session/:id/cover），不要让小程序直连 LiteLLM。
 * 本仓库 project.config.json 已设 urlCheck: false，模拟器一般不用再勾「不校验合法域名」。
 * 真机/正式版还要把该 API 域名配进 request / downloadFile 合法域名。
 */
export const API_BASE = "http://127.0.0.1:8420";

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

/** 全站品牌静帧。Loader 视频未进包前，首屏/对话/文档/分享卡共用这一张。 */
export const LOGO_SRC = "/images/forgeax-logo.png";

/** 首页协议勾选。拆成 Tab 后必须落盘，共创发送时读取。 */
export const AGREED_KEY = "nb.agreed";

/** 首页示例预填到共创输入框。switchTab 不能带 query。 */
export const PENDING_PROMPT_KEY = "nb.pendingPrompt";

/** 首页/我的交给共创页的动作：boot / resume / open。 */
export const PENDING_CHAT_KEY = "nb.pendingChat";
