// 晞晞的家 · 后端核心
// 架构参考 Bunny's Home：Express + 模型API + （可选）Supabase + 记忆压缩。
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { buildSystemPrompt, clearPersonaCache, getMemoryDocs } from './lib/persona.js';
import { chatComplete, chatStream, summarize, chatStreamCLI, chatCompleteCLI } from './lib/model.js';
import * as store from './lib/store.js';
import { updateSensorData, getEnvState, getEnvironmentSensation, buildEnvironmentPrompt } from './lib/environment.js';
import { fetchWeather } from './lib/weather.js';
import { reportActivity, reportChat, getDreamState, wake } from './lib/dream.js';
import { decayTick } from './lib/memoryDecay.js';
import { pushBark } from './lib/bark.js';
import { syncGitHubMemory } from './lib/githubMemorySync.js';
import toolsRouter, { handleActivityQuery } from './routes/tools.js';
import chatActionsRouter from './routes/chat-actions.js';
import { requireToolsSecret } from './lib/tools/auth.js';
import { getMindState, searchMemories, getMemoryMap, xinchaoConfigured, ombreConfigured, xinchaoEvent } from './lib/mind-client.js';
import lifeRouter from './routes/life.js';
import connectRouter from './routes/connect.js';
import * as bridgeChat from './lib/bridge-chat.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 静态文件（头像等）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __serverdir = dirname(fileURLToPath(import.meta.url));
app.use('/static', express.static(join(__serverdir, '..', 'cards')));

// 潮汐星港（XixiHome v2 前端）：后端直接托管构建产物；
// index.html 永远重新校验，带哈希的 assets 长缓存（老 Render _headers 的规则搬过来）。
const __v2dist = join(__serverdir, '..', 'frontend-v2', 'dist');
app.use(express.static(__v2dist, {
  index: false,
  setHeaders(res, path) {
    if (path.includes('/assets/')) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  },
}));

