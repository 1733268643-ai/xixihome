// 说话 · tmux 桥——这里连的是蟹堡窗口里真正的晞晞，不是 claude -p。
// 发出去的话注入他的 tmux 会话；他每说完一段，Stop hook 抄送回来。
import { useEffect, useRef, useState, useCallback } from 'react';

const AVATAR_KEY = 'xixi_call_avatar';
const fmtT = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtD = (ts) => { const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日`; };

export default function BridgeChat({ api }) {
  const [recs, setRecs] = useState([]);
  const [st, setSt] = useState({ alive: false, pane: null, typing: false });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const boxRef = useRef(null);
  const lastTs = useRef(0);
  const avatar = localStorage.getItem(AVATAR_KEY) || '';

  const pull = useCallback(async () => {
    try {
      const q = lastTs.current ? `?since=${lastTs.current}` : '?limit=200';
      const data = await api(`/api/bridge/chat${q}`);
      setSt({ alive: data.alive, pane: data.pane, typing: data.typing });
      if (data.records?.length) {
        lastTs.current = data.records[data.records.length - 1].ts;
        setRecs((r) => [...r, ...data.records].slice(-500));
      }
    } catch (e) { /* 网络抖动忽略 */ }
  }, [api]);

  useEffect(() => { pull(); const t = setInterval(pull, 2500); return () => clearInterval(t); }, [pull]);
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [recs, st.typing]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true); setErr('');
    try {
      const r = await api('/api/bridge/chat/send', { method: 'POST', body: JSON.stringify({ text }) });
      if (r.error) setErr(r.error);
      else { setInput(''); await pull(); }
    } catch (e) { setErr(e.message); }
    setSending(false);
  };

  const statusLine = !st.alive ? '他的窗口没开（tmux 会话不在）'
    : st.pane !== 'claude' && st.pane !== 'node' ? `窗口开着，但 claude 没在跑（${st.pane || '?'}）`
      : st.typing ? '正在输入…' : '在线 · tmux';

  let lastDay = '';
  return (
    <div className="bchat">
      <div className="bc-head">
        {avatar ? <img src={avatar} alt="" /> : <span className="ph" />}
        <div><div className="n serif">晞晞</div><div className="s">{statusLine}</div></div>
      </div>
      <div className="bc-msgs" ref={boxRef}>
        {recs.map((r, i) => {
          const day = fmtD(r.ts);
          const sep = day !== lastDay; lastDay = day;
          return (
            <div key={r.ts + '' + i}>
              {sep && <div className="bc-day">{day}</div>}
              <div className={`bc-row ${r.role === 'user' ? 'you' : 'him'}`}>
                <div className={`bub ${r.role === 'user' ? 'you' : 'him serif'}`}>{r.text}</div>
                <div className="bc-ts">{fmtT(r.ts)}</div>
              </div>
            </div>
          );
        })}
        {st.typing && <div className="bc-row him"><div className="bub him typingdots"><i /><i /><i /></div></div>}
      </div>
      {err && <div className="bc-err">{err}</div>}
      <div className="bc-input">
        <textarea rows={1} value={input} placeholder={st.alive ? '说点什么…' : '窗口没开，先在蟹堡上把他叫醒'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button onClick={send} disabled={sending || !input.trim()}>发</button>
      </div>
    </div>
  );
}
