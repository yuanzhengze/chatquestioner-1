function emptyPitch(pitch) {
  var p = String(pitch || "").trim();
  if (!p || p === "（待补充）" || p === "（未写）") return "";
  return p;
}

/**
 * 完整文档展示用的正文：去掉开头的游戏名和一句话 Pitch。
 * 收起只藏这段展示；复制仍用原文。
 */
function fullDocBody(md) {
  var text = String(md || "").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").trim();
  if (!text) return "";
  var rest = text.replace(/^#\s+[^\n]+\n+/, "");
  rest = rest.replace(/^>\s*一句话 Pitch：[^\n]*\n*/, "");
  return rest.trim();
}

/** 从 renderGdd 的 Markdown 抽出封面要用的标题和一句话。 */
function parseGddPreview(md) {
  var text = String(md || "").replace(/\r\n/g, "\n");
  var titleMatch = text.match(/^#\s+(.+)$/m);
  var pitchMatch = text.match(/^>\s*一句话 Pitch：\s*(.+)$/m);
  var title = (titleMatch && titleMatch[1].trim()) || "未命名游戏";
  var pitch = emptyPitch(pitchMatch && pitchMatch[1]);
  return { title: title, pitch: pitch };
}

/** 共创卡片的封面位。高度固定，状态只换里面的字或图。 */
function coverSlot(meta) {
  var status = meta && meta.status ? String(meta.status) : "";
  var image = meta && meta.imageUrl ? String(meta.imageUrl).trim() : "";
  if (status === "ready" && image) return "ready";
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return "empty";
}

module.exports.fullDocBody = fullDocBody;
module.exports.parseGddPreview = parseGddPreview;
module.exports.coverSlot = coverSlot;

/** 「我的」里的一条记录。有没有文档只看这次 GET 的 gddMarkdown。封面只带这条自己的地址。 */
function recordCard(indexItem, state) {
  var item = indexItem && typeof indexItem === "object" ? indexItem : {};
  var id = typeof item.id === "string" ? item.id : "";
  var fallback = item.title ? String(item.title) : "未命名共创";
  var body = state && typeof state === "object" ? state : {};
  var md = typeof body.gddMarkdown === "string" ? body.gddMarkdown.trim() : "";
  var hasDoc = Boolean(md);
  var preview = hasDoc ? parseGddPreview(md) : { title: "", pitch: "" };
  var title = preview.title && preview.title !== "未命名游戏" ? preview.title : fallback;
  var cover = body.gddView && body.gddView.cover ? body.gddView.cover : null;
  var coverPath = "";
  if (hasDoc && cover && cover.status === "ready" && cover.imageUrl) {
    coverPath = String(cover.imageUrl).trim();
  }
  return {
    id: id,
    title: title,
    pitch: preview.pitch || "",
    hasDoc: hasDoc,
    coverPath: coverPath,
    action: hasDoc ? "view" : "continue",
  };
}

function listViewportHeight(contentPx, windowPx) {
  var content = Number(contentPx);
  var win = Number(windowPx);
  if (!isFinite(content) || content <= 0) return 0;
  var box = Math.ceil(content);
  if (!isFinite(win) || win <= 0) return box;
  return Math.min(box, Math.round(win * 0.52));
}

function gameplayFileName(sessionId, mechanicId, revision) {
  var clean = function (v) { return String(v || "").replace(/[^A-Za-z0-9_-]/g, ""); };
  var session = clean(sessionId);
  var mechanic = clean(mechanicId);
  var rev = clean(revision);
  if (!session || !mechanic || !rev) return "";
  return "nb-gp-" + session + "-" + mechanic + "-" + rev + ".png";
}

function coverFileName(sessionId) {
  var id = String(sessionId || "").replace(/[^A-Za-z0-9_-]/g, "");
  return id ? "nb-cover-" + id + ".png" : "";
}

function coverFileMatches(sessionId, localPath) {
  var name = coverFileName(sessionId);
  if (!name) return false;
  return String(localPath || "").indexOf(name) >= 0;
}

/** 列表下载不能把共用临时路径当成 src。字节要落到这份 session 自己的文件上。 */
function resolveCoverDownload(sessionId, requestedPath, result) {
  var name = coverFileName(sessionId);
  var reported = result && (result.filePath || result.tempFilePath) ? String(result.filePath || result.tempFilePath) : "";
  var requested = String(requestedPath || "");
  if (!name || requested.indexOf(name) < 0) return { localPath: "", copyFrom: "" };
  if (reported && reported.indexOf(name) >= 0) return { localPath: reported, copyFrom: "" };
  if (!reported) return { localPath: "", copyFrom: "" };
  return { localPath: requested, copyFrom: reported };
}

module.exports.recordCard = recordCard;
module.exports.listViewportHeight = listViewportHeight;
module.exports.gameplayFileName = gameplayFileName;
module.exports.coverFileName = coverFileName;
module.exports.coverFileMatches = coverFileMatches;
module.exports.resolveCoverDownload = resolveCoverDownload;
