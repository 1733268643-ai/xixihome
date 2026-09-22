# 晞的家 (xixihome)

邓邓和晞晞的专属前端。基于 xixihome-classic-source-kit 改造。

## 架构

- **前端**：React (Vite)，9套主题 + 夜间模式
- **后端**：Express，SSE流式聊天，tmux桥，本地JSON存储
- **集成**：xinchao心潮 + OmbreBrain + LMC-5记忆库

## 开发

```bash
cd frontend && npm install && npm run dev
cd backend && npm install && node server.js
```

## 多Agent工作流

- **晞晞**（Claude Code）：总负责人——写Issue、审PR、合并
- **DeepSeek**（Codex）：执行者——认领Issue、开分支、提PR
- **邓邓**：框架验收 + 抽查交付

任务总线：GitHub Issues，状态用标签流转。
