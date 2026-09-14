function filled(s) {
  return Boolean(s && String(s).trim());
}

function line(s, complete) {
  var t = String(s || "").trim();
  if (t) return t;
  return complete ? "" : "（未写）";
}

function push(lines, text) {
  if (text) lines.push(text);
}

function poolLines(pools, complete) {
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
    return pair[1] + "：" + (words.length ? words.join("、") : (complete ? "本游戏无此项，不单列。" : "（未写）"));
  });
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
  push(constitution, "核心幻想：" + line(c.coreFantasy || model.coreFantasy, complete));
  push(constitution, "核心循环：" + line(c.coreLoop || loop.micro, complete));
  push(constitution, "美术规则：" + line(c.artRule || model.aesthetic, complete));
  push(constitution, "内容边界：" + line(c.contentBoundary, complete));
  push(constitution, "呈现边界：" + line(c.presentationBoundary || pres.dimension, complete));
  if (Array.isArray(c.extras)) {
    c.extras.filter(Boolean).forEach(function (x) { constitution.push(x); });
  }

  var what = [];
  push(what, line(model.coreExperience, complete));
  push(what, "主情感：" + line(model.coreEmotion, complete));
  push(what, "禁止情感：" + line(model.forbiddenEmotion, complete));
  push(what, line([model.coreFantasy, model.playerIdentity].filter(filled).join("。"), complete));
  push(what, "差异化：" + line(model.differentiator, complete));
  var borrow = Array.isArray(refs.borrow) ? refs.borrow.filter(Boolean) : [];
  var avoid = Array.isArray(refs.avoid) ? refs.avoid.filter(Boolean) : [];
  push(what, "借鉴：" + (borrow.length ? borrow.join("、") : line("", complete)));
  push(what, "刻意避开：" + (avoid.length ? avoid.join("、") : line("", complete)));

  var how = [];
  push(how, "核心动作：" + line(model.coreAction, complete));
  push(how, "微循环：" + line(loop.micro, complete));
  push(how, "中循环：" + line(loop.mid, complete));
  push(how, "宏循环：" + line(loop.macro, complete));
  if (mechanics.length) {
    mechanics.forEach(function (m, i) { how.push((i + 1) + ". " + m); });
  } else {
    push(how, "机制：" + line("", complete));
  }
  push(how, "奖励：" + line(model.reward, complete));

  var win = [];
  push(win, "胜利：" + line(model.winRule, complete));
  push(win, "失败：" + line(model.loseRule, complete));
  push(win, "重玩：" + line(model.replayMotivation, complete));

  var world = [];
  push(world, line(model.world, complete));
  push(world, "叙事：" + line(model.narrative, complete));
  push(world, "视听：" + line(model.aesthetic, complete));
  push(world, "手感：" + line(model.gameFeel, complete));
  push(world, "高光：" + line(model.highlight, complete));

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

  return [
    { id: "constitution", title: "游戏宪法", lines: constitution.filter(Boolean) },
    { id: "what", title: "这是什么游戏", lines: what.filter(Boolean) },
    { id: "how", title: "怎么玩", lines: how.filter(Boolean) },
    { id: "win", title: "胜利与失败", lines: win.filter(Boolean) },
    { id: "world", title: "世界与美学", lines: world.filter(Boolean) },
    { id: "pools", title: "关键词池", lines: poolLines(model.keywordPools, complete) },
    { id: "presentation", title: "呈现与资产", lines: present.filter(Boolean) },
    { id: "difficulty", title: "难度与心流", lines: difficulty.filter(Boolean) },
  ];
}

module.exports.sectionsFromModel = sectionsFromModel;
