function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 行内重点：品牌强调 #C5DD78 底、字 #1A1C1F。半截 `**` 不匹配，流式时保持原文。 */
function inline(s) {
  return escapeHtml(s).replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="color:#1A1C1F;background:#C5DD78;padding:0 4px;border-radius:8px;font-weight:600">$1</strong>',
  );
}

function quoteHtml(inner) {
  return (
    '<div style="background:#222326;border-left:3px solid #C5DD78;padding:8px 12px;border-radius:12px;margin:8px 0;color:#EDEDED;line-height:1.65;font-size:14px">' +
    inner +
    "</div>"
  );
}

/**
 * Markdown 子集 → 小程序 rich-text HTML。对话与 GDD 共用：正文 / **高亮** / > 引用卡 / 标题 / 列表。
 * opts.chat：聊天气泡用。正文和用户气泡同一套 15px / 22px，段首段尾不加外边距，气泡上下留白只由气泡自己给。
 */
function mdToHtml(md, opts) {
  var chat = Boolean(opts && opts.chat);
  var body = chat
    ? "font-size:15px;line-height:22px;font-weight:400;color:#EDEDED;margin:0"
    : "font-size:15px;line-height:1.65;color:#EDEDED;margin:8px 0";
  var item = chat
    ? "font-size:15px;line-height:22px;font-weight:400;color:#EDEDED;margin:0"
    : "font-size:14px;line-height:1.65;color:#EDEDED;margin:2px 0";
  var gap = chat ? ";margin-top:6px" : "";
  var lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  var out = [];
  var inList = false;
  var quoteBuf = [];

  function closeList() {
    if (inList) {
      out.push("</div>");
      inList = false;
    }
  }

  function flushQuote() {
    if (!quoteBuf.length) return;
    out.push(quoteHtml(quoteBuf.map(inline).join("<br/>")));
    quoteBuf = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, "");
    if (line.indexOf("> ") === 0) {
      closeList();
      quoteBuf.push(line.slice(2));
      continue;
    }
    flushQuote();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (line.indexOf("# ") === 0) {
      closeList();
      out.push('<div style="font-size:16px;font-weight:500;color:#EDEDED;margin:0 0 12px">' + inline(line.slice(2)) + "</div>");
      continue;
    }
    if (line.indexOf("## ") === 0) {
      closeList();
      out.push('<div style="font-size:15px;font-weight:500;color:#C5DD78;margin:16px 0 8px">' + inline(line.slice(3)) + "</div>");
      continue;
    }
    if (line.indexOf("- ") === 0) {
      if (!inList) {
        out.push('<div style="' + (chat ? "padding-left:0;margin:0" : "padding-left:4px;margin:4px 0") + (chat && out.length ? gap : "") + '">');
        inList = true;
      }
      out.push('<div style="' + item + '">· ' + inline(line.slice(2)) + "</div>");
      continue;
    }
    closeList();
    out.push('<div style="' + body + (chat && out.length ? gap : "") + '">' + inline(line) + "</div>");
  }
  flushQuote();
  closeList();
  return out.join("");
}

module.exports.mdToHtml = mdToHtml;
