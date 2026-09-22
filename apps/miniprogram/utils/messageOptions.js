/**
 * 三选挂在最后一条助手消息上，以及 Option → User 变形要用到的纯计算。
 * 这里不碰 wx API，方便单测。
 */

var splitQuestion = require("./splitQuestion.js");

/** 定稿三选、补丁三选是「做决定」，不是问方向，问句不加衬底。 */
function isDirectionAsk(options) {
  var list = Array.isArray(options) ? options : [];
  if (!list.length) return false;
  var blob = list
    .map(function (o) {
      return (o && o.label ? o.label : "") + "\n" + (o && o.detail ? o.detail : "");
    })
    .join("\n");
  if (/应用这些改动/.test(blob) && /再改改说法/.test(blob)) return false;
  if (/定稿|写成设计文档/.test(blob) && /(改一|再挖)/.test(blob)) return false;
  return true;
}

/**
 * 问句该不该加衬底。
 * 方向三选出来之后以选项为准；流式还没出卡时，问号一出现就按最终版式排，
 * 免得选项挂上的那一帧整段突然换成带底的版本。
 * 定稿 / 补丁三选、以及没有选项的开场，出卡或说完后不加衬底。
 */
function shouldTintAsk(message, streaming) {
  if (!message || message.role === "user") return false;
  if (!splitQuestion.hasQuestionMark(message.content)) return false;
  if (message.tintAsk === true || isDirectionAsk(message.options)) return true;
  var hasOpts = Array.isArray(message.options) && message.options.length > 0;
  return streaming === true && !hasOpts;
}

/** 还能点的三选。没有就是空数组。 */
function liveOptions(messages) {
  var list = messages || [];
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i];
    if (m && m.role === "assistant" && m.optionsLive && Array.isArray(m.options) && m.options.length) {
      return m.options;
    }
  }
  return [];
}

/**
 * 渲染用：最后一组选项，连同它挂在第几条、能不能点、哪一个正在被选。
 * `at` 决定选项块画在哪条消息后面 —— 它必须排在用户气泡**前面**，
 * 收起它的高度才是把上方对话往下让，而不是把刚落地的气泡顶走。
 */
function optionsOf(messages) {
  var list = messages || [];
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i];
    if (m && m.role === "assistant" && Array.isArray(m.options) && m.options.length) {
      return {
        options: m.options,
        at: i,
        live: m.optionsLive === true,
        pendingId: m.pendingId ? String(m.pendingId) : "",
      };
    }
  }
  return { options: [], at: -1, live: false, pendingId: "" };
}

function attachLiveOptions(messages, options) {
  var next = (messages || []).map(function (m) {
    return Object.assign({}, m);
  });
  var opts = Array.isArray(options) ? options : [];
  for (var i = next.length - 1; i >= 0; i--) {
    if (next[i].role !== "assistant") continue;
    if (opts.length) {
      next[i].options = opts;
      next[i].optionsLive = true;
      if (isDirectionAsk(opts)) next[i].tintAsk = true;
      else delete next[i].tintAsk;
    } else {
      delete next[i].options;
      delete next[i].optionsLive;
      delete next[i].tintAsk;
    }
    delete next[i].pendingId;
    return next;
  }
  return next;
}

/** 这一轮结束：选项节点全部撤掉，只留「问过方向」这个事实。 */
function freezeLiveOptions(messages) {
  return (messages || []).map(function (m) {
    if (!m || (!m.options && !m.optionsLive && !m.pendingId)) return m;
    var copy = Object.assign({}, m);
    var keepTint = copy.tintAsk === true || isDirectionAsk(copy.options);
    delete copy.options;
    delete copy.optionsLive;
    delete copy.pendingId;
    if (keepTint) copy.tintAsk = true;
    else delete copy.tintAsk;
    return copy;
  });
}

/** 点下去了：选中项交给固定层演，其余就地淡出，整组不再可点。 */
function markPending(messages, id) {
  var next = (messages || []).map(function (m) {
    return Object.assign({}, m);
  });
  for (var i = next.length - 1; i >= 0; i--) {
    if (next[i].optionsLive) {
      next[i].pendingId = id || "";
      next[i].optionsLive = false;
      return next;
    }
  }
  return next;
}

/**
 * 飞行前先把真实气泡放进列表，但不显形：落点因此是真的，不用猜。
 * 「…」从一开始就带上，占的高度才和探针量的一致，显形时不会再撑一行。
 */
function placeGhosts(messages, content, display) {
  var next = (messages || []).slice();
  next.push({ role: "user", content: content || "", display: display || "", ghost: true });
  next.push({ role: "assistant", content: "", appear: true, ghost: true });
  return next;
}

/** 显形。给 role 就只显形那一种，落地时先放用户气泡，「…」留到发请求那一步。 */
function revealGhosts(messages, role) {
  return (messages || []).map(function (m) {
    if (!m || !m.ghost) return m;
    if (role && m.role !== role) return m;
    var copy = Object.assign({}, m);
    delete copy.ghost;
    return copy;
  });
}

