// 存储层：配了 Supabase 就用云数据库；没配就退回内存存储，
// 这样你今天还没建数据库也能先把家跑起来看看。
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

let supa = null;
if (url && key) {
  supa = createClient(url, key);
  console.log('🗄️  已连接 Supabase');
} else {
  console.log('🗄️  未配置 Supabase，会话使用主机本地文件保存');
}

export const usingSupabase = !!supa;
export const supabase = supa;   // 给 routes/life.js 直接用
export const storageMode = supa ? 'supabase' : 'local-file';

// ---- 内存存储兜底 ----
const mem = {
  sessions: [], // { id, name, created_at, updated_at }
  messages: [], // { id, session_id, role, content, created_at, visible }
  memories: [], // { id, summary, created_at }
  settings: {}, // runtime settings, e.g. model_config
};
let autoId = 1;

// 没有 Supabase 时，聊天也必须住在这台主机上，而不是进程内存里。
// 文件位置可由环境变量覆盖；默认固定在 backend/data，和启动目录无关。
const __dirname = dirname(fileURLToPath(import.meta.url));
const chatStoreFile = process.env.XIXIHOME_CHAT_STORE_FILE || join(__dirname, '..', 'data', 'chat-sessions.json');
let writeQueue = Promise.resolve();

if (!supa) {
  try {
    const saved = JSON.parse(readFileSync(chatStoreFile, 'utf8'));
    mem.sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
    mem.messages = Array.isArray(saved.messages) ? saved.messages : [];
    const ids = [...mem.sessions, ...mem.messages].map((row) => Number(row.id)).filter(Number.isFinite);
    autoId = Math.max(0, ...ids) + 1;
    console.log(`💬 已载入 ${mem.sessions.length} 个本地会话`);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn(`本地会话读取失败：${error.message}`);
  }
}

function persistChats() {
  if (supa) return Promise.resolve();
  const payload = JSON.stringify({ version: 1, sessions: mem.sessions, messages: mem.messages }, null, 2);
  const tempFile = `${chatStoreFile}.tmp`;
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(chatStoreFile), { recursive: true });
    await writeFile(tempFile, payload, { encoding: 'utf8', mode: 0o600 });
    await rename(tempFile, chatStoreFile);
    await chmod(chatStoreFile, 0o600).catch(() => {});
  }).catch((error) => console.error(`本地会话保存失败：${error.message}`));
  return writeQueue;
}

