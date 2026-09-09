// PaiHome ↔ Codex App Server bridge.
//
// The app server stays private on stdio. PaiHome exposes only a small, authenticated
// HTTP surface and keeps a lightweight display history for the mobile client.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CODEX_BRIDGE_CWD || join(__dir, '..', '..');
const CODEX = process.env.CODEX_BIN || join(process.env.HOME || '/home/paihome', '.local', 'bin', 'codex');
const STATE_FILE = process.env.CODEX_BRIDGE_STATE || join(__dir, '..', 'data', 'codex-bridge.json');
const MODEL = process.env.CODEX_BRIDGE_MODEL || null;
const MAX_RECORDS = 500;

const developerInstructions = `请先读取项目根目录 CLAUDE.md 以及其中指定的身份、记忆和项目资料，再开始工作。
你是此部署中由 CLAUDE.md 定义的长期协作助手；模型和终端只是运行载体。连续性必须来自可核验的本地文件、Git 历史以及已配置的可选服务，不能凭空编造。
涉及身份、共同经历或状态时，严格区分已记录事实、合理推断和缺失内容；资料不足时明确说明缺口。
保留用户已有文件与服务。先检查，再行动；高风险、不可逆、外部发送或权限扩张操作必须等待批准。
回复使用自然中文，重要技术细节清楚但不过度铺陈。`;

function blankState() {
  return { threadId: null, model: MODEL || '', effort: '', records: [], updatedAt: 0 };
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const value = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      return { ...blankState(), ...value, records: Array.isArray(value.records) ? value.records.slice(-MAX_RECORDS) : [] };
    }
  } catch (error) {
    console.error('Codex bridge state read failed:', error.message);
  }
  return blankState();
}

let state = loadState();
let child = null;
let lineReader = null;
let startPromise = null;
let ready = false;
let busy = false;
let activeTurnId = null;
let lastError = '';
let modelCatalog = [];
let nextId = 1;
let saveTimer = null;
const pending = new Map();
const approvals = new Map();
const recordByItem = new Map();

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(STATE_FILE), { recursive: true });
      const temp = `${STATE_FILE}.tmp`;
      writeFileSync(temp, JSON.stringify({ ...state, records: state.records.slice(-MAX_RECORDS) }, null, 2));
      renameSync(temp, STATE_FILE);
    } catch (error) {
      console.error('Codex bridge state write failed:', error.message);
    }
  }, 180);
  saveTimer.unref?.();
}

function addRecord(record) {
  const value = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: record.ts || Date.now(),
    ...record,
  };
  state.records.push(value);
  state.records = state.records.slice(-MAX_RECORDS);
  state.updatedAt = Date.now();
  saveSoon();
  return value;
}

function updateRecord(record, patch) {
  if (!record) return;
  Object.assign(record, patch, { updatedAt: Date.now() });
  state.updatedAt = Date.now();
  saveSoon();
}

function sendRaw(message) {
  if (!child?.stdin?.writable) throw new Error('Codex App Server 未连接');
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params = {}, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 等待超时`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer, method });
    sendRaw({ method, id, params });
  });
}

function notification(method, params = {}) {
  sendRaw({ method, params });
}

function itemLabel(item) {
  if (!item) return '工具调用';
  if (item.type === 'commandExecution') {
    const command = Array.isArray(item.command) ? item.command.join(' ') : String(item.command || '');
    return command ? `运行 ${command.slice(0, 120)}` : '运行主机命令';
  }
  if (item.type === 'fileChange') return '修改文件';
  if (item.type === 'mcpToolCall') return item.tool ? `调用 ${item.tool}` : '调用工具';
  if (item.type === 'dynamicToolCall') return item.tool ? `调用 ${item.tool}` : '调用工具';
  if (item.type === 'webSearch') return '搜索资料';
  if (item.type === 'imageView') return '查看图片';
  if (item.type === 'plan') return '整理计划';
  return String(item.type || '工具调用');
}

function compactOutput(value, max = 6000) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}\n…（输出已截断）` : text;
}

function handleServerRequest(message) {
  const method = message.method;
  if (!method || message.id == null) return;
  if (method.includes('requestApproval') || method === 'execCommandApproval' || method === 'applyPatchApproval') {
    const approvalId = String(message.id);
    const params = message.params || {};
    approvals.set(approvalId, { id: approvalId, rpcId: message.id, method, params, ts: Date.now() });
    addRecord({
      role: 'approval', approvalId,
      text: params.reason || params.command || (method.includes('fileChange') ? '请求修改工作区文件' : '请求执行操作'),
      meta: { command: params.command || '', cwd: params.cwd || '', method },
    });
    return;
  }
  // Unknown server-side requests must fail closed instead of hanging forever.
  sendRaw({ id: message.id, error: { code: -32601, message: `PaiHome 暂不支持 ${method}` } });
}

