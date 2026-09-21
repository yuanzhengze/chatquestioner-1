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

module.exports.hasQuestionMark = hasQuestionMark;
module.exports.splitQuestion = splitQuestion;
