function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 行内重点：荧光笔（对齐网页 .cq-md strong / F9）。半截 `**` 不匹配，流式时保持原文。 */
function inline(s) {
  return escapeHtml(s).replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="color:#E8943A;background:#FBE7CC;padding:0 4px;border-radius:4px;font-weight:600">$1</strong>',
  );
}

function quoteHtml(inner) {
  return (
    '<div style="background:#F3EDE3;border-left:3px solid #E8943A;padding:8px 12px;border-radius:8px;margin:8px 0;color:#3A3530;line-height:1.6;font-size:14px">' +
    inner +
    "</div>"
  );
}

/** Markdown 子集 → 小程序 rich-text HTML。对话与 GDD 共用：正文 / **高亮** / > 引用卡 / 标题 / 列表。 */
function mdToHtml(md) {
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
      out.push('<div style="font-size:18px;font-weight:700;color:#3A3530;margin:0 0 12px">' + inline(line.slice(2)) + "</div>");
      continue;
    }
    if (line.indexOf("## ") === 0) {
      closeList();
      out.push('<div style="font-size:15px;font-weight:600;color:#E8943A;margin:16px 0 8px">' + inline(line.slice(3)) + "</div>");
      continue;
    }
    if (line.indexOf("- ") === 0) {
      if (!inList) {
        out.push('<div style="padding-left:4px;margin:4px 0">');
        inList = true;
      }
      out.push('<div style="font-size:14px;line-height:1.65;color:#3A3530;margin:2px 0">· ' + inline(line.slice(2)) + "</div>");
      continue;
    }
    closeList();
    out.push('<div style="font-size:14px;line-height:1.65;color:#3A3530;margin:8px 0">' + inline(line) + "</div>");
  }
  flushQuote();
  closeList();
  return out.join("");
}

module.exports.mdToHtml = mdToHtml;
