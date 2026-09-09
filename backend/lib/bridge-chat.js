// tmux 桥：PaiHome 聊天直连蟹堡 tmux 窗口（多窗口版，2026-08-31）。
//
//   发：她的话 → tmux load-buffer/paste-buffer + send-keys 注入对应会话
//   收：claude 窗口用 Stop hook（scripts/paihome-stop-hook.sh）、
//       codex 窗口用 notify 钩子（scripts/codex-notify.sh），
//       都 POST 到 /api/bridge/reply（带 win）落进各自历史
//
// 历史：backend/data/bridge-<win>.jsonl，一行一条 {ts, role, text, source}
// 兼容：默认窗口 guchuan 沿用老文件 bridge-chat.jsonl；语音桥固定走 guchuan。

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, '..', 'data');
const VOICE_ACTIVE = process.env.VOICE_ACTIVE_FLAG || '/tmp/voice-call-active';

// 窗口注册表：kind 决定允许的 pane 程序
export const WINDOWS = {
  guchuan: {
    session: process.env.BRIDGE_TMUX_SESSION || 'guchuan',
    kind: 'claude',
    label: '顾川',
    file: process.env.BRIDGE_CHAT_FILE || join(DATA, 'bridge-chat.jsonl'),
  },
  workbench: {
    session: 'workbench',
    kind: 'codex',
    label: '工作台',
    file: join(DATA, 'bridge-workbench.jsonl'),
  },
  device: {
    session: 'device',
    kind: 'claude',
    label: '设备窗口',
    file: join(DATA, 'bridge-device.jsonl'),
  },
};
const DEFAULT_WIN = 'guchuan';
const ALLOWED_PANES = { claude: ['claude', 'node'], codex: ['codex', 'node'] };

export function resolveWin(win) {
  return WINDOWS[win] ? win : DEFAULT_WIN;
}

const caches = new Map();   // win -> records[]
const typings = new Map();  // win -> { is, since }
const voice = { active: null, queue: [] };

export function typingOf(win) {
  const key = resolveWin(win);
  if (!typings.has(key)) typings.set(key, { is: false, since: 0 });
  return typings.get(key);
}
// 兼容旧引用（voice-proxy 等直接摸 typing 的地方指向 guchuan）
export const typing = typingOf(DEFAULT_WIN);

function load(win) {
  const key = resolveWin(win);
  if (caches.has(key)) return caches.get(key);
  const list = [];
  try {
    const file = WINDOWS[key].file;
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { list.push(JSON.parse(line)); } catch { /* 坏行跳过 */ }
      }
    }
  } catch (e) { console.error(`bridge[${key}] 历史读取失败:`, e.message); }
  caches.set(key, list);
  return list;
}

export function append(win, role, text, source, extra) {
  const key = resolveWin(win);
  const rec = { ts: Date.now(), role, text: String(text), source: source || null, ...(extra || {}) };
  load(key).push(rec);
  try {
    mkdirSync(DATA, { recursive: true });
    appendFileSync(WINDOWS[key].file, JSON.stringify(rec) + '\n');
  } catch (e) { console.error(`bridge[${key}] 历史写入失败:`, e.message); }
  return rec;
}

export function history(win, { since, limit } = {}) {
  const all = load(win);
  if (since) return all.filter((r) => r.ts > Number(since));
  return all.slice(-(Number(limit) || 200));
}

function tmux(...args) {
  return spawnSync('tmux', args, { encoding: 'utf8', timeout: 5000 });
}

export function sessionAlive(win) {
  return tmux('has-session', '-t', WINDOWS[resolveWin(win)].session).status === 0;
}

export function paneCommand(win) {
  const r = tmux('display-message', '-p', '-t', WINDOWS[resolveWin(win)].session, '#{pane_current_command}');
  return r.status === 0 ? r.stdout.trim() : null;
}

