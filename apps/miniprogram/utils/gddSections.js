function filled(s) {
  return Boolean(s && String(s).trim());
}

function line(s, complete) {
  var t = String(s || "").trim();
  if (t) return t;
  return complete ? "" : "（未写）";
}

function push(lines, id, text) {
  if (!text) return;
  lines.push({ id: id, text: text });
}

function labeled(id, label, value, complete) {
  var t = String(value == null ? "" : value).trim();
  if (t && t !== "（未写）" && t !== "本游戏无此项，不单列。") {
    return { id: id, text: label + "：" + t };
  }
  if (complete) return null;
  return { id: id, text: label + "：" + "（未写）" };
}

function pushLabeled(arr, id, label, value, complete) {
  var row = labeled(id, label, value, complete);
  if (row) arr.push(row);
}

function asList(v) {
  return Array.isArray(v) ? v.map(function (x) { return String(x || "").trim(); }).filter(Boolean) : [];
}

function poolLines(pools) {
  var labels = [
    ["gameplay", "玩法"],
    ["emotion", "情绪"],
    ["world", "世界观"],
    ["visual", "视觉"],
    ["narrative", "叙事"],
    ["motivation", "玩家动机"],
  ];
  var p = pools && typeof pools === "object" ? pools : {};
  return labels.map(function (pair) {
    var words = Array.isArray(p[pair[0]]) ? p[pair[0]].filter(Boolean) : [];
    return words.length ? { id: "keywordPools." + pair[0], text: pair[1] + "：" + words.join("、") } : null;
  }).filter(Boolean);
}

function joinFantasy(model) {
  var parts = [model.coreFantasy, model.playerIdentity]
    .map(function (s) { return String(s || "").trim().replace(/。+$/g, ""); })
    .filter(filled);
  var uniq = [];
  parts.forEach(function (p) {
    var idx = -1;
    for (var i = 0; i < uniq.length; i++) {
      if (uniq[i].indexOf(p) >= 0 || p.indexOf(uniq[i]) >= 0) { idx = i; break; }
    }
    if (idx >= 0) {
      if (p.length > uniq[idx].length) uniq[idx] = p;
    } else {
      uniq.push(p);
    }
  });
  return uniq.join("。");
}

