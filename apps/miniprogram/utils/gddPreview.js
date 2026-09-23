function emptyPitch(pitch) {
  var p = String(pitch || "").trim();
  if (!p || p === "（待补充）" || p === "（未写）") return "";
  return p;
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

module.exports.parseGddPreview = parseGddPreview;
module.exports.coverSlot = coverSlot;
