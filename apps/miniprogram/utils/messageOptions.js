/**
 * 三选挂在最后一条助手消息上，以及 Option → User 变形要用到的纯计算。
 * 这里不碰 wx API，方便单测。
 */

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

/** 渲染用：最后一组选项，连同能不能点、哪一个正在被选。冻结中的也要画完收尾。 */
function optionsOf(messages) {
  var list = messages || [];
  for (var i = list.length - 1; i >= 0; i--) {
    var m = list[i];
    if (m && m.role === "assistant" && Array.isArray(m.options) && m.options.length) {
      return {
        options: m.options,
        live: m.optionsLive === true,
        pendingId: m.pendingId ? String(m.pendingId) : "",
      };
    }
  }
  return { options: [], live: false, pendingId: "" };
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

/** 飞行前先把真实气泡放进列表，但不显形：落点因此是真的，不用猜。 */
function placeGhosts(messages, content, display) {
  var next = (messages || []).slice();
  next.push({ role: "user", content: content || "", display: display || "", ghost: true });
  next.push({ role: "assistant", content: "" });
  return next;
}

/** 落地：用户气泡显形。 */
function revealGhosts(messages) {
  return (messages || []).map(function (m) {
    if (!m || !m.ghost) return m;
    var copy = Object.assign({}, m);
    delete copy.ghost;
    return copy;
  });
}

/** 该出「…」了。 */
function wakeThinking(messages) {
  var next = (messages || []).map(function (m) {
    return Object.assign({}, m);
  });
  for (var i = next.length - 1; i >= 0; i--) {
    if (next[i].role === "assistant") {
      if (!next[i].content) next[i].appear = true;
      return next;
    }
  }
  return next;
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

module.exports.isDirectionAsk = isDirectionAsk;
module.exports.liveOptions = liveOptions;
module.exports.optionsOf = optionsOf;
module.exports.attachLiveOptions = attachLiveOptions;
module.exports.freezeLiveOptions = freezeLiveOptions;
module.exports.markPending = markPending;
module.exports.placeGhosts = placeGhosts;
module.exports.revealGhosts = revealGhosts;
module.exports.wakeThinking = wakeThinking;
module.exports.preserveAssistantMeta = preserveAssistantMeta;
module.exports.morphDelta = morphDelta;
module.exports.frozenSpacer = frozenSpacer;
