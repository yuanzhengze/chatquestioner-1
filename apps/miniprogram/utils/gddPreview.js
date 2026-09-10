function bullets(block) {
  return String(block || "")
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return /^-\s+/.test(l);
    })
    .map(function (l) {
      return l.replace(/^-\s+/, "");
    })
    .filter(function (l) {
      return l && l !== "（待补充）";
    });
}

/** 从 renderGdd / gddFromState 的 Markdown 抽出预览头图要用的字段。 */
function parseGddPreview(md) {
  var text = String(md || "").replace(/\r\n/g, "\n");
  var titleMatch = text.match(/^#\s+(.+)$/m);
  var pitchMatch = text.match(/^>\s*一句话 Pitch：\s*(.+)$/m);
  var title = (titleMatch && titleMatch[1].trim()) || "未命名游戏";
  var pitch = (pitchMatch && pitchMatch[1].trim()) || "";
  if (pitch === "（待补充）") pitch = "";

  var mvpChunk = "";
  var mvpHead = text.indexOf("## 6.");
  if (mvpHead >= 0) {
    var rest = text.slice(mvpHead);
    var next = rest.search(/\n## (?!6\.)/);
    mvpChunk = next >= 0 ? rest.slice(0, next) : rest;
  }

  var parts = mvpChunk.split("主动裁剪");
  var must = bullets(parts[0]);
  var cut = bullets(parts[1] || "");

  return { title: title, pitch: pitch, must: must, cut: cut };
}

module.exports.parseGddPreview = parseGddPreview;
