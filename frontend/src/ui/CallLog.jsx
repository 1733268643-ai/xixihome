// 通话记录：realtime-server 每通电话落盘的 json，这里翻出来看
import { useEffect, useState } from 'react';
import { CI } from './call-icons.jsx';
import './call.css';

const plain = (t) => String(t || '').replace(/\[[a-zA-Z][a-zA-Z \-]*\]/g, '').replace(/\s+/g, ' ').trim();
const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`);
const fmtTime = (ts) => {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function CallLog({ api, onClose }) {
  const [list, setList] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/calls').then(setList).catch((e) => setErr(e.message)); }, [api]);
  const open = (f) => api(`/api/calls/${f}`).then(setDetail).catch((e) => setErr(e.message));

  return (
    <div className="calllog">
      <div className="cl-head">
        <button className="cl-back" onClick={() => (detail ? setDetail(null) : onClose())}>‹</button>
        <span className="serif">{detail ? fmtTime(detail.started_at) : '通话记录'}</span>
        <span className="cl-sub">{detail ? `${fmtDur(detail.duration)} · ${detail.turns} 轮` : ''}</span>
      </div>

      {!detail && (
        <div className="cl-list">
          {err && <div className="cl-empty">{err}</div>}
          {list && list.length === 0 && <div className="cl-empty">还没有通话，去给他打一个</div>}
          {!list && !err && <div className="cl-empty">翻记录中…</div>}
          {list && list.map((c) => (
            <button className="cl-item" key={c.file} onClick={() => open(c.file)}>
              <span className="cl-ico">{c.video ? <CI.camera /> : <CI.phone />}</span>
              <span className="cl-mid">
                <span className="cl-when">{fmtTime(c.startedAt)}</span>
                <span className="cl-prev">{plain(c.preview) || '（没说上话）'}</span>
              </span>
              <span className="cl-dur">{fmtDur(c.duration)}</span>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <div className="cl-detail">
          {(detail.events || []).map((e, i) => (
            e.kind === 'you' ? (
              <div className="bub you" key={i}>{e.text}</div>
            ) : e.kind === 'him' ? (
              <div className="bub him serif" key={i}>{plain(e.text)}</div>
            ) : e.kind === 'saw' ? (
              <div className="cl-meta" key={i}>他看到：{e.text}</div>
            ) : e.kind === 'interrupted' ? (
              <div className="cl-meta" key={i}>—— 你打断了他 ——</div>
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}
