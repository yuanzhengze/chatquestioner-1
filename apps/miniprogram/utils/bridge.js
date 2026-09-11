/** Tab 之间不能带 query。协议、预填、待办动作走本机存储。 */

var AGREED_KEY = "nb.agreed";
var PENDING_PROMPT_KEY = "nb.pendingPrompt";
var PENDING_CHAT_KEY = "nb.pendingChat";

function loadAgreed() {
  try {
    return wx.getStorageSync(AGREED_KEY) === true;
  } catch (_e) {
    return false;
  }
}

function saveAgreed(value) {
  try {
    wx.setStorageSync(AGREED_KEY, value === true);
  } catch (_e) {
    // 存储失败不挡勾选的内存态；发送时会再读一次
  }
}

function setPendingPrompt(text) {
  try {
    wx.setStorageSync(PENDING_PROMPT_KEY, String(text || ""));
  } catch (_e) {
    // 预填失败时用户仍可手打
  }
}

function takePendingPrompt() {
  try {
    var text = wx.getStorageSync(PENDING_PROMPT_KEY);
    wx.removeStorageSync(PENDING_PROMPT_KEY);
    return typeof text === "string" ? text : "";
  } catch (_e) {
    return "";
  }
}

function setPendingChat(payload) {
  try {
    wx.setStorageSync(PENDING_CHAT_KEY, payload);
  } catch (_e) {
    // 动作丢失时用户可再点一次
  }
}

function takePendingChat() {
  try {
    var payload = wx.getStorageSync(PENDING_CHAT_KEY);
    wx.removeStorageSync(PENDING_CHAT_KEY);
    if (payload && typeof payload === "object") return payload;
    return null;
  } catch (_e) {
    return null;
  }
}

function goChat() {
  wx.switchTab({ url: "/pages/stage/index" });
}

module.exports = {
  loadAgreed: loadAgreed,
  saveAgreed: saveAgreed,
  setPendingPrompt: setPendingPrompt,
  takePendingPrompt: takePendingPrompt,
  setPendingChat: setPendingChat,
  takePendingChat: takePendingChat,
  goChat: goChat,
};
