# 可选终端桥模板

本目录不包含任何终端账号、tmux 会话、历史记录或远程访问配置。

- `xixihome-stop-hook.sh`：将 Claude Code 一轮完成的文本同步到 XixiHome。
- `xixihome-tool-hook.sh`：将工具调用摘要同步到 XixiHome。
- `xixihome-permission-hook.sh`：把 Claude Code 的审批请求交给 XixiHome 手机端；超时或故障时回退到终端原生审批。
- `xixihome-send-image.sh`：从终端把本机图片以 `multipart` 方式传给 XixiHome；前端只接收服务器生成的媒体 URL。
- `bridge-listener.sh` / `bridge-injector.mjs`：连接心潮的可选事件队列。

启用前请先设置 `backend/.env` 的 `BRIDGE_MACHINE_TOKEN`，并设置：

```bash
export XIXIHOME_ROOT=/opt/xixihome-classic
export XIXIHOME_API_URL=http://127.0.0.1:3001
export BRIDGE_TMUX_SESSION=xixihome
```

将 `BRIDGE_TMUX_SESSION` 改为自己的 Claude 或 Codex tmux 会话名即可。所有脚本都应在受控主机执行，且只连接回环地址或自己的 HTTPS 后端。