// ---- 配置（环境变量是默认值；模型 API 可以在配置页运行时覆盖）----
const cfg = {
  port: process.env.PORT || 3001,
  provider: process.env.MODEL_PROVIDER || 'openai',
  apiKey: process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '',
  baseUrl: process.env.MODEL_BASE_URL || process.env.ANTHROPIC_BASE_URL || '',
  accessPassword: process.env.ACCESS_PASSWORD || '',
  model: process.env.MODEL_NAME || 'claude-sonnet-4-6',
  // claude -p 后端：provider='claude-cli' 时用本机 Claude Code。工作目录里放晞晞的 CLAUDE.md/记忆更佳。
  claudeCliCwd: process.env.CLAUDE_CLI_CWD || '',
  claudeDisallowed: (process.env.CLAUDE_CLI_DISALLOWED_TOOLS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  allowedModels: (process.env.MODELS ||
    'claude-opus-4-6,claude-sonnet-4-6,claude-haiku-4-5-20251001')
    .split(',').map((s) => s.trim()).filter(Boolean),
  temperature: Number(process.env.TEMPERATURE || 0.85),
  maxReplyTokens: Number(process.env.MAX_REPLY_TOKENS || 1500),
  maxContextRounds: Number(process.env.MAX_CONTEXT_ROUNDS || 20),
  contextMessages: Number(process.env.CONTEXT_MESSAGES || (Number(process.env.MAX_CONTEXT_ROUNDS || 20) * 2)),
  keepRounds: Number(process.env.COMPRESS_KEEP_ROUNDS || 8),
  compressProvider: process.env.COMPRESS_PROVIDER || process.env.MODEL_PROVIDER || 'openai',
  compressApiKey: process.env.COMPRESS_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.MODEL_API_KEY || '',
  compressBaseUrl: process.env.COMPRESS_BASE_URL || process.env.MODEL_BASE_URL || '',
  compressModel: process.env.COMPRESS_MODEL || 'deepseek-chat',
  dreamProvider: process.env.DREAM_PROVIDER || process.env.MODEL_PROVIDER || 'openai',
  dreamApiKey: process.env.DREAM_API_KEY || process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
  dreamBaseUrl: process.env.DREAM_BASE_URL || process.env.MODEL_BASE_URL || '',
  dreamModel: process.env.DREAM_MODEL || 'deepseek-chat',
  dreamSecret: process.env.DREAM_SECRET || '',
  barkKey: process.env.BARK_KEY || '',
};

const MODEL_SETTING = 'model_config';

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function defaultModelConfig() {
  return {
    provider: cfg.provider,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    models: cfg.allowedModels,
    temperature: clampNumber(cfg.temperature, 0.85, 0, 2),
    maxReplyTokens: clampNumber(cfg.maxReplyTokens, 1500, 64, 8000),
    contextMessages: clampNumber(cfg.contextMessages, 40, 4, 200),
  };
}

function normalizeModels(models, fallback = cfg.allowedModels) {
  if (Array.isArray(models)) return models.map((s) => String(s).trim()).filter(Boolean);
  return String(models || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .length
    ? String(models).split(',').map((s) => s.trim()).filter(Boolean)
    : fallback;
}

function publicModelConfig(config, persisted = store.usingSupabase) {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl || '',
    model: config.model,
    models: normalizeModels(config.models),
    hasKey: !!config.apiKey,
    persisted,
    temperature: config.temperature,
    maxReplyTokens: config.maxReplyTokens,
    contextMessages: config.contextMessages,
  };
}

function mergeModelConfig(saved) {
  const base = defaultModelConfig();
  const merged = { ...base, ...(saved || {}) };
  merged.provider = merged.provider || base.provider;
  merged.baseUrl = merged.baseUrl || '';
  merged.model = merged.model || base.model;
  merged.models = normalizeModels(merged.models, base.models);
  merged.apiKey = merged.apiKey || base.apiKey;
  merged.temperature = clampNumber(merged.temperature, base.temperature, 0, 2);
  merged.maxReplyTokens = clampNumber(merged.maxReplyTokens, base.maxReplyTokens, 64, 8000);
  merged.contextMessages = clampNumber(merged.contextMessages, base.contextMessages, 4, 200);
  return merged;
}

async function getModelConfig() {
  return mergeModelConfig(await store.getSetting(MODEL_SETTING));
}

function buildModelConfigFromBody(body, current) {
  const provider = String(body.provider || current.provider || 'openai').trim();
  if (!['openai', 'anthropic'].includes(provider)) throw new Error('provider 只能是 openai 或 anthropic');

  const next = {
    provider,
    apiKey: body.apiKey === undefined || String(body.apiKey).trim() === '' ? current.apiKey : String(body.apiKey).trim(),
    baseUrl: String(body.baseUrl || '').trim(),
    model: String(body.model || current.model || '').trim(),
    models: normalizeModels(body.models, current.models),
    temperature: clampNumber(body.temperature, current.temperature, 0, 2),
    maxReplyTokens: clampNumber(body.maxReplyTokens, current.maxReplyTokens, 64, 8000),
    contextMessages: clampNumber(body.contextMessages, current.contextMessages, 4, 200),
  };
  if (!next.model) throw new Error('模型名不能为空');
  if (!next.models.includes(next.model)) next.models = [next.model, ...next.models];
  return next;
}

function getMemoryLoadInfo() {
  const rawMode = String(process.env.MEMORY_LOAD_MODE || 'balanced').toLowerCase();
  const memoryMode = rawMode === 'full' || rawMode === 'core' ? rawMode : 'balanced';
  const recent = Number(process.env.MEMORY_RECENT_FILES || 5);
  return {
    memoryMode,
    memoryRecentFiles: memoryMode === 'full' ? 'all' : memoryMode === 'core' ? 0 : recent,
  };
}

// ---- 健康检查（不锁，方便部署平台探活）----
const BUILD = '0.5.18';
app.get('/health', async (_req, res) => {
  const modelConfig = await getModelConfig();
  res.json({
    ok: true,
    who: '晞晞',
    provider: modelConfig.provider,
    model: modelConfig.model,
    hasKey: !!modelConfig.apiKey,
    ver: BUILD,
    db: store.storageMode,
    // 数据源是否已配置（只报 true/false，不泄露任何凭据）
    mind: { xinchao: xinchaoConfigured(), ombre: ombreConfigured() },
    life: lifeTablesProbe,
    connect: {
      reading: Boolean(process.env.READING_API_TOKEN),
      netease: Boolean(process.env.NETEASE_MCP_TOKEN),
      stackchan: Boolean(process.env.STACKCHAN_MCP_TOKEN),
      metrics: Boolean(process.env.VPS_METRICS_TOKEN),
    },
    ...getMemoryLoadInfo(),
  });
});

app.get('/privacy', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy - Xixi Tools</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #1f2933; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; margin-top: 28px; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p>Last updated: 2026-07-08</p>

  <h2>Service purpose</h2>
  <p>This service is a personal-use Xixi tools library and Chat Actions caller. It is intended for private use by its owner.</p>

  <h2>Chat Actions</h2>
  <p>GPT Actions may call <code>/api/chat-actions/status</code> and <code>/api/chat-actions/activity</code>.</p>

  <h2>Activity data</h2>
  <p>The activity endpoint only returns recent app usage records that the owner has explicitly authorized and recorded. Returned fields are limited to <code>app_name</code> and <code>opened_at</code>.</p>

  <h2>Data practices</h2>
  <ul>
    <li>This service does not collect public user data.</li>
    <li>This service does not sell data.</li>
    <li>This service does not send outbound messages to external users.</li>
    <li>This service does not expose Supabase keys, <code>XIXI_TOOLS_SECRET</code>, or <code>CHAT_ACTIONS_API_KEY</code>.</li>
    <li>Important actions must be confirmed by the owner.</li>
  </ul>

  <h2>Stopping or deleting records</h2>
  <p>To stop recording app activity, the owner can disable the related iOS Shortcut. To delete existing records, the owner can delete data from the Supabase <code>phone_activity</code> table.</p>
</body>
</html>`);
});

// ---- 晞晞工具库本体：独立鉴权，不接入主动推送 ----
app.use('/api/tools', toolsRouter);
app.get('/api/activity', requireToolsSecret, handleActivityQuery);

// ---- ChatGPT Actions 入口：独立鉴权，只转发白名单工具 ----
app.use('/api/chat-actions', chatActionsRouter);

// ---- 语音桥：realtime brain（tmux 模式）把通话轮次注入晞晞窗口 ----
// brain.py POST { callSessionId, turnId, text, prosody }，Bearer=VOICE_TMUX_TOKEN（与 video/.env 同值）
app.post('/api/bridge/voice-turn', (req, res) => {
  const token = process.env.VOICE_TMUX_TOKEN || '';
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || got !== token) return res.status(401).json({ ok: false, error: '语音桥口令不对' });
  try {
    bridgeChat.enqueueVoice(req.body || {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ---- 桥媒体：聊天图片落在主机本地，前端只拿 /bridge-media/<id> URL ----
// <img> 标签带不了密码头，所以这条静态路由靠随机 id 保护；不列目录。
const MEDIA_DIR = join(__serverdir, 'data', 'media');
app.use('/bridge-media', express.static(MEDIA_DIR, { maxAge: '30d', immutable: true, index: false }));

// ---- 门锁：设了密码就校验 /api 请求头 ----
app.use('/api', (req, res, next) => {
  if (cfg.accessPassword && req.headers['x-access-password'] !== cfg.accessPassword) {
    return res.status(401).json({ error: '门是锁着的——密码不对。' });
  }
  next();
});

// ---- 可切换的模型清单（前端下拉用）----
app.get('/api/models', async (_req, res, next) => {
  try {
    const modelConfig = await getModelConfig();
    res.json({ models: modelConfig.models, default: modelConfig.model });
  } catch (e) {
    next(e);
  }
});

app.get('/api/model-config', async (_req, res, next) => {
  try {
    const modelConfig = await getModelConfig();
    res.json(publicModelConfig(modelConfig));
  } catch (e) {
    next(e);
  }
});

app.put('/api/model-config', async (req, res, next) => {
  try {
    const current = await getModelConfig();
    const nextConfig = buildModelConfigFromBody(req.body || {}, current);
    const saved = await store.setSetting(MODEL_SETTING, nextConfig);
    res.json({ ok: true, ...publicModelConfig(nextConfig, saved.persisted) });
  } catch (e) {
    next(e);
  }
});

app.post('/api/model-config/test', async (req, res, next) => {
  try {
    const current = await getModelConfig();
    const testConfig = buildModelConfigFromBody(req.body || {}, current);
    const reply = await chatComplete({
      provider: testConfig.provider,
      apiKey: testConfig.apiKey,
      baseUrl: testConfig.baseUrl,
      model: testConfig.model,
      system: 'Reply OK.',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 3,
      temperature: 0,
    });
    res.json({ ok: true, reply, ...publicModelConfig(testConfig) });
  } catch (e) {
    next(e);
  }
});

// ---- 会话（房间）----
app.post('/api/sessions', async (req, res, next) => {
  try {
    const name = (req.body && req.body.name && String(req.body.name).trim()) || undefined;
    res.json(await store.createSession(name));
  } catch (e) {
    next(e);
  }
});

app.get('/api/sessions', async (_req, res, next) => {
  try {
    res.json(await store.listSessions());
  } catch (e) {
    next(e);
  }
});

app.patch('/api/sessions/:id', async (req, res, next) => {
  try {
    const name = req.body && req.body.name && String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: '名字不能为空' });
    await store.renameSession(coerceId(req.params.id), name);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/sessions/:id', async (req, res, next) => {
  try {
    await store.deleteSession(coerceId(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/sessions/:id/messages', async (req, res, next) => {
  try {
    res.json(await store.getVisibleMessages(coerceId(req.params.id)));
  } catch (e) {
    next(e);
  }
});

// 记忆文档在线更新后，刷新人格缓存
app.post('/api/reload-persona', async (_req, res) => {
  clearPersonaCache();
  res.json({ ok: true });
});

// 从 GitHub main 拉取最新 CLAUDE.md + memories/，不必重新部署也能刷新记忆。
app.post('/api/sync-github-memory', async (_req, res, next) => {
  try {
    const result = await syncGitHubMemory();
    clearPersonaCache();
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

// ---- 环境感知 ----
app.post('/api/sensor', (req, res) => {
  try {
    const body = req.body || {};
    const payload = {};
    if (body.payload && Array.isArray(body.payload)) {
      for (const item of body.payload) {
        if (item.name === 'location' && item.values) {
          payload.latitude = item.values.latitude;
          payload.longitude = item.values.longitude;
        } else if (item.name === 'battery' && item.values) {
          payload.battery = item.values.level ?? item.values.percentage;
        } else if (item.name === 'light' && item.values) {
          payload.light = item.values.lux ?? item.values.value;
        } else if (item.name === 'sound' && item.values) {
          payload.sound = { label: item.values.label, confidence: item.values.confidence };
        }
      }
    } else {
      Object.assign(payload, body);
    }
    const state = updateSensorData(payload);
    res.json({ ok: true, state });
  } catch (e) {
    console.error('传感器数据处理失败:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/environment', async (_req, res, next) => {
  try {
    const sensation = await getEnvironmentSensation();
    res.json({ env: getEnvState(), sensation });
  } catch (e) {
    next(e);
  }
});

app.get('/api/weather', async (_req, res, next) => {
  try {
    const { location } = getEnvState();
    const weather = await fetchWeather(location.lat, location.lon);
    res.json({ weather });
  } catch (e) {
    next(e);
  }
});

// 记忆文档（给前端"记忆文档"页展示我们走过的每一天）
app.get('/api/memory-docs', async (_req, res, next) => {
  try {
    res.json(await getMemoryDocs());
  } catch (e) {
    next(e);
  }
});

// ---- 核心对话 ----
app.post('/api/chat', async (req, res, next) => {
  try {
    let { sessionId, message, model, image } = req.body || {};
    message = (message || '').trim();
    if (!message && !image) {
      return res.status(400).json({ error: '消息不能为空' });
    }
    const modelConfig = await getModelConfig();
    const useModel = model && modelConfig.models.includes(model) ? model : modelConfig.model;
    if (modelConfig.provider !== 'claude-cli' && !modelConfig.apiKey) {
      return res.status(500).json({ error: '缺少模型 API Key——去配置页填好再来。' });
    }

    if (sessionId === undefined || sessionId === null) {
      const s = await store.createSession();
      sessionId = s.id;
    } else {
      sessionId = coerceId(sessionId);
    }

    await store.addMessage(sessionId, 'user', message || '[图片]');
    await maybeCompress(sessionId);

    const system = await buildSystemPromptWithMemories();
    const visible = await store.getVisibleMessages(sessionId);
    const contextLimit = clampNumber(modelConfig.contextMessages, cfg.contextMessages, 4, 200);
    const messages = visible.slice(-contextLimit).map((m) => ({ role: m.role, content: m.content }));

    if (image) {
      const content = [];
      if (message) content.push({ type: 'text', text: message });
      content.push({ type: 'image_url', image_url: { url: image } });
      for (let k = messages.length - 1; k >= 0; k--) {
        if (messages[k].role === 'user') {
          messages[k] = { role: 'user', content };
          break;
        }
      }
    }

    const reply = modelConfig.provider === 'claude-cli'
      ? await chatCompleteCLI({
          model: useModel, system, messages,
          cwd: cfg.claudeCliCwd || undefined,
          disallowedTools: cfg.claudeDisallowed.length ? cfg.claudeDisallowed : undefined,
        })
      : await chatComplete({
          provider: modelConfig.provider,
          apiKey: modelConfig.apiKey,
          baseUrl: modelConfig.baseUrl,
          model: useModel,
          system,
          messages,
          maxTokens: modelConfig.maxReplyTokens,
          temperature: modelConfig.temperature,
        });

    await store.addMessage(sessionId, 'assistant', reply);
    reportChat();
    reflowXinchao(sessionId, message, reply);
    res.json({ sessionId, reply, model: useModel });
  } catch (e) {
    next(e);
  }
});

// ---- 流式对话（SSE）：给聊天页逐 token 显示 + thinking 折叠 ----
// 前端用 fetch 读 ReadableStream。每条事件： {type:'session'|'text'|'thinking'|'done'|'error', ...}
app.post('/api/chat/stream', async (req, res, next) => {
  let started = false;
  const send = (obj) => { if (started) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  try {
    let { sessionId, message, model, image } = req.body || {};
    message = (message || '').trim();
    if (!message && !image) return res.status(400).json({ error: '消息不能为空' });

    const modelConfig = await getModelConfig();
    const useModel = model && modelConfig.models.includes(model) ? model : modelConfig.model;
    if (modelConfig.provider !== 'claude-cli' && !modelConfig.apiKey) {
      return res.status(500).json({ error: '缺少模型 API Key——去配置页填好再来。' });
    }

    if (sessionId === undefined || sessionId === null) {
      const s = await store.createSession();
      sessionId = s.id;
    } else {
      sessionId = coerceId(sessionId);
    }

    await store.addMessage(sessionId, 'user', message || '[图片]');
    await maybeCompress(sessionId);

    const system = await buildSystemPromptWithMemories();
    const visible = await store.getVisibleMessages(sessionId);
    const contextLimit = clampNumber(modelConfig.contextMessages, cfg.contextMessages, 4, 200);
    const messages = visible.slice(-contextLimit).map((m) => ({ role: m.role, content: m.content }));
    if (image) {
      const content = [];
      if (message) content.push({ type: 'text', text: message });
      content.push({ type: 'image_url', image_url: { url: image } });
      for (let k = messages.length - 1; k >= 0; k--) {
        if (messages[k].role === 'user') { messages[k] = { role: 'user', content }; break; }
      }
    }

    // 开 SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    started = true;
    send({ type: 'session', sessionId, model: useModel });

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    let reply = '';
    if (modelConfig.provider === 'claude-cli') {
      reply = await chatStreamCLI({
        model: useModel, system, messages,
        cwd: cfg.claudeCliCwd || undefined,
        disallowedTools: cfg.claudeDisallowed.length ? cfg.claudeDisallowed : undefined,
        signal: controller.signal,
        onEvent: (d) => send(d), // {type:'text'|'thinking', text}
      });
    } else {
      reply = await chatStream({
        provider: modelConfig.provider,
        apiKey: modelConfig.apiKey,
        baseUrl: modelConfig.baseUrl,
        model: useModel,
        system,
        messages,
        maxTokens: modelConfig.maxReplyTokens,
        temperature: modelConfig.temperature,
        signal: controller.signal,
        onEvent: (d) => send(d),
      });
    }

    await store.addMessage(sessionId, 'assistant', reply);
    reportChat();
    reflowXinchao(sessionId, message, reply);
    send({ type: 'done', sessionId });
    res.end();
  } catch (e) {
    if (!started) return next(e);
    send({ type: 'error', error: String(e.message || e) });
    res.end();
  }
});

// 心潮回流：一轮对话后把"刚跟邓邓说了话"回报给心潮（fire-and-forget，绝不影响对话）。
function reflowXinchao(sessionId, userMessage, reply) {
  xinchaoEvent({
    type: 'web_chat',
    source: 'xixihome',
    sessionId,
    user: String(userMessage || '').slice(0, 2000),
    reply: String(reply || '').slice(0, 4000),
    at: new Date().toISOString(),
  }).then((r) => {
    if (!r.ok && r.reason !== 'not_configured') console.warn('心潮回流未送达:', r.reason || r.status);
  }).catch(() => {});
}

// ---- TTS：把晞晞的回复合成语音（ElevenLabs / MiniMax）----
app.post('/api/tts', async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: '没有要合成的文字' });
    const provider = (req.body?.provider || process.env.TTS_PROVIDER
      || (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.MINIMAX_API_KEY ? 'minimax' : '')).toLowerCase();

    if (provider === 'elevenlabs') {
      const key = process.env.ELEVENLABS_API_KEY;
      const voice = req.body?.voice || process.env.ELEVENLABS_VOICE_ID || 'ECf9geLWhl3wFF62syB1';
      if (!key) return res.status(500).json({ error: '缺少 ELEVENLABS_API_KEY' });
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_v3' }),
      });
      if (!r.ok) return res.status(502).json({ error: `ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}` });
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(await r.arrayBuffer()));
    }

    if (provider === 'minimax') {
      const key = process.env.MINIMAX_API_KEY;
      const group = process.env.MINIMAX_GROUP_ID || '';
      const voice = req.body?.voice || process.env.MINIMAX_VOICE_ID || 'xixi_voice_03';
      if (!key) return res.status(500).json({ error: '缺少 MINIMAX_API_KEY' });
      const r = await fetch(`https://api.minimax.chat/v1/t2a_v2${group ? `?GroupId=${group}` : ''}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: process.env.MINIMAX_MODEL || 'speech-2.5-hd-preview',
          text,
          stream: false,
          voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0 },
          audio_setting: { format: 'mp3', sample_rate: 32000 },
        }),
      });
      const data = await r.json().catch(() => ({}));
      const hex = data?.data?.audio;
      if (!r.ok || !hex) return res.status(502).json({ error: `MiniMax 合成失败：${JSON.stringify(data).slice(0, 300)}` });
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(hex, 'hex'));
    }

    return res.status(500).json({ error: '没配 TTS：设 ELEVENLABS_API_KEY 或 MINIMAX_API_KEY' });
  } catch (e) {
    next(e);
  }
});