// 注入她的话：bracketed paste 整段贴进去，等输入框吃完再回车
export function inject(win, text) {
  const key = resolveWin(win);
  const { session, kind, label } = WINDOWS[key];
  if (!sessionAlive(key)) return { ok: false, error: `tmux 会话 ${session} 不存在——${label}的窗口没开` };
  const cmd = paneCommand(key);
  if (!ALLOWED_PANES[kind].includes(cmd)) {
    return { ok: false, error: `会话 ${session} 里跑的是 ${cmd || '未知'}，${kind} 没在里面` };
  }
  const loaded = spawnSync('tmux', ['load-buffer', '-b', 'paihome', '-'], { input: text, encoding: 'utf8', timeout: 5000 });
  if (loaded.status !== 0) return { ok: false, error: 'tmux load-buffer 失败: ' + loaded.stderr };
  const pasted = tmux('paste-buffer', '-p', '-b', 'paihome', '-d', '-t', session);
  if (pasted.status !== 0) return { ok: false, error: 'tmux paste-buffer 失败: ' + pasted.stderr };
  // 回车前等粘贴被输入框完全吃进去：窗口忙时太快会把半截前缀发出去（2026-08-31 发生过）
  setTimeout(() => tmux('send-keys', '-t', session, 'Enter'), 900);
  const t = typingOf(key);
  t.is = true; t.since = Date.now();
  return { ok: true, session };
}

function voicePrompt(turn) {
  const prosody = turn.prosody?.label ? `\n语气参考：${turn.prosody.label}` : '';
  const say = process.env.PAIVOICE_SAY_SCRIPT || 'scripts/pai-voice-say.sh';
  return `[PHONE CALL / turn ${turn.turnId}]\n用户正在电话里说：${turn.text}${prosody}\n\n请像电话里自然地简短回应。先执行：\n${say} "你的第一句" "${turn.turnId}"\n若还要说第二句，再执行一次；说完执行：\n${say} --done "${turn.turnId}"\n不要解释这套协议，也不要把命令或内部状态念给对方听。`;
}

function pumpVoice() {
  if (voice.active || typingOf(DEFAULT_WIN).is) return;
  while (voice.queue.length) {
    if (!existsSync(VOICE_ACTIVE)) { voice.queue = []; return; }
    const turn = voice.queue.shift();
    const sent = inject(DEFAULT_WIN, voicePrompt(turn));
    if (!sent.ok) { voice.queue.unshift(turn); return; }
    voice.active = turn;
    return;
  }
}

export function enqueueVoice({ callSessionId, turnId, text, prosody } = {}) {
  if (!existsSync(VOICE_ACTIVE)) return { ok: false, error: '当前没有进行中的电话' };
  if (!callSessionId || !turnId || !String(text || '').trim()) return { ok: false, error: '语音轮次不完整' };
  voice.queue.push({ callSessionId, turnId, text: String(text).trim().slice(0, 2400), prosody: prosody || null });
  pumpVoice();
  return { ok: true, queued: voice.queue.length + (voice.active ? 1 : 0), session: WINDOWS[DEFAULT_WIN].session };
}

export function completeReply(win) {
  const t = typingOf(win);
  t.is = false; t.since = 0;
  if (resolveWin(win) === DEFAULT_WIN) {
    voice.active = null;
    setTimeout(pumpVoice, 40);
  }
}

