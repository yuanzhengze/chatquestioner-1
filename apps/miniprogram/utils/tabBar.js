/**
 * 底栏显隐。switchTab 过程中立刻调经常失败，而且失败是异步的，
 * try/catch 接不住。失败就隔一小会儿再试，直到成功或次数用完。
 */
function applyTabBar(wxApi, hidden) {
  var name = hidden ? "hideTabBar" : "showTabBar";
  var left = 5;
  var call = function () {
    var fn = wxApi && wxApi[name];
    if (typeof fn !== "function") return;
    fn({
      animation: false,
      fail: function () {
        left -= 1;
        if (left > 0) setTimeout(call, 80);
      },
    });
  };
  call();
}

module.exports.applyTabBar = applyTabBar;
