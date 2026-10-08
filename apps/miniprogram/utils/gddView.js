function text(v) {
  return typeof v === "string" ? v.trim() : "";
}

function filled(v) {
  return Boolean(text(v));
}

function fnv1aHex(raw) {
  var h = 2166136261;
  for (var i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function coverFingerprint(m) {
  var c = m.constitution && typeof m.constitution === "object" ? m.constitution : {};
  var pres = m.presentation && typeof m.presentation === "object" ? m.presentation : {};
  var raw = [
    m.title,
    m.coreFantasy,
    c.coreFantasy,
    m.aesthetic,
    m.coreEmotion,
    m.world,
    m.pitch,
    pres.where,
    pres.dimension,
  ].map(text).join("|");
  return fnv1aHex(raw);
}

function coverPromptFromModel(m) {
  var c = m.constitution && typeof m.constitution === "object" ? m.constitution : {};
  var pres = m.presentation && typeof m.presentation === "object" ? m.presentation : {};
  var lines = [
    "游戏封面插画，电影感概念图，一张主视觉。",
    "画面里不要出现任何文字、标题、Logo 或手机 UI。",
  ];
  var title = text(m.title);
  if (title && title !== "未命名游戏") lines.push("创作参考（不要写进画面）：" + title);
  var fantasy = text(c.coreFantasy) || text(m.coreFantasy);
  if (fantasy) lines.push("核心幻想：" + fantasy);
  if (text(m.world)) lines.push("世界：" + text(m.world));
  var aesthetic = text(m.aesthetic) || text(c.artRule);
  if (aesthetic) lines.push("视听氛围：" + aesthetic);
  if (text(m.coreEmotion)) lines.push("情感：" + text(m.coreEmotion));
  var where = text(pres.where);
  var dim = text(pres.dimension);
  if (where || dim) lines.push("呈现：" + [where, dim].filter(Boolean).join("，"));
  return lines.join("\n");
}

function formatProfile(m) {
  var pres = m.presentation && typeof m.presentation === "object" ? m.presentation : {};
  var players = { "自己玩": "单人", "要和别人一起": "多人" }[text(pres.players)] || "";
  var platform = { "电脑": "PC", "手机": "手机", "网页": "网页" }[text(pres.where)] || "";
  var dimension = { "平面": "2D", "能转视角的立体": "3D" }[text(pres.dimension)] || "";
  var orientation = { "横屏": "横屏", "竖屏": "竖屏" }[text(pres.orientation)] || "";
  var format = {};
  if (players) format.players = players;
  if (platform) format.platform = platform;
  if (dimension) format.dimension = dimension;
  if (orientation) format.orientation = orientation;
  return {
    genres: [],
    gameplayTags: [],
    experienceTags: [],
    tags: [],
    format: format,
    formatLine: [players, platform, dimension, orientation].filter(Boolean).join(" · "),
  };
}

function parseCoreMechanic(raw) {
  var whole = text(raw);
  if (!whole) return { title: "", description: "" };
  var full = whole.indexOf("：");
  var half = whole.indexOf(":");
  var idx = -1;
  if (full >= 0 && half >= 0) idx = Math.min(full, half);
  else if (full >= 0) idx = full;
  else idx = half;
  if (idx <= 0) return { title: whole, description: "" };
  var title = whole.slice(0, idx).trim();
  var description = whole.slice(idx + 1).trim();
  if (!title || !description) return { title: whole, description: "" };
  return { title: title, description: description };
}

function gameplayMoments(m) {
  var list = Array.isArray(m.mechanics) ? m.mechanics : [];
  var ids = Array.isArray(m.mechanicIds) ? m.mechanicIds : [];
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var raw = text(list[i]);
    if (!raw) continue;
    var base = text(ids[i]) || fnv1aHex(raw);
    var n = (seen[base] || 0) + 1;
    seen[base] = n;
    var parsed = parseCoreMechanic(raw);
    out.push({
      id: n === 1 ? base : base + "-" + n,
      title: parsed.title,
      description: parsed.description,
    });
  }
  return out;
}

function growthStepsFromModel(m) {
  var g = m.growth && typeof m.growth === "object" ? m.growth : {};
  var steps = [];
  if (filled(g.nearGoal)) steps.push({ id: "near", label: "眼前目标", text: text(g.nearGoal) });
  if (filled(g.afterTenMin)) steps.push({ id: "after", label: "玩一阵之后", text: text(g.afterTenMin) });
  if (filled(g.unlocks)) steps.push({ id: "unlocks", label: "越玩越多", text: text(g.unlocks) });
  return steps;
}

function toGddView(m, cover) {
  if (!m || typeof m !== "object") m = {};
  cover = cover || {};
  var g = m.growth && typeof m.growth === "object" ? m.growth : {};
  var steps = growthStepsFromModel(m);
  return {
    title: text(m.title) || "未命名游戏",
    pitch: text(m.pitch),
    profile: formatProfile(m),
    delight: text(m.coreDelight),
    growthSteps: steps,
    growthNone: Boolean(g.none) && steps.length === 0,
    gameplayMoments: gameplayMoments(m),
    cover: {
      prompt: coverPromptFromModel(m),
      fingerprint: coverFingerprint(m),
      status: cover.status || "idle",
      imageUrl: cover.imageUrl,
    },
  };
}

module.exports.toGddView = toGddView;
module.exports.coverFingerprint = coverFingerprint;
