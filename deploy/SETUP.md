# 部署说明

## 本地开发

后端：在 `backend/` 安装依赖，复制 `.env.example` 为 `.env`，执行 `npm run dev`。

前端：在 `frontend/` 安装依赖，复制 `.env.example` 为 `.env`，执行 `npm run dev`。当 `VITE_API_BASE` 为空时，前端走本地开发代理；生产环境应填写 HTTPS 后端地址后执行 `npm run build`。

## 生产环境

- 使用 Node.js 20+ 运行后端，反向代理暴露 HTTPS。
- 前端 `dist/` 可部署到任意静态站点或 Nginx。
- 后端 `.env` 权限应设置为仅运行账户可读。
- `ACCESS_PASSWORD` 不应留空；模型、数据库、MCP 和设备令牌只放后端环境变量。
- 需要持久化时配置 Supabase；不配置时聊天历史仅保存在进程内存中。

## 终端桥（可选）

`scripts/` 中的 hook 模板默认工作在 tmux 会话 `paihome`。部署前先配置 `backend/.env` 的 `BRIDGE_MACHINE_TOKEN`，然后按终端产品的 Hook 配置把相应脚本注册进去。

可用环境变量：

- `PAIHOME_ROOT`：本交付包所在的绝对路径。
- `PAIHOME_API_URL`：后端地址，默认 `http://127.0.0.1:3001`。
- `BRIDGE_TMUX_SESSION`：要同步到 PaiHome 的 tmux 会话名。
- `BRIDGE_URL` / `BRIDGE_MACHINE_TOKEN`：外部连接桥启用时使用。

桥接是可选能力。未配置时，聊天、日历、星图、机房和普通模型 API 仍可独立运行。
