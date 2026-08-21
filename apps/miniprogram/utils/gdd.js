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

function bullets(items) {
  return items.length ? items.map(function (i) { return "- " + i; }).join("\n") : "- （待补充）";
}

function orPending(v) {
  return v || "（待补充）";
}

/** 从会话 state 快照拼一份可读 GDD（synthesis 未到时的兜底）。 */
function gddFromState(state) {
  if (!state) return "";
  var loop = (state.loop && typeof state.loop === "object") ? state.loop : {};
  var coreLoop = [loop.thirtySec, loop.fiveMin, loop.thirtyMin, loop.longTerm]
    .map(asString)
    .filter(Boolean);
  var pools = (state.keywordPools && typeof state.keywordPools === "object") ? state.keywordPools : {};
  var mvp = (state.mvpScope && typeof state.mvpScope === "object") ? state.mvpScope : {};

  var title = asString(state.workingTitle) || asString(state.theme) || asString(state.spark) || "未命名游戏";
  var pitch = asString(state.pitch);
  var fantasy = asString(state.coreFantasy);
  var experience = asString(state.coreExperience) || asString(state.coreEmotion);
  var poolBlock = Object.keys(POOL_LABELS)
    .map(function (k) {
      return "**" + POOL_LABELS[k] + "**：" + (asList(pools[k]).join("、") || "（待补充）");
    })
    .join("\n\n");

  var hasSignal = Boolean(title !== "未命名游戏" || pitch || fantasy || experience || coreLoop.length);
  if (!hasSignal) return "";

  return "# " + title + "\n\n"
    + "> 一句话 Pitch：" + orPending(pitch) + "\n\n"
    + "## 1. 核心幻想\n" + orPending(fantasy) + "\n\n"
    + "## 2. 核心体验\n" + orPending(experience) + "\n\n"
    + "## 3. 核心玩法循环\n" + (coreLoop.length ? coreLoop.join(" → ") : "（待补充）") + "\n\n"
    + "## 4. 关键词池\n" + poolBlock + "\n\n"
    + "## 5. 差异化亮点\n" + orPending(asString(state.differentiator)) + "\n\n"
    + "## 6. MVP 范围\n**本次会做（必须）**\n" + bullets(asList(mvp.must)) + "\n\n"
    + "**主动裁剪**\n" + bullets(asList(mvp.cut)) + "\n\n"
    + "## 7. 风险提示\n" + bullets(asList(state.risks)) + "\n\n"
    + "## 游戏宪法\n> 不可漂移项。后续任何改动需明确确认。\n"
    + bullets(asList(state.constitution)) + "\n";
}

module.exports.gddFromState = gddFromState;
