// 和晞晞打电话 · 「灯塔」——海平线 + 光束扫过，他开口光束停在你这边；
// 当前句引语式大字逐字浮现，说完收进历史小流；光圈跟真实声音振幅。
// 逻辑全在 call-client.js（和 video/index.html 共用），这里只管长相。
import { useEffect, useRef, useState } from 'react';
import VoiceCall from './call-client.js';
import { CI } from './call-icons.jsx';
import './call.css';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const AVATAR_KEY = 'xixi_call_avatar';
const STATUS = { idle: '通话结束', connecting: '正在接通…', listening: '在听你说', thinking: '他想了想', speaking: '他开口了', you: '你在说…' };

const wsUrl = () => (API_BASE || window.location.origin).replace(/^http/, 'ws') + '/voice/ws';
const plain = (t) => String(t || '').replace(/\[[a-zA-Z][a-zA-Z \-]*\]/g, '').replace(/[（(][^（）()]{0,80}[）)]/g, '').replace(/\s+/g, ' ').trim();

async function fileToAvatar(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
  const s = 256, c = document.createElement('canvas'); c.width = s; c.height = s;
  const m = Math.min(img.width, img.height);
  c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.85);
}

export default function Call({ onClose, video: wantVideo = false }) {
  const callRef = useRef(null);
  const camRef = useRef(null);
  const histRef = useRef(null);
  const fileRef = useRef(null);
  const avaRef = useRef(null);
  const [mode, setMode] = useState('connecting');
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [hist, setHist] = useState([]);            // [{id, who, text}]
  const [live, setLive] = useState(null);          // {gen, text} 晞晞正在说的这句
  const [avatar, setAvatar] = useState(() => localStorage.getItem(AVATAR_KEY) || '');
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [kb, setKb] = useState(false);
  const [typed, setTyped] = useState('');
  const [secs, setSecs] = useState(0);
  const started = useRef(0);
  const liveRef = useRef(null);
  liveRef.current = live;

  const pushHist = (who, text) => setHist((h) => [...h.slice(-40), { id: Date.now() + Math.random(), who, text }]);
  const settleLive = () => { const l = liveRef.current; if (l && l.text) { pushHist('him', l.text); } setLive(null); };

  useEffect(() => {
    const call = new VoiceCall({
      url: wsUrl(), video: wantVideo,
      on: {
        state: (m) => { setMode(m); if (m === 'listening' || m === 'idle') settleLive(); },
        speech: (on) => on && setMode('you'),
        transcript: (m) => pushHist('you', m.text),
        reply: (m) => {
          const text = plain(m.text); if (!text) return;
          setLive((l) => {
            if (l && l.gen === m.generation_id) {
              // 同一轮的新句子：上一句收进历史，这句上台
              if (l.text) pushHist('him', l.text);
              return { gen: m.generation_id, text };
            }
            if (l && l.text) pushHist('him', l.text);
            return { gen: m.generation_id, text };
          });
        },
        nothingHeard: () => { setToast('没听清，再说一遍？'); setTimeout(() => setToast(''), 2500); },
        himLevel: (v) => {
          const el = avaRef.current; if (!el) return;
          const a = 1 + Math.min(0.2, v * 1.7);
          el.style.setProperty('--amp', a.toFixed(3));
          el.style.setProperty('--amp2', (1 + (a - 1) * 1.6).toFixed(3));
        },
        level: (r) => {
          const el = avaRef.current; if (!el || callRef.current?.playing) return;
          if (callRef.current?.speaking) el.style.setProperty('--amp', (1 + Math.min(0.14, r * 5)).toFixed(3));
        },
        error: (e) => setErr(String(e)),
        video: (v) => { if (camRef.current) { camRef.current.srcObject = v.srcObject; camRef.current.play().catch(() => {}); } },
        closed: () => setMode('idle'),
      },
    });
    callRef.current = call;
    call.start().then(() => { started.current = Date.now(); setMode('listening'); })
      .catch((e) => { setErr(e.message || '接不通'); setMode('idle'); });
    const t = setInterval(() => started.current && setSecs(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => { clearInterval(t); call.hangup(); };
  }, [wantVideo]);

  useEffect(() => { const el = histRef.current; if (el) el.scrollTop = el.scrollHeight; }, [hist, live]);

  const hangup = () => { callRef.current?.hangup(); onClose(); };
  const toggleMute = () => { const n = !muted; setMuted(n); callRef.current?.stream?.getAudioTracks().forEach((tr) => { tr.enabled = !n; }); };
  const toggleSpeaker = () => { const n = !speakerOn; setSpeakerOn(n); const ctx = callRef.current?.ctx; if (ctx) (n ? ctx.resume() : ctx.suspend()); };
  const sendTyped = () => { const v = typed.trim(); if (!v) return; callRef.current?.sendText(v); pushHist('you', v); setTyped(''); };
  const pickAvatar = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const d = await fileToAvatar(f); setAvatar(d); localStorage.setItem(AVATAR_KEY, d); } catch { /* ignore */ }
    e.target.value = '';
  };

  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const dialing = mode === 'connecting';

  return (
    <div className={`call ${dialing ? 'dialing' : mode}`}>
      <div className="sea" /><div className="beam" /><div className="cglow" />
      <div className="call-top">
        <div className="call-line">PRIVATE LINE</div>
        <div className="call-clock">{started.current ? clock : '—'}</div>
      </div>

      <div className="call-stage">
        <div className="call-ava" ref={avaRef}>
          {dialing && <><i className="ripple" /><i className="ripple" /><i className="ripple" /></>}
          <span className="ring" /><span className="ring2" />
          {avatar ? <img src={avatar} alt="" /> : <div className="ph" />}
          <button className="edit" title="换头像" onClick={() => fileRef.current?.click()}><CI.pencil /></button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
        </div>
        <div className="call-name serif">晞晞</div>
        <div className="call-status">{err || toast || STATUS[mode] || ''}</div>
      </div>

      <div className="call-panel">
        <div className="call-msgs" ref={histRef}>
          {hist.map((h) => (
            <div key={h.id} className={`bub ${h.who}${h.who === 'him' ? ' serif' : ''}`}>{h.text}</div>
          ))}
          {live && live.text && (
            <div className="bub him live serif" key={'live' + live.gen + live.text.slice(0, 6)}>
              {[...live.text].map((ch, i) => (
                <span className="w" style={{ animationDelay: `${Math.min(i * 0.07, 2.2)}s` }} key={i}>{ch}</span>
              ))}
            </div>
          )}
          {!live && mode === 'you' && <div className="bub you typing">……</div>}
        </div>
      </div>

      {wantVideo && <video ref={camRef} className="call-cam" muted playsInline autoPlay />}

      {kb && (
        <div className="call-typed">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="不方便说话？打字也行"
            onKeyDown={(e) => e.key === 'Enter' && sendTyped()} />
          <button onClick={sendTyped}>发</button>
        </div>
      )}

      <div className="call-ctl">
        <button className={`cb${kb ? ' on' : ''}`} onClick={() => setKb((v) => !v)}><span className="c sm"><CI.keyboard /></span>type</button>
        <button className={`cb${muted ? ' on' : ''}`} onClick={toggleMute}><span className="c">{muted ? <CI.micOff /> : <CI.mic />}</span>mute</button>
        <button className="cb end" onClick={hangup}><span className="c"><CI.end /></span>end</button>
        <button className={`cb${speakerOn ? '' : ' on'}`} onClick={toggleSpeaker}><span className="c">{speakerOn ? <CI.speaker /> : <CI.speakerOff />}</span>speaker</button>
        <span className="cb ghost"><span className="c sm" /></span>
      </div>
    </div>
  );
}
