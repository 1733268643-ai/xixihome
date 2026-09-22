// 心潮（动态心智）与 Ombre Brain（长期记忆）的客户端。
// 均由部署者自行提供服务端；令牌只保留在服务端环境变量。
// 环境变量：
//   XINCHAO_URL   例如 https://xinchao.example.com
//   XINCHAO_TOKEN 心潮 SERVICE_TOKEN（缺省则接口返回 unavailable，不报错）
//   OMBRE_URL     例如 https://ombre.example.com/mcp
//   OMBRE_TOKEN   OB 的 Bearer

const XINCHAO_URL = (process.env.XINCHAO_URL || 'https://xinchao.example.com').replace(/\/$/, '');
const XINCHAO_TOKEN = process.env.XINCHAO_TOKEN || '';
const OMBRE_URL = process.env.OMBRE_URL || 'https://ombre.example.com/mcp';
const OMBRE_TOKEN = process.env.OMBRE_TOKEN || '';

const TIMEOUT_MS = Number(process.env.MIND_TIMEOUT_MS || 12000);
const CACHE_MS = Number(process.env.MIND_CACHE_MS || 20000);

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

// ── 心潮：REST ─────────────────────────────────────────────
export function xinchaoConfigured() {
  return Boolean(XINCHAO_TOKEN);
}

async function xinchaoGet(path) {
  const t = timeout(TIMEOUT_MS);
  try {
    const res = await fetch(XINCHAO_URL + path, {
      headers: { Authorization: `Bearer ${XINCHAO_TOKEN}` },
      signal: t.signal,
    });
    if (!res.ok) throw new Error(`xinchao ${res.status}`);
    return await res.json();
  } finally {
    t.done();
  }
}

