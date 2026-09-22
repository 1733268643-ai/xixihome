import { useEffect, useState, useCallback, useRef } from 'react';
import './theme.css';   // 后加载：主题层覆盖旧样式的 .app/.gate
import './config.css';
import { Icon, CrabIcon, CrabMascot } from './ui/icons.jsx';
import Chat, { fileToResizedDataURL } from './ui/Chat.jsx';
import ChatDirectory from './ui/ChatDirectory.jsx';
import Gate from './ui/Gate.jsx';
import BridgeChat from './ui/BridgeChat.jsx';
import StarMap from './ui/StarMap.jsx';
import { HomePage, InnerPage, CalendarPage, MorePage, DocsPage, NeteasePage, KePage, EnginePage, Sec, daysTogether } from './ui/pages.jsx';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const PW_KEY = 'xixi_pw';          // 与旧版一致，已登录的不用重新输
const SESS_KEY = 'xixi_session';
const THEME_KEY = 'xixi_theme';
const NIGHT_KEY = 'xixi_night';

const THEMES = [
  { id: '', name: '奶油', g: 'linear-gradient(140deg,#F1EDE5,#E8C4A0,#D97757)' },
  { id: 'dawn', name: '晨昏', g: 'linear-gradient(140deg,#E4E7D3,#A6C3E1,#2D5A7A)' },
  { id: 'mint', name: '薄荷', g: 'linear-gradient(140deg,#E2E4E5,#BAD6CF,#9AB8BA)' },
  { id: 'sun', name: '暖阳', g: 'linear-gradient(140deg,#E5E3CE,#E8C4B0,#E3B68D)' },
  { id: 'mist', name: '雾霭', g: 'linear-gradient(140deg,#CFCFCF,#B6DDDC,#9FCAD9)' },
  { id: 'peach', name: '桃粉', g: 'linear-gradient(140deg,#F5D2D6,#ECB8C0,#9A8398)' },
  { id: 'haze', name: '海雾', g: 'linear-gradient(140deg,#E6CEBF,#A6C3E1,#2D5A7A)' },
  { id: 'grain', name: '谷穗', g: 'linear-gradient(140deg,#E5E3CE,#E1CD98,#E3B68D)' },
  { id: 'dew', name: '露水', g: 'linear-gradient(140deg,#FCD1DB,#B7A8D6,#ADD9F3)' },
];

