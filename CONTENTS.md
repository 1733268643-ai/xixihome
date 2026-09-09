# 内容清单

## 代码

| 目录 | 内容 |
| --- | --- |
| `frontend/` | React/Vite 旧版设计与全部页面实现，包括聊天、内在、星图云图、日历、更多、阅读、音乐、机房、工具、PWA 静态资源和窗口/模型 UI。 |
| `backend/` | Express API、模型网关、对话与图片桥、Claude/Codex App Server、审批、记忆、GitHub 同步、心潮/OB、Bark、设备、天气与机房状态。 |
| `scripts/` | 可选的 Claude/Codex tmux 桥接脚本模板。 |

## 未打包的数据与独立项目

| 项目 | 处理方式 |
| --- | --- |
| 聊天、记忆、日记、图片、数据库、日志 | 全部剔除，买家部署后自行产生。 |
| 密钥、域名、账号、定位、SSH/Cloudflare 配置 | 全部剔除。 |
| 心潮 Dynamic Mind | 仅在 `integrations/README.md` 提供仓库和连接变量。 |
| Ombre Brain | 仅提供仓库和连接变量；商业使用须自行取得相应许可。 |
| StackChan / 小克 | 仅提供上游仓库和 MCP 连接变量。 |
| XixiVoice | 仅提供仓库和连接建议，不打包源码。 |
