/**
 * 小程序 API 根地址怎么选。不读 wx，方便单测。
 * release / trial 用正式地址，不回退到本机。
 * platform 为 devtools，或根本没有运行环境（单测）时用 127.0.0.1。
 * 其他平台在开发版里视为真机，用局域网地址；地址空着就空着，不猜成 127.0.0.1。
 */
function resolveApiBase(input) {
  var envVersion = String((input && input.envVersion) || "");
  var platform = String((input && input.platform) || "").toLowerCase();
  var productionBase = String((input && input.productionBase) || "").trim();
  var lanBase = String((input && input.lanBase) || "").trim();
  var devtoolsBase = String((input && input.devtoolsBase) || "http://127.0.0.1:8420").trim();
  if (envVersion === "release" || envVersion === "trial") {
    return { base: productionBase, where: "production" };
  }
  if (platform === "devtools" || platform === "") {
    return { base: devtoolsBase, where: "devtools" };
  }
  return { base: lanBase, where: "device" };
}

module.exports = { resolveApiBase };
