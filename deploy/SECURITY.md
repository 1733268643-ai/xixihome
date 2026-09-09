# 交付与部署安全清单

- 不要把 `.env`、`backend/data/`、`memories/`、上传媒体或数据库导出文件重新打进发行包。
- 轮换所有曾在旧环境中使用过的令牌：模型、GitHub、Supabase、Bark、MCP、Cloudflare、设备与桥接令牌。
- 前端不能保存模型 key、MCP token、SSH key、设备 token 或主机绝对路径。
- 生产环境启用 HTTPS，并给 `ACCESS_PASSWORD` 设置独立的强密码。
- 将外部服务限制在自己的域名、网络或访问控制范围内；不要将 OB、心潮、设备网关直接暴露为匿名公网服务。
- 交付前执行一次全文扫描，确认压缩包中没有 `sk-`、Bearer token、私有域名、用户邮箱或聊天记录。