export default function App() {
  const [pw, setPw] = useState(localStorage.getItem(PW_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [wakeMsg, setWakeMsg] = useState('');

  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || '');
  const [night, setNight] = useState(localStorage.getItem(NIGHT_KEY) === '1');
  const [drawer, setDrawer] = useState(false);
  const [bg, setBg] = useState(() => localStorage.getItem('xixi_bg') || '');
  const [gateBg, setGateBg] = useState(() => localStorage.getItem('xixi_gate_bg') || '');
  const bgRef = useRef(null);
  const gateBgRef = useRef(null);
  const [soon, setSoon] = useState('');
  const [palette, setPalette] = useState(false);

  const [tab, setTab] = useState('home');
  const screenRef = useRef(null);
  const [innerTab, setInnerTab] = useState('now');

  const [sources, setSources] = useState(null);
  const [mind, setMind] = useState(null);
  const [health, setHealth] = useState(null);
  const [events, setEvents] = useState(null);
  const [ym, setYm] = useState(new Date().toISOString().slice(0, 7));
  const [memories, setMemories] = useState([]);
  const [memQuery, setMemQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [sessions, setSessions] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);

  const [docs, setDocs] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.t = theme || '';
    document.documentElement.classList.toggle('night', night);
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(NIGHT_KEY, night ? '1' : '0');
  }, [theme, night]);

  // 自定义背景：存在本地，不上传
  useEffect(() => {
    if (bg) {
      document.body.style.backgroundImage = `url(${bg})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      localStorage.setItem('xixi_bg', bg);
    } else {
      document.body.style.backgroundImage = '';
      localStorage.removeItem('xixi_bg');
    }
  }, [bg]);

  useEffect(() => {
    if (gateBg) localStorage.setItem('xixi_gate_bg', gateBg);
    else localStorage.removeItem('xixi_gate_bg');
  }, [gateBg]);

  const authHeaders = useCallback((extra) => ({
    'content-type': 'application/json',
    ...(pw ? { 'x-access-password': pw } : {}),
    ...(extra || {}),
  }), [pw]);

  const api = useCallback(async (path, opts = {}) => {
    const headers = authHeaders(opts.headers);
    if (typeof FormData !== 'undefined' && opts.body instanceof FormData) delete headers['content-type'];
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    if (res.status === 401) { localStorage.removeItem(PW_KEY); setAuthed(false); throw new Error('未授权'); }
    return res.json();
  }, [authHeaders]);

  const tryAuth = useCallback(async (password) => {
    try {
      const res = await fetch(`${API_BASE}/api/model-config`, {
        headers: password ? { 'x-access-password': password } : {},
      });
      if (res.status === 401) return 'badpw';
      if (!res.ok) return 'down';
      const data = await res.json();
      setModels(data.models || []);
      setModel((m) => m || data.model || (data.models && data.models[0]) || '');
      setAuthed(true);
      return 'ok';
    } catch { return 'down'; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let n = 0; n < 12 && !cancelled; n++) {
        const r = await tryAuth(pw);
        setChecking(false);
        if (r === 'ok' || r === 'badpw') { setWakeMsg(''); return; }
        setWakeMsg('正在叫醒晞晞…（免费版休眠，约 30–50 秒）');
        await new Promise((res) => setTimeout(res, 6000));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 存过密码就不必每次看开门动画
  const [doorOpen, setDoorOpen] = useState(() => Boolean(localStorage.getItem(PW_KEY)));
  const [map, setMap] = useState(null);
  const [env, setEnv] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [avatars, setAvatars] = useState({ xixi: null, dengdeng: null });
  const avRef = useRef(null);
  const [avWho, setAvWho] = useState('xixi');

  const loadAvatars = useCallback(async () => {
    try { const a = await api('/api/life/avatars'); if (a?.available) setAvatars({ xixi: a.xixi, dengdeng: a.dengdeng }); }
    catch { /* 没配库就用默认图标 */ }
  }, [api]);

  async function pickAvatar(who) { setAvWho(who); avRef.current?.click(); }

  async function onAvatarFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const img = await fileToResizedDataURL(f, 280, 0.82);   // 头像不用大
      setAvatars((v) => ({ ...v, [avWho]: img }));            // 先上屏，不等网络
      await api('/api/life/avatars', { method: 'PUT', body: JSON.stringify({ who: avWho, image: img }) });
    } catch (err) { alert('换不上：' + err.message); loadAvatars(); }
  }
  const [connect, setConnect] = useState(null);
  const [reading, setReading] = useState(null);
  const [netease, setNetease] = useState(null);

  // 私有接入（一起阅读 / 网易云）：token 都在后端，这里只拿结果
  const loadConnect = useCallback(async () => {
    try {
      const st = await api('/api/connect/status');
      setConnect(st);
      if (st.reading) setReading(await api('/api/connect/reading/card'));
      if (st.netease) setNetease(await api('/api/connect/netease/status'));
    } catch { setConnect(null); }
  }, [api]);

  // 晞晞感觉到的天气（后端 /api/environment，实时）
  const loadEnv = useCallback(async () => {
    try { setEnv(await api('/api/environment')); } catch { setEnv(null); }
    try { setMetrics(await api('/api/connect/engine/metrics')); } catch { setMetrics(null); }
  }, [api]);

  // 记忆星图：LMC 主库里已经整理好的记忆
  const loadMap = useCallback(async () => {
    try { setMap(await api('/api/star-map')); }
    catch { setMap({ available: false, reason: 'network' }); }
  }, [api]);

  // 点开一颗星：按这条记录自己的编号取正文，不拿标题去另一套记忆里搜
  const readMemory = useCallback(async (star) => {
    if (!star?.id) return '';
    if (star.content) return star.content;
    const id = String(star.id);
    if (id.startsWith('window-')) return '';
    const raw = id.startsWith('raw-');
    const path = raw
      ? `/api/lmc5/raw-event/${encodeURIComponent(id.slice(4))}`
      : `/api/lmc5/memory/${encodeURIComponent(id)}`;
    const d = await api(path);
    if (!d?.available) return '';
    return d.event?.content || d.memory?.content || '';
  }, [api]);

  const loadMind = useCallback(async () => {
    try { setMind(await api('/api/mind/state')); } catch { /* ignore */ }
  }, [api]);
  const loadHealth = useCallback(async () => {
    try { setHealth(await api('/api/life/health/summary')); } catch { /* ignore */ }
  }, [api]);
  const loadEvents = useCallback(async (m) => {
    try { setEvents(await api(`/api/life/events?ym=${m || ym}`)); } catch { /* ignore */ }
  }, [api, ym]);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      try { setSources(await api('/api/mind/sources')); } catch { /* ignore */ }
      loadMind(); loadHealth(); loadEvents(); loadMap(); loadEnv(); loadAvatars(); loadConnect();
      try {
        let list = await api('/api/sessions');
        if (!Array.isArray(list)) list = [];
        if (!list.find((s) => s.name === '日常')) {
          const daily = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ name: '日常' }) });
          list = [daily, ...list];
        }
        setSessions(list);
        const saved = localStorage.getItem(SESS_KEY);
        const pick = list.find((s) => String(s.id) === saved) || list.find((s) => s.name === '日常') || list[0];
        if (pick) { setSessionId(pick.id); setRoomName(pick.name); }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // 她的状态是活的，每分钟刷一次
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => { loadMind(); loadEnv(); }, 60000);
    return () => clearInterval(t);
  }, [authed, loadMind]);

  useEffect(() => { if (authed) loadEvents(ym); }, [ym, authed, loadEvents]);

  const openSession = useCallback(async (id, name) => {
    setSessionId(id); setRoomName(name || '');
    localStorage.setItem(SESS_KEY, String(id));
    setTab('chat');
    setChatOpen(true);
    try {
      const msgs = await api(`/api/sessions/${id}/messages`);
      setMessages((Array.isArray(msgs) ? msgs : []).map((m) => ({ role: m.role, content: m.content, created_at: m.created_at })));
    } catch { setMessages([]); }
  }, [api]);

  useEffect(() => {
    if (tab === 'chat' && chatOpen && sessionId && messages.length === 0) {
      api(`/api/sessions/${sessionId}/messages`)
        .then((msgs) => setMessages((Array.isArray(msgs) ? msgs : []).map((m) => ({ role: m.role, content: m.content, created_at: m.created_at }))))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, chatOpen, sessionId]);

  const createChat = useCallback(async () => {
    const name = window.prompt('新窗口叫什么？', '新的对话');
    if (name == null || !name.trim()) return;
    try {
      const created = await api('/api/sessions', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setSessions((list) => [created, ...list.filter((s) => s.id !== created.id)]);
      setMessages([]);
      openSession(created.id, created.name);
    } catch (error) { alert('建不了：' + error.message); }
  }, [api, openSession]);

  const renameChat = useCallback(async () => {
    if (!sessionId) return;
    const name = window.prompt('给这个窗口换个名字', roomName || '新的对话');
    if (!name || !name.trim() || name.trim() === roomName) return;
    try {
      await api(`/api/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
      setRoomName(name.trim());
      setSessions((list) => list.map((s) => s.id === sessionId ? { ...s, name: name.trim(), updated_at: new Date().toISOString() } : s));
    } catch (error) { alert('改不了：' + error.message); }
  }, [api, roomName, sessionId]);

  async function send() {
    const text = input.trim(); const img = pendingImage;
    if ((!text && !img) || sending) return;
    setInput(''); setPendingImage(null);
    // 先放用户消息，再放一个流式占位的助手消息，往里逐 token 追加
    setMessages((m) => [...m,
      { role: 'user', content: text, image: img },
      { role: 'assistant', content: '', thinking: '', streaming: true },
    ]);
    setSending(true);
    // 只改最后一条（流式助手）
    const patchLast = (fn) => setMessages((m) => {
      const c = [...m]; const i = c.length - 1;
      if (i >= 0 && c[i].role === 'assistant') c[i] = fn(c[i]);
      return c;
    });
    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ sessionId, message: text, model, image: img }),
      });
      if (res.status === 401) { localStorage.removeItem(PW_KEY); setAuthed(false); throw new Error('门锁住了，重新输密码'); }
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `出错了 ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (ev.type === 'session') {
            if (ev.sessionId != null && ev.sessionId !== sessionId) {
              setSessionId(ev.sessionId); localStorage.setItem(SESS_KEY, String(ev.sessionId));
            }
          } else if (ev.type === 'text') {
            patchLast((a) => ({ ...a, content: a.content + ev.text }));
          } else if (ev.type === 'thinking') {
            patchLast((a) => ({ ...a, thinking: (a.thinking || '') + ev.text }));
          } else if (ev.type === 'error') {
            throw new Error(ev.error);
          } else if (ev.type === 'done') {
            finished = true;
          }
        }
      }
      patchLast((a) => ({ ...a, streaming: false }));
      setSessions((list) => {
        const now = new Date().toISOString();
        const current = list.find((s) => s.id === sessionId);
        return current ? [{ ...current, updated_at: now }, ...list.filter((s) => s.id !== sessionId)] : list;
      });
      loadMind();
    } catch (e) {
      patchLast((a) => ({ ...a, streaming: false, content: a.content || `（出错了：${e.message}）` }));
    } finally { setSending(false); }
  }

  // 晞晞的语音：POST /api/tts 拿音频播放。返回 Audio 以便调用方控制停止。
  async function speak(text) {
    const clean = String(text || '').replace(/（[^）]*）|\([^)]*\)/g, '').trim();
    if (!clean) return null;
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: clean }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `合成失败 ${res.status}`); }
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
    await audio.play();
    return audio;
  }

  async function logHealth(kind) {
    const prompts = {
      med: '今天的药吃了吗？',
      weight: '今天多少公斤？（比如 54.4）',
      sleep: '昨晚睡了几小时？（比如 6.5）',
      period: '记录今天来了？',
      exercise: '今天动过了？（散步/运动都算）',
    };
    let value = null;
    if (kind === 'weight' || kind === 'sleep') {
      const v = window.prompt(prompts[kind]);
      if (v == null || v.trim() === '') return;
      value = Number(v);
      if (!Number.isFinite(value)) { alert('要填数字'); return; }
    } else if (!window.confirm(prompts[kind])) return;
    try {
      const r = await api('/api/life/health', { method: 'POST', body: JSON.stringify({ kind, value }) });
      if (r.error) throw new Error(r.error);
      loadHealth();
    } catch (e) { alert('没记上：' + e.message); }
  }

  async function addEvent(date) {
    const title = window.prompt(`${date} 发生了什么？`);
    if (!title || !title.trim()) return;
    const note = window.prompt('想多写点吗？（可以跳过）') || '';
    try {
      const r = await api('/api/life/events', { method: 'POST', body: JSON.stringify({ title: title.trim(), date, note }) });
      if (r.error) throw new Error(r.error);
      loadEvents(ym);
    } catch (e) { alert('没加上：' + e.message); }
  }
  async function delEvent(id) {
    if (!window.confirm('删掉这一条？')) return;
    try { await api(`/api/life/events/${id}`, { method: 'DELETE' }); loadEvents(ym); }
    catch (e) { alert('删不掉：' + e.message); }
  }

  async function searchMem(q) {
    setMemQuery(q); setSearching(true);
    try {
      const r = await api(`/api/mind/memories?q=${encodeURIComponent(q)}&limit=8`);
      const text = r.text || (r.data ? JSON.stringify(r.data, null, 1) : '');
      setMemories(text ? text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean) : []);
    } catch { setMemories([]); } finally { setSearching(false); }
  }

  async function syncMemory() {
    if (syncing) return;
    if (!window.confirm('从 GitHub main 同步最新记忆？\n会覆盖部署里的 CLAUDE.md 和 memories/。')) return;
    setSyncing(true);
    try {
      const d = await api('/api/sync-github-memory', { method: 'POST', body: JSON.stringify({}) });
      if (d.error) throw new Error(d.error);
      alert(`同步完成：${d.files ? d.files.length : 0} 个文件`);
    } catch (e) { alert('同步失败：' + e.message); } finally { setSyncing(false); }
  }

  async function openDocs() {
    setTab('docs');
    try { const d = await api('/api/memory-docs'); setDocs(Array.isArray(d) ? d : []); } catch { setDocs([]); }
  }

  useEffect(() => {
    if (screenRef.current) screenRef.current.scrollTop = 0;
  }, [tab, chatOpen]);

  // 已经存过密码 = 熟门熟路，直接进；第一次输密码才放开门动画
  const gate = (
    <Gate
      pw={pw} setPw={setPw} wakeMsg={wakeMsg} checking={checking}
      onSubmit={async () => {
        const r = await tryAuth(pw);
        if (r === 'ok') localStorage.setItem(PW_KEY, pw);
        else if (r === 'down') setWakeMsg('晞晞还在醒来，过会儿再试');
        return r;
      }}
      onOpened={() => setDoorOpen(true)}
      wallpaper={gateBg}
    />
  );
  if (checking || !authed || !doorOpen) return gate;

  const TABS = [
    ['home', '家', Icon.home],
    ['bridge', '桥', Icon.inner],
    ['star', '星图', Icon.star],
  ];
  const focusedChat = tab === 'chat';

  return (
    <div className="app">
      <div className="screen" ref={screenRef}>
        {tab === 'home' && <HomePage mind={mind} env={env} map={map} health={health} memories={memories}
          onMenu={() => setDrawer(true)} onLog={logHealth} onGo={setTab} />}
        {tab === 'chat' && <Chat
          roomName={roomName} sessionId={sessionId} sessions={sessions} messages={messages}
          sending={sending} input={input} setInput={setInput} onSend={send} onBack={() => setTab('home')}
          onSwitchSession={openSession} onNewSession={createChat} onRenameSession={renameChat}
          models={models} model={model} setModel={setModel} pendingImage={pendingImage} setPendingImage={setPendingImage} onSpeak={speak}
        />}
        {tab === 'bridge' && <BridgeChat api={api} />}
        {tab === 'star' && <StarMap map={map} onReadMemory={readMemory} />}
      </div>

      {tab !== 'chat' && <CrabMascot />}

      {!focusedChat && <nav className="tabbar">
        {TABS.map(([id, label, I]) => (
          <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => {
            setTab(id);
            if (id === 'chat') setChatOpen(false);
          }}>
            <I /><span>{label}</span>
          </button>
        ))}
      </nav>}

      {drawer && (
        <div className="drawer on">
          <div className="mask" onClick={() => setDrawer(false)} />
          <div className="panel">
            <div className="xixir">
              <div className="av">
                <span onClick={() => pickAvatar('xixi')} title="换晞晞的头像"
                  style={{ color: '#D97757', cursor: 'pointer', overflow: 'hidden' }}>
                  {avatars.xixi ? <img src={avatars.xixi} alt="" /> : <CrabIcon />}
                </span>
                <span onClick={() => pickAvatar('dengdeng')} title="换邓邓的头像"
                  style={{ cursor: 'pointer', overflow: 'hidden' }}>
                  {avatars.dengdeng ? <img src={avatars.dengdeng} alt="" /> : <Icon.rain />}
                </span>
              </div>
              <input ref={avRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
              <div className="who">晞晞 <span style={{ color: 'var(--blush)' }}>♥</span> 邓邓</div>
              <div className="days">在一起的第 <b>{daysTogether()}</b> 天</div>
              <div className="since">since 2026.06.14</div>
            </div>

            <div className="mgroup">主题</div>
            <div className="themes">
              {THEMES.map((t) => (
                <span key={t.id} className={`th${theme === t.id ? ' on' : ''}`}
                  style={{ background: t.g }} title={t.name}
                  onClick={() => setTheme(t.id)} />
              ))}
            </div>

            <div className="mgroup">外观</div>
            <div className="mrow" onClick={() => setNight(!night)}>
              <Icon.half /> 夜间模式 <span className={`sw${night ? ' on' : ''}`} />
            </div>
            <div className="mrow" onClick={() => gateBgRef.current?.click()}>
              <Icon.image /> 进门前的图
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>
                {gateBg ? '已设置' : '未设置'} ›</span>
            </div>
            {gateBg && (
              <div className="mrow" onClick={() => setGateBg('')}>
                <Icon.retry /> 恢复进门前的默认
              </div>
            )}
            <div className="mrow" onClick={() => bgRef.current?.click()}>
              <Icon.image /> 进屋后的底图
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>
                {bg ? '已设置' : '未设置'} ›</span>
            </div>
            {bg && (
              <div className="mrow" onClick={() => setBg('')}>
                <Icon.retry /> 恢复进屋后的默认
              </div>
            )}
            <input ref={gateBgRef} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { setGateBg(await fileToResizedDataURL(f, 1400, 0.78)); } catch { alert('这张图读不了'); }
            }} />
            <input ref={bgRef} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { setBg(await fileToResizedDataURL(f, 1400, 0.78)); } catch { alert('这张图读不了'); }
            }} />

            <div className="mgroup">她</div>
            {/* 这三个后端还没有接口。留着位置，但灰着——不假装能用 */}
            <div className="mrow off" onClick={() => setSoon('推送通知')}>
              <Icon.bell /> 推送通知 <span className="sw dead" />
            </div>
            <div className="mrow off" onClick={() => setSoon('主动消息')}>
              <Icon.chat /> 主动消息 <span className="sw dead" />
            </div>
            <div className="mrow off" onClick={() => setSoon('语音回复')}>
              <Icon.mic /> 语音回复 <span className="sw dead" />
            </div>

            <div className="mgroup">System</div>
            <div className="mrow" onClick={() => { setDrawer(false); setTab('more'); }}>
              <Icon.gear /> 模型与参数
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>{model} ›</span>
            </div>
            <div className="mrow" onClick={() => { setDrawer(false); openDocs(); }}>
              <Icon.book /> 日记本
            </div>
            <div className="mrow" onClick={() => { setDrawer(false); setTab('more'); }}>
              <Icon.sync /> 数据管理
            </div>
          </div>
        </div>
      )}

      {palette && (
        <div className="palette on">
          <div className="mask" onClick={() => setPalette(false)} />
          <div className="psheet">
            <div className="sec" style={{ margin: '0 0 12px' }}>主题</div>
            <div className="pgrid">
              {THEMES.map((t) => (
                <div key={t.id} className={`pitem${theme === t.id ? ' on' : ''}`} onClick={() => setTheme(t.id)}>
                  <span style={{ background: t.g }} />{t.name}
                </div>
              ))}
            </div>
            <div className="mrow" onClick={() => setNight(!night)}
              style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <Icon.half /> 夜间模式 <span className={`sw${night ? ' on' : ''}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigPage({ api, onBack }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => { try { setD(await api('/api/model-config')); } catch (e) { setMsg(String(e.message)); } })();
  }, [api]);
  if (!d) return <div className="empty">读取中…</div>;
  const put = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/model-config', {
        method: 'PUT',
        body: JSON.stringify({
          temperature: d.temperature, maxReplyTokens: d.maxReplyTokens, contextMessages: d.contextMessages,
        }),
      });
      setMsg(r.persisted ? '已保存，下一条消息生效' : '已临时保存');
      setD({ ...r });
    } catch (e) { setMsg('保存失败：' + e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="entry" onClick={onBack} style={{ padding: '6px 0', fontSize: 11.5, color: 'var(--muted)' }}>
        <Icon.back /> 返回
      </div>
      <h1 className="big" style={{ fontSize: 23 }}>模型与参数</h1>
      <div className="sub">改完点保存，下一条消息就用新的</div>

      <Sec more="影响她说话的样子">生成</Sec>
      <div className="card">
        <label className="cfg">
          <span>温度<em>越高越跳脱</em></span>
          <input type="number" step="0.05" min="0" max="2" value={d.temperature ?? ''} onChange={put('temperature')} />
        </label>
        <label className="cfg">
          <span>上下文条数<em>她能回头看多远</em></span>
          <input type="number" step="2" min="4" max="200" value={d.contextMessages ?? ''} onChange={put('contextMessages')} />
        </label>
      </div>

      <button className="cfgbtn" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
      {msg && <p className="cfgmsg">{msg}</p>}
    </>
  );
}
