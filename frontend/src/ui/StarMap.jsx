import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';

/**
 * 记忆星图 —— 数据全部来自 OB 的 pulse，没有一颗是编出来的。
 *   位置：主题（内心/人际/数字…）分扇区，重要度越高越靠中心
 *   大小：重要度 + 是否固化（📌）
 *   亮度：权重
 *   冷暖：情感效价 V（正=暖，负=冷灰）
 * 点任意一颗 → 展开这条记忆的真实元数据，可再点「读这条」取正文。
 */

const R = 46;            // 星图半径（百分比坐标系 0-100）
const CX = 50, CY = 50;

/* 用 bucket_id 的 hex 做确定性抖动 —— 同一条记忆每次都在同一个位置，
   这样她能认出"那颗星"，不会刷新一次就换地方。 */
function jitter(id, salt) {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function layout(stars, edges) {
  // 主题按记忆数排序；扇区大小 ∝ 该主题的记忆数，所以整圈铺满，
  // 而且一眼能看出他记的东西里什么占得多。
  const counts = new Map();
  stars.forEach((s) => (s.domains.length ? s.domains : ['其他'])
    .forEach((d) => counts.set(d, (counts.get(d) || 0) + 1)));
  const domains = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);

  // 用「首要主题」归组，保证每颗星只落一个扇区
  const primary = new Map();
  stars.forEach((s) => {
    const d = s.domains[0] || '其他';
    primary.set(d, (primary.get(d) || 0) + 1);
  });
  const total = stars.length || 1;
  const arc = new Map();
  let acc = 0;
  for (const d of domains) {
    const n = primary.get(d) || 0;
    if (!n) continue;
    const span = (n / total) * Math.PI * 2;
    arc.set(d, [acc, span]);
    acc += span;
  }

  // 邻接表：选中一颗星时，跟它相关的那些也要亮起来
  const near = new Map();
  for (const e of (edges || [])) {
    if (!near.has(e.source)) near.set(e.source, []);
    if (!near.has(e.target)) near.set(e.target, []);
    near.get(e.source).push({ id: e.target, sim: e.similarity });
    near.get(e.target).push({ id: e.source, sim: e.similarity });
  }

  return {
    domains: domains.filter((d) => primary.get(d)),
    counts: primary,
    near,
    placed: stars.map((s) => {
      const d = s.domains[0] || '其他';
      const [start, span] = arc.get(d) || [0, Math.PI * 2];
      // 扇区内留 6% 边距，主题之间看得出缝
      const a = start + span * (0.06 + jitter(s.id, 7) * 0.88) - Math.PI / 2;
      const imp = s.importance ?? 3;
      // 重要的靠中心
      const rr = R * (0.14 + (1 - Math.min(imp, 10) / 10) * 0.86) * (0.68 + jitter(s.id, 13) * 0.4);
      return {
        ...s, domain: d,
        x: CX + Math.cos(a) * rr,
        y: CY + Math.sin(a) * rr,
        rad: (s.pinned ? 1.1 : 0.4) + Math.min(imp, 10) / 10 * 0.8,
        glow: Math.min(1, (s.weight ?? 1) / 60) * 0.55 + Math.min(imp, 10) / 10 * 0.45,
        delay: jitter(s.id, 29) * 6,
      };
    }),
  };
}

