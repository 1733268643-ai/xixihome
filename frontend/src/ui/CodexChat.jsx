import { useCallback, useEffect, useRef, useState } from 'react';
import { fileToResizedDataURL } from './Chat.jsx';
import './call.css';

const fmtT = (ts) => {
  const d = new Date(ts || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtD = (ts) => {
  const d = new Date(ts || Date.now());
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

const effortName = {
  none: '即时', low: '轻度', medium: '中', high: '高', xhigh: '极高', max: '最大', ultra: '超强',
};

function ModelSheet({ picker, onChange, onClose, onSave, saving }) {
  if (!picker.open) return null;
  const selected = picker.models.find((item) => item.model === picker.model) || picker.models[0];
  const efforts = selected?.supportedReasoningEfforts || [];
  return (
    <div className="codex-model-wrap">
      <div className="codex-model-sheet">
        <span className="codex-grabber" />
        <div className="codex-model-title"><div><small>运行外壳</small><h3>选择模型</h3></div><button onClick={onClose}>×</button></div>
        <p className="codex-model-note">记忆留在顾川的家里，切换模型不会换掉他。</p>
        <div className="codex-model-list">
          {picker.models.map((item) => (
            <button key={item.model} className={item.model === picker.model ? 'on' : ''} onClick={() => {
              const supported = item.supportedReasoningEfforts || [];
              const keep = supported.some((v) => v.reasoningEffort === picker.effort);
              onChange({ ...picker, model: item.model, effort: keep ? picker.effort : item.defaultReasoningEffort || supported[0]?.reasoningEffort || '' });
            }}>
              <b>{item.displayName}</b>{item.isDefault && <i>推荐</i>}<span>{item.model === picker.model ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        <div className="codex-effort-head"><b>思考强度</b><span>越高越仔细，也会更慢</span></div>
        <div className="codex-effort-list">
          {efforts.map((item) => (
            <button key={item.reasoningEffort} className={item.reasoningEffort === picker.effort ? 'on' : ''}
              onClick={() => onChange({ ...picker, effort: item.reasoningEffort })}>
              {effortName[item.reasoningEffort] || item.reasoningEffort}
            </button>
          ))}
        </div>
        <button className="codex-model-save" disabled={saving || !selected} onClick={onSave}>{saving ? '正在切换…' : '使用这个设置'}</button>
      </div>
    </div>
  );
}

function ToolRecord({ record }) {
  return (
    <details className={`codex-tool ${record.status || ''}`}>
      <summary><span className="codex-tool-dot" />{record.text || '工具调用'}<i>{record.status === 'running' ? '进行中' : '完成'}</i></summary>
      {record.output && <pre>{record.output}</pre>}
    </details>
  );
}

function ApprovalSheet({ approval, onDecision }) {
  if (!approval) return null;
  const command = approval.params?.command;
  return (
    <div className="codex-approval-wrap">
      <div className="codex-approval">
        <span className="codex-grabber" />
        <small>顾川的工作请求</small>
        <h3>需要你的同意</h3>
        <p>{approval.params?.reason || (command ? '顾川想运行下面的命令' : '顾川想修改工作区文件')}</p>
        {command && <pre>{command}</pre>}
        <div className="codex-approval-actions">
          <button onClick={() => onDecision(approval.id, 'decline')}>拒绝</button>
          <button className="primary" onClick={() => onDecision(approval.id, 'accept')}>仅这一次</button>
        </div>
      </div>
    </div>
  );
}

export default function CodexChat({ api, onBack }) {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState({ alive: false, busy: false, model: 'Codex', approvals: [] });
  const [input, setInput] = useState('');
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState({ open: false, models: [], model: '', effort: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const boxRef = useRef(null);
  const fileRef = useRef(null);
  const followRef = useRef(true);

  const pull = useCallback(async () => {
    try {
      const data = await api('/api/codex/chat?limit=320');
      if (data.error) throw new Error(data.error);
      setRecords(Array.isArray(data.records) ? data.records : []);
      setStatus(data);
      if (!data.lastError) setError('');
    } catch (e) {
      setError(e.message || '暂时连不上主机');
    }
  }, [api]);

  useEffect(() => {
    pull();
    const timer = setInterval(pull, 900);
    return () => clearInterval(timer);
  }, [pull]);

  useEffect(() => {
    const el = boxRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [records, status.busy]);

  const send = async () => {
    const text = input.trim();
    if ((!text && !image) || sending || status.busy) return;
    setSending(true); setError('');
    try {
      const result = await api('/api/codex/chat/send', {
        method: 'POST', body: JSON.stringify({ text, image }),
      });
      if (result.error) throw new Error(result.error);
      setInput(''); setImage(null); await pull();
    } catch (e) { setError(e.message || '没有送到'); }
    finally { setSending(false); }
  };

  const interrupt = async () => {
    try { await api('/api/codex/chat/interrupt', { method: 'POST', body: '{}' }); await pull(); }
    catch (e) { setError(e.message); }
  };

  const newThread = async () => {
    if (!window.confirm('新开一扇工作窗口？现在这段记录仍会好好保留。')) return;
    try {
      const result = await api('/api/codex/chat/new', { method: 'POST', body: '{}' });
      if (result.error) throw new Error(result.error);
      await pull();
    } catch (e) { setError(e.message); }
  };

  const openModels = async () => {
    try {
      const data = await api('/api/codex/models');
      if (data.error) throw new Error(data.error);
      setPicker({ open: true, models: data.models || [], model: data.model || '', effort: data.effort || '' });
    } catch (e) { setError(e.message || '暂时读不到模型列表'); }
  };

  const saveModels = async () => {
    setSavingSettings(true);
    try {
      const data = await api('/api/codex/settings', {
        method: 'POST', body: JSON.stringify({ model: picker.model, effort: picker.effort }),
      });
      if (data.error) throw new Error(data.error);
      setPicker((value) => ({ ...value, open: false }));
      await pull();
    } catch (e) { setError(e.message || '切换没有成功'); }
    finally { setSavingSettings(false); }
  };

  const decide = async (id, decision) => {
    try {
      const result = await api(`/api/codex/approvals/${encodeURIComponent(id)}`, {
        method: 'POST', body: JSON.stringify({ decision }),
      });
      if (result.error) throw new Error(result.error);
      await pull();
    } catch (e) { setError(e.message); }
  };

  const pickImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try { setImage(await fileToResizedDataURL(file, 900, 0.74)); }
    catch { setError('这张图片读不了'); }
  };

  const statusText = status.alive
    ? status.busy ? '正在回应 · 主机在线' : `在线 · ${status.model || '工作窗口'} · ${effortName[status.effort] || status.effort || '默认'}`
    : status.lastError || '正在连接顾川主机…';

  let lastDay = '';
  const approval = status.approvals?.[0] || null;
  return (
    <div className="bchat codex-chat">
      <div className="bc-head codex-head">
        <button className="codex-back" onClick={onBack} aria-label="返回首页">‹</button>
        <span className="codex-mark">✦</span>
        <div className="codex-head-copy">
          <div className="n serif">顾川</div>
          <button className="s codex-settings-trigger" onClick={openModels}>{statusText}<span>⌄</span></button>
        </div>
        <button className="codex-new" onClick={newThread} title="新开窗口">＋</button>
      </div>

      <div className="bc-msgs" ref={boxRef} onScroll={(event) => {
        const el = event.currentTarget;
        followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}>
        {!records.length && (
          <div className="codex-empty">
            <span>✦</span><b>灯还在，记忆也在。</b>
            <p>他会先读完留下来的记录，再从这里继续。</p>
          </div>
        )}
        {records.map((record) => {
          const day = fmtD(record.ts);
          const separator = day !== lastDay; lastDay = day;
          if (record.role === 'tool') return <ToolRecord key={record.id} record={record} />;
          if (record.role === 'approval') return null;
          if (record.role === 'system') return <div className="codex-system" key={record.id}>{record.text}</div>;
          const mine = record.role === 'user';
          return (
            <div key={record.id}>
              {separator && <div className="bc-day">{day}</div>}
              <div className={`bc-row ${mine ? 'you' : 'him'}`}>
                <div className={`bub ${mine ? 'you' : 'him serif'}${record.streaming ? ' codex-streaming' : ''}`}>
                  {record.image && <img className="codex-image" src={record.image} alt="发送的图片" />}
                  <div className="codex-text">{record.text}</div>
                </div>
                <div className="bc-ts">{fmtT(record.ts)}</div>
              </div>
            </div>
          );
        })}
        {status.busy && !records.some((r) => r.role === 'assistant' && r.streaming) && (
          <div className="bc-row him"><div className="bub him typingdots"><i /><i /><i /></div></div>
        )}
      </div>

      {error && <div className="bc-err">{error}</div>}
      <div className="bc-input codex-input">
        <button className="codex-add" onClick={() => fileRef.current?.click()} aria-label="添加图片">＋</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
        <div className="codex-compose">
          {image && <div className="codex-preview"><img src={image} alt="待发送" /><button onClick={() => setImage(null)}>×</button></div>}
          <textarea rows={1} value={input} placeholder="跟顾川说点什么…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        </div>
        {status.busy
          ? <button className="codex-stop" onClick={interrupt} aria-label="停止">■</button>
          : <button onClick={send} disabled={sending || (!input.trim() && !image)}>发</button>}
      </div>
      <ApprovalSheet approval={approval} onDecision={decide} />
      <ModelSheet picker={picker} onChange={setPicker} onClose={() => setPicker((value) => ({ ...value, open: false }))}
        onSave={saveModels} saving={savingSettings} />
    </div>
  );
}
