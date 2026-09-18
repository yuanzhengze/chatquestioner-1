# chat-questioner 竖屏微信小程序

第一版是底部 Tab：首页 / 共创 / 我的。对话仍走本机 Fastify（`pnpm dev:server`）。

产品何时出卡、何时出文档，见仓库 [docs/PRODUCT.md](../../docs/PRODUCT.md)。

## 打开项目

1. 在仓库根安装依赖并打包小程序共享逻辑：

```bash
pnpm install
pnpm bundle:miniprogram
pnpm dev:server
```

2. 打开 **微信开发者工具** → 导入项目，目录选：

`chatquestioner-1/apps/miniprogram`

3. AppID 可用测试号 / 游客。详情里勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**。

4. 模拟器默认请求 `http://127.0.0.1:8420`。真机预览时把 [config.ts](config.ts) 改成电脑局域网 IP，例如 `http://192.168.1.8:8420`，并保证手机和电脑同一 Wi-Fi。封面图也走这个地址，真机还要允许 **downloadFile**。

结果页是 Interactive GDD：打开预览后封面会异步出现（角标「封面生成中」），不要点封面重生图，用「重新生成封面」。自己的预览里，点手风琴一句会高亮，右侧出现 ✎ 再去改。手风琴展开收回有动画；点另一块时视角跟到新标题。「分享给朋友」仍是小程序卡片；「导出 GDD 文件」把完整 Markdown 发给微信（选文件传输助手 ≈ 保存在微信，不写入系统「文件」App）。**模拟器会提示请用真机**，开发者工具不支持发文件。分享页第一版不能导出。产品规则见 [docs/PRODUCT.md](../../docs/PRODUCT.md) §3.7、§3.8、§5.6。

## 改完共享逻辑后

`@cq/avatar`、SSE 解析、baseline 推导在 `lib/shared.js`。改了这些源文件后重新打包：

```bash
pnpm bundle:miniprogram
```

不要手改 `lib/shared.js`。