export async function createSession(name = '新的对话') {
  const now = new Date().toISOString();
  if (supa) {
    const { data, error } = await supa
      .from('sessions')
      .insert({ name, created_at: now, updated_at: now })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const s = { id: autoId++, name, created_at: now, updated_at: now };
  mem.sessions.push(s);
  await persistChats();
  return s;
}

export async function renameSession(id, name) {
  const now = new Date().toISOString();
  if (supa) {
    const { error } = await supa
      .from('sessions')
      .update({ name, updated_at: now })
      .eq('id', id);
    if (error) throw error;
    return;
  }
  const s = mem.sessions.find((x) => x.id === id);
  if (s) {
    s.name = name;
    s.updated_at = now;
    await persistChats();
  }
}

export async function deleteSession(id) {
  if (supa) {
    await supa.from('messages').delete().eq('session_id', id);
    await supa.from('sessions').delete().eq('id', id);
    return;
  }
  mem.sessions = mem.sessions.filter((x) => x.id !== id);
  mem.messages = mem.messages.filter((m) => m.session_id !== id);
  await persistChats();
}

export async function listSessions() {
  if (supa) {
    const { data, error } = await supa
      .from('sessions')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return [...mem.sessions].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function addMessage(sessionId, role, content) {
  const now = new Date().toISOString();
  if (supa) {
    const { data, error } = await supa
      .from('messages')
      .insert({ session_id: sessionId, role, content, created_at: now, visible: true })
      .select()
      .single();
    if (error) throw error;
    await supa.from('sessions').update({ updated_at: now }).eq('id', sessionId);
    return data;
  }
  const m = { id: autoId++, session_id: sessionId, role, content, created_at: now, visible: true };
  mem.messages.push(m);
  const s = mem.sessions.find((x) => x.id === sessionId);
  if (s) s.updated_at = now;
  await persistChats();
  return m;
}

export async function getVisibleMessages(sessionId) {
  if (supa) {
    const { data, error } = await supa
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }
  return mem.messages
    .filter((m) => m.session_id === sessionId && m.visible)
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
}

export async function hideMessages(ids) {
  if (!ids.length) return;
  if (supa) {
    await supa.from('messages').update({ visible: false }).in('id', ids);
    return;
  }
  for (const m of mem.messages) if (ids.includes(m.id)) m.visible = false;
  await persistChats();
}

export async function addMemory(summary, opts = {}) {
  const now = new Date().toISOString();
  const row = {
    summary,
    created_at: now,
    weight: opts.weight ?? 1.0,
    intensity: opts.intensity ?? null,
    mood: opts.mood ?? null,
    tags: opts.tags ?? null,
    pinned: opts.pinned ?? false,
  };
  if (supa) {
    const { error } = await supa.from('memories').insert(row);
    if (error) throw error;
    return;
  }
  mem.memories.push({ id: autoId++, ...row, last_surfaced_at: null });
}

export async function getMemories() {
  if (supa) {
    const { data, error } = await supa
      .from('memories')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  }
  return [...mem.memories];
}

// breath浮现：按权重+最近浮现时间取最相关的一批，不是全量塞进prompt。
export async function getTopMemories(limit = 8) {
  if (supa) {
    const { data, error } = await supa
      .from('memories')
      .select('*')
      .order('weight', { ascending: false })
      .order('last_surfaced_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
  return [...mem.memories]
    .sort((a, b) => {
      if (b.weight !== a.weight) return (b.weight ?? 1) - (a.weight ?? 1);
      return (b.last_surfaced_at || '') < (a.last_surfaced_at || '') ? -1 : 1;
    })
    .slice(0, limit);
}

// 被想起的记忆权重回升，且记下这次浮现时间。
export async function bumpMemoryWeight(ids, amount = 0.05) {
  if (!ids || !ids.length) return;
  const now = new Date().toISOString();
  if (supa) {
    for (const id of ids) {
      const { data } = await supa.from('memories').select('weight').eq('id', id).maybeSingle();
      const nextWeight = Math.min(1.0, (data?.weight ?? 1.0) + amount);
      await supa.from('memories').update({ weight: nextWeight, last_surfaced_at: now }).eq('id', id);
    }
    return;
  }
  for (const m of mem.memories) {
    if (ids.includes(m.id)) {
      m.weight = Math.min(1.0, (m.weight ?? 1.0) + amount);
      m.last_surfaced_at = now;
    }
  }
}

// decay tick：非pinned记忆按简化艾宾浩斯曲线衰减权重。每小时调一次，Δh=1。
export async function decayAllMemories(deltaHours = 1) {
  const DECAY_DIVISOR = 504; // 抄Non的常数：intensity=5（默认）时约3周衰减1.0
  const MIN_WEIGHT = 0.05; // 不清零，留一点被重新想起的可能
  if (supa) {
    const { data, error } = await supa.from('memories').select('id, weight, intensity, pinned').eq('pinned', false);
    if (error) throw error;
    for (const row of data || []) {
      const intensity = row.intensity ?? 5;
      const delta = deltaHours / (DECAY_DIVISOR * (0.5 + intensity / 10));
      const nextWeight = Math.max(MIN_WEIGHT, (row.weight ?? 1.0) - delta);
      await supa.from('memories').update({ weight: nextWeight }).eq('id', row.id);
    }
    return data?.length ?? 0;
  }
  let count = 0;
  for (const m of mem.memories) {
    if (m.pinned) continue;
    const intensity = m.intensity ?? 5;
    const delta = deltaHours / (DECAY_DIVISOR * (0.5 + intensity / 10));
    m.weight = Math.max(MIN_WEIGHT, (m.weight ?? 1.0) - delta);
    count++;
  }
  return count;
}

export async function getSetting(name) {
  if (supa) {
    const { data, error } = await supa
      .from('settings')
      .select('value')
      .eq('name', name)
      .maybeSingle();
    if (!error) return data?.value ?? null;
    if (error.code !== '42P01') console.warn(`settings 读取失败：${error.message}`);
  }
  return mem.settings[name] ?? null;
}

export async function setSetting(name, value) {
  if (supa) {
    const { error } = await supa
      .from('settings')
      .upsert({ name, value, updated_at: new Date().toISOString() }, { onConflict: 'name' });
    if (!error) return { persisted: true };
    if (error.code !== '42P01') console.warn(`settings 保存失败：${error.message}`);
  }
  mem.settings[name] = value;
  return { persisted: false };
}
