/**
 * 开发期 API 根地址。
 * - 模拟器：127.0.0.1 即可
 * - 真机：改成电脑的局域网 IP，例如 http://192.168.1.8:8420
 * 本仓库 project.config.json 已设 urlCheck: false，模拟器一般不用再勾「不校验合法域名」。
 */
export const API_BASE = "http://127.0.0.1:8420";

/** ForgeaX 开源组织入口。小程序未配业务域名时不能 web-view，阶段 1 用复制链接。 */
export const FORGEAX_SITE_URL = "https://github.com/ForgeaX-Games";

/** 聊天页把 GDD Markdown 交给独立预览页（过长不宜走 URL query）。 */
export const GDD_DRAFT_KEY = "nb.gddDraft";

/** 本机会话索引（D17）。只存 id/标题/时间，正文在服务端 data/sessions。 */
export const SESSION_INDEX_KEY = "nb.sessionIndex";

/** 全站品牌静帧。Loader 视频未进包前，首屏/对话/文档/分享卡共用这一张。 */
export const LOGO_SRC = "/images/forgeax-logo.png";