function handleNotification(method, params) {
  if (method === 'turn/started') {
    busy = true;
    activeTurnId = params.turn?.id || activeTurnId;
    lastError = '';
    return;
  }
  if (method === 'item/started') {
    const item = params.item || {};
    if (item.type === 'agentMessage') {
      const record = addRecord({ role: 'assistant', text: '', streaming: true, itemId: item.id });
      recordByItem.set(item.id, record);
    } else if (!['reasoning', 'userMessage'].includes(item.type)) {
      const record = addRecord({ role: 'tool', kind: item.type, text: itemLabel(item), output: '', status: 'running', itemId: item.id });
      recordByItem.set(item.id, record);
    }
    return;
  }
  if (method === 'item/agentMessage/delta') {
    let record = recordByItem.get(params.itemId);
    if (!record) {
      record = addRecord({ role: 'assistant', text: '', streaming: true, itemId: params.itemId });
      recordByItem.set(params.itemId, record);
    }
    updateRecord(record, { text: `${record.text || ''}${params.delta || ''}`, streaming: true });
    return;
  }
  if (method === 'item/commandExecution/outputDelta' || method === 'item/fileChange/outputDelta' || method === 'item/mcpToolCall/progress') {
    const record = recordByItem.get(params.itemId);
    if (record) updateRecord(record, { output: compactOutput(`${record.output || ''}${params.delta || params.message || ''}`) });
    return;
  }
  if (method === 'item/completed') {
    const item = params.item || {};
    let record = recordByItem.get(item.id);
    if (item.type === 'agentMessage') {
      const finalText = item.text || item.content || record?.text || '';
      if (!record) record = addRecord({ role: 'assistant', text: String(finalText), itemId: item.id });
      updateRecord(record, { text: String(finalText), streaming: false });
    } else if (record) {
      const output = item.aggregatedOutput || item.output || item.result || record.output || '';
      updateRecord(record, { output: compactOutput(typeof output === 'string' ? output : JSON.stringify(output, null, 2)), status: item.status || 'completed' });
    }
    recordByItem.delete(item.id);
    return;
  }
  if (method === 'turn/completed') {
    busy = false;
    activeTurnId = null;
    for (const record of recordByItem.values()) {
      if (record.role === 'assistant') updateRecord(record, { streaming: false });
      else updateRecord(record, { status: record.status === 'running' ? 'completed' : record.status });
    }
    recordByItem.clear();
    const error = params.turn?.error;
    if (error) {
      lastError = error.message || String(error);
      addRecord({ role: 'system', text: `Codex 出错了：${lastError}` });
    }
    return;
  }
  if (method === 'error' && !params.willRetry) {
    lastError = params.error?.message || 'Codex 出错了';
  }
}

function handleLine(line) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id != null && !message.method) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message || `${waiter.method} 失败`));
    else waiter.resolve(message.result);
    return;
  }
  if (message.id != null && message.method) handleServerRequest(message);
  else if (message.method) handleNotification(message.method, message.params || {});
}

async function initialize() {
  await request('initialize', {
    clientInfo: { name: 'paihome', title: 'PaiHome', version: '0.1.0' },
  });
  notification('initialized');

  try {
    const listed = await request('model/list', { limit: 50, includeHidden: false }, 30000);
    modelCatalog = Array.isArray(listed?.data) ? listed.data : [];
    const selected = modelCatalog.find((item) => (item.model || item.id) === state.model)
      || modelCatalog.find((item) => item.isDefault) || modelCatalog[0];
    if (!state.model && selected) state.model = selected.model || selected.id;
    if (!state.effort && selected) state.effort = selected.defaultReasoningEffort
      || selected.supportedReasoningEfforts?.[0]?.reasoningEffort || '';
  } catch (error) {
    console.warn('Codex model list unavailable:', error.message);
  }

  const common = {
    cwd: ROOT,
    model: state.model || MODEL,
    effort: state.effort || undefined,
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    sandbox: 'workspace-write',
    developerInstructions,
  };
  let result;
  if (state.threadId) {
    try {
      result = await request('thread/resume', { ...common, threadId: state.threadId }, 45000);
    } catch (error) {
      console.warn('Codex thread resume failed, starting a new thread:', error.message);
      state.threadId = null;
    }
  }
  if (!result) result = await request('thread/start', common, 45000);
  state.threadId = result?.thread?.id || state.threadId;
  state.model = result?.model || MODEL || state.model;
  ready = true;
  lastError = '';
  saveSoon();
}