function Sky({ placed, sel, onPick, big, near, pos }) {
  // 星星很小、手指很大：点哪儿就选离那儿最近的一颗
  function pickNearest(e) {
    e.stopPropagation();          // 别冒泡到全屏层，否则刚选中就被清掉
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width, r.height) / 100;
    const vx = (e.clientX - r.left - (r.width - 100 * scale) / 2) / scale;
    const vy = (e.clientY - r.top - (r.height - 100 * scale) / 2) / scale;
    let best = null, bd = Infinity;
    for (const p of placed) {
      const d = (p.x - vx) ** 2 + (p.y - vy) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    // 太远就是想关掉，不是想选
    if (!best || bd > 36) { onPick(null); return; }
    onPick(sel?.id === best.id ? null : best);
  }

  return (
    <svg className={`sky${big ? ' big' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
         onClick={pickNearest}>
      <defs>
        <radialGradient id="halo">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity=".38" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r={R} className="sky-ring" />
      <circle cx={CX} cy={CY} r={R * 0.55} className="sky-ring dim" />
      <circle cx={CX} cy={CY} r={R * 0.28} className="sky-ring dim" />
      <circle cx={CX} cy={CY} r="9" fill="url(#halo)" />

      <g className="star-spin">
      {/* 选中时，从这颗星往它的关联记忆长出线 */}
      {big && sel && (near?.get(sel.id) || []).map((n) => {
        const t = pos?.get(n.id);
        if (!t) return null;
        return (
          <line key={n.id} className="link"
            x1={sel.x} y1={sel.y} x2={t.x} y2={t.y}
            style={{ '--sim': n.sim }} />
        );
      })}
      {placed.map((s) => {
        // 暖度：情感效价 V 直接映射，V 高=主题色，V 低=灰。不做二元标签。
        const warm = s.valence == null ? 0.5 : Math.max(0, Math.min(1, (s.valence + 1) / 2));
        const on = sel?.id === s.id;
        const lit = !on && sel && near?.get(sel.id)?.some((n) => n.id === s.id);
        // 选中一颗星后，无关的星退到背景里去
        const dim = sel && !on && !lit;
        return (
          <g key={s.id} className={`star${on ? ' on' : ''}${lit ? ' lit' : ''}${dim ? ' dim' : ''}${s.pinned ? ' pin' : ''}`}
             style={{ '--d': `${s.delay}s`, '--w': warm,
                      opacity: on ? 1 : lit ? 1 : dim ? 0.12 : 0.34 + s.glow * 0.66 }}>
            {on && <circle cx={s.x} cy={s.y} r={s.rad + 2.2} className="halo-ring" />}
            {lit && <circle cx={s.x} cy={s.y} r={s.rad + 1.3} className="lit-ring" />}
            <circle cx={s.x} cy={s.y} r={s.rad} className="dot" />
          </g>
        );
      })}
      </g>
    </svg>
  );
}

/* OB 正文里带着给机器看的标记，展示时清掉，内容一个字不动 */
function clean(t) {
  return String(t || '')
    .replace(/\[(?:bucket_id|content_role|instructions|核心准则)[^\]]*\]/g, '')
    .replace(/^[\s📌]+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function Detail({ s, body, loading, onRead, onClose }) {
  const v = s.valence, warm = v == null ? '—' : v > 0.15 ? '暖' : v < -0.15 ? '冷' : '平';
  return (
    <div className="sdetail">
      <div className="sdt">
        <b>{s.pinned && <i className="pinmark" />}{s.title || '（无题）'}</b>
        <span onClick={onClose}><Icon.x /></span>
      </div>
      <div className="smeta">
        {s.domains.map((d) => <em key={d}>{d}</em>)}
        {s.importance != null && <em>重要 {s.importance}</em>}
        {v != null && <em>{warm} V{v}</em>}
        {s.weight != null && <em>权重 {Math.round(s.weight)}</em>}
        {s.pinned && <em className="hot">固化</em>}
        {s.linked > 0 && <em className="hot">牵着 {s.linked} 条</em>}
      </div>
      {body
        ? <div className="sbody">{clean(body)}</div>
        : s.summary
          ? <div className="sbody">{clean(s.summary)}</div>
          : <button className="sread" onClick={onRead} disabled={loading}>
              {loading ? '取正文中…' : '读这条'}
            </button>}
    </div>
  );
}

export default function StarMap({ map, onReadMemory, embedded }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const { placed, domains, counts, near } = useMemo(
    () => (map?.stars?.length ? layout(map.stars, map.edges)
      : { placed: [], domains: [], counts: new Map(), near: new Map() }),
    [map]
  );
  const pos = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  useEffect(() => { setBody(''); }, [sel?.id]);

  // 流星：只在放大层，每 6~14 秒一颗，随机从上方某处划下来
  const [meteors, setMeteors] = useState([]);
  useEffect(() => {
    if (!open) return;
    let n = 0, timer;
    const shoot = () => {
      const id = ++n;
      setMeteors((m) => [...m, { id, top: 6 + (id * 37) % 34, left: -6 + (id * 53) % 26 }]);
      setTimeout(() => setMeteors((m) => m.filter((x) => x.id !== id)), 1400);
      timer = setTimeout(shoot, 6000 + (id * 2731) % 8000);
    };
    timer = setTimeout(shoot, 2200);
    return () => clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open]);

  async function read() {
    if (!sel || !onReadMemory) return;
    setLoading(true);
    try { setBody(await onReadMemory(sel) || '这条没取到正文。'); }
    catch { setBody('取正文失败了。'); }
    finally { setLoading(false); }
  }

  if (!map?.available) {
    return <div className="card"><div className="empty">记忆星图还没接上 —— 不显示假数据</div></div>;
  }

  const st = map.stats || {};

  return (
    <>
      <div className={`card starcard${embedded ? ' flat' : ''}`}>
        <div className="pill" style={{ padding: '0 0 9px' }}>
          <Icon.star /> 记忆星图<span className="r cnt">{map.total} 颗</span>
        </div>

        <div className="skywrap" onClick={() => { window.location.href = '/starmap/index.html'; }}>
          <Sky placed={placed} sel={null} onPick={() => { window.location.href = '/starmap/index.html'; }} near={near} pos={pos} />
          <span className="zoomhint"><Icon.expand /> 点开进星空</span>
        </div>

        <div className="sstats">
          <span><b>{st.pinned ?? '—'}</b>固化</span>
          <span><b>{st.dynamic ?? '—'}</b>动态</span>
          <span><b>{st.archived ?? '—'}</b>归档</span>
          <span><b>{st.size || '—'}</b></span>
        </div>
      </div>

      {open && createPortal((
        <div className="skyfull" onClick={() => { setSel(null); }}>
          <div className="sfhead">
            <span>记忆星图 · {map.total} 颗 · 全部来自 LMC-5</span>
            <span className="sfx" onClick={(e) => { e.stopPropagation(); setOpen(false); setSel(null); }}>
              <Icon.x />
            </span>
          </div>

          {meteors.map((m) => (
            <i key={m.id} className="meteor go"
               style={{ top: `${m.top}%`, left: `${m.left}%` }} />
          ))}

          <Sky placed={placed} sel={sel} onPick={setSel} big near={near} pos={pos} />

          {!sel && (
            <div className="sflegend">
              {domains.slice(0, 6).map((d) => <em key={d}>{d} {counts.get(d)}</em>)}
            </div>
          )}

          {sel
            ? <div onClick={(e) => e.stopPropagation()}>
                <Detail s={sel} body={body} loading={loading} onRead={read} onClose={() => setSel(null)} />
              </div>
            : <div className="sftip">点任意一颗星，看看那是什么</div>}
        </div>
      ), document.body)}
    </>
  );
}
