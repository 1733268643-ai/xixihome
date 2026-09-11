// 模型调用层：支持 Claude（Anthropic 原生）、OpenAI 兼容接口（DeepSeek / OpenAI / 中转），
// 以及 provider='claude-cli' —— 直接起本机 `claude -p` 子进程当聊天后端（晞晞跑在 Claude Code 上）。

import { spawn } from 'node:child_process';

const ANTHROPIC_VERSION = '2023-06-01';

// —— claude -p（Claude Code CLI）后端 ——
// 设计：xixihome 仍然自己管会话和记忆（每轮把 persona+浮现记忆拼进 --system-prompt，
// 上下文拼进 prompt 走 stdin）。所以这里是无状态的——不用 claude 的 session/--resume，
// 反而正好配合 xixihome 的"按轮浮现记忆"注入。

// 默认屏蔽的工具：晞晞是聊天伴侣，不该动文件/跑命令。部署时可用 CLAUDE_CLI_DISALLOWED_TOOLS 覆盖。
const DEFAULT_DISALLOWED_TOOLS = [
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'TodoWrite',
];

// xixihome 的 messages 数组 → 给 claude -p 的单条 prompt。
// claude -p 只吃一条 prompt，所以拼成对话记录；身份/回应规则由 --system-prompt（persona）建立，
// 最后一句是邓邓要回应的话。content 可能是字符串或 [{type,text|image_url}]（图片这里降级成占位）。
function renderTranscript(messages) {
  return (messages || [])
    .map((m) => {
      const who = m.role === 'user' ? '邓邓' : '晞晞';
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content || []).map((c) => (c.type === 'text' ? c.text : '［图片］')).join(' ');
      return `${who}：${text}`;
    })
    .join('\n');
}

// 解析一行 stream-json 事件，取出增量。返回 {type:'text'|'thinking', text} 或 null。
function parseStreamEvent(ev) {
  if (ev.type === 'stream_event' && ev.event) {
    const e = ev.event;
    if (e.type === 'content_block_delta' && e.delta) {
      if (e.delta.type === 'text_delta') return { type: 'text', text: e.delta.text };
      if (e.delta.type === 'thinking_delta') return { type: 'thinking', text: e.delta.thinking };
    }
  }
  return null;
}

// 流式调用 claude -p。onEvent({type,text}) 收增量；resolve 完整正文（不含 thinking）。
// signal 可选（AbortSignal）：前端断开就 kill 子进程。
export function chatStreamCLI({ model, system, messages, onEvent, signal, cwd, disallowedTools }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model', model,
      '--system-prompt', system,
      '--exclude-dynamic-system-prompt-sections',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];
    const blocked = disallowedTools || DEFAULT_DISALLOWED_TOOLS;
    if (blocked.length) args.push('--disallowedTools', ...blocked);

    const child = spawn('claude', args, {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let full = '';       // 拼出来的正文（来自 text 增量）
    let resultText = ''; // result 事件里的权威完整正文（兜底）
    let buf = '';
    let stderr = '';
    const onAbort = () => { try { child.kill('SIGTERM'); } catch { /* ignore */ } };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'result' && typeof ev.result === 'string') resultText = ev.result;
        const d = parseStreamEvent(ev);
        if (!d) continue;
        if (d.type === 'text') full += d.text;
        if (onEvent) onEvent(d);
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (e) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error(`起不来 claude 子进程：${e.message}（主机装了 claude 并登录了吗？）`));
    });
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const out = (full || resultText).trim();
      if (out) return resolve(out);
      reject(new Error(`claude -p 退出码 ${code}，没拿到回复：${stderr.slice(0, 500)}`));
    });

    child.stdin.on('error', () => { /* EPIPE 忽略：进程可能已退出 */ });
    child.stdin.write(renderTranscript(messages));
    child.stdin.end();
  });
}

// 非流式包装：内部还是流式跑，攒完再返回。给不需要 SSE 的地方（如摘要）用。
export function chatCompleteCLI(opts) {
  return chatStreamCLI({ ...opts, onEvent: undefined });
}

function openAICompatibleBaseUrl(model) {
  const name = String(model || '').toLowerCase();
  if (name.startsWith('deepseek')) return 'https://api.deepseek.com';
  return 'https://api.openai.com/v1';
}

// messages: [{ role: 'user'|'assistant', content: string }]
// 返回：助手回复的纯文本
export async function chatComplete({
  provider,
  apiKey,
  baseUrl,
  model,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.8,
}) {
  if (!apiKey) {
    throw new Error('缺少模型 API Key——请在环境变量里配好再来。');
  }

  if (provider === 'anthropic') {
    const url = (baseUrl || 'https://api.anthropic.com') + '/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic 调用失败 ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return (data.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();
  }

  // openai 兼容（DeepSeek / OpenAI / 中转）
  const url = (baseUrl || openAICompatibleBaseUrl(model)) + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) {
    throw new Error(`模型调用失败 ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

// 流式 API 调用：Anthropic 和 OpenAI 兼容接口都返回逐块增量。
// onEvent({type:'text'|'thinking', text}) 收到增量；resolve 返回完整正文。
export async function chatStream({
  provider,
  apiKey,
  baseUrl,
  model,
  system,
  messages,
  maxTokens = 1024,
  temperature = 0.8,
  signal,
  onEvent,
}) {
  if (!apiKey) {
    throw new Error('缺少模型 API Key——请在环境变量里配好再来。');
  }

  if (provider === 'anthropic') {
    return streamAnthropic({ apiKey, baseUrl, model, system, messages, maxTokens, temperature, signal, onEvent });
  }

  return streamOpenAICompatible({ apiKey, baseUrl, model, system, messages, maxTokens, temperature, signal, onEvent });
}

async function streamAnthropic({ apiKey, baseUrl, model, system, messages, maxTokens, temperature, signal, onEvent }) {
  const url = (baseUrl || 'https://api.anthropic.com') + '/v1/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      stream: true,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Anthropic 调用失败 ${res.status}: ${await res.text()}`);

  let full = '';
  let buf = '';
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let ev;
      try { ev = JSON.parse(raw); } catch { continue; }
      if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'text_delta' && ev.delta.text) {
          full += ev.delta.text;
          if (onEvent) onEvent({ type: 'text', text: ev.delta.text });
        } else if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
          if (onEvent) onEvent({ type: 'thinking', text: ev.delta.thinking });
        }
      }
    }
  }
  return full.trim();
}

async function streamOpenAICompatible({ apiKey, baseUrl, model, system, messages, maxTokens, temperature, signal, onEvent }) {
  const url = (baseUrl || openAICompatibleBaseUrl(model)) + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`模型调用失败 ${res.status}: ${await res.text()}`);

  let full = '';
  let buf = '';
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(raw); } catch { continue; }
      const delta = ev.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        if (onEvent) onEvent({ type: 'text', text: delta });
      }
    }
  }
  return full.trim();
}

// 把一段旧对话压缩成简短摘要，存进长期记忆。
export async function summarize({ provider, apiKey, baseUrl, model, rounds }) {
  const transcript = rounds
    .map((m) => `${m.role === 'user' ? '邓邓' : '晞晞'}：${m.content}`)
    .join('\n');
  const system =
    '你是一个记忆整理助手。把下面晞晞和邓邓的对话压缩成一段简短的第三人称摘要，' +
    '只保留对以后相处有用的事实、约定、情绪和细节，去掉寒暄。不超过200字。';
  return chatComplete({
    provider,
    apiKey,
    baseUrl,
    model,
    system,
    messages: [{ role: 'user', content: transcript }],
    maxTokens: 400,
    temperature: 0.3,
  });
}
