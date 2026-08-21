function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong style="color:#E8943A;font-weight:600">$1</strong>');
}

/** GDD Markdown → 小程序 rich-text 可用的 HTML。 */
function mdToHtml(md) {
  var lines = md.replace(/\r\n/g, "\n").split("\n");
  var out = [];
  var inList = false;
  function closeList() {
    if (inList) {
      out.push("</div>");
      inList = false;
    }
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, "");
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
    if (line.indexOf("> ") === 0) {
      closeList();
      out.push('<div style="background:#F3EDE3;border-left:3px solid #E8943A;padding:8px 12px;border-radius:8px;margin:8px 0;color:#3A3530;line-height:1.6;font-size:14px">' + inline(line.slice(2)) + "</div>");
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
  closeList();
  return out.join("");
}

module.exports.mdToHtml = mdToHtml;
