/**
 * 本机会话索引。键名与 config.ts SESSION_INDEX_KEY 保持一致。
 * 「我的」和共创页历史侧栏都读 load().items，顺序只认内容更新时间。
 * contentUpdatedAt：服务端记下的最近一次真修改。没有这个字段的旧记录沿用 updatedAt，读的时候不写成现在。
 * 只打开、点修改、取消、封面和分类都不会改这两个时间。
 */
var KEY = "nb.sessionIndex";

function empty() {
  return { currentId: "", items: [] };
}

function positiveTime(value) {
  return typeof value === "number" && isFinite(value) && value > 0 ? value : 0;
}

/** 历史排序：内容更新时间优先；旧记录没有该字段时用原来的 updatedAt。 */
function timeOf(it) {
  if (!it) return 0;
  return positiveTime(it.contentUpdatedAt) || positiveTime(it.updatedAt);
}

function byRecentContent(items) {
  return items.map(function (it, i) {
    return { it: it, i: i };
  }).sort(function (a, b) {
    var delta = timeOf(b.it) - timeOf(a.it);
    if (delta !== 0) return delta;
    return a.i - b.i;
  }).map(function (row) {
    return row.it;
  });
}

function load() {
  try {
    var raw = wx.getStorageSync(KEY);
    if (!raw || typeof raw !== "object") return empty();
    var items = Array.isArray(raw.items) ? raw.items.filter(function (it) {
      return it && typeof it.id === "string";
    }) : [];
    return {
      currentId: typeof raw.currentId === "string" ? raw.currentId : "",
      items: byRecentContent(items),
    };
  } catch (_e) {
    return empty();
  }
}

function save(idx) {
  try {
    wx.setStorageSync(KEY, idx);
  } catch (_e) {
    // 存储满或被禁时静默失败，不挡对话
  }
}

function upsert(entry) {
  var idx = load();
  var prev = null;
  var rest = [];
  for (var i = 0; i < idx.items.length; i++) {
    if (idx.items[i].id === entry.id) prev = idx.items[i];
    else rest.push(idx.items[i]);
  }
  var sortKey = prev ? timeOf(prev) : 0;
  var prevContent = prev ? positiveTime(prev.contentUpdatedAt) : 0;
  var incoming = positiveTime(entry.contentUpdatedAt);
  var contentUpdatedAt = prevContent;
  var updatedAt = prev ? positiveTime(prev.updatedAt) : 0;
  if (incoming > sortKey) {
    contentUpdatedAt = incoming;
    updatedAt = incoming;
  } else if (!updatedAt && contentUpdatedAt) {
    updatedAt = contentUpdatedAt;
  }
  var next = {
    id: entry.id,
    title: entry.title || (prev && prev.title) || "未命名共创",
    updatedAt: updatedAt,
    lastOptions: Array.isArray(entry.lastOptions)
      ? entry.lastOptions
      : (prev && Array.isArray(prev.lastOptions) ? prev.lastOptions : []),
    readyForSynthesis: entry.readyForSynthesis === true,
  };
  if (contentUpdatedAt > 0) next.contentUpdatedAt = contentUpdatedAt;
  rest.push(next);
  idx.items = byRecentContent(rest);
  idx.currentId = entry.id;
  save(idx);
  return idx;
}

function setCurrent(id) {
  var idx = load();
  idx.currentId = id || "";
  save(idx);
  return idx;
}

function remove(id) {
  var idx = load();
  idx.items = idx.items.filter(function (it) {
    return it.id !== id;
  });
  if (idx.currentId === id) {
    idx.currentId = idx.items[0] ? idx.items[0].id : "";
  }
  save(idx);
  return idx;
}

function current() {
  var idx = load();
  if (!idx.currentId) return null;
  for (var i = 0; i < idx.items.length; i++) {
    if (idx.items[i].id === idx.currentId) return idx.items[i];
  }
  return null;
}

function titleFrom(state, messages) {
  var wt = state && typeof state.workingTitle === "string" ? state.workingTitle.trim() : "";
  if (wt) return wt;
  var list = messages || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].role === "user" && String(list[i].content || "").trim()) {
      var t = String(list[i].content).trim().replace(/\s+/g, " ");
      return t.length > 18 ? t.slice(0, 18) + "…" : t;
    }
  }
  return "未命名共创";
}

module.exports = {
  load: load,
  save: save,
  upsert: upsert,
  setCurrent: setCurrent,
  remove: remove,
  current: current,
  titleFrom: titleFrom,
};
