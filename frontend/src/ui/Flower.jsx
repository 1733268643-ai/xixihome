import { useState, useMemo, useEffect } from 'react';

/**
 * 欲望花：12 片圆头花瓣，长度＝真实欲望数值。
 * - 点一片：它长出来、花心显示数值、其余淡下去
 * - 醒着摇曳快、睡着摇曳慢（consciousness 联动）
 * 数据来自 /api/mind/state 的 drives，没有数据时不渲染。
 */

const CX = 155, CY = 152;
// 负面情绪走中性灰，其余走主题色相
const GREY_KEYS = new Set(['boredom', 'grieve', 'anger']);
const ang = (i, n) => (i / n) * Math.PI * 2 - Math.PI / 2;
const pt = (a, r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r];

function petalPath(i, v, n) {
  const a = ang(i, n), L = 30 + v * 84, w = 0.2;
  const [p1x, p1y] = pt(a - w, L * 0.62), [p2x, p2y] = pt(a + w, L * 0.62);
  const [c1x, c1y] = pt(a - w * 1.15, L * 1.06), [c2x, c2y] = pt(a + w * 1.15, L * 1.06);
  return `M${CX},${CY} L${p1x},${p1y} C${c1x},${c1y} ${c2x},${c2y} ${p2x},${p2y}Z`;
}

function tone(v, grey) {
  // 主题色相由 CSS 变量给，JS 里读不到，所以用固定映射 + 主题类覆盖不了 SVG fill，
  // 因此这里直接用 hsl 计算：奶油橙为默认，主题切换时通过 data-t 覆写（见下方 useMemo）
  const h = grey ? 28 : 16, s = grey ? 9 : 52;
  return {
    fill: `hsl(${h} ${s}% ${84 - v * 22}%)`,
    ink: `hsl(${h} ${Math.round(s * 0.8)}% ${42 - v * 10}%)`,
  };
}

export default function Flower({ drives: drivesProp, consciousness: consciousnessProp, api }) {
  const [sel, setSel] = useState(-1);
  const [localDrives, setLocalDrives] = useState(null);
  const [localConsciousness, setLocalConsciousness] = useState(null);
  const drives = drivesProp || localDrives || [];
  const consciousness = consciousnessProp ?? localConsciousness;

  useEffect(() => {
    if (!api || drivesProp) return;
    let cancelled = false;
    api('/api/drives')
      .then((data) => {
        if (cancelled || !data?.available) return;
        setLocalDrives(data.drives || []);
        setLocalConsciousness(data.consciousness || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [api, drivesProp]);

  const n = drives?.length || 0;

  const petals = useMemo(() => (drives || []).map((d, i) => {
    const grey = GREY_KEYS.has(d.key);
    const t = tone(d.value, grey);
    const a = ang(i, n);
    const [lx, ly] = pt(a, 30 + d.value * 84 + 17);
    return { ...d, ...t, path: petalPath(i, d.value, n), lx, ly };
  }), [drives, n]);

  if (!n) return null;
  const asleep = consciousness === 'asleep' || consciousness === 'sleeping';
  const cur = sel >= 0 ? petals[sel] : null;

  return (
    <div className="flower">
      <svg viewBox="0 0 310 304" className={asleep ? 'asleep' : 'awake'} onClick={() => setSel(-1)}>
        {petals.map((p, i) => (
          <g key={p.key} className="petal" style={{ animationDelay: `${-i * 0.42}s` }}>
            <g className="pin" style={{ transform: sel === i ? 'scale(1.12)' : 'scale(1)' }}>
              <path
                className="pth" d={p.path} fill={p.fill}
                opacity={sel < 0 ? 0.88 : sel === i ? 1 : 0.3}
                onClick={(e) => { e.stopPropagation(); setSel(sel === i ? -1 : i); }}
              />
            </g>
          </g>
        ))}
        <circle className="hub" cx={CX} cy={CY} r={cur ? 31 : 9} fill="var(--bg)" />
        <text className="hubtxt" x={CX} y={CY - 3} fontSize="10.5" fill="var(--ink2)" opacity={cur ? 1 : 0}>
          {cur?.label}
        </text>
        <text className="hubtxt" x={CX} y={CY + 12} fontSize="15" fill="var(--ink)"
          style={{ fontFamily: 'var(--mono)' }} opacity={cur ? 1 : 0}>
          {cur ? cur.value.toFixed(2) : ''}
        </text>
        {petals.map((p, i) => (
          <text key={p.key} className="lab" x={p.lx} y={p.ly + 3.5} fill={p.ink}
            opacity={sel < 0 ? 1 : sel === i ? 1 : 0.25}>{p.label}</text>
        ))}
      </svg>
    </div>
  );
}
