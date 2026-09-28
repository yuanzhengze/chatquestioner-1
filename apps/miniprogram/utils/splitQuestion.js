/** 把助手这段话切成「铺垫 / 问句 / 收尾」，问句单独拿去加衬底。 */

var ENDERS = "\n。！？!?";

function hasQuestionMark(s) {
  return /[？?]/.test(String(s || ""));
}

function cleanQuestion(s) {
  return String(s || "")
    .replace(/^[\s>*\-]+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function splitQuestion(md) {
  var text = String(md || "");
  var mark = Math.max(text.lastIndexOf("？"), text.lastIndexOf("?"));
  if (mark < 0) return { lead: "", question: "", tail: "" };

  var start = 0;
  for (var i = mark - 1; i >= 0; i--) {
    if (ENDERS.indexOf(text.charAt(i)) >= 0) {
      start = i + 1;
      break;
    }
  }

  var question = cleanQuestion(text.slice(start, mark + 1));
  if (!question) return { lead: "", question: "", tail: "" };

  return {
    lead: text.slice(0, start).trim(),
    question: question,
    tail: text
      .slice(mark + 1)
      .replace(/^\*+/, "")
      .trim(),
  };
}

/**
 * 已经写进正文的引导问题。`> ❓` 或问号结尾的引用行会留在会话里，
 * 重新打开时不再靠内存里的 tintAsk。
 */
function markedQuestion(md) {
  var lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  var start = -1;
  var end = -1;
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i].trim();
    if (raw.indexOf(">") !== 0) continue;
    var body = raw.replace(/^>\s*/, "").replace(/\*\*/g, "").replace(/^❓\s*/, "").trim();
    var marked = /^❓/.test(raw.replace(/^>\s*/, "")) || /[？?]\s*$/.test(body);
    if (!marked || !body) continue;
    start = i;
    end = i;
    for (var j = i + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (next.indexOf(">") !== 0) break;
      if (/^>\s*[💡📌❓]/.test(next)) break;
      end = j;
    }
    break;
  }
  if (start < 0) return { lead: "", question: "", tail: "" };
  var question = lines.slice(start, end + 1).map(function (line) {
    return line.trim().replace(/^>\s*/, "").replace(/^❓\s*/, "").replace(/\*\*/g, "").trim();
  }).filter(Boolean).join("");
  return {
    lead: lines.slice(0, start).join("\n").trim(),
    question: question,
    tail: lines.slice(end + 1).join("\n").trim(),
  };
}

module.exports.hasQuestionMark = hasQuestionMark;
module.exports.splitQuestion = splitQuestion;
module.exports.markedQuestion = markedQuestion;