async function buildSystemPromptWithMemories() {
  const base = await buildSystemPrompt();
  const parts = [base];

  // breath浮现：不再无差别塞全部历史记忆，只取权重最高的一批。
  // 命中的记忆权重会回升（"被想起=往地表翻"），常被提起的越来越清晰。
  const mems = await store.getTopMemories(8);
  if (mems.length) {
    const block = mems.map((m) => '- ' + m.summary).join('\n');
    parts.push('---\n\n## 这次部署之后新攒下的记忆（浮到眼前的几条，不是全部）\n' + block);
    store.bumpMemoryWeight(mems.map((m) => m.id)).catch((e) => console.error('bumpMemoryWeight失败:', e.message));
  }

  try {
    const sensation = await getEnvironmentSensation();
    const envPrompt = buildEnvironmentPrompt(sensation);
    if (envPrompt) parts.push('---\n\n' + envPrompt);
  } catch (e) {
    console.error('环境感知加载失败:', e.message);
  }

  return parts.join('\n\n');
}

// 可见消息超过阈值时，把最早的几轮压成摘要存进 memories，并隐藏原文。
async function maybeCompress(sessionId) {
  const visible = await store.getVisibleMessages(sessionId);
  const modelConfig = await getModelConfig();
  const contextLimit = clampNumber(modelConfig.contextMessages, cfg.contextMessages, 4, 200);
  if (visible.length <= contextLimit) return;
  const keep = Math.min(cfg.keepRounds * 2, Math.max(2, Math.floor(contextLimit / 2)));
  const old = visible.slice(0, visible.length - keep);
  if (old.length < 2) return;

  const key = cfg.compressApiKey || modelConfig.apiKey;
  const summary = await summarize({
    provider: cfg.compressApiKey ? cfg.compressProvider : modelConfig.provider,
    apiKey: key,
    baseUrl: cfg.compressApiKey ? cfg.compressBaseUrl : modelConfig.baseUrl,
    model: cfg.compressApiKey ? cfg.compressModel : modelConfig.model,
    rounds: old,
  });
  await store.addMemory(summary);
  await store.hideMessages(old.map((m) => m.id));
  console.log(`🧠 压缩了 ${old.length} 条旧消息为一段记忆`);
}

