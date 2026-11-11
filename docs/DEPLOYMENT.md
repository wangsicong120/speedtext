# 部署说明

## 推荐：同源 Workers + 静态资源

前后端源码分离，但浏览器与 API 使用同一站点，避免给只读边缘信息接口开放跨域权限。

1. 安装受支持的 Node.js，运行 `npm ci`。
2. 运行 `npx --no-install playwright install chromium`；Linux CI 使用 `npx --no-install playwright install --with-deps chromium`。
3. 运行 `npm run verify`，所有测试与部署 dry-run 通过后再继续。
4. 本人使用 Cloudflare 官方 CLI 登录：`npx --no-install cf auth login`。不要把密码、授权令牌或 `.env` 提交到仓库。
5. 核对 Cloudflare 账号，以及 `cloudflare.config.ts` 中的 Worker 名称 `speedtext`。实际部署会创建或更新所选账号的同名 Worker，不会自动迁移已有 Pages 项目或域名。
6. 确认要改变线上站点后，运行 `npm run deploy`。按 CLI 返回的地址访问，不在文档中预设账号/域名。

本次仓库发布只进行 GitHub 推送和 `cf deploy --dry-run`，不执行上述实际部署步骤。

### 配置要点

- `backend/worker.js` 是真正的 Worker 入口，`ASSETS` 绑定提供构建后的前端。
- `assets.runWorkerFirst: true` 让 API 与静态响应经过相同安全头处理；未知 API 和资源返回 404，不做 SPA 回退。
- Vite 使用仓库 root，以便 beta Cloudflare 插件找到配置。`scripts/vite-frontend.js` 在开发/构建时使用唯一页面源 `frontend/index.html`；生产根页面不是兼容跳转页。
- 本地配置 `remoteBindings: false`，不连接远程存储；没有 KV/D1/R2 或其他计费资源绑定。
- 默认开发模式显式设置 `LOCAL_DEV: true`，不展示 workerd 模拟的 IP/归属；生产和 Preview 不包含此标记。开发与构建根入口都直接使用新页面，不经兼容页跳转。
- compatibility date 为 `2026-11-10`。升级 `cf`/Vite/Miniflare 时应一并复测；当前 CLI 和插件是 beta，版本不能独立随意更新。
- 日志/trace 启用 10% 采样，查询参数脱敏，常规 invocation logs 关闭；应用错误日志仅包含事件与错误类型。平台仍按自己的政策处理请求元数据，不能解释为“所有平台日志零个人数据”。

构建产物位置：

```text
.cloudflare/output/v0/
  config.json
  workers/default/
    worker.config.json
    bundle/index.js
    assets/index.html
    assets/assets/*
```

`npm run build` 和 `npm run deploy:check` 都会检查 Worker bundle、ASSETS 绑定、完整页面入口、开发标记隔离和测试流隔离。不要修改生成目录来修复源码问题。

### 部署后的最小检查

- `/api/health` 返回 `{"ok":true,"version":"3.2.0"}`，`Cache-Control: no-store`；`/api/config` 的默认流量与时长限制均为 `0`。
- `/` 返回完整页面，带 CSP、`nosniff`、`DENY`、`no-referrer`；HTTPS 响应另带 HSTS。
- `/api/client` 能显示本站出口信息；跨站 API 请求失败，`/api/download` 为 404。
- 初次打开自动发起小型 IP/连通性检测，不启动下载；完成后约 30 秒刷新，关闭自动刷新后不再轮询，后台或离线暂停。
- 流量上限和自动停止开关默认关闭；两项都关闭时开始前有额外确认。已保存的显式开关可恢复，旧版隐式限制不会启用。
- 选择本人控制且支持 CORS 的小测试资源，确认停止后连接取消。不要用批量真实下载代替功能验证。

## 可选：独立静态前端

```bash
npm run build:static
```

只托管 `dist/client/`。使用相对资源路径，可放在 GitHub Pages 子路径或其他静态服务器。不要直接用 `file://` 打开模块页面。

- 下载、节点管理、主题、图表和自动第三方检测仍可用。
- `/api/client` 不存在或返回静态 HTML 时，当前 IP 自动回退到 ipip.net / ipinfo.io，必要时用 ipify，明确显示第三方来源；本站首响应用页面的同源图标测量，不冒充边缘 API 或 ICMP Ping。
- 本站 API 与 ipinfo 失败后冷却 5 分钟，截止时间不会随每轮检测后移；手动刷新或重新联网可强制重试。自动刷新可关闭并保存，IP 服务都失败时不妨碍下载与节点管理。
- `frontend/public/_headers` 会随构建复制。支持该约定的静态平台可读取它；GitHub Pages 等不读取时，必须由前置服务器另行设置安全响应头。HTML 的 referrer 策略不能替代完整 CSP/防嵌入响应头。
- 不建议把后端单独放在另一个域名并给 API 开放 `Access-Control-Allow-Origin: *`。如需不同站点，需重新设计允许源、隐私边界与测试，不属于当前配置。

## 本地验证与测试浏览器

`npm run dev:local` 为仅监听 `127.0.0.1:4173` 的 Node 服务器。`npm run dev` 使用 Cloudflare/Vite 本地运行环境，默认 `5173`。

Playwright 自行启动并关闭 `4173` 测试服务器，运行测试前不要占用该端口。已安装的 Chromium 可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定可执行文件；默认使用 Playwright 安装的固定浏览器版本。

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:\path\to\chrome-headless-shell.exe'
npm run verify
```

模拟下载流只由测试服务器显式 `--fixtures` 启用，不打包进 Worker；不要将此开发服务器暴露到公网。

## 回退

保留 Git 历史与上一版可用部署。需要回退时，通过新的 Git revert 提交或 Cloudflare 控制台的版本回退处理，不强制推送，不用 reset 删除他人修改。旧版资产保留不是安全回退方案，旧入口也不再加载旧脚本。
