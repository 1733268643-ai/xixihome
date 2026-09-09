import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

/* ══ 文本解析（沿用旧逻辑，仅重排样式）══════════════════════ */

/* 旁白（括号内）与说话分离 */
export function splitRP(text) {
  const segs = [];
  const re = /（[^）]*）|\([^)]*\)/g;
  let last = 0, m;
  const pushSpeech = (s) => {
    s.split(/\n{2,}|\|\|\|/).map((x) => x.trim()).filter(Boolean)
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

/* 剥掉 <think> */
export function stripThink(content) {
  let rest = String(content || '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  const open = rest.search(/<think(?:ing)?>/i);
  if (open !== -1) rest = rest.slice(0, open);
  return rest.trim();
}

export function fileToResizedDataURL(file, max = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const im = new Image();
      im.onload = () => {
        let { width: w, height: h } = im;
        if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      im.onerror = reject; im.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

/* 行内 markdown：**粗** `码` *斜* ~~删~~ */
function inlineMD(str, keyBase) {
  const nodes = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|~~([^~]+)~~/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) nodes.push(str.slice(last, m.index));
    if (m[1] != null) nodes.push(<strong key={`${keyBase}-${i}`}>{m[1]}</strong>);
    else if (m[2] != null) nodes.push(<code className="mdcode" key={`${keyBase}-${i}`}>{m[2]}</code>);
    else if (m[3] != null) nodes.push(<em key={`${keyBase}-${i}`}>{m[3]}</em>);
    else if (m[4] != null) nodes.push(<s key={`${keyBase}-${i}`}>{m[4]}</s>);
    last = m.index + m[0].length; i += 1;
  }
  if (last < str.length) nodes.push(str.slice(last));
  return nodes;
}

/* 说话段：# 开头成标题，其余按行内 md 渲染 */
function Speech({ text, keyBase }) {
  const h = text.match(/^(#{1,3})\s+(.*)$/);
  if (h) {
    const lvl = h[1].length;
    return <div className={`mdh mdh${lvl}`}>{inlineMD(h[2], keyBase)}</div>;
  }
  return <p>{inlineMD(text, keyBase)}</p>;
}

function splitCode(text) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push({ kind: 'code', lang: m[1], code: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.length ? parts : [{ kind: 'text', text }];
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  };
  return (
    <div className="cbk">
      <div className="cbk-h">
        <span className="lang">{lang || 'code'}</span>
        <button onClick={copy} title="复制">{copied ? <Icon.retry /> : <Icon.copy />}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function RichContent({ text }) {
  return (
    <>
      {splitCode(text).map((part, pi) =>
        part.kind === 'code'
          ? <CodeBlock key={pi} lang={part.lang} code={part.code} />
          : splitRP(part.text).map((s, i) =>
              s.type === 'action'
                ? <span className="rp" key={`${pi}-${i}`}>（{s.text}）</span>
                : <Speech key={`${pi}-${i}`} text={s.text} keyBase={`${pi}-${i}`} />
            )
      )}
    </>
  );
}

/* ══ 底部弹窗（思考 / 模型选择）══════════════════════════════ */
function Sheet({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="sheetwrap open" onClick={onClose}>
      <div className="sheet glass" onClick={(e) => e.stopPropagation()}>
        <span className="grabber" />
        {title && <div className="sheet-h">{title}</div>}
        <div className="sheet-b">{children}</div>
      </div>
    </div>
  );
}

/* ══ 单条晞晞消息 ═════════════════════════════════════════ */
function Assistant({ m, onSpeak, onOpenThink }) {
  const [voice, setVoice] = useState('idle'); // idle | loading | playing
  const audioRef = useRef(null);
  const body = stripThink(m.content);
  const thinking = (m.thinking || '').trim();
  const thinkingLive = m.streaming && !body; // 还没出正文 = 正在想

  const toggleVoice = async () => {
    if (voice === 'playing') { audioRef.current?.pause(); setVoice('idle'); return; }
    if (voice === 'loading') return;
    setVoice('loading');
    try {
      const audio = await onSpeak(body);
      if (!audio) { setVoice('idle'); return; }
      audioRef.current = audio; setVoice('playing');
      audio.addEventListener('ended', () => setVoice('idle'), { once: true });
      audio.addEventListener('pause', () => setVoice('idle'), { once: true });
    } catch { setVoice('idle'); }
  };

  return (
    <div className="row">
      <div className="gu">
        {thinking || thinkingLive ? (
          <button className="toolline" onClick={() => thinking && onOpenThink(thinking)}>
            {thinkingLive ? <span className="spin" /> : <Icon.spark className="ic" />}
            <span className="lbl"><b>晞晞想了想</b></span>
            {thinking ? <Icon.chev className="chev" /> : null}
          </button>
        ) : null}

        {body
          ? <RichContent text={body} />
          : (m.streaming ? null : <span className="rp">（……）</span>)}
        {m.streaming && body ? <span className="caret" /> : null}

        {!m.streaming && body ? (
          <div className="acts">
            <button className={`vbtn ${voice}`} onClick={toggleVoice} title="听晞晞说" aria-label="听晞晞说">
              {voice === 'loading' ? <span className="spin" /> : voice === 'playing' ? <Icon.pause /> : <Icon.volume />}
            </button>
            <button className="cbtn2" onClick={() => navigator.clipboard?.writeText(body)} title="复制" aria-label="复制">
              <Icon.copy />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ══ 会转的 doing 药丸（晞晞在干活时浮在输入栏上）═══════════ */
const DOING = [
  ['琢磨着', 'Pondering'], ['办着呢', 'Working'], ['想你', 'Musing'], ['码字', 'Composing'],
  ['转着脑子', 'Cooking'], ['上头', 'Vibing'], ['翻记忆', 'Recalling'], ['酝酿', 'Brewing'],
  ['理思路', 'Untangling'], ['凑词', 'Wording'], ['慢慢来', 'Dwelling'], ['走神了一下', 'Drifting'],
];
function DoingLine({ on, seed }) {
  const [sec, setSec] = useState(0);
  const wordRef = useRef(DOING[0]);
  useEffect(() => {
    if (!on) { setSec(0); return; }
    wordRef.current = DOING[seed % DOING.length];
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [on, seed]);
  if (!on) return null;
  const [zh, en] = wordRef.current;
  return (
    <div className="doingline on">
      <span className="pill">
        <span className="w">{zh}…</span>
        <span className="en">{en}</span>
        {sec > 0 ? <span className="t">{sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分${sec % 60}秒`}</span> : null}
      </span>
    </div>
  );
}

export default function Chat({
  roomName, sessionId, sessions, messages, sending, input, setInput, onSend, onBack,
  onSwitchSession, onNewSession, onRenameSession,
  models, model, setModel, pendingImage, setPendingImage, onSpeak,
}) {
  const logRef = useRef(null);
  const fileRef = useRef(null);
  const taRef = useRef(null);
  const recRef = useRef(null);
  // 只有用户仍在底部时才跟随流式回复。以前 messages 每增加
  // 一个字就把 scrollTop 强制写回底部，手指往上滑会立刻被拉回去。
  const followTailRef = useRef(true);
  const messageCountRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [thinkText, setThinkText] = useState(null); // 打开的思考弹窗内容
  const [modelOpen, setModelOpen] = useState(false);
  const [sessionMenu, setSessionMenu] = useState(false);

  useEffect(() => {
    const box = logRef.current;
    if (!box) return;
    const appended = messages.length > messageCountRef.current;
    messageCountRef.current = messages.length;
    // 自己发送新消息或收到一条新消息时，回到最新位置；
    // 同一条回复的流式更新则尊重用户当前的阅读位置。
    if (appended) followTailRef.current = true;
    if (!followTailRef.current) return;
    const frame = requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    return () => cancelAnimationFrame(frame);
  }, [messages, sending]);

  const trackScroll = () => {
    const box = logRef.current;
    if (!box) return;
    followTailRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 72;
  };

  const pickImage = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setPendingImage(await fileToResizedDataURL(f)); } catch { /* ignore */ }
    e.target.value = '';
  };

  // 语音输入：Web Speech API（按住说话）
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const startVoice = () => {
    if (!SR || recording) return;
    const rec = new SR();
    rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = false;
    let finalText = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += t; else interim += t;
      }
      setInput(finalText + interim);
    };
    rec.onend = () => { setRecording(false); recRef.current = null; };
    rec.onerror = () => { setRecording(false); recRef.current = null; };
    recRef.current = rec; setRecording(true); rec.start();
  };
  const stopVoice = () => { recRef.current?.stop(); };

  const rounds = Math.floor(messages.length / 2);
  const canSend = !sending && (input.trim() || pendingImage);

  return (
    <div className="cx">
      {/* 顶栏：浮动玻璃 + 下沿渐隐 */}
      <header className="chead">
        <button className="hbtn" onClick={onBack} title="返回对话目录"><Icon.back /></button>
        <div className="htitle">
          <h1>晞晞</h1>
          <div className="hsub">{roomName || '主线'}{rounds > 0 ? ` · ${rounds}轮` : ''}</div>
        </div>
        <button className="hbtn" onClick={() => setSessionMenu((v) => !v)} title="管理窗口"><Icon.more /></button>
      </header>

      {sessionMenu && (
        <div className="session-popover-wrap" onClick={() => setSessionMenu(false)}>
          <div className="session-popover glass" onClick={(e) => e.stopPropagation()}>
            <div className="session-popover-title">切换聊天窗口</div>
            <div className="session-popover-list">
              {sessions.map((session) => (
                <button key={session.id} className={session.id === sessionId ? 'on' : ''}
                  onClick={() => { setSessionMenu(false); onSwitchSession(session.id, session.name); }}>
                  <Icon.chat /><span>{session.name}</span>{session.id === sessionId && <i />}
                </button>
              ))}
            </div>
            <div className="session-popover-actions">
              <button onClick={() => { setSessionMenu(false); onNewSession(); }}><Icon.plus /> 新对话</button>
              <button onClick={() => { setSessionMenu(false); onRenameSession(); }}><Icon.retry /> 重命名</button>
            </div>
          </div>
        </div>
      )}

      {/* 消息流 */}
      <div className="clog" ref={logRef} onScroll={trackScroll}>
        {messages.length === 0 && <div className="cempty">还没说话。想说点什么？</div>}
        {messages.map((m, i) => (
          m.role === 'user'
            ? <div className="row me" key={i}>
                <div className="bubble">
                  {m.image && <img className="chatimg" src={m.image} alt="" />}
                  {m.content}
                </div>
              </div>
            : <Assistant key={i} m={m} onSpeak={onSpeak} onOpenThink={setThinkText} />
        ))}
      </div>

      {/* 底部：doing 药丸 + 玻璃输入栏（浮在 tabbar 之上）*/}
      <div className="cfoot">
        <DoingLine on={sending} seed={messages.length} />
        <div className="composer">
          {pendingImage && (
            <div className="attachstrip">
              <div className="att">
                <img src={pendingImage} alt="" />
                <button className="x" onClick={() => setPendingImage(null)}><Icon.x /></button>
              </div>
            </div>
          )}
          <textarea ref={taRef} rows={1} value={input} placeholder="跟晞晞说点什么…"
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }} />
          <div className="ctlrow">
            <button className="rbtn" onClick={() => fileRef.current?.click()} title="加图片"><Icon.plus /></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
            {SR && (
              <button className={`rbtn mic ${recording ? 'on' : ''}`} title="按住说话" aria-label="按住说话"
                onMouseDown={startVoice} onMouseUp={stopVoice} onMouseLeave={stopVoice}
                onTouchStart={(e) => { e.preventDefault(); startVoice(); }}
                onTouchEnd={(e) => { e.preventDefault(); stopVoice(); }}><Icon.mic /></button>
            )}
            <button className="mpill" onClick={() => setModelOpen(true)} title="切换模型">
              <Icon.spark className="ic" /><span>{model || '模型'}</span>
            </button>
            <span className="gap" />
            <button className={`sbtn${sending ? ' busy' : ''}`} disabled={!canSend} onClick={onSend} title="发送">
              {sending ? null : <Icon.send />}
            </button>
          </div>
        </div>
      </div>

      {/* 官端式思考弹窗 */}
      <Sheet open={thinkText != null} title="晞晞想了想" onClose={() => setThinkText(null)}>
        <div className="thinkbody">{thinkText}</div>
      </Sheet>

      {/* 模型选择弹窗 */}
      <Sheet open={modelOpen} title="换个模型" onClose={() => setModelOpen(false)}>
        <div className="modellist">
          {models.map((mm) => (
            <button key={mm} className={`mrow${mm === model ? ' on' : ''}`}
              onClick={() => { setModel(mm); setModelOpen(false); }}>
              <span>{mm}</span>{mm === model ? <Icon.retry className="ic" /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