/** 把 GddModel 收成结果页章节卡。lines 为 {id,text}，供点行修改。 */
function sectionsFromModel(model, complete) {
  if (!model || typeof model !== "object") return [];
  var c = model.constitution && typeof model.constitution === "object" ? model.constitution : {};
  var loop = model.loop && typeof model.loop === "object" ? model.loop : {};
  var pres = model.presentation && typeof model.presentation === "object" ? model.presentation : {};
  var diff = model.difficulty && typeof model.difficulty === "object" ? model.difficulty : {};
  var refs = model.references && typeof model.references === "object" ? model.references : {};
  var mechanics = Array.isArray(model.mechanics) ? model.mechanics.filter(Boolean) : [];

  var constitution = [];
  pushLabeled(constitution, "constitution.coreFantasy", "核心幻想", c.coreFantasy || model.coreFantasy, complete);
  pushLabeled(constitution, "constitution.coreLoop", "核心循环", c.coreLoop || loop.micro, complete);
  pushLabeled(constitution, "constitution.artRule", "美术规则", c.artRule || model.aesthetic, complete);
  pushLabeled(constitution, "constitution.contentBoundary", "内容边界", c.contentBoundary, complete);
  pushLabeled(constitution, "constitution.presentationBoundary", "呈现边界", c.presentationBoundary || pres.dimension, complete);
  pushLabeled(constitution, "constitution.growthRule", "成长规则", c.growthRule, complete);
  pushLabeled(constitution, "constitution.worldRule", "世界观规则", c.worldRule, complete);
  pushLabeled(constitution, "constitution.uiRule", "UI 规则", c.uiRule, complete);

  var what = [];
  push(what, "coreExperience", line(model.coreExperience, complete));
  push(what, "coreEmotion", "主情感：" + line(model.coreEmotion, complete));
  if (filled(model.forbiddenEmotion)) {
    push(what, "forbiddenEmotion", "禁止情感：" + String(model.forbiddenEmotion).trim());
  }
  push(what, "coreFantasy", line(joinFantasy(model), complete));
  push(what, "differentiator", "差异化：" + line(model.differentiator, complete));
  var borrow = Array.isArray(refs.borrow) ? refs.borrow.filter(Boolean) : [];
  var avoid = Array.isArray(refs.avoid) ? refs.avoid.filter(Boolean) : [];
  if (borrow.length) push(what, "references.borrow", "借鉴：" + borrow.join("、"));
  if (avoid.length) push(what, "references.avoid", "刻意避开：" + avoid.join("、"));

  var how = [];
  push(how, "coreAction", "核心动作：" + line(model.coreAction, complete));
  var inter = model.interaction && typeof model.interaction === "object" ? model.interaction : {};
  push(how, "interaction.verb", "主要操作：" + line(inter.verb, complete));
  push(how, "interaction.target", "操作对象：" + line(inter.target, complete));
  push(how, "interaction.chain", "交互链路：" + line(inter.chain, complete));
  push(how, "interaction.feedback", "即时反馈：" + line(inter.feedback, complete));
  if (mechanics.length) {
    mechanics.forEach(function (m, i) { how.push({ id: "mechanics." + i, text: (i + 1) + ". " + m }); });
  } else {
    push(how, "mechanics", "机制：" + line("", complete));
  }

  var whyCard = [];
  push(whyCard, "loop.micro", "微循环：" + line(loop.micro, complete));
  push(whyCard, "loop.mid", "中循环：" + line(loop.mid, complete));
  push(whyCard, "loop.macro", "宏循环：" + line(loop.macro, complete));
  var longTerm = String(loop.longTerm || "").trim();
  if (longTerm && longTerm !== String(loop.macro || "").trim()) {
    push(whyCard, "loop.longTerm", "长线：" + longTerm);
  }
  push(whyCard, "coreDelight", "核心爽点：" + line(model.coreDelight, complete));
  push(whyCard, "reward", "奖励：" + line(model.reward, complete));
  var growth = model.growth && typeof model.growth === "object" ? model.growth : {};
  var unlocks = String(growth.unlocks || "").trim();
  var nearGoal = String(growth.nearGoal || "").trim();
  var afterTen = String(growth.afterTenMin || "").trim();
  if (growth.none && !unlocks && !nearGoal && !afterTen) {
    push(whyCard, "growth.none", "成长与变化：本游戏无独立成长");
  } else if (unlocks || nearGoal || afterTen) {
    if (unlocks) push(whyCard, "growth.unlocks", "越玩越多：" + unlocks);
    if (nearGoal) push(whyCard, "growth.nearGoal", "眼前目标：" + nearGoal);
    if (afterTen) push(whyCard, "growth.afterTenMin", "玩一阵之后：" + afterTen);
  }

  var win = [];
  push(win, "winRule", "胜利：" + line(model.winRule, complete));
  push(win, "loseRule", "失败：" + line(model.loseRule, complete));
  push(win, "replayMotivation", "重玩：" + line(model.replayMotivation, complete));

  var world = [];
  push(world, "world", line(model.world, complete));
  push(world, "narrative", "叙事：" + line(model.narrative, complete));
  push(world, "aesthetic", "视听：" + line(model.aesthetic, complete));
  push(world, "gameFeel", "手感：" + line(model.gameFeel, complete));
  var highs = asList(model.highlights);
  if (highs.length) {
    highs.forEach(function (h, i) { push(world, "highlights." + i, h); });
  } else if (filled(model.highlight)) {
    push(world, "highlights.0", String(model.highlight).trim());
  }

  var present = [];
  push(present, "presentation.where", "在哪玩：" + line(pres.where, complete));
  push(present, "presentation.dimension", "画面维度：" + line(pres.dimension, complete));
  push(present, "presentation.orientation", "屏幕方向：" + line(pres.orientation, complete));
  push(present, "presentation.players", "人数：" + line(pres.players, complete));
  push(present, "presentation.assets", "主要资产：" + line(pres.assets, complete));

  var difficulty = [];
  push(difficulty, "difficulty.ramp", "怎么上强度：" + line(diff.ramp, complete));
  push(difficulty, "difficulty.firstMinutes", "前几分钟：" + line(diff.firstMinutes, complete));
  push(difficulty, "difficulty.fatigue", "疲劳与缓解：" + line(diff.fatigue, complete));
  var flags = model.contentFlags && typeof model.contentFlags === "object" ? model.contentFlags : {};
  var detail = model.contentDetail && typeof model.contentDetail === "object" ? model.contentDetail : {};
  var content = [];
  if (filled(model.content)) push(content, "content.overview", String(model.content).trim());
  if (flags.levels) push(content, "content.levels", "关卡：" + line(detail.levels, complete));
  if (flags.boss) push(content, "content.boss", "Boss：" + line(detail.boss, complete));
  if (flags.progression) push(content, "content.progression", "养成 / 长线：" + line(detail.progression, complete));
  if (flags.multiplayer) push(content, "content.multiplayer", "多人：" + line(detail.multiplayer, complete));

  var howLines = how.filter(Boolean);
  var whyLines = whyCard.filter(Boolean);
  var sections = [
    { id: "constitution", title: "游戏宪法", lines: constitution.filter(Boolean) },
    { id: "what", title: "这是什么游戏", lines: what.filter(Boolean) },
    { id: "how", title: "怎么玩", lines: howLines },
    { id: "why", title: "为什么继续玩", lines: whyLines },
    { id: "win", title: "胜利与失败", lines: win.filter(Boolean) },
    { id: "world", title: "世界与美学", lines: world.filter(Boolean) },
  ];
  var pools = poolLines(model.keywordPools);
  if (pools.length) sections.push({ id: "pools", title: "关键词池", lines: pools });
  if (content.length) sections.push({ id: "content", title: "内容", lines: content.filter(Boolean) });
  sections.push({ id: "presentation", title: "呈现与资产", lines: present.filter(Boolean) });
  sections.push({ id: "difficulty", title: "难度与心流", lines: difficulty.filter(Boolean) });
  return sections;
}

module.exports.sectionsFromModel = sectionsFromModel;
