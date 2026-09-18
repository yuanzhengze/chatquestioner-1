function filled(s) {
  return Boolean(s && String(s).trim());
}

function line(s, complete) {
  var t = String(s || "").trim();
  if (t) return t;
  return complete ? "" : "（未写）";
}

function pushLabeled(arr, label, value) {
  var t = String(value == null ? "" : value).trim();
  if (!t || t === "（未写）" || t === "本游戏无此项，不单列。") return;
  arr.push(label + "：" + t);
}

function push(lines, text) {
  if (text) lines.push(text);
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
    return words.length ? pair[1] + "：" + words.join("、") : "";
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

/** 把 GddModel 收成结果页章节卡。 */
function sectionsFromModel(model, complete) {
  if (!model || typeof model !== "object") return [];
  var c = model.constitution && typeof model.constitution === "object" ? model.constitution : {};
  var loop = model.loop && typeof model.loop === "object" ? model.loop : {};
  var pres = model.presentation && typeof model.presentation === "object" ? model.presentation : {};
  var diff = model.difficulty && typeof model.difficulty === "object" ? model.difficulty : {};
  var refs = model.references && typeof model.references === "object" ? model.references : {};
  var mechanics = Array.isArray(model.mechanics) ? model.mechanics.filter(Boolean) : [];

  var constitution = [];
  pushLabeled(constitution, "核心幻想", c.coreFantasy || model.coreFantasy);
  pushLabeled(constitution, "核心循环", c.coreLoop || loop.micro);
  pushLabeled(constitution, "美术规则", c.artRule || model.aesthetic);
  pushLabeled(constitution, "内容边界", c.contentBoundary);
  pushLabeled(constitution, "呈现边界", c.presentationBoundary || pres.dimension);
  pushLabeled(constitution, "成长规则", c.growthRule);
  pushLabeled(constitution, "世界观规则", c.worldRule);
  pushLabeled(constitution, "UI 规则", c.uiRule);

  var what = [];
  push(what, line(model.coreExperience, complete));
  push(what, "主情感：" + line(model.coreEmotion, complete));
  if (filled(model.forbiddenEmotion)) push(what, "禁止情感：" + String(model.forbiddenEmotion).trim());
  push(what, line(joinFantasy(model), complete));
  push(what, "差异化：" + line(model.differentiator, complete));
  var borrow = Array.isArray(refs.borrow) ? refs.borrow.filter(Boolean) : [];
  var avoid = Array.isArray(refs.avoid) ? refs.avoid.filter(Boolean) : [];
  if (borrow.length) push(what, "借鉴：" + borrow.join("、"));
  if (avoid.length) push(what, "刻意避开：" + avoid.join("、"));

  var how = [];
  push(how, "核心动作：" + line(model.coreAction, complete));
  var inter = model.interaction && typeof model.interaction === "object" ? model.interaction : {};
  push(how, "主要操作：" + line(inter.verb, complete));
  push(how, "操作对象：" + line(inter.target, complete));
  push(how, "交互链路：" + line(inter.chain, complete));
  push(how, "即时反馈：" + line(inter.feedback, complete));
  if (mechanics.length) {
    mechanics.forEach(function (m, i) { how.push((i + 1) + ". " + m); });
  } else {
    push(how, "机制：" + line("", complete));
  }

  var whyCard = [];
  push(whyCard, "微循环：" + line(loop.micro, complete));
  push(whyCard, "中循环：" + line(loop.mid, complete));
  push(whyCard, "宏循环：" + line(loop.macro, complete));
  var longTerm = String(loop.longTerm || "").trim();
  if (longTerm && longTerm !== String(loop.macro || "").trim()) {
    push(whyCard, "长线：" + longTerm);
  }
  push(whyCard, "核心爽点：" + line(model.coreDelight, complete));
  push(whyCard, "奖励：" + line(model.reward, complete));
  var growth = model.growth && typeof model.growth === "object" ? model.growth : {};
  var unlocks = String(growth.unlocks || "").trim();
  var nearGoal = String(growth.nearGoal || "").trim();
  var afterTen = String(growth.afterTenMin || "").trim();
  if (growth.none && !unlocks && !nearGoal && !afterTen) {
    push(whyCard, "成长与变化：本游戏无独立成长");
  } else if (unlocks || nearGoal || afterTen) {
    if (unlocks) push(whyCard, "越玩越多：" + unlocks);
    if (nearGoal) push(whyCard, "眼前目标：" + nearGoal);
    if (afterTen) push(whyCard, "玩一阵之后：" + afterTen);
  }

  var win = [];
  push(win, "胜利：" + line(model.winRule, complete));
  push(win, "失败：" + line(model.loseRule, complete));
  push(win, "重玩：" + line(model.replayMotivation, complete));

  var world = [];
  push(world, line(model.world, complete));
  push(world, "叙事：" + line(model.narrative, complete));
  push(world, "视听：" + line(model.aesthetic, complete));
  push(world, "手感：" + line(model.gameFeel, complete));
  var highs = asList(model.highlights);
  if (highs.length) {
    highs.forEach(function (h) { push(world, h); });
  } else if (filled(model.highlight)) {
    push(world, String(model.highlight).trim());
  }

  var present = [];
  push(present, "在哪玩：" + line(pres.where, complete));
  push(present, "画面维度：" + line(pres.dimension, complete));
  push(present, "屏幕方向：" + line(pres.orientation, complete));
  push(present, "人数：" + line(pres.players, complete));
  push(present, "主要资产：" + line(pres.assets, complete));

  var difficulty = [];
  push(difficulty, "怎么上强度：" + line(diff.ramp, complete));
  push(difficulty, "前几分钟：" + line(diff.firstMinutes, complete));
  push(difficulty, "疲劳与缓解：" + line(diff.fatigue, complete));
  var flags = model.contentFlags && typeof model.contentFlags === "object" ? model.contentFlags : {};
  var detail = model.contentDetail && typeof model.contentDetail === "object" ? model.contentDetail : {};
  var content = [];
  if (filled(model.content)) push(content, String(model.content).trim());
  if (flags.levels) push(content, "关卡：" + line(detail.levels, complete));
  if (flags.boss) push(content, "Boss：" + line(detail.boss, complete));
  if (flags.progression) push(content, "养成 / 长线：" + line(detail.progression, complete));
  if (flags.multiplayer) push(content, "多人：" + line(detail.multiplayer, complete));

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
