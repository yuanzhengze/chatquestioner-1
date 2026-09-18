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

function splitInteractionChain(chain) {
  return String(chain || "")
    .split(/\s*(?:→|->|➔|然后|之后)\s*/g)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
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

function storyboardFrames(m) {
  var inter = m.interaction && typeof m.interaction === "object" ? m.interaction : {};
  var parts = splitInteractionChain(inter.chain);
  if (parts.length >= 2) {
    return parts.slice(0, 4).map(function (t, i) {
      return { title: "第 " + (i + 1) + " 步", text: t };
    });
  }
  var fallback = [];
  if (filled(inter.verb)) fallback.push({ title: "主要操作", text: text(inter.verb) });
  if (filled(inter.target)) fallback.push({ title: "操作对象", text: text(inter.target) });
  if (filled(inter.feedback)) fallback.push({ title: "即时反馈", text: text(inter.feedback) });
  if (fallback.length >= 2) return fallback.slice(0, 4);
  var one = text(inter.chain) || text(m.coreAction);
  return one ? [{ title: "你怎么玩", text: one }] : [];
}

function dnaChips(m) {
  var c = m.constitution && typeof m.constitution === "object" ? m.constitution : {};
  var pres = m.presentation && typeof m.presentation === "object" ? m.presentation : {};
  var chips = [];
  var fantasy = text(c.coreFantasy) || text(m.coreFantasy);
  if (fantasy) chips.push({ id: "fantasy", label: "幻想", text: fantasy });
  if (filled(m.coreEmotion)) chips.push({ id: "emotion", label: "情感", text: text(m.coreEmotion) });
  if (filled(m.differentiator)) chips.push({ id: "diff", label: "不同", text: text(m.differentiator) });
  var play = [text(pres.where), text(pres.dimension)].filter(Boolean).join(" · ");
  if (play) chips.push({ id: "play", label: "在哪玩", text: play });
  return chips;
}

function loopNodes(m) {
  var loop = m.loop && typeof m.loop === "object" ? m.loop : {};
  var nodes = [];
  if (filled(loop.micro)) nodes.push({ id: "micro", label: "头几秒", text: text(loop.micro) });
  if (filled(loop.mid)) nodes.push({ id: "mid", label: "一局", text: text(loop.mid) });
  if (filled(loop.macro)) nodes.push({ id: "macro", label: "再玩下去", text: text(loop.macro) });
  return nodes;
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
    dna: dnaChips(m),
    storyboard: storyboardFrames(m),
    loopNodes: loopNodes(m),
    delight: text(m.coreDelight),
    growthSteps: steps,
    growthNone: Boolean(g.none) && steps.length === 0,
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
module.exports.splitInteractionChain = splitInteractionChain;
