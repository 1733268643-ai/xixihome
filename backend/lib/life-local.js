// 生活记录的本地存储：日历事件 + 健康记录，存主机本地 JSON。
// 2026-08-31 起替代 Supabase（旧云库随 Render 时代退役，数据全新开始）。
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = process.env.XIXIHOME_LIFE_STORE_FILE || join(__dirname, '..', 'data', 'life.json');

const db = { events: [], health_logs: [] };
try {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  db.events = Array.isArray(saved.events) ? saved.events : [];
  db.health_logs = Array.isArray(saved.health_logs) ? saved.health_logs : [];
  console.log(`📅 已载入本地生活记录：${db.events.length} 条事件 / ${db.health_logs.length} 条健康记录`);
} catch (e) {
  if (e?.code !== 'ENOENT') console.warn(`本地生活记录读取失败：${e.message}`);
}

let writeQueue = Promise.resolve();
function persist() {
  const payload = JSON.stringify({ version: 1, ...db }, null, 2);
  const tmp = `${FILE}.tmp`;
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(FILE), { recursive: true });
    await writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, FILE);
    await chmod(FILE, 0o600).catch(() => {});
  }).catch((e) => console.error(`本地生活记录保存失败：${e.message}`));
  return writeQueue;
}

// ── 日历事件（形状与旧 Supabase rows 一致：id,title,note,date,source,ob_id）──
export function listEvents(from, to) {
  return db.events
    .filter((e) => e.date >= from && e.date < to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function addEvent({ title, date, note, source, obId }) {
  const row = {
    id: randomUUID(),
    title, date,
    note: note || null,
    source: source === 'ob' ? 'ob' : 'manual',
    ob_id: obId || null,
    created_at: new Date().toISOString(),
  };
  db.events.push(row);
  await persist();
  return row;
}

export async function updateEvent(id, patch) {
  const row = db.events.find((e) => e.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  await persist();
  return row;
}

export async function deleteEvent(id) {
  db.events = db.events.filter((e) => e.id !== id);
  await persist();
}

// ── 健康记录（id,kind,value,note,logged_at）──────────────────
export function listHealth({ kind, since, limit = 400 }) {
  return db.health_logs
    .filter((r) => (!kind || r.kind === kind) && (!since || r.logged_at >= since))
    .sort((a, b) => (a.logged_at > b.logged_at ? -1 : 1))
    .slice(0, limit);
}

export async function addHealth({ kind, value, note, loggedAt }) {
  const row = {
    id: randomUUID(),
    kind,
    value: value != null && value !== '' ? Number(value) : null,
    note: note || null,
    logged_at: loggedAt ? new Date(loggedAt).toISOString() : new Date().toISOString(),
  };
  db.health_logs.push(row);
  await persist();
  return row;
}

export async function deleteHealth(id) {
  db.health_logs = db.health_logs.filter((r) => r.id !== id);
  await persist();
}
