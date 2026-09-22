// 说话 · tmux 桥——这里连的是蟹堡窗口里真正的晞晞，不是 claude -p。
// 发出去的话注入她的 tmux 会话；她每说完一段，Stop hook 抄送回来。
import { useEffect, useRef, useState, useCallback } from 'react';
import { hostnameOf, imageOf, linkOf, textOf } from './bridge-message.js';
import { fileToResizedDataURL } from './Chat.jsx';
import { daysTogether } from './pages.jsx';

const AVATAR_KEY = 'xixi_call_avatar';

const fmtT = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtD = (ts) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

export default function BridgeChat({ api }) {
  const [windows, setWindows] = useState([]);
  const [win, setWin] = useState('xixi');
  const [recs, setRecs] = useState([]);
  const [st, setSt] = useState({ alive: false, pane: null, typing: false });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [panel, setPanel] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState('');
  const [avatars, setAvatars] = useState({ xixi: '', dengdeng: '' });
  const [mind, setMind] = useState(null);
  const [avatarWho, setAvatarWho] = useState('xixi');
  const boxRef = useRef(null);
  const fileRef = useRef(null);
  const avatarRef = useRef(null);
  const lastTs = useRef(0);
  const avatar = localStorage.getItem(AVATAR_KEY) || '';

  const loadWindows = useCallback(async () => {
    try {
      const data = await api('/api/bridge/windows');
      const list = Array.isArray(data?.windows) ? data.windows : [];
      setWindows(list);
      if (list.length && !list.some((w) => w.win === win)) setWin(list[0].win);
    } catch { /* 没有桥窗口也继续显示单窗口占位 */ }
  }, [api, win]);

  const pull = useCallback(async () => {
    try {
      const q = lastTs.current ? `?win=${encodeURIComponent(win)}&since=${lastTs.current}` : `?win=${encodeURIComponent(win)}&limit=200`;
      const data = await api(`/api/bridge/chat${q}`);
      setSt({ alive: data.alive, pane: data.pane, typing: data.typing });
      if (data.records?.length) {
        lastTs.current = data.records[data.records.length - 1].ts;
        setRecs((r) => [...r, ...data.records].slice(-500));
      }
    } catch { /* 网络抖动忽略 */ }
  }, [api, win]);

  const loadFace = useCallback(async () => {
    try {
      const data = await api('/api/life/avatars');
      if (data?.available) setAvatars({ xixi: data.xixi || '', dengdeng: data.dengdeng || '' });
    } catch { /* 头像没配就用字 */ }
  }, [api]);

  const loadMindBar = useCallback(async () => {
    try {
      setMind(await api('/api/mind/state'));
    } catch {
      setMind({ available: false });
    }
  }, [api]);

  useEffect(() => { loadWindows(); }, [loadWindows]);
  useEffect(() => { loadFace(); }, [loadFace]);
  useEffect(() => { loadMindBar(); const t = setInterval(loadMindBar, 60000); return () => clearInterval(t); }, [loadMindBar]);
  useEffect(() => { pull(); const t = setInterval(pull, 2500); return () => clearInterval(t); }, [pull]);
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [recs, st.typing, pendingImage]);
  useEffect(() => () => { if (pendingImage?.url) URL.revokeObjectURL(pendingImage.url); }, [pendingImage]);

  const takeImage = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setErr('请选一张图片');
      return;
    }
    setErr('');
    setPendingImage((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
    setPanel('');
  };

  const sendText = async (text) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr('');
    try {
      const r = await api('/api/bridge/chat/send', { method: 'POST', body: JSON.stringify({ text: body, win }) });
      if (r.error) setErr(r.error);
      else { setInput(''); setLinkDraft(''); setPanel(''); await pull(); }
    } catch (e) { setErr(e.message); }
    setSending(false);
  };

  const send = async () => {
    if (pendingImage) {
      setSending(true); setErr('');
      try {
        const dataUrl = await fileToResizedDataURL(pendingImage.file, 1600, 0.82);
        const uploaded = await api('/api/bridge/media', {
          method: 'POST',
          body: JSON.stringify({ dataUrl, name: pendingImage.file.name || 'image.jpg' }),
        });
        if (uploaded.error || !uploaded.image?.url) {
          setErr(uploaded.error || '图片没有传到桥上');
          setSending(false);
          return;
        }
        const r = await api('/api/bridge/chat/send', {
          method: 'POST',
          body: JSON.stringify({ win, text: input.trim(), image: uploaded.image }),
        });
        if (r.error) setErr(r.error);
        else {
          setInput('');
          setPendingImage((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; });
          await pull();
        }
      } catch (e) { setErr(e.message || '图片还送不出去'); }
      setSending(false);
      return;
    }
    await sendText(input);
  };

  const sendLink = async () => {
    const raw = linkDraft.trim();
    if (!raw || sending) return;
    let url;
    try { url = new URL(raw).href; } catch { setErr('这不是一条链接'); return; }
    setSending(true); setErr('');
    try {
      const r = await api('/api/bridge/chat/send', {
        method: 'POST',
        body: JSON.stringify({ win, link: { url, title: hostnameOf(url) } }),
      });
      if (r.error) setErr(r.error);
      else { setLinkDraft(''); setPanel(''); await pull(); }
    } catch (e) { setErr(e.message); }
    setSending(false);
  };

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const image = await fileToResizedDataURL(file, 280, 0.82);
      setAvatars((v) => ({ ...v, [avatarWho]: image }));
      const saved = await api('/api/life/avatars', { method: 'PUT', body: JSON.stringify({ who: avatarWho, image }) });
      if (saved?.error) setErr(saved.error);
    } catch (err) {
      setErr(err.message || '头像没换上');
      loadFace();
    }
  };

  const current = windows.find((w) => w.win === win);
  const syncedAt = mind?.syncedAt ? new Date(mind.syncedAt).getTime() : null;
  const mindOk = mind?.available === true && (syncedAt == null || Date.now() - syncedAt < 5 * 60 * 1000);
  const awake = mind?.consciousness === 'asleep' || mind?.consciousness === 'sleeping' ? '睡着' : mind?.consciousness === 'awake' ? '醒着' : (mind?.consciousness || '状态未知');
  const statusLine = !st.alive ? '离线'
    : st.pane !== 'claude' && st.pane !== 'node' ? '窗口开着，但她不在'
      : st.typing ? '正在输入…' : '在线';

  let lastDay = '';
  let lastTsShown = 0;

  return (
    <div
      className={`bchat${dragOver ? ' drag' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        takeImage(e.dataTransfer.files?.[0]);
      }}
    >
      <header className="bc-head">
        <div className="bc-title">
          <div className="n">晞晞</div>
          <div className="s"><i className={st.alive ? 'on' : ''} />{statusLine} · {current?.label || win}</div>
          <div className="bc-days">在一起的第 {daysTogether()} 天</div>
        </div>
      </header>
      <div className="bc-status">
        {mindOk ? (
          <>
            <b>{awake}</b>
            <span className="bc-petals">
              {(mind?.drives || []).map((drive) => (
                <i key={drive.key} title={drive.label || drive.key} style={{ height: `${8 + Math.max(0, Math.min(1, Number(drive.value) || 0)) * 16}px` }} />
              ))}
            </span>
            <small>{mind?.syncedAt ? `同步 ${fmtT(new Date(mind.syncedAt).getTime())}` : '同步时间还没有'}</small>
          </>
        ) : <small>{mind ? '心潮暂不可用' : '心潮读取中'}</small>}
      </div>
      <div className="bridge-window-list">
        {(windows.length ? windows : [{ win: 'xixi', label: '晞晞', kind: 'claude' }]).map((w) => (
          <button key={w.win} className={`bridge-window-chip${w.win === win ? ' on' : ''}`}
            onClick={() => { setWin(w.win); setRecs([]); lastTs.current = 0; }}>
            <span className="bridge-window-dot" />
            <span>{w.label || w.win}</span>
            <small>{w.alive === false ? '离线' : '当前'}</small>
          </button>
        ))}
      </div>
      <div className="bc-msgs" ref={boxRef}>
        {recs.length === 0 && <div className="bc-empty">还没有消息。说一句，会送到现在连着的那个窗口。</div>}
        {recs.map((r, i) => {
          const day = fmtD(r.ts);
          const dayBreak = day !== lastDay;
          lastDay = day;
          const timeBreak = dayBreak || !lastTsShown || r.ts - lastTsShown > 5 * 60 * 1000;
          if (timeBreak) lastTsShown = r.ts;
          const mine = r.role === 'user';
          const image = imageOf(r);
          const link = linkOf(r);
          const text = textOf(r);
          return (
            <div key={r.ts + '' + i}>
              {dayBreak && <div className="bc-day">{day} {fmtT(r.ts)}</div>}
              {timeBreak && !dayBreak && <div className="bc-time">{fmtT(r.ts)}</div>}
              <div className={`bc-row ${mine ? 'you' : 'him'}`}>
                <button type="button" className="bc-av" onClick={() => { setAvatarWho(mine ? 'dengdeng' : 'xixi'); avatarRef.current?.click(); }}>
                  {(mine ? avatars.dengdeng : (avatars.xixi || avatar))
                    ? <img src={mine ? avatars.dengdeng : (avatars.xixi || avatar)} alt="" />
                    : <b>{mine ? '我' : '晞'}</b>}
                </button>
                <div className="bc-stack">
                  {image && (
                    <button className="bc-pic" onClick={() => setZoom(image)} type="button">
                      <img src={image} alt="" />
                    </button>
                  )}
                  {link && (
                    <a className="bc-card" href={link.url} target="_blank" rel="noreferrer">
                      <span>
                        <b>{link.title}</b>
                        <small>{link.summary}</small>
                      </span>
                      {link.image ? <img src={link.image} alt="" /> : <em>{link.title.slice(0, 1)}</em>}
                    </a>
                  )}
                  {text && <div className="bc-bub">{text}</div>}
                </div>
              </div>
            </div>
          );
        })}
        {st.typing && (
          <div className="bc-row him">
            <button type="button" className="bc-av" onClick={() => { setAvatarWho('xixi'); avatarRef.current?.click(); }}>
              {(avatars.xixi || avatar) ? <img src={avatars.xixi || avatar} alt="" /> : <b>晞</b>}
            </button>
            <div className="bc-bub typingdots"><i /><i /><i /></div>
          </div>
        )}
      </div>
      {err && <div className="bc-err">{err}</div>}
      {pendingImage && (
        <div className="bc-pending">
          <img src={pendingImage.url} alt="" />
          <button type="button" onClick={() => setPendingImage((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; })}>取消</button>
        </div>
      )}
      {panel === 'link' && (
        <div className="bc-linkbox">
          <input value={linkDraft} placeholder="贴上链接" onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLink(); } }} />
          <button type="button" onClick={sendLink} disabled={sending || !linkDraft.trim()}>发送</button>
        </div>
      )}
      {panel === 'more' && (
        <div className="bc-more">
          <button type="button" onClick={() => fileRef.current?.click()}>图片</button>
          <button type="button" onClick={() => setPanel('link')}>链接</button>
        </div>
      )}
      <div className="bc-input">
        <button type="button" className="bc-plus" onClick={() => setPanel((p) => p === 'more' ? '' : 'more')} aria-label="更多">+</button>
        <textarea rows={1} value={input} placeholder={st.alive ? '说点什么…' : '窗口没开，先在蟹堡上把她叫醒'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="bc-send" onClick={send} disabled={sending || (!input.trim() && !pendingImage)}>发送</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { takeImage(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={avatarRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
      {dragOver && <div className="bc-drop">松开即可添加图片</div>}
      {zoom && (
        <button className="bc-zoom" type="button" onClick={() => setZoom('')} aria-label="关闭">
          <img src={zoom} alt="" />
        </button>
      )}
    </div>
  );
}