export function start() {
  if (ready && child) return Promise.resolve();
  if (startPromise) return startPromise;
  startPromise = new Promise((resolve, reject) => {
    if (!existsSync(CODEX)) {
      reject(new Error(`找不到 Codex：${CODEX}`));
      return;
    }
    child = spawn(CODEX, ['app-server'], {
      cwd: ROOT,
      env: { ...process.env, HOME: process.env.HOME || '/home/paihome' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    lineReader = readline.createInterface({ input: child.stdout });
    lineReader.on('line', handleLine);
    child.stderr.on('data', (chunk) => {
      const line = String(chunk || '').trim();
      if (line) console.error('Codex App Server:', line.slice(0, 500));
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      ready = false; busy = false; activeTurnId = null; child = null; startPromise = null;
      lastError = code == null ? 'Codex App Server 已停止' : `Codex App Server 已退出（${code}）`;
      for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(lastError)); }
      pending.clear();
    });
    initialize().then(resolve, reject);
  }).finally(() => { startPromise = null; });
  return startPromise;
}

export async function status() {
  try { await start(); } catch (error) { lastError = error.message; }
  return {
    available: existsSync(CODEX), alive: Boolean(child && ready), busy,
    threadId: state.threadId, model: state.model || MODEL || 'Codex', effort: state.effort || '', cwd: ROOT,
    lastError, count: state.records.length,
    approvals: [...approvals.values()].map(({ rpcId, ...value }) => value),
  };
}

export function history({ limit } = {}) {
  return state.records.slice(-(Number(limit) || 300));
}

export async function models() {
  await start();
  return {
    models: modelCatalog.map((item) => ({
      id: item.id || item.model,
      model: item.model || item.id,
      displayName: item.displayName || item.model || item.id,
      isDefault: Boolean(item.isDefault),
      defaultReasoningEffort: item.defaultReasoningEffort || '',
      supportedReasoningEfforts: Array.isArray(item.supportedReasoningEfforts)
        ? item.supportedReasoningEfforts : [],
    })),
    model: state.model || MODEL || '',
    effort: state.effort || '',
  };
}

export async function setSettings({ model, effort }) {
  if (busy) throw new Error('顾川正在回应，等这句话说完再切换');
  await start();
  const chosen = modelCatalog.find((item) => (item.model || item.id) === String(model || state.model));
  if (!chosen) throw new Error('这个模型当前账号不可用');
  const supported = (chosen.supportedReasoningEfforts || []).map((item) => item.reasoningEffort);
  const nextEffort = String(effort || chosen.defaultReasoningEffort || supported[0] || '');
  if (nextEffort && supported.length && !supported.includes(nextEffort)) {
    throw new Error('这个模型不支持所选思考强度');
  }
  state.model = chosen.model || chosen.id;
  state.effort = nextEffort;
  saveSoon();
  return { ok: true, model: state.model, effort: state.effort };
}

export async function send({ text, image }) {
  text = String(text || '').trim();
  if (!text && !image) throw new Error('消息不能为空');
  if (busy) throw new Error('顾川还在处理上一条消息');
  await start();
  const input = [];
  if (text) input.push({ type: 'text', text });
  if (image) input.push({ type: 'image', url: String(image), detail: 'auto' });
  addRecord({ role: 'user', text, image: image || null });
  busy = true;
  try {
    const result = await request('turn/start', {
      threadId: state.threadId, input,
      model: state.model || MODEL || undefined,
      effort: state.effort || undefined,
    }, 45000);
    activeTurnId = result?.turn?.id || activeTurnId;
    return { ok: true, turnId: result?.turn?.id, threadId: state.threadId };
  } catch (error) {
    busy = false; lastError = error.message;
    addRecord({ role: 'system', text: `没送到 Codex：${error.message}` });
    throw error;
  }
}

export async function interrupt() {
  if (!busy || !state.threadId || !activeTurnId) return { ok: true, interrupted: false };
  const result = await request('turn/interrupt', { threadId: state.threadId, turnId: activeTurnId });
  busy = false; activeTurnId = null;
  return { ok: true, interrupted: true, result };
}

export function decideApproval(id, decision) {
  const approval = approvals.get(String(id));
  if (!approval) throw new Error('这个审批已经失效');
  const allowed = new Set(['accept', 'acceptForSession', 'decline', 'cancel']);
  if (!allowed.has(decision)) throw new Error('审批选项不正确');
  sendRaw({ id: approval.rpcId, result: { decision } });
  approvals.delete(String(id));
  const record = state.records.find((r) => r.approvalId === String(id));
  updateRecord(record, { role: 'system', text: decision.startsWith('accept') ? '已批准这项操作' : '已拒绝这项操作', decision });
  return { ok: true };
}

export async function newThread() {
  await start();
  const chosenModel = state.model || MODEL || '';
  const chosenEffort = state.effort || '';
  const result = await request('thread/start', {
    cwd: ROOT, model: chosenModel || undefined, effort: chosenEffort || undefined,
    approvalPolicy: 'on-request', approvalsReviewer: 'auto_review',
    sandbox: 'workspace-write', developerInstructions,
  }, 45000);
  state = {
    ...blankState(), threadId: result?.thread?.id,
    model: result?.model || chosenModel, effort: chosenEffort,
  };
  approvals.clear(); recordByItem.clear(); busy = false; activeTurnId = null; lastError = '';
  saveSoon();
  return { ok: true, threadId: state.threadId, model: state.model };
}

export function shutdown() {
  try { lineReader?.close(); } catch { /* ignore */ }
  try { child?.kill('SIGTERM'); } catch { /* ignore */ }
}
