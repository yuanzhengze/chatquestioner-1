var parseGddPreview = require("./gddPreview.js").parseGddPreview;
var toGddView = require("./gddView.js").toGddView;

/**
 * 首页示例成果：只记「示例 → 分享快照」。游戏名、一句话、封面都从快照读，不另存一份。
 * 分享快照是只读的：打开不写会话、不进用户历史、不改排序。
 * 开发期指向本机后端 data/shares 里已有的快照；正式示例上线只换这张表（或换成服务端示例源）。
 */
var EXAMPLE_SOURCE = [
  { id: "broom-courier", shareId: "e2fc8894-40cc-470a-8921-839c81ee1293" },
  { id: "bead-shop", shareId: "5345b728-b28f-4773-9432-8a6b8e28aad8" },
  { id: "moon-shadow", shareId: "6394f25f-0189-4649-b6a8-0825f72d31b5" },
  { id: "old-village", shareId: "77cf5d51-90ee-4593-bc6f-d51e80caeee8" },
  { id: "corner-tea", shareId: "b1b9abf4-5588-4145-8552-557e58add165" },
  { id: "click-box", shareId: "e6dc5f68-ca84-47bc-ab59-67e9102cd0f9" },
];

/** 快照 → 首页卡片。没有正文的快照不展示。 */
function exampleCard(source, snap) {
  var body = snap && typeof snap === "object" ? snap : {};
  var markdown = typeof body.markdown === "string" ? body.markdown.trim() : "";
  if (!source || !source.shareId || !markdown) return null;
  var view = toGddView(body.model && typeof body.model === "object" ? body.model : {});
  var meta = parseGddPreview(markdown);
  var title = view.title && view.title !== "未命名游戏" ? view.title : meta.title;
  return {
    id: source.id,
    shareId: source.shareId,
    title: title,
    pitch: view.pitch || meta.pitch || "",
    coverRemote: typeof body.coverImageUrl === "string" ? body.coverImageUrl : "",
    cover: "",
    tall: false,
  };
}

/** 双列：按顺序左右交替；同一行左右一高一方、下一行对调，两列高度交错又不失衡。 */
function exampleColumns(cards) {
  var cols = [{ key: "left", items: [] }, { key: "right", items: [] }];
  (cards || []).forEach(function (card, i) {
    var col = i % 2;
    var row = Math.floor(i / 2);
    card.tall = (row + col) % 2 === 0;
    cols[col].items.push(card);
  });
  return cols;
}

function examplePath(shareId) {
  return "/pages/gdd/index?s=" + encodeURIComponent(String(shareId || "")) + "&ex=1";
}

module.exports = {
  EXAMPLE_SOURCE: EXAMPLE_SOURCE,
  exampleCard: exampleCard,
  exampleColumns: exampleColumns,
  examplePath: examplePath,
};
