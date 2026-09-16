var POOL_LABELS = {
  gameplay: "玩法",
  emotion: "情绪",
  world: "世界观",
  visual: "视觉",
  narrative: "叙事",
  motivation: "玩家动机",
};

function asString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function asList(v) {
  return Array.isArray(v) ? v.map(function (x) { return String(x).trim(); }).filter(Boolean) : [];
}

function gap(v) {
  return v || "（未写）";
}

function looksLikeViewpoint(s) {
  return /人称|视角|手电筒|第一人称|第三人称|FPS/i.test(s) && !/电脑|手机|网页|PC/i.test(s);
}

function compactDup(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[。．，,、：:；;！!？?\-—（）()《》""'']/g, "").toLowerCase();
}

function nearDuplicate(a, b) {
  var ca = compactDup(a);
  var cb = compactDup(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (ca.length >= 2 && cb.indexOf(ca) >= 0) return true;
  if (cb.length >= 2 && ca.indexOf(cb) >= 0) return true;
  return false;
}

function collapseNearDup(items, max) {
  var cleaned = [];
  (items || []).forEach(function (raw) {
    var t = asString(raw);
    if (t && cleaned.indexOf(t) < 0) cleaned.push(t);
  });
  var ranked = cleaned.slice().sort(function (a, b) { return b.length - a.length; });
  var kept = [];
  ranked.forEach(function (item) {
    if (kept.some(function (k) { return nearDuplicate(item, k); })) return;
    kept.push(item);
  });
  var chosenSet = {};
  kept.slice(0, max || 6).forEach(function (k) { chosenSet[k] = true; });
  return cleaned.filter(function (x) { return chosenSet[x]; });
}

function isShortKeyword(s) {
  var t = asString(s);
  if (!t) return false;
  if (/[。！？!?]/.test(t) || /[：:]/.test(t)) return false;
  return t.length <= 12;
}

function shortKeywords(vals) {
  var out = [];
  asList(vals).forEach(function (v) {
    if (isShortKeyword(v) && out.indexOf(v) < 0) out.push(v);
  });
  return out.slice(0, 10);
}

/** 从会话 state 快照拼一份可读 GDD（synthesis 未到时的兜底）。 */
function gddFromState(state) {
  if (!state) return "";
  var loop = (state.loop && typeof state.loop === "object") ? state.loop : {};
  var pools = (state.keywordPools && typeof state.keywordPools === "object") ? state.keywordPools : {};
  var pres = (state.presentation && typeof state.presentation === "object") ? state.presentation : {};
  var diff = (state.difficulty && typeof state.difficulty === "object") ? state.difficulty : {};
  var cf = (state.constitutionFields && typeof state.constitutionFields === "object") ? state.constitutionFields : {};
  var eng = (state.engineering && typeof state.engineering === "object") ? state.engineering : {};

  var title = asString(state.workingTitle) || asString(state.theme) || asString(state.spark) || "未命名游戏";
  var pitch = asString(state.pitch) || asString(state.coreExperience) || asString(state.spark);
  var fantasy = asString(state.coreFantasy) || asString(state.playerIdentity) || asString(state.coreExperience) || asString(cf.coreFantasy);
  var identity = asString(state.playerIdentity);
  if (identity && fantasy.indexOf(identity.replace(/。+$/g, "")) >= 0) identity = "";
  var experience = asString(state.coreExperience) || asString(state.coreEmotion);
  var micro = asString(loop.thirtySec);
  var mid = asString(loop.fiveMin) || asString(state.coreAction);
  var macro = asString(loop.thirtyMin) || asString(loop.longTerm) || asString(state.winRule);
  var longTerm = asString(loop.longTerm);
  var mechanics = collapseNearDup(asList(state.mechanics).concat(asList(eng.mechanics)), 6);
  if (!mechanics.length && asString(state.coreAction)) mechanics = [asString(state.coreAction)];
  var whereRaw = asString(pres.where);
  var where = (whereRaw && !looksLikeViewpoint(whereRaw)) ? whereRaw : "";
  var hasSignal = Boolean(
    title !== "未命名游戏" || pitch || fantasy || experience || micro || mechanics.length,
  );
  if (!hasSignal) return "";

  var filledPools = {
    gameplay: shortKeywords(pools.gameplay),
    emotion: shortKeywords(pools.emotion),
    world: shortKeywords(pools.world),
    visual: shortKeywords(pools.visual),
    narrative: shortKeywords(pools.narrative),
    motivation: shortKeywords(pools.motivation),
  };
  var poolLines = Object.keys(POOL_LABELS)
    .map(function (k) {
      return filledPools[k].length ? "- **" + POOL_LABELS[k] + "**：" + filledPools[k].join("、") : "";
    })
    .filter(Boolean);
  var poolBlock = poolLines.length ? "### 关键词池\n\n" + poolLines.join("\n") + "\n\n" : "";

  var extraConst = asList(cf.extras).concat(asList(state.constitution))
    .map(function (x) { return "- " + x; })
    .join("\n");
  var highs = collapseNearDup(asList(state.juice), 6);
  var highlight = highs.length
    ? highs.map(function (h) { return "- " + h; }).join("\n")
    : asString(state.gameFeel);

  var emotionBlock = "- 主情感：" + gap(asString(state.coreEmotion));
  if (asString(state.forbiddenEmotion)) emotionBlock += "\n- 禁止情感：" + asString(state.forbiddenEmotion);

  var players = asString(pres.players);
  var social = asString(state.content && state.content.multiplayer);
  if (!social && (players === "要和别人一起" || /好友|排行|偷师/.test(asString(cf.presentationBoundary) + pitch))) {
    social = asString(cf.presentationBoundary) || pitch || players;
  }

  return "# " + title + "\n\n"
    + "> 一句话 Pitch：" + gap(pitch) + "\n\n"
    + "## 游戏宪法\n\n"
    + "- 核心幻想：" + gap(asString(cf.coreFantasy) || fantasy) + "\n"
    + "- 核心循环：" + gap(asString(cf.coreLoop) || mid || micro) + "\n"
    + "- 美术规则：" + gap(asString(cf.artRule) || asString(state.aesthetic)) + "\n"
    + (extraConst ? extraConst + "\n" : "")
    + "\n## 1. What · 这是什么游戏\n\n"
    + "### 核心体验陈述\n" + gap(experience) + "\n\n"
    + "### 核心情感\n" + emotionBlock + "\n\n"
    + "### 核心幻想 / 玩家身份\n" + gap([fantasy, identity].filter(Boolean).join("。").replace(/。{2,}/g, "。")) + "\n\n"
    + "### 差异化亮点\n" + gap(asString(state.differentiator)) + "\n\n"
    + "## 2. How · 怎么玩\n\n"
    + "### 核心动作\n" + gap(asString(state.coreAction)) + "\n\n"
    + "### 核心游戏循环\n"
    + "- 微循环：" + gap(micro) + "\n"
    + "- 中循环：" + gap(mid) + "\n"
    + "- 宏循环：" + gap(macro) + "\n"
    + (longTerm && longTerm !== macro ? "- 长线：" + longTerm + "\n" : "")
    + "\n### 核心机制\n" + (mechanics.length ? mechanics.map(function (m, i) { return (i + 1) + ". " + m; }).join("\n") : "1. （未写）") + "\n\n"
    + "### 奖励节奏\n" + gap(asString(state.reward)) + "\n\n"
    + "## 3. Win · Lose\n\n- 胜利：" + gap(asString(state.winRule)) + "\n- 失败：" + gap(asString(state.failRule)) + "\n- 重玩：" + gap(asString(state.replayMotivation) || asString(state.failRule)) + "\n\n"
    + "## 4. 世界、叙事与美学\n\n"
    + "### 世界与情境\n" + gap(asString(state.world) || asString(state.theme)) + "\n\n"
    + "### 叙事\n" + gap(asString(state.narrative)) + "\n\n"
    + "### 视听氛围\n" + gap(asString(state.aesthetic)) + "\n\n"
    + "### 手感\n" + gap(asString(state.gameFeel)) + "\n\n"
    + "### 高光时刻\n" + gap(highlight) + "\n\n"
    + "## 5. 内容\n\n" + gap(asString(state.world) || asString(state.theme)) + "\n\n"
    + (social ? "### 多人\n" + social + "\n\n" : "")
    + poolBlock
    + "## 6. 呈现与资产\n\n- 在哪玩：" + gap(where) + "\n- 画面维度：" + gap(asString(pres.dimension)) + "\n- 主要资产：" + gap(asString(pres.assets) || asString(state.aesthetic)) + "\n\n"
    + "## 7. 难度与心流\n\n- 怎么上强度：" + gap(asString(diff.ramp) || asString(state.difficultyCurve)) + "\n";
}

module.exports.gddFromState = gddFromState;
