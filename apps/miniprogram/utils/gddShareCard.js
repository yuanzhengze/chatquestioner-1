/**
 * 预览页和共创卡片共用的分享图。5:4，避免不设 imageUrl 时退回整页截屏。
 */
var SHARE_W = 500;
var SHARE_H = 400;

function wrapText(ctx, text, maxWidth, maxLines) {
  var raw = String(text || "").trim();
  if (!raw) return [];
  var lines = [];
  var line = "";
  for (var i = 0; i < raw.length; i++) {
    var ch = raw.charAt(i);
    var next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) {
        line = "";
        break;
      }
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    var last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth) {
      last = last.slice(0, -1);
    }
    if (raw.length > last.length) lines[maxLines - 1] = last + "…";
  }
  return lines;
}

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  ctx.fill();
}

function drawShareCard(ctx, chrome, title, pitch, logo) {
  ctx.fillStyle = chrome.canvas;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.fillStyle = chrome.brand;
  ctx.fillRect(0, 0, SHARE_W, 6);
  fillRoundRect(ctx, 28, 28, 132, 36, 4);
  ctx.fillStyle = chrome.brandOn;
  ctx.font = "20px sans-serif";
  ctx.fillText("游戏文档", 48, 53);
  if (logo && typeof ctx.drawImage === "function") {
    ctx.drawImage(logo, SHARE_W - 116, 20, 88, 88);
  }
  ctx.fillStyle = chrome.text;
  ctx.font = "bold 40px sans-serif";
  var titleLines = wrapText(ctx, title || "未命名游戏", SHARE_W - 56, 3);
  var y = 128;
  for (var i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], 28, y);
    y += 50;
  }
  if (pitch) {
    ctx.fillStyle = chrome.textSecondary;
    ctx.font = "22px sans-serif";
    var pitchLines = wrapText(ctx, pitch, SHARE_W - 56, 2);
    y += 8;
    for (var j = 0; j < pitchLines.length; j++) {
      ctx.fillText(pitchLines[j], 28, y);
      y += 32;
    }
  }
  ctx.fillStyle = chrome.brand;
  ctx.font = "20px sans-serif";
  ctx.fillText("NewBee × ForgeaX", 28, SHARE_H - 36);
}

function loadShareLogo(canvas, src) {
  return new Promise(function (resolve) {
    if (!canvas || typeof canvas.createImage !== "function") {
      resolve(null);
      return;
    }
    var done = false;
    var finish = function (img) {
      if (done) return;
      done = true;
      resolve(img);
    };
    var timer = setTimeout(function () { finish(null); }, 800);
    var img = canvas.createImage();
    img.onload = function () {
      clearTimeout(timer);
      finish(img);
    };
    img.onerror = function () {
      clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

/** 把分享图画到页面上的 #shareCard，返回临时路径。画不出来就空串，分享仍可发出。 */
function captureShareCard(page, chrome, logoSrc, title, pitch) {
  return new Promise(function (resolve) {
    var draw = function (attempt) {
      page.createSelectorQuery()
        .select("#shareCard")
        .fields({ node: true, size: true })
        .exec(function (res) {
          var canvas = res && res[0] && res[0].node;
          if (!canvas) {
            if (attempt < 1) {
              setTimeout(function () { draw(attempt + 1); }, 80);
              return;
            }
            resolve("");
            return;
          }
          var info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
          var dpr = Number(info.pixelRatio) || 2;
          canvas.width = SHARE_W * dpr;
          canvas.height = SHARE_H * dpr;
          var ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve("");
            return;
          }
          ctx.scale(dpr, dpr);
          loadShareLogo(canvas, logoSrc).then(function (logo) {
            drawShareCard(ctx, chrome, title, pitch, logo);
            wx.canvasToTempFilePath({
              canvas: canvas,
              fileType: "jpg",
              quality: 0.92,
              success: function (r) { resolve(r.tempFilePath || ""); },
              fail: function () { resolve(""); },
            });
          });
        });
    };
    if (typeof wx.nextTick === "function") wx.nextTick(function () { draw(0); });
    else draw(0);
  });
}

module.exports.wrapText = wrapText;
module.exports.captureShareCard = captureShareCard;
module.exports.SHARE_W = SHARE_W;
module.exports.SHARE_H = SHARE_H;
