// 私有接入代理：一起阅读 / 网易云 MCP / 小克网关。
// token 全部只在服务端（.env / 托管平台环境变量），前端永远拿不到。
import express from 'express';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
// ESM 的 import 会先于 server.js 主体执行，所以这份 env 得在这里自己加载。
// 注意路径里有中文，必须 fileURLToPath，.pathname 会百分号转义。
dotenvConfig({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const READING_URL = (process.env.READING_API_URL || '').replace(/\/$/, '');
const READING_TOKEN = process.env.READING_API_TOKEN || '';
const NETEASE_URL = process.env.NETEASE_MCP_URL || '';
const NETEASE_TOKEN = process.env.NETEASE_MCP_TOKEN || '';

const TIMEOUT_MS = 12000;
const CACHE_MS = 30000;
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.val;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

function timeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// ── 一起阅读（部署者自行提供服务）──────────────────────────
async function readingGet(path) {
  const t = timeout(TIMEOUT_MS);
  try {
    const res = await fetch(READING_URL + path, {
      headers: { Authorization: `Bearer ${READING_TOKEN}` }, signal: t.signal,
    });
    if (!res.ok) throw new Error(`reading ${res.status}`);
    return await res.json();
  } finally { t.done(); }
}

// ── 网易云（MCP over HTTP）────────────────────────────────
async function neteaseMcp(body, session) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${NETEASE_TOKEN}`,
  };
  if (session) headers['mcp-session-id'] = session;
  const t = timeout(TIMEOUT_MS);
  try {
    const res = await fetch(NETEASE_URL, {
      method: 'POST', headers, body: JSON.stringify(body), signal: t.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, session: res.headers.get('mcp-session-id'), text };
  } finally { t.done(); }
}

function parseMcp(text) {
  let payload = text;
  const lines = text.split('\n').filter((l) => l.startsWith('data:'));
  if (lines.length) payload = lines[lines.length - 1].slice(5).trim();
  try { return JSON.parse(payload); } catch { return null; }
}

async function neteaseCall(tool, args = {}) {
  const init = await neteaseMcp({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'xixihome', version: '1.0' },
    },
  });
  if (!init.ok) throw new Error(`netease init ${init.status}`);
  await neteaseMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.session);
  const call = await neteaseMcp({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: tool, arguments: args },
  }, init.session);
  const data = parseMcp(call.text);
  const content = data?.result?.content;
  if (!Array.isArray(content)) return null;
  const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  try { return JSON.parse(text); } catch { return text; }
}

// ── 路由 ─────────────────────────────────────────────────
const router = express.Router();

/** 在读卡片：书名 + 两个人各读到哪 + 他画的线 */
router.get('/reading/card', async (_req, res) => {
  if (!READING_TOKEN) return res.json({ available: false, reason: 'not_configured' });
  try {
    res.json(await cached('reading', () => readingGet('/api/card')));
  } catch (e) {
    res.json({ available: false, reason: String(e.message || e) });
  }
});

/** 网易云正在放什么 */
router.get('/netease/status', async (_req, res) => {
  if (!NETEASE_TOKEN) return res.json({ available: false, reason: 'not_configured' });
  try {
    res.json({ available: true, data: await cached('netease', () => neteaseCall('netease_status')) });
  } catch (e) {
    res.json({ available: false, reason: String(e.message || e) });
  }
});

/** 搜歌（只读） */
router.get('/netease/search', async (req, res) => {
  if (!NETEASE_TOKEN) return res.json({ available: false, reason: 'not_configured' });
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ available: false, reason: 'empty_query' });
  try {
    res.json({ available: true, data: await neteaseCall('netease_search', { query: q }) });
  } catch (e) {
    res.json({ available: false, reason: String(e.message || e) });
  }
});

// ── 小克（StackChan MCP over HTTP）────────────────────────
const STACKCHAN_URL = process.env.STACKCHAN_MCP_URL || '';
const STACKCHAN_TOKEN = process.env.STACKCHAN_MCP_TOKEN || '';

async function stackchanMcp(body, session) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${STACKCHAN_TOKEN}`,
  };
  if (session) headers['mcp-session-id'] = session;
  const t = timeout(25000);
  try {
    const res = await fetch(STACKCHAN_URL, {
      method: 'POST', headers, body: JSON.stringify(body), signal: t.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, session: res.headers.get('mcp-session-id'), text };
  } finally { t.done(); }
}

async function stackchanCall(tool, args = {}) {
  const init = await stackchanMcp({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'xixihome', version: '1.0' },
    },
  });
  if (!init.ok) throw new Error(`stackchan init ${init.status}`);
  await stackchanMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.session);
  const call = await stackchanMcp({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: tool, arguments: args },
  }, init.session);
  const data = parseMcp(call.text);
  if (data?.error) throw new Error(data.error.message || 'mcp error');
  const content = data?.result?.content;
  if (!Array.isArray(content)) return null;
  const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  try { return JSON.parse(text); } catch { return text; }
}

// 小克页允许的操作——白名单，别的工具一概不代理
const KE_TOOLS = new Set([
  'get_status', 'get_device_info', 'set_avatar', 'say', 'move_head',
  'set_volume', 'set_brightness', 'take_photo', 'get_head_angles',
]);

router.get('/ke/status', async (_req, res) => {
  if (!STACKCHAN_TOKEN) return res.json({ available: false, reason: 'not_configured' });
  try {
    const [st, info] = await Promise.all([
      stackchanCall('get_status'), stackchanCall('get_device_info').catch(() => null),
    ]);
    res.json({ available: true, status: st, info });
  } catch (e) {
    res.json({ available: false, reason: String(e.message || e) });
  }
});

router.post('/ke/call', async (req, res) => {
  if (!STACKCHAN_TOKEN) return res.json({ available: false, reason: 'not_configured' });
  const { tool, args } = req.body || {};
  if (!KE_TOOLS.has(tool)) return res.status(400).json({ error: '这个工具不在小克页的白名单里' });
  try {
    res.json({ available: true, data: await stackchanCall(tool, args || {}) });
  } catch (e) {
    res.json({ available: false, reason: String(e.message || e) });
  }
});

// ── VPS 体检（只读 metrics 服务）───────────────────────────
const METRICS_URL = process.env.VPS_METRICS_URL || '';
const METRICS_TOKEN = process.env.VPS_METRICS_TOKEN || '';

router.get('/engine/metrics', async (_req, res) => {
  if (!METRICS_TOKEN) return res.json({ available: false, reason: 'not_configured' });
  const t = timeout(12000);
  try {
    const r = await fetch(METRICS_URL, {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` }, signal: t.signal,
    });
    if (!r.ok) throw new Error(`metrics ${r.status}`);
    res.json({ available: true, ...(await r.json()) });
  } catch (e) {
    res.json({ available: false, reason: String(e.message || e) });
  } finally { t.done(); }
});

/** 前端启动时问一次：这些接入哪个活着 */
router.get('/status', (_req, res) => {
  res.json({
    reading: Boolean(READING_TOKEN),
    netease: Boolean(NETEASE_TOKEN),
    stackchan: Boolean(process.env.STACKCHAN_MCP_TOKEN),
  });
});

export default router;