// ── 模型 / 推理强度（注入 /model /effort 斜杠命令）──────────
// 设置持久在 backend/data/bridge-settings.json；只记"我们上次设的值"，
// 窗口里手动改过的话以窗口为准（我们无法读回，界面注明）。
const SETTINGS_FILE = join(DATA, 'bridge-settings.json');
let winSettings = null;
function loadSettings() {
  if (winSettings) return winSettings;
  try { winSettings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { winSettings = {}; }
  return winSettings;
}
export function getWinSettings(win) {
  return loadSettings()[resolveWin(win)] || {};
}
export function saveWinSettings(win, patch) {
  const all = loadSettings();
  const key = resolveWin(win);
  all[key] = { ...(all[key] || {}), ...patch };
  try {
    mkdirSync(DATA, { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch (e) { console.error('bridge 设置保存失败:', e.message); }
  return all[key];
}

/** 注入斜杠命令（claude 窗口）：命令 + 回车，再补一个回车确认可能弹出的滑杆/选择器 */
export function injectCommand(win, command) {
  const key = resolveWin(win);
  const { session, kind } = WINDOWS[key];
  if (kind !== 'claude') return { ok: false, error: '这个窗口不吃 claude 斜杠命令' };
  if (!sessionAlive(key)) return { ok: false, error: `窗口 ${session} 没开` };
  const cmd = paneCommand(key);
  if (!ALLOWED_PANES.claude.includes(cmd)) return { ok: false, error: `窗口里跑的是 ${cmd || '未知'}` };
  const r1 = tmux('send-keys', '-t', session, command);
  if (r1.status !== 0) return { ok: false, error: 'tmux send-keys 失败' };
  setTimeout(() => tmux('send-keys', '-t', session, 'Enter'), 350);
  setTimeout(() => tmux('send-keys', '-t', session, 'Enter'), 1500);  // 确认滑杆；空回车无副作用
  return { ok: true };
}

// ── 审批（PermissionRequest hook 挂起队列）────────────────
// hook 打过来的请求悬在这里等手机上的决定；超时由 hook 侧兜底（回落终端弹窗）。
const approvalQueues = new Map();   // win -> [{ id, ts, toolName, toolInput, mode, suggestions, resolve }]
const permissionModes = new Map();  // win -> 最近一次 hook 报告的 permission_mode

function queueOf(win) {
  const key = resolveWin(win);
  if (!approvalQueues.has(key)) approvalQueues.set(key, []);
  return approvalQueues.get(key);
}

export function createApproval(win, { sessionId, mode, toolName, toolInput, suggestions }) {
  const key = resolveWin(win);
  if (mode) permissionModes.set(key, mode);
  const id = `apv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  queueOf(key).push({ id, ts: Date.now(), sessionId: sessionId || null, mode: mode || null,
                      toolName, toolInput, suggestions: suggestions || null, resolve });
  return { id, promise };
}

export function decideApprovalReq(win, id, decision, setMode) {
  const q = queueOf(win);
  const i = q.findIndex((a) => a.id === id);
  if (i < 0) return { ok: false, error: '这条批准已经过期或被处理了' };
  const [a] = q.splice(i, 1);
  a.resolve({ decision: decision === 'allow' ? 'allow' : 'deny', setMode: setMode || null });
  return { ok: true };
}

export function dropApproval(win, id) {
  const q = queueOf(win);
  const i = q.findIndex((a) => a.id === id);
  if (i >= 0) q.splice(i, 1);
}

export function pendingApprovals(win) {
  return queueOf(win).map(({ id, ts, mode, toolName, toolInput }) => ({
    id, ts, mode,
    toolName,
    // 只透出人类可读摘要，不整包 tool_input
    summary: summarizeTool(toolName, toolInput),
  }));
}

function summarizeTool(name, input) {
  if (!input || typeof input !== 'object') return name;
  const v = input.command || input.file_path || input.url || input.pattern || input.description || '';
  return String(v).slice(0, 300);
}

export function permissionModeOf(win) {
  return permissionModes.get(resolveWin(win)) || null;
}

export function status(win) {
  const key = resolveWin(win);
  const t = typingOf(key);
  return {
    win: key,
    session: WINDOWS[key].session,
    kind: WINDOWS[key].kind,
    label: WINDOWS[key].label,
    alive: sessionAlive(key),
    pane: paneCommand(key),
    typing: t.is,
    typingSince: t.since,
    voiceActive: key === DEFAULT_WIN ? (voice.active?.turnId || null) : null,
    voiceQueued: key === DEFAULT_WIN ? voice.queue.length : 0,
    count: load(key).length,
    approvals: pendingApprovals(key),
    permissionMode: permissionModeOf(key),
  };
}

/** 窗口列表：给前端 window-lists 用 */
export function listWindows() {
  return Object.keys(WINDOWS).map((key) => {
    const st = status(key);
    const recs = load(key);
    return {
      win: key, label: WINDOWS[key].label, kind: WINDOWS[key].kind,
      session: WINDOWS[key].session, alive: st.alive, pane: st.pane,
      typing: st.typing, lastTs: recs[recs.length - 1]?.ts || null, count: recs.length,
    };
  });
}
