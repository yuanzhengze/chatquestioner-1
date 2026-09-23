/** 预览页把完整 Markdown 写成可转发文件。不带聊天。 */

var UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

function sanitizeExportBase(title) {
  var cleaned = String(title || "")
    .replace(UNSAFE_NAME, "")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .trim();
  return cleaned || "未命名游戏";
}

function gddExportFileName(title, ext) {
  var e = ext === "txt" ? "txt" : "md";
  return sanitizeExportBase(title) + "-gdd." + e;
}

function joinUserDataPath(root, name) {
  var r = String(root || "").replace(/[/\\]+$/, "");
  return r + "/" + name;
}

function errMsgOf(err) {
  return String((err && (err.errMsg || err.message)) || err || "");
}

function isShareCancel(err) {
  return /cancel/i.test(errMsgOf(err));
}

function isDevtoolsShareUnsupported(err) {
  var msg = errMsgOf(err);
  return /开发者工具暂时不支持|暂时不支持此 API/i.test(msg);
}

/**
 * 同一拍里先写 .md 和 .txt，再调分享（必须仍在 tap 同步路径里发起第一次分享）。
 * .md 被客户端拒则立刻改发 .txt。用户取消不重试、不报失败。
 */
function shareGddMarkdown(opts) {
  var markdown = String(opts.markdown || "");
  var writeFileSync = opts.writeFileSync;
  var shareFileMessage = opts.shareFileMessage;
  var onFail = typeof opts.onFail === "function" ? opts.onFail : function () {};
  var onUnsupported = typeof opts.onUnsupported === "function" ? opts.onUnsupported : onFail;
  var userDataPath = String(opts.userDataPath || "");

  if (!markdown.trim()) return { ok: false, reason: "empty" };
  if (typeof writeFileSync !== "function" || typeof shareFileMessage !== "function") {
    onFail();
    return { ok: false, reason: "api" };
  }

  var mdName = gddExportFileName(opts.title, "md");
  var txtName = gddExportFileName(opts.title, "txt");
  var mdPath = joinUserDataPath(userDataPath, mdName);
  var txtPath = joinUserDataPath(userDataPath, txtName);

  try {
    writeFileSync(mdPath, markdown, "utf8");
    writeFileSync(txtPath, markdown, "utf8");
  } catch (e) {
    onFail();
    return { ok: false, reason: "write" };
  }

  function send(filePath, fileName, onShareFail) {
    try {
      shareFileMessage({
        filePath: filePath,
        fileName: fileName,
        success: function () {},
        fail: onShareFail,
      });
    } catch (e) {
      onShareFail(e);
    }
  }

  send(mdPath, mdName, function (err) {
    if (isShareCancel(err)) return;
    if (isDevtoolsShareUnsupported(err)) {
      onUnsupported();
      return;
    }
    send(txtPath, txtName, function (err2) {
      if (isShareCancel(err2)) return;
      if (isDevtoolsShareUnsupported(err2)) {
        onUnsupported();
        return;
      }
      onFail();
    });
  });

  return { ok: true, fileName: mdName };
}

/** 预览页和共创卡片共用。规则在 shareGddMarkdown：先 .md，被拒再 .txt，取消不报失败。 */
function sendGddFile(title, markdown) {
  var wxApi = typeof wx !== "undefined" ? wx : null;
  if (!wxApi || !wxApi.env) {
    return { ok: false, reason: "api" };
  }
  var result = shareGddMarkdown({
    title: title,
    markdown: markdown,
    userDataPath: wxApi.env.USER_DATA_PATH,
    writeFileSync: function (filePath, data, encoding) {
      wxApi.getFileSystemManager().writeFileSync(filePath, data, encoding);
    },
    shareFileMessage: function (opts) {
      wxApi.shareFileMessage(opts);
    },
    onFail: function () {
      wxApi.showToast({ title: "文件没发出去，可以先复制全文", icon: "none" });
    },
    onUnsupported: function () {
      wxApi.showToast({ title: "模拟器发不了，请用真机", icon: "none" });
    },
  });
  if (!result.ok && result.reason === "empty") {
    wxApi.showToast({ title: "还没有文档可导出", icon: "none" });
  }
  return result;
}

module.exports = {
  sanitizeExportBase: sanitizeExportBase,
  gddExportFileName: gddExportFileName,
  joinUserDataPath: joinUserDataPath,
  isShareCancel: isShareCancel,
  isDevtoolsShareUnsupported: isDevtoolsShareUnsupported,
  shareGddMarkdown: shareGddMarkdown,
  sendGddFile: sendGddFile,
};
