/**
 * 自定义导航页的顶部避让：内容行从胶囊顶部开始、至少和胶囊一样高，右侧让出胶囊。
 * 取不到胶囊时按状态栏推算，宁可多让，不让内容进状态栏或压到胶囊。
 */
function capsuleInset(win, menu) {
  var status = Number(win && win.statusBarHeight) || 0;
  var width = Number(win && win.windowWidth) || 0;
  var top = Number(menu && menu.top) || 0;
  var height = Number(menu && menu.height) || 0;
  var left = Number(menu && menu.left) || 0;
  if (top > 0 && height > 0 && left > 0 && width > left) {
    return { top: Math.max(top, status), height: height, right: width - left };
  }
  return { top: status + 4, height: 32, right: 96 };
}

module.exports = { capsuleInset: capsuleInset };