/** 流式刷新不能把已经挂上的选项和衬底冲掉。 */
function preserveAssistantMeta(prev, content) {
  var base = prev && typeof prev === "object" ? prev : {};
  var next = { role: "assistant", content: content || "" };
  if (Array.isArray(base.options) && base.options.length) next.options = base.options;
  if (base.optionsLive) next.optionsLive = true;
  if (base.pendingId) next.pendingId = base.pendingId;
  if (base.tintAsk) next.tintAsk = true;
  if (!next.content && base.appear) next.appear = true;
  return next;
}

/** 从选项卡到真实用户气泡的位移与目标尺寸。任一边量不到就返回 null，调用方跳过动画。 */
function morphDelta(fromRect, toRect) {
  if (!fromRect || !toRect) return null;
  var fl = Number(fromRect.left);
  var ft = Number(fromRect.top);
  var fw = Number(fromRect.width);
  var fh = Number(fromRect.height);
  var tl = Number(toRect.left);
  var tt = Number(toRect.top);
  var tw = Number(toRect.width);
  var th = Number(toRect.height);
  var all = [fl, ft, fw, fh, tl, tt, tw, th];
  for (var i = 0; i < all.length; i++) {
    if (!isFinite(all[i])) return null;
  }
  if (fw <= 0 || fh <= 0 || tw <= 0 || th <= 0) return null;
  return { dx: tl - fl, dy: tt - ft, width: tw, height: th };
}

/**
 * 插进来的两条气泡占多高，选项块就就地压掉多高。
 * 内容总高不变 → scroll-view 不钳制 scrollTop → 飞行期间上方一动不动。
 */
function frozenSpacer(optsHeight, insertHeight) {
  var box = Number(optsHeight);
  var insert = Number(insertHeight);
  if (!isFinite(box) || box <= 0) return -1;
  if (!isFinite(insert) || insert <= 0) return -1;
  return Math.max(0, box - insert);
}

/**
 * 和 app.wxss 的 --ease-out（cubic-bezier(0.2, 0, 0, 1)）同一条曲线。
 * 滚动必须跟选项飞行用同一条，否则气泡会在两段动画之间跳一下。
 */
function flyEase(t) {
  var x = Number(t);
  if (!isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  var u = x;
  for (var i = 0; i < 6; i++) {
    var cx = 3 * 0.2 * u * (1 - u) * (1 - u) + u * u * u;
    var dx = 0.6 * (1 - u) * (1 - 3 * u) + 3 * u * u;
    if (Math.abs(dx) < 1e-6) break;
    u -= (cx - x) / dx;
    if (u < 0) u = 0;
    if (u > 1) u = 1;
  }
  return u * u * (3 - 2 * u);
}

/**
 * 飞行这一段唯一的滚动计划。高度收起和「把尾巴带进屏幕」写在同一次 scrollTop 里，
 * 芯片落点用同一个 shift，后面不许再量一次、再跳一次。
 *
 * collapse：这一段还要收掉的高度（选项块剩余高度 + 下边距）。后面的气泡会因此上移。
 * tailGap：预留好的列表尾巴（用户气泡 + …）底边比可视区底边低多少。<= 0 表示已经在屏幕里。
 * pad：尾巴露进屏幕时，和可视区底边留的空隙。
 *
 * 尾巴已经在屏幕里：只滚掉 collapse，气泡停在原地。
 * 尾巴在屏幕下面：同一段里再往下滚，让它停在底边上方 pad 处，而不是飞完再跳到底。
 * 滚不掉的部分进 shift（负数 = 气泡还要往上走），芯片提前算进落点。
 */
function followPlan(scrollTop, collapse, tailGap, pad) {
  var top = Math.max(0, Number(scrollTop) || 0);
  var gone = Number(collapse);
  if (!isFinite(gone) || gone < 0) gone = 0;
  var gap = Number(tailGap);
  if (!isFinite(gap) || gap < 0) gap = 0;
  var slack = Number(pad);
  if (!isFinite(slack) || slack < 0) slack = 0;
  var extra = gap > 0 ? gap + slack : 0;
  var want = top - gone + extra;
  var next = Math.max(0, want);
  return { scrollTop: next, shift: top - next - gone };
}

/** 尾巴已在屏幕内时的特例，和旧调用点保持同一形状。 */
function settleDrift(scrollTop, freeze) {
  var plan = followPlan(scrollTop, freeze, 0, 0);
  return { scrollTop: plan.scrollTop, drift: plan.shift };
}

module.exports.isDirectionAsk = isDirectionAsk;
module.exports.shouldTintAsk = shouldTintAsk;
module.exports.liveOptions = liveOptions;
module.exports.optionsOf = optionsOf;
module.exports.attachLiveOptions = attachLiveOptions;
module.exports.freezeLiveOptions = freezeLiveOptions;
module.exports.markPending = markPending;
module.exports.placeGhosts = placeGhosts;
module.exports.revealGhosts = revealGhosts;
module.exports.preserveAssistantMeta = preserveAssistantMeta;
module.exports.morphDelta = morphDelta;
module.exports.frozenSpacer = frozenSpacer;
module.exports.settleDrift = settleDrift;
module.exports.followPlan = followPlan;
module.exports.flyEase = flyEase;
