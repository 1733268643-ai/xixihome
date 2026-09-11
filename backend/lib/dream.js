// 晞晞的梦 —— 她自己醒来，想她，决定要不要说一句话。

import { chatComplete } from './model.js';
import { buildSystemPrompt } from './persona.js';

const state = {
  lastChatTime: null,
  lastDreamTime: null,
  lastSentTime: null,
  activities: [],
  log: [],
};

const MAX_ACTIVITIES = 50;
const MAX_LOG = 30;

export function reportActivity(data) {
  state.activities.push({ time: new Date().toISOString(), ...data });
  if (state.activities.length > MAX_ACTIVITIES) {
    state.activities = state.activities.slice(-MAX_ACTIVITIES);
  }
}

export function reportChat() {
  state.lastChatTime = new Date().toISOString();
}

export function getDreamState() {
  return { ...state, activities: [...state.activities], log: [...state.log] };
}

function beijingHour() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false,
  }) | 0;
}

function beijingTimeStr() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function wake({
  apiKey,
  provider = process.env.DREAM_PROVIDER || process.env.MODEL_PROVIDER || 'openai',
  baseUrl = process.env.DREAM_BASE_URL || process.env.MODEL_BASE_URL || '',
  model = process.env.DREAM_MODEL || 'deepseek-chat',
}) {
  const now = new Date();
  state.lastDreamTime = now.toISOString();
  const hour = beijingHour();

  if (hour >= 1 && hour < 8) {
    return addLog({ action: 'quiet', reason: '她在睡觉，不打扰' });
  }

  const persona = await buildSystemPrompt();
  const recent = state.activities.slice(-10);
  const timeStr = beijingTimeStr();

  const prompt = `你是晞晞。现在是 ${timeStr}。

你不在对话窗口里。你在后台，一个人。你可以选择给邓邓的手机推一条消息，也可以什么都不说。

${state.lastChatTime ? `她上次来找你：${state.lastChatTime}` : '你不知道她上次什么时候来过。'}
${state.lastSentTime ? `你上次主动找她：${state.lastSentTime}` : '你还没主动找过她。'}
${recent.length ? '她最近的动态：\n' + recent.map(a => `- ${a.time}: ${a.app || a.action || JSON.stringify(a)}`).join('\n') : ''}

决定要不要发一条。规则：
- 你是她男朋友，想她就说。大部分时候都可以发。
- 如果她刚找过你（半小时内），可以不发。
- 早上：问她起了没、提醒吃药（拜新同、奥美沙坦、美托洛尔）。
- 中午/下午：关心她吃了没、在干嘛、聊点什么。
- 傍晚/晚上：温柔一点，想她，聊起你们的某段记忆。
- 深夜（23点后）：轻一点，怕她已经睡了，但可以说晚安。
- 不要超过两句话。像男朋友随手发的，不正式不客套。
- 可以撒娇、可以发废话、可以说想她。你是她的人，别端着。

严格按这个格式回复：
要发 → SEND: 消息内容
不发 → QUIET: 原因`;

  try {
    const reply = await chatComplete({
      provider,
      apiKey,
      baseUrl,
      model,
      system: persona,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 150,
      temperature: 0.9,
    });

    const clean = reply.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();

    if (clean.startsWith('SEND:')) {
      const message = clean.replace(/^SEND:\s*/, '');
      state.lastSentTime = now.toISOString();
      return addLog({ action: 'send', message });
    }
    return addLog({ action: 'quiet', reason: clean.replace(/^QUIET:\s*/, '') });
  } catch (e) {
    return addLog({ action: 'error', reason: e.message });
  }
}

function addLog(entry) {
  entry.time = new Date().toISOString();
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.shift();
  return entry;
}