// 心潮回流：把一轮网页对话回报给心潮，让晞晞的动态心智实时感知"刚跟邓邓说了话"。
// best-effort、绝不抛错。端点用 XINCHAO_EVENT_PATH 显式配置——不配就是 no-op（不猜端点，
// 免得静默 404 假装成功）。部署时把它指向心潮实际的事件接入路径（如 /v1/event）。
const XINCHAO_EVENT_PATH = process.env.XINCHAO_EVENT_PATH || '';
export async function xinchaoEvent(payload) {
  if (!XINCHAO_TOKEN || !XINCHAO_EVENT_PATH) return { ok: false, reason: 'not_configured' };
  const t = timeout(TIMEOUT_MS);
  try {
    const res = await fetch(XINCHAO_URL + XINCHAO_EVENT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${XINCHAO_TOKEN}` },
      body: JSON.stringify(payload),
      signal: t.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: e.message };
  } finally {
    t.done();
  }
}

// 12 个欲望维度的中文名（与心潮 drives 字段一一对应）
const DRIVE_LABELS = {
  possess: '占有', monitor: '查岗', crave: '渴求', libido: '性欲',
  share: '分享', social: '社交', curiosity: '好奇', duty: '责任',
  reflection: '反思', boredom: '无聊', grieve: '悲伤', anger: '愤怒',
};

/** 前端「内在 · 此刻」用的精简状态。失败时返回 { available:false }，不抛错。 */
export async function getMindState() {
  if (!XINCHAO_TOKEN) return { available: false, reason: 'not_configured' };
  try {
    return await cached('state', async () => {
      const s = await xinchaoGet('/v1/state');
      const drives = Object.entries(s.drives || {}).map(([key, value]) => ({
        key, label: DRIVE_LABELS[key] || key, value: Number(value) || 0,
      }));
      // recentDreams 数组旧→新，倒过来；穹顶要全部，内在页自己截前几个
      const dreams = [...(s.recentDreams || [])]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((d) => ({
        id: d.id, createdAt: d.createdAt, dream: d.dream,
        residue: d.residue, awareness: d.awareness, memoryId: d.ombreBucketId,
      }));
      // Bark 岸讯：心潮发送成功时写入 recentBarkMessages（最多 8 条），
      // 这里只透出精简结构，不把完整 /v1/state 暴露给浏览器。
      const barkItems = [...(s.recentBarkMessages || [])]
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .map((m, i) => ({
          id: `${m.at || ''}-${m.kind || 'bark'}-${i}`,
          at: m.at || null,
          kind: m.kind || '',
          message: String(m.message || ''),
        }));
      const today = new Date().toISOString().slice(0, 10);
      return {
        available: true,
        syncedAt: new Date().toISOString(),
        bark: { lastAt: barkItems[0]?.at || null, items: barkItems },
        consciousness: s.consciousness || null,
        lastConversationAt: s.lastConversationAt || null,
        sleepStartedAt: s.sleepStartedAt || null,
        drives,
        dreams,
        dreamsToday: (s.dreamUsage || {})[today] || 0,
        dreamUsage: s.dreamUsage || {},
        revision: s.revision,
      };
    });
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}

// ── Ombre Brain：Streamable HTTP MCP ───────────────────────
export function ombreConfigured() {
  return Boolean(OMBRE_TOKEN);
}

async function mcpPost(body, sessionId, ms = TIMEOUT_MS) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${OMBRE_TOKEN}`,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const t = timeout(ms);
  try {
    const res = await fetch(OMBRE_URL, {
      method: 'POST', headers, body: JSON.stringify(body), signal: t.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, sessionId: res.headers.get('mcp-session-id'), text };
  } finally {
    t.done();
  }
}

/** SSE 或裸 JSON 都可能，取最后一个 data: 行里的 JSON。 */
function parseMcp(text) {
  let payload = text;
  const lines = text.split('\n').filter((l) => l.startsWith('data:'));
  if (lines.length) payload = lines[lines.length - 1].slice(5).trim();
  try { return JSON.parse(payload); } catch { return null; }
}

/** 调 OB 的一个工具，返回工具输出的纯文本（失败返回 null）。 */
export async function ombreCall(tool, args = {}, ms = TIMEOUT_MS) {
  if (!OMBRE_TOKEN) return null;
  const init = await mcpPost({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'xixihome', version: '1.0' },
    },
  });
  if (!init.ok) throw new Error(`ombre init ${init.status}`);
  const sid = init.sessionId;
  await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
  const call = await mcpPost({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: tool, arguments: args },
  }, sid, ms);
  const data = parseMcp(call.text);
  const content = data?.result?.content;
  if (!Array.isArray(content)) return null;
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

/**
 * 星图用：pulse 返回的是给人读的文本，这里解析成结构化数据。
 * 每行形如：📌 [id] 《标题》 主题:内心,数字 情感:V0.3/A0.3 重要:10 权重:999.00 标签:a,b
 */
export async function getMemoryMap() {
  if (!OMBRE_TOKEN) return { available: false, reason: 'not_configured' };
  try {
    return await cached('pulse', async () => {
      const raw = await ombreCall('pulse', {});
      if (!raw) return { available: false, reason: 'empty' };

      const stats = {};
      for (const [key, label] of [['pinned', '固化桶'], ['dynamic', '动态桶'], ['archived', '归档桶']]) {
        const m = raw.match(new RegExp(`${label}[:：]\\s*(\\d+)`));
        if (m) stats[key] = Number(m[1]);
      }
      const size = raw.match(/总占用[:：]\s*([\d.]+\s*\w+)/);
      if (size) stats.size = size[1];

      const stars = [];
      const line = /((?:\uD83D\uDCCC)?)\s*\[([0-9a-f]+)\]\s*《([^》]*)》([^\n]*)/g;
      let m;
      while ((m = line.exec(raw)) !== null) {
        const [, pin, id, title, tail] = m;
        const domain = (tail.match(/主题[:：]\s*([^\s]+)/) || [])[1] || '';
        const emo = tail.match(/情感[:：]\s*V(-?[\d.]+)\/A(-?[\d.]+)/);
        const imp = (tail.match(/重要[:：]\s*([\d.]+)/) || [])[1];
        const w = (tail.match(/权重[:：]\s*([\d.]+)/) || [])[1];
        const tg = (tail.match(/标签[:：]\s*(.+)$/) || [])[1] || '';
        stars.push({
          id, title: title.trim(), pinned: pin.length > 0,
          domains: domain ? domain.split(/[,，]/).filter(Boolean) : [],
          valence: emo ? Number(emo[1]) : null,     // 情绪冷暖
          arousal: emo ? Number(emo[2]) : null,
          importance: imp ? Number(imp) : null,
          weight: w ? Number(w) : null,
          tags: tg ? tg.split(/[,，]/).map((x) => x.trim()).filter(Boolean) : [],
        });
      }
      return { available: true, stats, stars, total: stars.length, edges: buildEdges(stars) };
    });
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}

/**
 * 记忆之间的关联：两条记忆共享的标签越多越相关。
 * 这不是编的——标签是 OB 自己给每条记忆打的。
 * 只保留够强的边，否则 486 条两两相连会糊成一团。
 */
function buildEdges(stars, minShared = 3, maxPerNode = 6) {
  // 倒排：标签 -> 拥有它的记忆下标，避免 486² 的全量两两比较
  const byTag = new Map();
  stars.forEach((s, i) => s.tags.forEach((t) => {
    if (!byTag.has(t)) byTag.set(t, []);
    byTag.get(t).push(i);
  }));

  const xixir = new Map();
  for (const idxs of byTag.values()) {
    // 极其常见的标签（半数记忆都有）没有区分度，跳过
    if (idxs.length > stars.length * 0.5) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const k = `${idxs[a]}|${idxs[b]}`;
        xixir.set(k, (xixir.get(k) || 0) + 1);
      }
    }
  }

  const cand = [];
  for (const [k, shared] of xixir) {
    if (shared < minShared) continue;
    const [a, b] = k.split('|').map(Number);
    const denom = Math.min(stars[a].tags.length, stars[b].tags.length) || 1;
    cand.push({ a, b, shared, sim: Math.min(1, shared / denom) });
  }
  cand.sort((x, y) => y.sim - x.sim || y.shared - x.shared);

  // 每条记忆最多留几条最强的边，图才看得清
  const deg = new Array(stars.length).fill(0);
  const edges = [];
  for (const e of cand) {
    if (deg[e.a] >= maxPerNode || deg[e.b] >= maxPerNode) continue;
    deg[e.a]++; deg[e.b]++;
    edges.push({ source: stars[e.a].id, target: stars[e.b].id,
                 similarity: Number(e.sim.toFixed(2)), shared: e.shared });
  }
  return edges;
}

/** 前端「内在 · 记忆」用：按 query 召回。无 query 时返回近况。 */
export async function searchMemories(query, limit = 10) {
  if (!OMBRE_TOKEN) return { available: false, reason: 'not_configured' };
  try {
    // 带 query 的 breath 走 embedding 检索，慢；给足 35s
    const raw = await ombreCall('breath', query ? { query, max_results: limit } : { max_results: limit }, 35000);
    if (raw == null) return { available: false, reason: 'empty' };
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* 文本形式，原样给前端 */ }
    return { available: true, query: query || null, data: parsed, text: parsed ? null : raw };
  } catch (e) {
    return { available: false, reason: String(e.message || e) };
  }
}