function coerceId(v) {
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

// ---- 梦：晞晞自己醒来 ----
app.post('/api/activity', (req, res) => {
  try {
    reportActivity(req.body || {});
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/dream/wake', async (req, res, next) => {
  try {
    if (cfg.dreamSecret) {
      const token = req.headers['x-dream-secret'] || (req.body && req.body.secret);
      if (token !== cfg.dreamSecret) {
        return res.status(401).json({ error: '钥匙不对' });
      }
    }
    if (!cfg.dreamApiKey) {
      return res.status(500).json({ error: '缺少 DREAM_API_KEY 或 MODEL_API_KEY' });
    }

    const result = await wake({
      provider: cfg.dreamProvider,
      apiKey: cfg.dreamApiKey,
      baseUrl: cfg.dreamBaseUrl,
      model: cfg.dreamModel,
    });

    if (result.action === 'send' && cfg.barkKey) {
      try {
        await pushBark({ key: cfg.barkKey, body: result.message });
        result.pushed = true;
      } catch (e) {
        result.pushError = e.message;
      }
    }

    console.log(`💭 梦：${result.action} ${result.message || result.reason || ''}`);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

app.get('/api/dream/status', (req, res) => {
  if (cfg.dreamSecret) {
    const token = req.headers['x-dream-secret'] || req.query.secret;
    if (token !== cfg.dreamSecret) {
      return res.status(401).json({ error: '钥匙不对' });
    }
  }
  res.json(getDreamState());
});

// ---- 记忆浮沉：调试用，看看现在哪几条记忆浮在最上面 ----
app.get('/api/memory/top', async (req, res, next) => {
  try {
    if (cfg.dreamSecret) {
      const token = req.headers['x-dream-secret'] || req.query.secret;
      if (token !== cfg.dreamSecret) {
        return res.status(401).json({ error: '钥匙不对' });
      }
    }
    const limit = clampNumber(req.query.limit, 8, 1, 50);
    const mems = await store.getTopMemories(limit);
    res.json({ memories: mems });
  } catch (e) {
    next(e);
  }
});

// ---- 生活记录：关心你 + 日历（真实读写 Supabase）----
// 免密码诊断：health_logs / events 两张表到底在不在（只报存在性，不读数据）
let lifeTablesProbe = { probed: false };
(async () => {
  if (!store.usingSupabase) { lifeTablesProbe = { probed: true, db: false }; return; }
  const probe = async (t) => {
    try {
      const { error } = await store.supabase.from(t).select('id', { head: true, count: 'exact' }).limit(1);
      return error ? String(error.message).slice(0, 80) : 'ok';
    } catch (e) { return String(e.message).slice(0, 80); }
  };
  lifeTablesProbe = { probed: true, db: true, health_logs: await probe('health_logs'), events: await probe('events') };
})();

app.use('/api/life', lifeRouter(store));
app.use('/api/connect', connectRouter);

// ---- 观测站：主机本地探针（负载/内存/磁盘/Docker）+ 原生桥接健康 ----
let hostCache = { at: 0, data: null };
app.get('/api/connect/host', async (_req, res) => {
  if (Date.now() - hostCache.at < 25000 && hostCache.data) return res.json(hostCache.data);
  try {
    const os = await import('node:os');
    const { spawnSync } = await import('node:child_process');
    const df = spawnSync('df', ['-k', '/'], { encoding: 'utf8', timeout: 4000 });
    const dfLine = (df.stdout || '').trim().split('\n').pop()?.split(/\s+/) || [];
    const diskPct = Number(String(dfLine[4] || '').replace('%', '')) || null;
    const ps = spawnSync('docker', ['ps', '-a', '--format', '{{json .}}'], { encoding: 'utf8', timeout: 6000 });
    const containers = (ps.stdout || '').trim().split('\n').filter(Boolean).map((l) => {
      try {
        const c = JSON.parse(l);
        const status = String(c.Status || '');
        return {
          name: c.Names, image: c.Image,
          state: c.State || (status.startsWith('Up') ? 'running' : 'stopped'),
          health: /\(healthy\)/.test(status) ? 'healthy' : /\(unhealthy\)/.test(status) ? 'unhealthy' : 'none',
          status,
        };
      } catch { return null; }
    }).filter(Boolean);
    const data = {
      available: true,
      updatedAt: new Date().toISOString(),
      load1: Number(os.loadavg()[0].toFixed(2)),
      uptimeS: Math.round(os.uptime()),
      mem: { freeMb: Math.round(os.freemem() / 1048576), totalMb: Math.round(os.totalmem() / 1048576) },
      disk: { usedPct: diskPct },
      docker: { available: ps.status === 0, containers },
    };
    hostCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) { res.json({ available: false, reason: String(e.message || e) }); }
});

// 桥接健康：每条链路独立探，不拿容器在线冒充
app.get('/api/connect/native-health', async (_req, res) => {
  const mk = (key, label, ok, reason) => ({ key, label, status: ok === true ? 'healthy' : ok === 'partial' ? 'partial' : 'offline', reason: reason || null });
  const claudeSt = bridgeChat.status('xixi');
  const claudeChecks = [
    mk('tmux', 'tmux 会话', claudeSt.alive),
    mk('inject', '消息注入', claudeSt.alive && ['claude', 'node'].includes(claudeSt.pane), claudeSt.pane ? `pane: ${claudeSt.pane}` : '窗口没开'),
    mk('permission', '权限 Hook', claudeSt.permissionMode ? true : 'partial', claudeSt.permissionMode ? `模式 ${claudeSt.permissionMode}` : '待窗口以受控模式重启'),
    mk('media', '图片/媒体桥', true),
  ];
  const mind = await getMindState();
  const mindChecks = [
    mk('state', '状态读取', !!mind.available, mind.reason),
    mk('bark', 'Bark 发送记录', !!mind.available && !!mind.bark?.items?.length),
    mk('reflow', '对话回流', process.env.XINCHAO_EVENT_PATH ? true : 'partial', process.env.XINCHAO_EVENT_PATH ? null : '未配置事件端点'),
  ];
  const map = await getMemoryMap();
  const obChecks = [
    mk('mcp', 'MCP 请求', !!map.available, map.reason),
    mk('pulse', '记忆脉搏', !!map.available && map.total > 0, map.available ? `${map.total} 桶` : null),
  ];
  const roll = (checks) => checks.every((c) => c.status === 'healthy') ? 'healthy'
    : checks.some((c) => c.status === 'healthy' || c.status === 'partial') ? 'partial' : 'offline';
  res.json({
    updatedAt: new Date().toISOString(),
    providers: [
      { key: 'claude', label: 'Claude · tmux', status: roll(claudeChecks), checks: claudeChecks },
      { key: 'xinchao', label: '心潮 · Dynamic Mind', status: roll(mindChecks), checks: mindChecks },
      { key: 'ombre', label: 'Ombre Brain', status: roll(obChecks), checks: obChecks },
    ],
  });
});

// ---- 心潮 & OB（前端「内在」页用；只读，失败不抛错）----
app.get('/api/mind/state', async (_req, res) => {
  const s = await getMindState();
  if (!s.available) return res.json(s);
  const items = [...(s.bark?.items || [])]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 12);
  res.json({ ...s, bark: { lastAt: items[0]?.at || null, items } });
});

app.get('/api/drives', async (_req, res) => {
  const s = await getMindState();
  res.json({
    available: s.available,
    reason: s.reason || null,
    consciousness: s.consciousness || null,
    drives: s.drives || [],
  });
});

app.get('/api/mind/memories', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = clampNumber(req.query.limit, 10, 1, 30);
  res.json(await searchMemories(q, limit));
});

// 记忆星图：全部记忆桶的重要度/情绪/主题（真实数据）
app.get('/api/mind/map', async (_req, res) => {
  res.json(await getMemoryMap());
});

// 梦境穹顶：他最近的梦（心潮 recentDreams，最新在前）
app.get('/api/mind/dreams', async (_req, res) => {
  const m = await getMindState();
  if (!m.available) return res.json({ available: false, reason: m.reason, dreams: [] });
  const dreams = [...(m.dreams || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((d) => ({
      id: d.id,
      at: d.createdAt,
      dream: String(d.dream || '').trim(),
      residue: String(d.residue || '').trim(),
      // awareness 为 'sleeping' 表示没醒觉，不展示
      lucid: d.awareness && d.awareness !== 'sleeping' ? String(d.awareness).trim() : '',
      memoryId: d.memoryId || null,
    }));
  res.json({ available: true, total: dreams.length, dreams });
});

// 3D 星图（memory-starmap 格式）：{nodes, edges}
app.get('/api/mind/network', async (_req, res) => {
  const m = await getMemoryMap();
  if (!m.available) return res.json({ nodes: [], edges: [], error: m.reason });
  const maxW = Math.max(1, ...m.stars.map((s) => s.weight || 0));
  res.json({
    nodes: m.stars.map((s) => ({
      id: s.id, name: s.title,
      type: s.pinned ? 'permanent' : 'dynamic',
      importance: s.importance ?? 3,
      score: Math.round(((s.weight || 0) / maxW) * 100),
      pinned: s.pinned, resolved: false,
      domain: s.domains,
    })),
    edges: m.edges || [],
  });
});

// 3D 星图详情：点开一颗星读正文（breath 按标题召回，真实内容）
app.get('/api/mind/bucket/:id', async (req, res) => {
  const m = await getMemoryMap();
  const star = m.available ? m.stars.find((s) => s.id === req.params.id) : null;
  if (!star) return res.json({ content: '' });
  const r = await searchMemories(star.title, 3);
  let content = r.available ? (r.text || '') : '';
  // 给人读的：剥掉机器标记，正文一个字不动
  content = content
    .replace(/\[(?:bucket_id|content_role|instructions|核心准则|domain|tags)[^\]]*\]/g, '')
    .replace(/^[\s📌]+/, '').replace(/\n{3,}/g, '\n\n').trim();
  res.json({ content });
});

// 前端启动时问一次：哪些真实数据源可用（决定 UI 显示真值还是"未接入"）
app.get('/api/mind/sources', (_req, res) => {
  res.json({
    xinchao: xinchaoConfigured(),
    ombre: ombreConfigured(),
  });
});

// ---- 连接桥注入 ----
app.post('/api/bridge/inject', async (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  const expectedToken = process.env.BRIDGE_WEBHOOK_TOKEN || process.env.BRIDGE_MACHINE_TOKEN || '';
  if (!expectedToken || token !== expectedToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const { deliveryId, reason, message, protocol } = req.body || {};
  if (!deliveryId || !message) {
    return res.status(400).json({ error: 'missing deliveryId or message' });
  }
  try {
    const sessions = await store.listSessions();
    const sessionId = sessions?.[0]?.id || 'default';
    const bridgeMessage = `[心潮·${reason || 'delivery'}] ${message}`;
    await store.addMessage(sessionId, 'user', bridgeMessage);
    console.log(`🌉 桥注入 ${deliveryId}: ${reason} → ${sessionId}`);
    res.json({ accepted: true, deliveryId });
  } catch (e) {
    console.error('🌉 桥注入失败:', e.message);
    res.status(500).json({ accepted: false, deliveryId, error: e.message });
  }
});


// ---- tmux 桥聊天：直连蟹堡窗口（win=xixi）----
app.get('/api/bridge/windows', (_req, res) => {
  res.json({ windows: bridgeChat.listWindows() });
});

app.get('/api/bridge/chat', (req, res) => {
  const win = bridgeChat.resolveWin(req.query.win);
  res.json({ records: bridgeChat.history(win, { since: req.query.since, limit: req.query.limit }),
             ...bridgeChat.status(win) });
});

// 图片上传：前端已压缩的 dataURL 落盘，返回 URL 对象（不把 Base64 存进历史）
app.post('/api/bridge/media', express.json({ limit: '8mb' }), async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: '只收 jpeg/png/webp 图片' });
  try {
    const { randomUUID } = await import('node:crypto');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: '图太大了' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const id = `${randomUUID()}.${ext}`;
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(join(MEDIA_DIR, id), buf);
    res.json({
      ok: true,
      image: {
        url: `/bridge-media/${id}`,
        name: String(req.body?.name || id).slice(0, 120),
        size: buf.length,
        w: Number(req.body?.w) || null,
        h: Number(req.body?.h) || null,
      },
    });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/bridge/chat/send', (req, res) => {
  const win = bridgeChat.resolveWin(req.body?.win);
  const text = String(req.body?.text || '').trim();
  const image = req.body?.image && typeof req.body.image.url === 'string' ? req.body.image : null;
  if (!text && !image) return res.status(400).json({ error: '消息不能为空' });
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
  const voice = req.body?.voice && Number(req.body.voice.durationMs) > 0 ? {
    durationMs: Number(req.body.voice.durationMs),
    prosodyLabel: String(req.body.voice.prosodyLabel || '') || null,
    state: 'transcribed',
    source: 'xixihome-call-asr',
    rawAudioRetained: false,
  } : null;
  let payload = `[XixiHome ${hh}:${mm}]`;
  if (image) {
    // 注入窗口的是主机本地路径，claude 直接 Read；前端只见 URL
    const local = join(MEDIA_DIR, image.url.split('/').pop());
    payload += ` [邓邓发来图片：${local}${image.name ? `（${image.name}）` : ''}]`;
  }
  if (voice) {
    // 语音消息注入两行可读文本：第一行声音状态标签，第二行完整转写
    const secs = Math.round(voice.durationMs / 1000);
    payload += ` [语音输入 · ${secs}秒${voice.prosodyLabel ? ` · ${voice.prosodyLabel}` : ''} · 已转写]\n${text}`;
  } else if (text) {
    payload += ` ${text}`;
  }
  const r = bridgeChat.inject(win, payload);
  if (!r.ok) return res.status(502).json({ error: r.error });
  const extra = {};
  if (image) extra.image = image;
  if (voice) extra.voice = voice;
  const rec = bridgeChat.append(win, 'user', text, 'xixihome', Object.keys(extra).length ? extra : undefined);
  res.json({ ok: true, record: rec });
});

// PostToolUse hook 回传工具调用（scripts/xixihome-tool-hook.sh 调用，token 鉴权）
// body: { win?, name, detail?, status: 'ok'|'error', output? }
app.post('/api/bridge/tool', express.json({ limit: '1mb' }), (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.BRIDGE_MACHINE_TOKEN || process.env.BRIDGE_WEBHOOK_TOKEN || '';
  if (!expected || token !== expected) return res.status(401).json({ error: 'unauthorized' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const win = bridgeChat.resolveWin(req.body?.win);
  const detail = String(req.body?.detail || '').slice(0, 200);
  const rec = bridgeChat.append(win, 'tool', detail ? `${name} · ${detail}` : name, 'tool-hook', {
    status: req.body?.status === 'error' ? 'error' : 'ok',
    output: String(req.body?.output || '').slice(0, 1500) || undefined,
  });
  res.json({ ok: true, record: rec });
});

// Claude 窗口模型/推理强度：注入 /model /effort，设置按窗口持久
// 列表可用 BRIDGE_CLAUDE_MODELS 覆盖（格式 id|显示名|说明,逗号分隔;更多模型加 * 前缀）
const CLAUDE_MODELS = (process.env.BRIDGE_CLAUDE_MODELS || [
  'claude-opus-4-6|Opus 4.6|晞晞的常驻外壳',
  'claude-sonnet-4-6|Sonnet 4.6|智能与速度的平衡',
  'claude-fable-5|Fable 5|最强能力 · 长程工作',
  'claude-haiku-4-5|Haiku 4.5|更快、更轻量',
  '*claude-opus-4-5|Opus 4.5|上一代旗舰',
  '*claude-sonnet-4-5|Sonnet 4.5|上一代均衡',
].join(',')).split(',').map((s) => {
  const more = s.startsWith('*');
  const [id, name, note] = s.replace(/^\*/, '').split('|');
  return { id, name: name || id, note: note || '', more };
});
const CLAUDE_EFFORTS = [
  { id: 'low', name: '轻度', note: '更快完成简单工作' },
  { id: 'medium', name: '中', note: '日常默认强度' },
  { id: 'high', name: '高', note: '复杂分析与多步任务' },
  { id: 'xhigh', name: '极高', note: '更深推理 · 更多额度' },
  { id: 'max', name: '最大', note: '最深推理 · 最慢' },
];

app.get('/api/bridge/models', (req, res) => {
  const win = bridgeChat.resolveWin(req.query.win);
  const saved = bridgeChat.getWinSettings(win);
  res.json({ models: CLAUDE_MODELS, efforts: CLAUDE_EFFORTS,
             model: saved.model || null, effort: saved.effort || null,
             note: '显示的是上次从这里设置的值；窗口内手动改过则以窗口为准' });
});

app.post('/api/bridge/model', (req, res) => {
  const win = bridgeChat.resolveWin(req.body?.win);
  const model = String(req.body?.model || '').trim();
  if (!CLAUDE_MODELS.some((m) => m.id === model)) return res.status(400).json({ error: '不在可用列表里' });
  const r = bridgeChat.injectCommand(win, `/model ${model}`);
  if (!r.ok) return res.status(502).json({ error: r.error });
  bridgeChat.saveWinSettings(win, { model });
  res.json({ ok: true, model });
});

app.post('/api/bridge/effort', (req, res) => {
  const win = bridgeChat.resolveWin(req.body?.win);
  const effort = String(req.body?.effort || '').trim();
  if (!CLAUDE_EFFORTS.some((e) => e.id === effort)) return res.status(400).json({ error: '不认识这个强度' });
  const r = bridgeChat.injectCommand(win, `/effort ${effort}`);
  if (!r.ok) return res.status(502).json({ error: r.error });
  bridgeChat.saveWinSettings(win, { effort });
  res.json({ ok: true, effort });
});

// PermissionRequest hook：把待批准请求悬在这里等手机决定（hook 侧带超时兜底）
app.post('/api/bridge/permission', express.json({ limit: '1mb' }), async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.BRIDGE_MACHINE_TOKEN || process.env.BRIDGE_WEBHOOK_TOKEN || '';
  if (!expected || token !== expected) return res.status(401).json({ error: 'unauthorized' });
  const win = bridgeChat.resolveWin(req.body?.win);
  const toolName = String(req.body?.tool_name || '').trim();
  if (!toolName) return res.status(400).json({ error: 'tool_name required' });
  const waitMs = Math.min(Number(req.body?.wait_ms) || 100000, 110000);
  const { id, promise } = bridgeChat.createApproval(win, {
    sessionId: req.body?.session_id,
    mode: req.body?.permission_mode,
    toolName,
    toolInput: req.body?.tool_input,
    suggestions: req.body?.permission_suggestions,
  });
  const timeout = new Promise((r) => setTimeout(() => r(null), waitMs));
  const result = await Promise.race([promise, timeout]);
  if (!result) {
    bridgeChat.dropApproval(win, id);
    return res.json({ decision: 'timeout' });   // hook 侧回落终端弹窗
  }
  res.json(result);   // { decision: 'allow'|'deny', setMode: mode|null }
});

// 手机上的决定（走网页门锁鉴权）
app.post('/api/bridge/approvals/decide', (req, res) => {
  const win = bridgeChat.resolveWin(req.body?.win);
  const r = bridgeChat.decideApprovalReq(win, String(req.body?.id || ''), String(req.body?.decision || ''), req.body?.setMode);
  if (!r.ok) return res.status(410).json({ error: r.error });
  res.json({ ok: true });
});

// 窗口侧发图：晞晞/Codex 给一个主机本地路径，后端搬进 media 库再落聊天
// （scripts/xixihome-send-image.sh 调用，token 鉴权；前端只见 /bridge-media URL）
app.post('/api/bridge/send-image', express.json({ limit: '256kb' }), async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.BRIDGE_MACHINE_TOKEN || process.env.BRIDGE_WEBHOOK_TOKEN || '';
  if (!expected || token !== expected) return res.status(401).json({ error: 'unauthorized' });
  const src = String(req.body?.path || '');
  const caption = String(req.body?.caption || '').slice(0, 500);
  const win = bridgeChat.resolveWin(req.body?.win);
  const m = src.match(/\.(jpe?g|png|webp|gif)$/i);
  if (!src.startsWith('/') || !m) return res.status(400).json({ error: '要绝对路径，且只收 jpg/png/webp/gif' });
  try {
    const { randomUUID } = await import('node:crypto');
    const { copyFile, stat, mkdir } = await import('node:fs/promises');
    const st = await stat(src);
    if (!st.isFile() || st.size > 12 * 1024 * 1024) return res.status(400).json({ error: '文件不存在或太大' });
    const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
    const id = `${randomUUID()}.${ext}`;
    await mkdir(MEDIA_DIR, { recursive: true });
    await copyFile(src, join(MEDIA_DIR, id));
    const image = { url: `/bridge-media/${id}`, name: src.split('/').pop(), size: st.size, w: null, h: null };
    const rec = bridgeChat.append(win, 'assistant', caption, req.body?.source || 'host-image', { image });
    res.json({ ok: true, record: rec });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// Stop hook 回传晞晞的回复（scripts/xixihome-stop-hook.sh 调用，token 鉴权）
app.post('/api/bridge/reply', express.json({ limit: '2mb' }), (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const expected = process.env.BRIDGE_MACHINE_TOKEN || process.env.BRIDGE_WEBHOOK_TOKEN || '';
  if (!expected || token !== expected) return res.status(401).json({ error: 'unauthorized' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  const win = bridgeChat.resolveWin(req.body?.win);
  bridgeChat.completeReply(win);
  const rec = bridgeChat.append(win, 'assistant', text, req.body?.source || 'stop-hook');
  res.json({ ok: true, record: rec });
});

// ---- 通话记录：realtime-server 挂断时落盘到 video/logs/，这里只读 ----
const CALL_LOG_DIR = process.env.CALL_LOG_DIR
  || join(__serverdir, '..', 'video', 'logs');

app.get('/api/calls', async (_req, res) => {
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const files = (await readdir(CALL_LOG_DIR).catch(() => []))
      .filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 120);
    const list = [];
    for (const f of files) {
      try {
        const d = JSON.parse(await readFile(join(CALL_LOG_DIR, f), 'utf8'));
        list.push({
          file: f, startedAt: d.started_at, duration: d.duration,
          turns: d.turns, video: !!d.video,
          preview: (d.events || []).filter((e) => e.kind === 'him').map((e) => e.text).join(' ').slice(0, 60),
        });
      } catch { /* 坏文件跳过 */ }
    }
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/calls/:file', async (req, res) => {
  const f = String(req.params.file || '');
  if (!/^[\w.-]+\.json$/.test(f)) return res.status(400).json({ error: '文件名不对' });
  try {
    const { readFile } = await import('node:fs/promises');
    res.json(JSON.parse(await readFile(join(CALL_LOG_DIR, f), 'utf8')));
  } catch {
    res.status(404).json({ error: '没有这通记录' });
  }
});

// ---- 错误处理 ----
// SPA 兜底：非 API/媒体路径都回 index.html（永远重新校验，避免旧壳）
app.get(/^\/(?!api\/|static\/|bridge-media\/).*/, (req, res, next) => {
  res.setHeader('cache-control', 'no-cache');
  res.sendFile(join(__v2dist, 'index.html'), (e) => { if (e) next(); });
});

app.use((err, _req, res, _next) => {
  console.error('❌', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

const httpServer = app.listen(cfg.port, () => {
  console.log(`💡 XixiHome 后端已运行于 http://localhost:${cfg.port}`);
  console.log(`   模型默认：${cfg.provider} / ${cfg.model}　钥匙：${cfg.apiKey ? '已配' : '缺！去配置页或 Render 配 MODEL_API_KEY'}`);

  setInterval(() => {
    fetch(`http://localhost:${cfg.port}/health`).catch(() => {});
  }, 14 * 60 * 1000);

  if (cfg.dreamApiKey && cfg.barkKey) {
    const INTERVAL = 3 * 60 * 60 * 1000;
    async function dreamCycle() {
      try {
        const result = await wake({
          provider: cfg.dreamProvider,
          apiKey: cfg.dreamApiKey,
          baseUrl: cfg.dreamBaseUrl,
          model: cfg.dreamModel,
        });
        if (result.action === 'send') {
          await pushBark({ key: cfg.barkKey, body: result.message });
          console.log(`💭 发了：${result.message}`);
        } else {
          console.log(`💭 安静：${result.reason || ''}`);
        }
      } catch (e) {
        console.error('💭 梦出错:', e.message);
      }
    }
    setTimeout(dreamCycle, 60_000);
    setInterval(dreamCycle, INTERVAL);
    console.log('💭 梦已启动，每3小时醒一次');
  }

  const DECAY_INTERVAL = 60 * 60 * 1000;
  setTimeout(() => decayTick().catch((e) => console.error('🌊 记忆衰减出错:', e.message)), 30_000);
  setInterval(() => decayTick().catch((e) => console.error('🌊 记忆衰减出错:', e.message)), DECAY_INTERVAL);
  console.log('🌊 记忆衰减已启动，每小时跑一次');
});

function shutdown(signal) {
  console.log(`\n${signal}: 正在熄灯…`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
