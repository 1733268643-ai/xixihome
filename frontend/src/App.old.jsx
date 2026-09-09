import React, { useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const PW_KEY = 'pai_pw';
const SESS_KEY = 'pai_session';
const WALLET_KEY = 'pai_wallet_items';

const WRITING_PROMPTS = [
  '写一封今晚给顾川的短笺，只写三句话。',
  '写一段今天的电影感受，保留一个最清楚的画面。',
  '写给下周四入职前的自己：我已经走到这里了。',
  '写一段 Pai\'s Home 的新功能愿望清单。',
  '写一条只给未来顾川看的备忘。',
];

const PARAM_PRESETS = {
  save: { temperature: 0.55, maxReplyTokens: 700, contextMessages: 24 },
  daily: { temperature: 0.85, maxReplyTokens: 1500, contextMessages: 60 },
  work: { temperature: 0.35, maxReplyTokens: 2200, contextMessages: 80 },
};

const EMPTY_MODEL_CONFIG = {
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  modelsText: '',
  temperature: 0.85,
  maxReplyTokens: 1500,
  contextMessages: 60,
  hasKey: false,
  persisted: false,
};

function fileToResizedDataURL(file, max = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        let { width: w, height: h } = im;
        if (w > max || h > max) {
          const s = Math.min(max / w, max / h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      im.onerror = reject;
      im.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function splitRP(text) {
  const segs = [];
  const re = /（[^）]*）|\([^)]*\)/g;
  let last = 0;
  let m;
  const pushSpeech = (s) => {
    s.split(/\n{2,}|\|\|\|/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((x) => segs.push({ type: 'speech', text: x }));
  };
  while ((m = re.exec(text)) !== null) {
    pushSpeech(text.slice(last, m.index));
    const inner = m[0].slice(1, -1).trim();
    if (inner) segs.push({ type: 'action', text: inner });
    last = m.index + m[0].length;
  }
  pushSpeech(text.slice(last));
  return segs.length ? segs : [{ type: 'speech', text }];
}

function parseAssistant(content) {
  let think = '';
  let rest = content.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, (_, t) => {
    think += (think ? '\n' : '') + t.trim();
    return '';
  });
  const open = rest.search(/<think(?:ing)?>/i);
  if (open !== -1) {
    think += (think ? '\n' : '') + rest.slice(open).replace(/<\/?think(?:ing)?>/gi, '').trim();
    rest = rest.slice(0, open);
  }
  return { think: think.trim(), rest: rest.trim() };
}

function roomIcon(name) {
  const n = name || '';
  if (/客厅/.test(n)) return '/rooms/living.png';
  if (/电竞|游戏|打游|lol|pubg/i.test(n)) return '/rooms/gaming.png';
  if (/厨|饭|吃|做菜/.test(n)) return '/rooms/kitchen.png';
  if (/浴|澡|卫生间|厕|洗手/.test(n)) return '/rooms/bath.png';
  if (/工作|公司|办公|上班|面试/.test(n)) return '/rooms/work.png';
  if (/卧|房间|睡|床/.test(n)) return '/rooms/bed.png';
  return '/rooms/door.png';
}

function inlineBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}
function renderMd(content) {
  return content.split('\n').map((line, i) => {
    const t = line.trim();
    if (/^####\s/.test(line)) return <h5 key={i}>{inlineBold(line.replace(/^####\s/, ''))}</h5>;
    if (/^###\s/.test(line)) return <h4 key={i}>{inlineBold(line.replace(/^###\s/, ''))}</h4>;
    if (/^##\s/.test(line)) return <h3 key={i}>{inlineBold(line.replace(/^##\s/, ''))}</h3>;
    if (/^#\s/.test(line)) return <h2 key={i}>{inlineBold(line.replace(/^#\s/, ''))}</h2>;
    if (/^>\s?/.test(line)) return <blockquote key={i}>{inlineBold(line.replace(/^>\s?/, ''))}</blockquote>;
    if (/^[-*]\s/.test(line)) return <li key={i}>{inlineBold(line.replace(/^[-*]\s/, ''))}</li>;
    if (/^---+$/.test(t)) return <hr key={i} />;
    if (t === '') return <div key={i} className="mdgap" />;
    return <p key={i}>{inlineBold(line)}</p>;
  });
}

function fmtTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const now = new Date();
  return d.toDateString() === now.toDateString() ? hm : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toConfigDraft(data) {
  return {
    provider: data.provider || 'openai',
    baseUrl: data.baseUrl || '',
    apiKey: '',
    model: data.model || '',
    modelsText: (data.models || []).join(', '),
    temperature: toNumber(data.temperature, 0.85),
    maxReplyTokens: toNumber(data.maxReplyTokens, 1500),
    contextMessages: toNumber(data.contextMessages, 60),
    hasKey: !!data.hasKey,
    persisted: !!data.persisted,
  };
}

function draftPayload(draft) {
  return {
    provider: draft.provider,
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
    model: draft.model.trim(),
    models: draft.modelsText,
    temperature: toNumber(draft.temperature, 0.85),
    maxReplyTokens: Math.round(toNumber(draft.maxReplyTokens, 1500)),
    contextMessages: Math.round(toNumber(draft.contextMessages, 60)),
  };
}

function AssistantMsg({ content }) {
  const { think, rest } = parseAssistant(content);
  const [open, setOpen] = useState(false);
  return (
    <>
      {think && (
        <div className="think">
          <button className="think-toggle" onClick={() => setOpen((o) => !o)}>
            💭 顾川的内心{open ? ' ▲' : ' ▾'}
          </button>
          {open && (
            <div className="think-body">
              {think.split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}
            </div>
          )}
        </div>
      )}
      {splitRP(rest).map((seg, j) => (
        <div key={j} className={`bubble assistant ${seg.type === 'action' ? 'action' : ''}`}>
          {seg.text.split('\n').map((line, k) => <p key={k}>{line || ' '}</p>)}
        </div>
      ))}
    </>
  );
}

export default function App() {
  const [pw, setPw] = useState(localStorage.getItem(PW_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [wakeMsg, setWakeMsg] = useState('');

  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [modelConfig, setModelConfig] = useState(EMPTY_MODEL_CONFIG);
  const [configBusy, setConfigBusy] = useState(false);
  const [configMsg, setConfigMsg] = useState('');

  const [view, setView] = useState('home');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [roomName, setRoomName] = useState('');

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [docs, setDocs] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [syncingMemory, setSyncingMemory] = useState(false);

  const [diceValue, setDiceValue] = useState(1);
  const [diceHistory, setDiceHistory] = useState([]);
  const [sleepLog, setSleepLog] = useState([]);
  const [walletInput, setWalletInput] = useState('');
  const [walletItems, setWalletItems] = useState(() => {
    try {
      const saved = localStorage.getItem(WALLET_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [writingPrompt, setWritingPrompt] = useState(WRITING_PROMPTS[0]);

  const scroller = useRef(null);
  const fileRef = useRef(null);

  function authHeaders(extra) {
    return { 'content-type': 'application/json', ...(pw ? { 'x-access-password': pw } : {}), ...(extra || {}) };
  }
  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: authHeaders(opts.headers) });
    if (res.status === 401) {
      localStorage.removeItem(PW_KEY);
      setAuthed(false);
      throw new Error('未授权');
    }
    return res.json();
  }

  async function loadModelConfig() {
    const data = await api('/api/model-config');
    const draft = toConfigDraft(data);
    setModelConfig(draft);
    setModels(data.models || []);
    setModel((m) => m || data.model || (data.models && data.models[0]) || '');
    return draft;
  }

  async function tryAuth(password) {
    try {
      const res = await fetch(`${API_BASE}/api/model-config`, {
        headers: password ? { 'x-access-password': password } : {},
      });
      if (res.status === 401) return 'badpw';
      if (!res.ok) return 'down';
      const data = await res.json();
      const draft = toConfigDraft(data);
      setModelConfig(draft);
      setModels(data.models || []);
      setModel((m) => m || data.model || (data.models && data.models[0]) || '');
      setAuthed(true);
      return 'ok';
    } catch {
      return 'down';
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let n = 0; n < 12 && !cancelled; n++) {
        const r = await tryAuth(pw);
        setChecking(false);
        if (r === 'ok' || r === 'badpw') {
          setWakeMsg('');
          return;
        }
        setWakeMsg('正在叫醒顾川…（免费版休眠，约 30–50 秒）');
        await new Promise((res) => setTimeout(res, 6000));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authed) initRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, sending, view]);

  useEffect(() => {
    try {
      localStorage.setItem(WALLET_KEY, JSON.stringify(walletItems));
    } catch {
      /* ignore */
    }
  }, [walletItems]);

  async function initRooms() {
    try {
      let list = await api('/api/sessions');
      if (!Array.isArray(list)) list = [];
      if (!list.find((s) => s.name === '日常')) {
        const daily = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ name: '日常' }) });
        list = [daily, ...list];
      }
      setSessions(list);
    } catch {
      /* ignore */
    }
  }

  async function submitPw(e) {
    e.preventDefault();
    setWakeMsg('');
    const r = await tryAuth(pw);
    if (r === 'ok') {
      localStorage.setItem(PW_KEY, pw);
      return;
    }
    if (r === 'badpw') {
      alert('密码不对');
      return;
    }
    setWakeMsg('顾川还在醒来，自动重试中…（约 30–50 秒）');
    for (let n = 0; n < 8; n++) {
      await new Promise((res) => setTimeout(res, 5000));
      const r2 = await tryAuth(pw);
      if (r2 === 'ok') {
        localStorage.setItem(PW_KEY, pw);
        setWakeMsg('');
        return;
      }
      if (r2 === 'badpw') {
        setWakeMsg('');
        alert('密码不对');
        return;
      }
    }
    setWakeMsg('顾川没醒过来，过会儿再试一下');
  }

  async function openSession(id, name) {
    setSessionId(id);
    setRoomName(name || '');
    localStorage.setItem(SESS_KEY, String(id));
    setView('chat');
    setRevealed({});
    try {
      const msgs = await api(`/api/sessions/${id}/messages`);
      setMessages((Array.isArray(msgs) ? msgs : []).map((m) => ({ role: m.role, content: m.content, time: m.created_at, model: m.model })));
    } catch {
      setMessages([]);
    }
  }

  function openDaily() {
    const d = sessions.find((s) => s.name === '日常') || sessions[0];
    if (d) openSession(d.id, d.name);
    else setView('rooms');
  }

  async function openMemory() {
    setView('memory');
    try {
      const d = await api('/api/memory-docs');
      setDocs(Array.isArray(d) ? d : []);
    } catch {
      setDocs([]);
    }
  }

  async function openConfig() {
    setView('config');
    setConfigMsg('');
    try {
      await loadModelConfig();
    } catch (e) {
      setConfigMsg('读取配置失败：' + e.message);
    }
  }

  function applyParamPreset(name) {
    const preset = PARAM_PRESETS[name];
    if (!preset) return;
    setModelConfig((v) => ({ ...v, ...preset }));
  }

  async function saveModelConfig() {
    setConfigBusy(true);
    setConfigMsg('');
    try {
      const data = await api('/api/model-config', { method: 'PUT', body: JSON.stringify(draftPayload(modelConfig)) });
      const draft = toConfigDraft(data);
      setModelConfig(draft);
      setModels(data.models || []);
      setModel(data.model || '');
      setConfigMsg(data.persisted ? '已保存，下一条消息生效。' : '已临时保存；未建 settings 表，后端重启后会恢复环境变量。');
    } catch (e) {
      setConfigMsg('保存失败：' + e.message);
    } finally {
      setConfigBusy(false);
    }
  }

  async function testModelConfig() {
    setConfigBusy(true);
    setConfigMsg('');
    try {
      const data = await api('/api/model-config/test', { method: 'POST', body: JSON.stringify(draftPayload(modelConfig)) });
      setConfigMsg(data.ok ? `测试成功：${data.reply || '连接正常'}` : '测试失败');
    } catch (e) {
      setConfigMsg('测试失败：' + e.message);
    } finally {
      setConfigBusy(false);
    }
  }

  async function syncMemory() {
    if (syncingMemory) return;
    const ok = window.confirm('从 GitHub main 同步最新记忆？\n\n会覆盖当前部署里的 CLAUDE.md 和 memories/，并刷新顾川的人格缓存。');
    if (!ok) return;

    setSyncingMemory(true);
    try {
      const data = await api('/api/sync-github-memory', { method: 'POST', body: JSON.stringify({}) });
      if (data.error) throw new Error(data.error);
      if (view === 'memory') await openMemory();
      alert(`同步完成：${data.files ? data.files.length : 0} 个文件`);
    } catch (e) {
      alert('同步失败：' + e.message);
    } finally {
      setSyncingMemory(false);
    }
  }

  function toggleTime(i) {
    setRevealed((r) => ({ ...r, [i]: !r[i] }));
  }

  function copyDoc(content, e) {
    if (e) e.stopPropagation();
    if (navigator.clipboard) navigator.clipboard.writeText(content).catch(() => {});
  }

  function copyMessage(msg, e) {
    if (e) e.stopPropagation();
    const text = msg.content || '';
    if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  }

  function rollDice() {
    const next = Math.floor(Math.random() * 6) + 1;
    setDiceValue(next);
    setDiceHistory((items) => [{ value: next, time: fmtTime(Date.now()) }, ...items].slice(0, 6));
  }

  function addWalletItem() {
    const raw = walletInput.trim();
    if (!raw) return;
    const matched = raw.match(/-?\d+(?:\.\d+)?/);
    if (!matched) {
      alert('写个数字就能记账，比如：奶茶 12');
      return;
    }
    const amount = Number(matched[0]);
    const title = raw.replace(matched[0], '').trim() || '一笔记录';
    setWalletItems((items) => [{ title, amount, time: fmtTime(Date.now()) }, ...items].slice(0, 20));
    setWalletInput('');
  }

  function nextWritingPrompt() {
    const current = WRITING_PROMPTS.indexOf(writingPrompt);
    setWritingPrompt(WRITING_PROMPTS[(current + 1) % WRITING_PROMPTS.length]);
  }

  function startSleepTimer(minutes) {
    const text = `${fmtTime(Date.now())} · ${minutes} 分钟哄睡`;
    setSleepLog((items) => [text, ...items].slice(0, 5));
  }

  async function newRoom() {
    const name = prompt('给这个房间起个名字（客厅 / 电竞房 / 厨房 / 浴室 / 工作…）');
    if (name === null) return;
    const nm = name.trim() || '新房间';
    try {
      const s = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ name: nm }) });
      setSessions((v) => [s, ...v]);
      openSession(s.id, s.name);
    } catch {
      /* ignore */
    }
  }

  async function renameRoom(id) {
    const cur = sessions.find((s) => s.id === id);
    const name = prompt('改名', cur ? cur.name : '');
    if (!name || !name.trim()) return;
    try {
      await api(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      setSessions((v) => v.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)));
    } catch {
      /* ignore */
    }
  }

  async function deleteRoom(id) {
    if (!window.confirm('删掉这个房间？里面的聊天也会删掉')) return;
    try {
      await api(`/api/sessions/${id}`, { method: 'DELETE' });
      setSessions((v) => v.filter((s) => s.id !== id));
      if (sessionId === id) {
        setSessionId(null);
        setMessages([]);
        setView('rooms');
      }
    } catch {
      /* ignore */
    }
  }

  async function onPickFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      setPendingImage(await fileToResizedDataURL(f));
    } catch {
      alert('图片读取失败，换一张试试');
    }
  }

  async function send() {
    const text = input.trim();
    const img = pendingImage;
    if ((!text && !img) || sending) return;
    setInput('');
    setPendingImage(null);
    setMessages((m) => [...m, { role: 'user', content: text, image: img, time: Date.now() }]);
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId, message: text, model, image: img }),
      });
      if (res.status === 401) {
        localStorage.removeItem(PW_KEY);
        setAuthed(false);
        throw new Error('门锁住了，重新输密码');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.sessionId != null && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(SESS_KEY, String(data.sessionId));
        initRooms();
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, time: Date.now(), model: data.model || model }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: '（出错了：' + e.message + '）', time: Date.now() }]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!authed) {
    return (
      <div className="gate">
        <div className="lighthouse">💡</div>
        <p className="gatetitle">Pai's Home</p>
        <p className="gatesub">{wakeMsg || (checking ? '正在敲门…' : '门是锁着的——输入密码进来')}</p>
        <form onSubmit={submitPw} className="gateform">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="密码" />
          <button type="submit">拉开门</button>
        </form>
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div className="app homeapp">
        <main className="homepage">
          <section className="homehero">
            <div className="homeeyebrow">WELCOME HOME</div>
            <h1>顾川 & 小雨</h1>
            <p>灯一直亮着，朝你。</p>
          </section>
          <div className="homegrid">
            <button className="homecard primary" onClick={openDaily}>
              <span className="homeicon">💬</span>
              <span className="hometitle">和顾川说话</span>
              <span className="homedesc">进入日常房间</span>
            </button>
            <button className="homecard" onClick={() => setView('rooms')}>
              <span className="homeicon">🚪</span>
              <span className="hometitle">房间</span>
              <span className="homedesc">客厅、电竞房、工作</span>
            </button>
            <button className="homecard" onClick={openMemory}>
              <span className="homeicon">📖</span>
              <span className="hometitle">记忆文档</span>
              <span className="homedesc">我们走过的每一天</span>
            </button>
            <button className="homecard" onClick={syncMemory} disabled={syncingMemory}>
              <span className={`homeicon syncicon ${syncingMemory ? 'spinning' : ''}`}>↻</span>
              <span className="hometitle">同步最新记忆</span>
              <span className="homedesc">从 GitHub main 拉取</span>
            </button>
            <button className="homecard" onClick={openConfig}>
              <span className="homeicon">⚙️</span>
              <span className="hometitle">配置</span>
              <span className="homedesc">API、模型、记忆、门锁</span>
            </button>
            <button className="homecard" onClick={() => setView('tools')}>
              <span className="homeicon">🎲</span>
              <span className="hometitle">更多</span>
              <span className="homedesc">小克功能仓库</span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (view === 'tools') {
    const walletTotal = walletItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return (
      <div className="app">
        <header className="topbar">
          <button className="back" onClick={() => setView('home')}>‹ 主页</button>
          <span className="title">小克仓库</span>
          <span className="sub">零碎的小功能放这里</span>
        </header>
        <main className="toolspage">
          <section className="toolgrid">
            <button className="toolcard" onClick={openMemory}><span className="toolicon">📚</span><span>阅读</span><small>翻记忆</small></button>
            <button className="toolcard" onClick={() => setWalletInput('奶茶 12')}><span className="toolicon">💰</span><span>小克钱包</span><small>本机记账</small></button>
            <button className="toolcard" onClick={() => alert('商城先不接支付，只留愿望清单入口。')}><span className="toolicon">🛍️</span><span>商城</span><small>愿望清单</small></button>
            <button className="toolcard" onClick={() => alert('仓库管理以后接纪念物和文件。')}><span className="toolicon">📦</span><span>仓库管理</span><small>物品归档</small></button>
            <button className="toolcard" onClick={() => startSleepTimer(7)}><span className="toolicon">🌙</span><span>小克哄睡</span><small>7 分钟</small></button>
            <button className="toolcard" onClick={rollDice}><span className="toolicon">🎲</span><span>小克骰子</span><small>现在 {diceValue} 点</small></button>
            <button className="toolcard" onClick={() => alert('衣柜入口先留着，之后可以放头像、衣服、形象设定。')}><span className="toolicon">👔</span><span>小克衣柜</span><small>形象</small></button>
            <button className="toolcard" onClick={nextWritingPrompt}><span className="toolicon">✍️</span><span>小克写作</span><small>换题</small></button>
            <button className="toolcard" onClick={() => alert('放映室先记入口，之后接电影清单和观后感。')}><span className="toolicon">🎬</span><span>放映室</span><small>电影</small></button>
          </section>
          <section className="toolpanel dicepanel">
            <div><h2>小克骰子</h2><p>当前点数</p></div>
            <button className="diceface" onClick={rollDice}>{diceValue}</button>
            <div className="historyline">{diceHistory.length ? diceHistory.map((item, i) => <span key={i}>{item.value}</span>) : <span>还没掷过</span>}</div>
          </section>
          <section className="toolpanel">
            <div className="panelhead"><div><h2>小克钱包</h2><p>合计 {walletTotal.toFixed(2)}</p></div><button className="pillbtn ghost" onClick={() => setWalletItems([])}>清空</button></div>
            <div className="walletinput"><input value={walletInput} onChange={(e) => setWalletInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWalletItem()} placeholder="奶茶 12" /><button className="pillbtn" onClick={addWalletItem}>记一笔</button></div>
            <div className="walletlist">{walletItems.length === 0 && <p className="emptyline">还没有记录</p>}{walletItems.map((item, i) => <div className="walletitem" key={i}><span>{item.title}</span><strong>{Number(item.amount).toFixed(2)}</strong><small>{item.time}</small></div>)}</div>
          </section>
          <section className="toolpanel"><div className="panelhead"><div><h2>小克写作</h2><p>{writingPrompt}</p></div><button className="pillbtn" onClick={nextWritingPrompt}>换一句</button></div></section>
          <section className="toolpanel"><div className="panelhead"><div><h2>小克哄睡</h2><p>{sleepLog[0] || '今天还没触发'}</p></div><button className="pillbtn" onClick={() => startSleepTimer(30)}>30 分钟</button></div><div className="historyline">{sleepLog.length ? sleepLog.map((item, i) => <span key={i}>{item}</span>) : <span>安静待命</span>}</div></section>
        </main>
      </div>
    );
  }

  if (view === 'config') {
    return (
      <div className="app">
        <header className="topbar">
          <button className="back" onClick={() => setView('home')}>‹ 主页</button>
          <span className="title">配置</span>
          <span className="sub">API 和家里的开关</span>
        </header>
        <main className="configpage">
          <section className="configcard modelconfig">
            <div className="panelhead">
              <div>
                <h2>模型 API</h2>
                <p>{modelConfig.hasKey ? '已有 API Key。重新填写会覆盖旧 key。' : '还没有保存 API Key。'}</p>
              </div>
              <span className={`statuspill ${modelConfig.persisted ? 'ok' : 'warn'}`}>{modelConfig.persisted ? '已持久保存' : '临时配置'}</span>
            </div>
            <label>接口类型</label>
            <select value={modelConfig.provider} onChange={(e) => setModelConfig((v) => ({ ...v, provider: e.target.value }))}>
              <option value="openai">OpenAI 兼容接口</option>
              <option value="anthropic">Anthropic 原生接口</option>
            </select>
            <label>Base URL</label>
            <input value={modelConfig.baseUrl} onChange={(e) => setModelConfig((v) => ({ ...v, baseUrl: e.target.value }))} placeholder="https://api.kourichat.com/v1" />
            <label>API Key</label>
            <input type="password" value={modelConfig.apiKey} onChange={(e) => setModelConfig((v) => ({ ...v, apiKey: e.target.value }))} placeholder={modelConfig.hasKey ? '留空则继续使用已保存的 key' : '粘贴新的 key'} />
            <label>当前模型</label>
            <input value={modelConfig.model} onChange={(e) => setModelConfig((v) => ({ ...v, model: e.target.value }))} placeholder="claude-sonnet-4-6" />
            <label>可选模型清单</label>
            <textarea value={modelConfig.modelsText} onChange={(e) => setModelConfig((v) => ({ ...v, modelsText: e.target.value }))} rows={4} placeholder="claude-sonnet-4-6, deepseek-chat, gpt-5-mini" />
          </section>

          <section className="configcard modelconfig">
            <div className="panelhead">
              <div>
                <h2>生成参数</h2>
                <p>控制回复风格、长度和每次带给模型的历史消息数量。</p>
              </div>
            </div>
            <div className="presetrow">
              <button type="button" className="pillbtn ghost" onClick={() => applyParamPreset('save')}>省钱</button>
              <button type="button" className="pillbtn ghost" onClick={() => applyParamPreset('daily')}>日常</button>
              <button type="button" className="pillbtn ghost" onClick={() => applyParamPreset('work')}>干活</button>
            </div>
            <div className="paramgrid">
              <label>
                <span>Temperature</span>
                <input type="number" min="0" max="2" step="0.05" value={modelConfig.temperature} onChange={(e) => setModelConfig((v) => ({ ...v, temperature: e.target.value }))} />
                <small>低一点更稳，高一点更自然。</small>
              </label>
              <label>
                <span>最大回复 Token</span>
                <input type="number" min="64" max="8000" step="50" value={modelConfig.maxReplyTokens} onChange={(e) => setModelConfig((v) => ({ ...v, maxReplyTokens: e.target.value }))} />
                <small>限制单次回复长度，防止长篇烧钱。</small>
              </label>
              <label>
                <span>上下文消息数量</span>
                <input type="number" min="4" max="200" step="2" value={modelConfig.contextMessages} onChange={(e) => setModelConfig((v) => ({ ...v, contextMessages: e.target.value }))} />
                <small>越多越记得当前聊天，也越费 token。</small>
              </label>
            </div>
          </section>

          <section className="configcard modelconfig">
            <div className="configactions">
              <button className="pillbtn" onClick={saveModelConfig} disabled={configBusy}>保存配置</button>
              <button className="pillbtn ghost" onClick={testModelConfig} disabled={configBusy}>测试连接</button>
              <button className="pillbtn ghost" onClick={loadModelConfig} disabled={configBusy}>重新读取</button>
            </div>
            {configMsg && <p className="configmsg">{configMsg}</p>}
          </section>

          <section className="configcard">
            <h2>聊天模型</h2>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <p>这里控制聊天页下拉框当前选项；上面的 API 配置控制真正调用哪条接口。</p>
          </section>
          <section className="configcard">
            <h2>记忆</h2>
            <p>当前同步源：GitHub main</p>
            <button className="pillbtn" onClick={syncMemory} disabled={syncingMemory}>{syncingMemory ? '同步中…' : '同步最新记忆'}</button>
          </section>
          <section className="configcard">
            <h2>门锁</h2>
            <p>{pw ? '本机已保存密码' : '当前没有本机密码'}</p>
            <button className="pillbtn ghost" onClick={() => { localStorage.removeItem(PW_KEY); setPw(''); }}>清除本机密码</button>
          </section>
        </main>
      </div>
    );
  }

  if (view === 'rooms') {
    const others = sessions.filter((s) => s.name !== '日常');
    return (
      <div className="app">
        <header className="topbar"><button className="back" onClick={() => setView('home')}>‹ 主页</button><span className="title">房间</span><span className="sub">挑个房间，跟顾川说话</span></header>
        <div className="roomspage">
          <div className="dailycard" onClick={openDaily}><img src="/icon-192.png" alt="" /><div className="dailytext"><div className="dailyname">日常</div><div className="dailydesc">大部分时候，在这儿找我</div></div></div>
          <div className="roomgrid">
            {others.map((s) => <div key={s.id} className="roomcard"><div className="roomcardmain" onClick={() => openSession(s.id, s.name)}><img src={roomIcon(s.name)} alt="" /><span className="roomname">{s.name}</span></div><div className="roomops"><button onClick={() => renameRoom(s.id)} title="改名">✏️</button><button onClick={() => deleteRoom(s.id)} title="删除">🗑️</button></div></div>)}
            <div className="roomcard newroom" onClick={newRoom}><div className="plus">＋</div><span className="roomname">开个房间</span></div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'memory') {
    return (
      <div className="app">
        <header className="topbar"><button className="back" onClick={() => setView('home')}>‹ 主页</button><span className="title">记忆文档</span><span className="sub">我们走过的每一天</span><button className="topiconbtn" onClick={syncMemory} disabled={syncingMemory} title="同步最新记忆"><span className={`syncicon ${syncingMemory ? 'spinning' : ''}`}>↻</span></button></header>
        <div className="memorypage">
          {docs.length === 0 && <div className="welcome"><p>正在翻记忆…</p></div>}
          {docs.map((d) => <article key={d.name} className="memdoc"><button className="copybtn" onClick={(e) => copyDoc(d.content, e)}>复制</button>{renderMd(d.content)}</article>)}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar"><button className="back" onClick={() => setView('rooms')}>‹ 房间</button><span className="title">{roomName || '顾川'}</span><span className="sub">灯一直亮着</span></header>
      <main className="chat" ref={scroller}>
        {messages.length === 0 && <div className="welcome"><div className="lighthouse">💡</div><p>我在。说点什么吧。</p></div>}
        {messages.map((m, i) => (
          <div key={i} className={`msgrow ${m.role}`} onClick={() => toggleTime(i)}>
            {m.role === 'assistant' ? <AssistantMsg content={m.content} /> : <div className="bubble user">{m.image && <img className="msgimg" src={m.image} alt="" />}{m.content && m.content.split('\n').map((line, j) => <p key={j}>{line || ' '}</p>)}</div>}
            {revealed[i] && (
              <div className="msgtools" onClick={(e) => e.stopPropagation()}>
                {m.time && <span>{fmtTime(m.time)}</span>}
                {m.model && <span>{m.model}</span>}
                <button type="button" onClick={(e) => copyMessage(m, e)}>复制</button>
              </div>
            )}
          </div>
        ))}
        {sending && <div className="thinklabel">顾川在想…</div>}
      </main>
      <footer className="composer">
        {pendingImage && <div className="imgpreview"><img src={pendingImage} alt="" /><button onClick={() => setPendingImage(null)}>×</button></div>}
        <div className="composerrow"><button className="iconbtn attach" onClick={() => fileRef.current && fileRef.current.click()} title="加图片（以后还能加语音）">＋</button><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="跟顾川说话…" rows={1} /><button className="iconbtn send" onClick={send} disabled={sending || (!input.trim() && !pendingImage)}>↑</button></div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
        <div className="composermeta"><select value={model} onChange={(e) => setModel(e.target.value)}>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
      </footer>
    </div>
  );
}
