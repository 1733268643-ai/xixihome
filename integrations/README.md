# 外部服务接入（仅地址与连接方式）

本交付包不再分发下列独立项目的源码、镜像、数据或凭据。XixiHome 的相关前后端适配代码仍在本包中：只要填写 `backend/.env` 并部署自己的服务，页面会自动显示可用状态。

## 1. 心潮 · Dynamic Mind

- 仓库：[tianyupaipai-cmd/xinchao-dynamic-mind](https://github.com/tianyupaipai-cmd/xinchao-dynamic-mind)
- 许可证：MIT（以仓库当前 `LICENSE` 为准）。
- 用途：十二驱动力、念头、疲惫/睡眠、梦境余韵、窗口短态、连接桥、Bark 事件回流。

XixiHome 连接变量：

```env
XINCHAO_URL=https://xinchao.example.com
XINCHAO_TOKEN=<心潮 SERVICE_TOKEN>
# 可选。仅在你的部署已启用事件入口时设置：
XINCHAO_EVENT_PATH=/v1/event
```

XixiHome 会读取 `/v1/state` 用于内在、星图和健康度；事件回流仅在 `XINCHAO_EVENT_PATH` 显式配置后发送。不要把 token 放到浏览器、URL 查询参数或静态前端中。

## 2. Ombre Brain（OB）

- 仓库：[P0luz/Ombre-Brain](https://github.com/P0luz/Ombre-Brain)
- 用途：长期记忆、检索、Breath 状态与记忆桶投影。
- 连接协议：受保护的 Streamable HTTP MCP。

XixiHome 连接变量：

```env
OMBRE_URL=https://ombre.example.com/mcp
OMBRE_TOKEN=<OB MCP token>
```

后端会用 `Authorization: Bearer` 与 MCP 服务通信；前端只能收到脱敏后的状态/搜索结果，永远不应得到 token 或数据目录路径。

> 商业交付注意：OB 仓库当前含非商业使用说明。此交付包没有包含、修改、再分发或再授权其源码；买家若要在商业产品中使用 OB，必须自行核对仓库当前许可证并向原作者取得需要的许可。

## 3. StackChan / 小克机器人

- MCP 网关仓库：[kisaragi-mochi/stackchan-mcp](https://github.com/kisaragi-mochi/stackchan-mcp)
- 硬件本体仓库：[stack-chan/stack-chan](https://github.com/stack-chan/stack-chan)
- 用途：设备状态、动作、说话、拍照等能力。

XixiHome 的 `backend/routes/connect.js` 以 MCP over HTTP 调用设备网关：

```env
STACKCHAN_MCP_URL=https://stackchan.example.com/mcp
STACKCHAN_MCP_TOKEN=<设备网关 Bearer token>
```

先在内网或受保护反向代理上运行网关，再由 XixiHome 后端代理调用。设备 token 只能存在网关与后端环境变量中；不要公开 ESP32、拍照上传或 MCP 端口。

## 4. XixiVoice（可选语音通话服务）

- 仓库：[tianyupaipai-cmd/pai-voice](https://github.com/tianyupaipai-cmd/pai-voice)
- 许可证：AGPL-3.0（以仓库当前 `LICENSE` 为准）。
- 用途：语音转录、发声、打断控制、通话状态。

XixiVoice 与 XixiHome 建议以独立 HTTPS 服务部署。XixiHome 前端/后端仅通过短期会话 ID 和受保护接口交换状态，不要向浏览器暴露模型 key、转录原音频、Base64 大文件或主机绝对路径。若将修改后的 XixiVoice 通过网络提供给他人使用，需遵守 AGPL-3.0 的对应源码提供义务。

## 5. 网易云、阅读、Bark、GitHub

这些均为可选适配器，不随包携带第三方内容或账号：

```env
NETEASE_MCP_URL=https://your-mcp.example.com/mcp
NETEASE_MCP_TOKEN=<token>
READING_API_URL=https://your-reading.example.com
READING_API_TOKEN=<token>
BARK_KEY=<device-key>
GITHUB_TOKEN=<read-only-token>
GITHUB_MEMORY_REPO=your-org/your-memory-repo
```

请使用最小权限 token。GitHub token 只需要读取目标仓库时，不要授予写入、组织管理或其他无关权限。
