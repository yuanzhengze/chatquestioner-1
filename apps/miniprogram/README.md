# chat-questioner 竖屏微信小程序

第一版只做共创对话：NewBee 形象 + 流式回复 + 选项卡片 + 底部输入。后端仍是仓库里的 Fastify（`pnpm dev:server`）。

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

4. 模拟器默认请求 `http://127.0.0.1:8420`。真机预览时把 [config.ts](config.ts) 改成电脑局域网 IP，例如 `http://192.168.1.8:8420`，并保证手机和电脑同一 Wi-Fi。

## 改完共享逻辑后

`@cq/avatar`、SSE 解析、baseline 推导在 `lib/shared.js`。改了这些源文件后重新打包：

```bash
pnpm bundle:miniprogram
```

不要手改 `lib/shared.js`。
