/** 本机会话索引。键名与 config.ts SESSION_INDEX_KEY 保持一致。 */
var KEY = "nb.sessionIndex";

function empty() {
  return { currentId: "", items: [] };
}

function load() {
  try {
    var raw = wx.getStorageSync(KEY);
    if (!raw || typeof raw !== "object") return empty();
    return {
      currentId: typeof raw.currentId === "string" ? raw.currentId : "",
      items: Array.isArray(raw.items) ? raw.items.filter(function (it) {
        return it && typeof it.id === "string";
      }) : [],
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
  var items = idx.items.filter(function (it) {
    return it.id !== entry.id;
  });
  items.unshift({
    id: entry.id,
    title: entry.title || "未命名共创",
    updatedAt: entry.updatedAt || Date.now(),
    lastOptions: Array.isArray(entry.lastOptions) ? entry.lastOptions : [],
    readyForSynthesis: entry.readyForSynthesis === true,
  });
  idx.items = items;
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
