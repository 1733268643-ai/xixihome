import { useEffect, useRef, useState } from 'react';
import StarMap from './StarMap.jsx';
import { Icon, CrabIcon } from './icons.jsx';
import Flower from './Flower.jsx';

/* ═══ 小工具 ═══ */
export const TOGETHER_SINCE = '2026-06-14';
export const daysTogether = () =>
  Math.floor((Date.now() - new Date(TOGETHER_SINCE + 'T00:00:00').getTime()) / 864e5) + 1;

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};
export const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
};

function Card({ children, ...p }) { return <div className="card" {...p}>{children}</div>; }
export function Sec({ children, more }) { return <div className="sec"><span>{children}</span>{more && <span className="more">{more}</span>}</div>; }
function Unavailable({ what }) {
  return <Card><div className="empty">{what}还没接上 —— 不显示假数据</div></Card>;
}

/* ═══ 家 ═══ */
export function HomePage({ mind, health, memories, env, map, onMenu, onLog, onGo }) {
  const now = new Date();
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
  const awake = mind?.consciousness;
  const memTotal = map?.available
    ? (map.stats ? (map.stats.pinned || 0) + (map.stats.dynamic || 0) + (map.stats.archived || 0) : map.total)
    : null;
  return (
    <>
      <div style={{ position: 'relative' }}>
        <div className="eb">{wd} · {now.getMonth() + 1}月{now.getDate()}日</div>
        <h1 className="big">
          {awake === 'awake' ? <>桌上的灯亮着，<br /><em>等你回来。</em></>
            : awake ? <>他睡着了，<br /><em>灯留着。</em></>
              : <>这里是家。</>}
        </h1>
        <button className="cbtn" onClick={onMenu}
          style={{ position: 'absolute', right: 0, top: 4, border: 0, zIndex: 6, padding: 12 }}><Icon.menu /></button>
      </div>

      {/* ── Today：设计稿的待办打卡（写的是真 health 表）── */}
      <Sec more={health?.available ? '点圈打卡' : undefined}>Today</Sec>
      {health?.available ? (
        <>
          <Card style={{ cursor: 'pointer' }} onClick={() => !health.med.doneToday && onLog('med')}>
            <div className="todo">
              <span className={`rg${health.med.doneToday ? ' done' : ''}`} />
              <span style={health.med.doneToday ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}}>
                早上三种药</span>
            </div>
          </Card>
          <Card style={{ cursor: 'pointer' }} onClick={() => !health.exercise?.doneToday && onLog('exercise')}>
            <div className="todo">
              <span className={`rg${health.exercise?.doneToday ? ' done' : ''}`} />
              <span style={health.exercise?.doneToday ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}}>
                今天动一动{health.exercise?.todaySteps ? ` · ${health.exercise.todaySteps} 步` : ''}</span>
            </div>
          </Card>
        </>
      ) : (
        <Card><div className="empty">health 表还没接上，打卡先歇着</div></Card>
      )}

      <div className="g2" style={{ marginTop: 14 }}>
        <Card className="card st"><div className="n">{daysTogether()}<small>天</small></div><div className="l">在一起</div></Card>
        <Card className="card st">
          <div className="n">{memTotal ?? '—'}<small>条</small></div>
          <div className="l">记忆总数</div>
        </Card>
      </div>

      {env?.sensation && (
        <>
          <Sec more={env.sensation.location || ''}>他感觉到的</Sec>
          <Card>
            <div className="dream">{env.sensation.sensation}</div>
            <div className="chips" style={{ marginTop: 9 }}>
              {env.sensation.axes?.temp != null && <span className="tag">体感 {env.sensation.axes.temp}°</span>}
              {env.sensation.axes?.sky && <span className="tag">{env.sensation.axes.sky}</span>}
              {env.sensation.axes?.wind && <span className="tag">{env.sensation.axes.wind}</span>}
              {env.sensation.axes?.humidity && <span className="tag">{env.sensation.axes.humidity}</span>}
              {env.sensation.raw?.aqi != null && <span className="tag">AQI {env.sensation.raw.aqi}</span>}
            </div>
          </Card>
        </>
      )}

      <Sec more={health?.available ? '记一笔 ＋' : undefined}>关心你</Sec>
      {health?.available ? (
        <Card>
          <div className="pill" onClick={() => onLog('med')} style={{ cursor: 'pointer' }}>
            <Icon.spark /> 今天的药
            <span className="r" style={{ color: health.med.doneToday ? 'var(--sage)' : 'var(--accent)' }}>
              {health.med.doneToday ? '已吃 ✓' : '点一下记录'}
            </span>
          </div>
          <div className="pill" onClick={() => onLog('weight')} style={{ cursor: 'pointer' }}>
            <Icon.aware /> 体重
            {health.weight.trend?.length > 1 && (
              <span className="spark">
                {health.weight.trend.map((v, i) => {
                  const arr = health.weight.trend, lo = Math.min(...arr), hi = Math.max(...arr);
                  const h = hi === lo ? 12 : 6 + ((v - lo) / (hi - lo)) * 15;
                  return <i key={i} style={{ height: h }} />;
                })}
              </span>
            )}
            <span className="r">
              {health.weight.latest != null ? `${health.weight.latest}kg` : '记一笔'}
              {health.weight.delta != null && health.weight.delta !== 0 && (
                <em style={{ fontStyle: 'normal', color: health.weight.delta < 0 ? 'var(--sage)' : 'var(--accent)', marginLeft: 4 }}>
                  {health.weight.delta > 0 ? '+' : ''}{health.weight.delta.toFixed(1)}kg</em>
              )}
            </span>
          </div>
          <div className="pill" onClick={() => onLog('sleep')} style={{ cursor: 'pointer' }}>
            <Icon.moon /> 昨晚睡了
            <span className="r">{health.sleep.lastHours != null ? `${health.sleep.lastHours}h` : '记一笔'}</span>
          </div>
          <div className="pill" onClick={() => onLog('period')} style={{ cursor: 'pointer' }}>
            <Icon.rain /> 经期
            <span className="r">{health.period.inDays != null ? `约 ${health.period.inDays} 天后` : '记一笔'}</span>
          </div>
        </Card>
      ) : <Card><div className="empty">在 Supabase 建好 health_logs 表就能开始记</div></Card>}

      <Sec more="全部 ›">最近记住的</Sec>
      {memories?.length ? memories.slice(0, 2).map((m, i) => (
        <Card key={i}><div className="mem"><div className="b">{m}</div></div></Card>
      )) : <Card><div className="empty">还没有召回的记忆</div></Card>}

      <Sec>他的内在</Sec>
      <Card>
        <div className="entry" onClick={() => onGo('inner')}>
          <span className="icbox" style={{ background: 'rgba(217,119,87,.12)', color: 'var(--accent)' }}><Icon.inner /></span>
          <div><div>此刻的他</div>
            <div className="t2">{mind?.available ? `${mind.consciousness} · ${mind.drives?.length || 0} 维欲望` : '未接入'}</div>
          </div><span className="ar">›</span>
        </div>
      </Card>
    </>
  );
}

/* ═══ 内在 ═══ */
export function InnerPage({ mind, memories, memQuery, onSearch, searching, tab, setTab, map, onReadMemory }) {
  return (
    <>
      <div className="eb">Inner · 他的内在</div>
      <h1 className="big">
        {mind?.consciousness === 'awake' ? <>他现在<br /><em>醒着。</em></>
          : mind?.consciousness ? <>他现在<br /><em>睡着了。</em></> : <>他的内在</>}
      </h1>

      <div className="seg">
        <button className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>此刻</button>
        <button className={tab === 'mem' ? 'on' : ''} onClick={() => setTab('mem')}>记忆</button>
      </div>

      {tab === 'now' && (!mind?.available ? <Unavailable what="心潮" /> : (
        <>
          <Card>
            <div className="pill" style={{ padding: 0 }}><Icon.aware /> 意识
              <span className="r" style={{ color: 'var(--sage)' }}>{mind.consciousness}</span></div>
            <div className="pill"><Icon.chat /> 上次说话<span className="r">{ago(mind.lastConversationAt)}</span></div>
            <div className="pill"><Icon.moon /> 今天做了<span className="r">{mind.dreamsToday} 个梦</span></div>
          </Card>

          <Sec more="点一片花瓣">欲望</Sec>
          <Card style={{ padding: '8px 6px' }}>
            <Flower drives={mind.drives} consciousness={mind.consciousness} />
          </Card>

          <Sec more={`${mind.dreams?.length || 0} 个`}>最近的梦</Sec>
          <Card className="card domecard" onClick={() => { window.location.href = '/dream/index.html'; }}
            style={{ cursor: 'pointer' }}>
            <div className="domesky">
              <i className="dc c1" /><i className="dc c2" /><i className="dc c3" />
              <span className="domehint"><Icon.expand /> 走进梦境穹顶</span>
            </div>
            <div className="pill" style={{ padding: '9px 0 0' }}>
              <Icon.moon /> 他梦见的
              <span className="r">{mind.dreams?.length || 0} 朵云 · 可环视</span>
            </div>
          </Card>
          {(mind.dreams || []).slice(0, 4).map((d) => (
            <Card key={d.id}>
              <div className="dream">
                {d.dream}
                {d.residue && <div className="rs">余韵：{d.residue}</div>}
                <span className="stamp">{fmtDay(d.createdAt)} {new Date(d.createdAt).toTimeString().slice(0, 5)}
                  {d.memoryId ? ` · 关联记忆 ${d.memoryId.slice(0, 8)}` : ''}</span>
              </div>
            </Card>
          ))}
        </>
      ))}

      {tab === 'mem' && (
        <>
          <StarMap map={map} onReadMemory={onReadMemory} />

          <Sec more="按词召回">搜索</Sec>
          <Card className="card search">
            <Icon.search />
            <input placeholder="搜索记忆…" defaultValue={memQuery}
              onKeyDown={(e) => { if (e.key === 'Enter') onSearch(e.currentTarget.value); }} />
          </Card>
          {searching && <Card><div className="empty">在想…</div></Card>}
          {!searching && memories?.length ? memories.map((m, i) => (
            <Card key={i}><div className="mem"><div className="b">{m}</div></div></Card>
          )) : !searching && <Card><div className="empty">
            {memQuery ? '这句话没有勾起什么' : '搜一个词，看他记得什么'}</div></Card>}
        </>
      )}
    </>
  );
}

/* ═══ 日历 ═══ */
export function CalendarPage({ events, ym, onYm, onAdd, onDel, map }) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const today = ymd(new Date());
  const byDate = {};
  (events?.rows || []).forEach((e) => { (byDate[e.date] ||= []).push(e); });
  // 他记住的：OB 里重要度 ≥9 的记忆，标题自带日期，直接落进日子（真实，不入库）
  (map?.stars || []).forEach((st) => {
    if ((st.importance ?? 0) < 9) return;
    const mm = st.title.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!mm) return;
    const date = `${mm[1]}-${mm[2]}-${mm[3]}`;
    (byDate[date] ||= []).push({
      id: `ob-${st.id}`, date, source: 'ob', fromOb: true,
      title: st.title.replace(/^\d{4}-\d{2}-\d{2}[\s0-9-]*/, '') || st.title,
      note: `重要度 ${st.importance}${st.pinned ? ' · 固化' : ''}`,
    });
  });

  // 快到了：整百日纪念倒计时
  const since = new Date(TOGETHER_SINCE + 'T00:00:00');
  const dnow = daysTogether();
  const nextHundred = Math.ceil(dnow / 100) * 100;
  const hDate = new Date(since.getTime() + (nextHundred - 1) * 864e5);
  const [sel, setSel] = useState(today.slice(0, 7) === ym ? today : `${ym}-01`);

  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    onYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <>
      <div style={{ position: 'relative' }}>
        <div className="eb">Calendar</div>
        <h1 className="big" style={{ fontSize: 23 }}>我们的日子</h1>
        <button className="cbtn" onClick={() => onAdd(sel)}
          style={{ position: 'absolute', right: 0, top: 6, border: 0, color: 'var(--accent)' }}><Icon.plus /></button>
      </div>

      {!events?.available && !map?.available ? <div style={{ marginTop: 14 }}><Card>
        <div className="empty">在 Supabase 建好 events 表就能开始记</div></Card></div> : (
        <>
          <Card style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>{y}年{m}月</span>
              <span style={{ display: 'flex', gap: 16, color: 'var(--muted)' }}>
                <span onClick={() => shift(-1)} style={{ cursor: 'pointer' }}>‹</span>
                <span onClick={() => shift(1)} style={{ cursor: 'pointer' }}>›</span>
              </span>
            </div>
            <div className="wk7">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
            <div className="cal">
              {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} className="day out" />)}
              {Array.from({ length: days }, (_, i) => {
                const date = `${ym}-${pad(i + 1)}`;
                const evs = byDate[date] || [];
                return (
                  <div key={date} className={`day${date === today ? ' today' : ''}`}
                    onClick={() => setSel(date)}
                    style={date === sel && date !== today ? { background: 'rgba(120,108,92,.1)' } : undefined}>
                    <span>{i + 1}</span>
                    <span className="dd">{evs.slice(0, 3).map((e, k) => (
                      <i key={k} style={{ background: date === today ? 'rgba(255,255,255,.85)' : e.source === 'ob' ? 'var(--accent)' : 'var(--blush)' }} />
                    ))}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 13, fontSize: 9.5, color: 'var(--muted)', marginTop: 10, justifyContent: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blush)' }} />我们加的</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />他记住的</span>
            </div>
          </Card>

          <Sec more={`还有 ${nextHundred - dnow} 天`}>快到了</Sec>
          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 21 }}>在一起 {nextHundred} 天</span>
              <span className="stamp" style={{ marginTop: 0 }}>
                {hDate.getFullYear()}年{hDate.getMonth() + 1}月{hDate.getDate()}日</span>
            </div>
          </Card>

          <Sec>{fmtDay(sel)}</Sec>
          {(byDate[sel] || []).length ? byDate[sel].map((e) => (
            <Card key={e.id}>
              <div style={{ display: 'flex', gap: 11 }}>
                <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, flex: 'none', background: e.source === 'ob' ? 'var(--accent)' : 'var(--blush)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{e.title}</div>
                  {e.note && <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 3, lineHeight: 1.6 }}>{e.note}</div>}
                  <div className="stamp">{e.source === 'ob' ? '来自记忆' : '手动添加'}</div>
                </div>
                {!e.fromOb && (
                  <button onClick={() => onDel(e.id)} style={{ border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>×</button>
                )}
              </div>
            </Card>
          )) : <Card><div className="empty">这天还什么都没有</div></Card>}
        </>
      )}
    </>
  );
}

/* ═══ 更多 ═══ */
export function MorePage({ sources, connect, reading, netease, onGo, onSync, syncing, docs }) {
  return (
    <>
      <div className="eb">More</div>
      <h1 className="big" style={{ fontSize: 23 }}>工具 & 房间</h1>

      {/* ── 在读：一起阅读（真实进度）── */}
      <Sec more="阅读服务">在读</Sec>
      {reading?.available ? (
        <Card>
          <div style={{ display: 'flex', gap: 13 }}>
            <div className="bookcover">{(reading.book?.title || '书')[1] || '书'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="booktitle">{reading.book?.title}</div>
              <div className="bookmeta">
                你读到第 {reading.user?.chapter ?? '—'} 章
                {reading.ai?.chapter != null ? ` · 他读到第 ${reading.ai.chapter} 章` : ' · 他还没开始读'}
              </div>
              {reading.user?.chapterTitle && (
                <div className="bookmeta dim2">「{reading.user.chapterTitle}」</div>
              )}
              {reading.ai?.lastUnderline && (
                <div className="bookline">他画了线：{reading.ai.lastUnderline}</div>
              )}
            </div>
          </div>
          <a className="bookgo" href={reading?.url || '#'} target="_blank" rel="noreferrer">继续读 ›</a>
        </Card>
      ) : <Unavailable what="一起阅读" />}

      {/* ── 工具：全部对着真实服务 ── */}
      <Sec>工具</Sec>
      <div className="g2">
        <Card className="card tool" onClick={() => onGo('netease')} style={{ cursor: 'pointer' }}>
          <div className="tl"><i className={`dot${connect?.netease ? '' : ' off'}`} /> 网易云</div>
          <div className="tb">搜歌 · 歌词 · 歌单</div>
          <div className="ts">{connect?.netease
            ? (netease?.data?.remoteToolsAvailable ? '云端就绪' : '已配置')
            : '未接入'}</div>
        </Card>
        <Card className="card tool" onClick={() => onGo('ke')} style={{ cursor: 'pointer' }}>
          <div className="tl"><i className={`dot${connect?.stackchan ? '' : ' off'}`} /> 小克</div>
          <div className="tb">桌上的他</div>
          <div className="ts">{connect?.stackchan ? '网关已配置' : '未接入'}</div>
        </Card>
      </div>

      <Sec>数据源</Sec>
      <Card>
        <div className="svc"><i className={`dot${sources?.xinchao ? '' : ' off'}`} />
          <div className="nm">心潮 · 动态心智<div className="ds">意识 / 欲望 / 梦境</div></div>
          <span className="meter">{sources?.xinchao ? '已接入' : '未配置'}</span></div>
        <div className="svc"><i className={`dot${sources?.ombre ? '' : ' off'}`} />
          <div className="nm">Ombre Brain · 长期记忆<div className="ds">breath 召回 · 星图</div></div>
          <span className="meter">{sources?.ombre ? '已接入' : '未配置'}</span></div>
      </Card>

      <Sec>记忆文档</Sec>
      <Card>
        <div className="entry" onClick={onSync}>
          <span className="icbox" style={{ background: 'rgba(163,179,148,.18)', color: '#5F6E52' }}><Icon.sync /></span>
          <div><div>{syncing ? '同步中…' : '从 GitHub 同步记忆'}</div>
            <div className="t2">拉取最新 CLAUDE.md 与 memories/</div></div>
          <span className="ar">›</span>
        </div>
        <div className="entry" onClick={() => onGo('docs')}>
          <span className="icbox" style={{ background: 'rgba(120,108,92,.1)', color: 'var(--ink2)' }}><Icon.book /></span>
          <div><div>底层日记</div><div className="t2">{docs?.length ? `${docs.length} 篇` : 'GitHub · memories/'}</div></div>
          <span className="ar">›</span>
        </div>
      </Card>

      <Sec>机房</Sec>
      <Card>
        <div className="entry" onClick={() => onGo('engine')}>
          <span className="icbox" style={{ background: 'rgba(120,108,92,.1)', color: 'var(--ink2)' }}><Icon.gear /></span>
          <div><div>机房 · VPS 状态与电闸</div><div className="t2">在役服务 / 记忆库 / 模型配置</div></div>
          <span className="ar">›</span>
        </div>
      </Card>
    </>
  );
}

/* ═══ 机房 ═══ */
export function EnginePage({ sources, connect, map, ke, health, metrics, onBack, onGo }) {
  const fmtUp = (sec) => sec == null ? '—' : sec > 86400 ? `${Math.floor(sec / 86400)} 天` : `${Math.floor(sec / 3600)} 小时`;
  const svcs = [
    ['OB 记忆库', 'breath / 星图 / 545+ 桶', sources?.ombre],
    ['心潮 · 动态心智', '意识 / 欲望 / 梦境', sources?.xinchao],
    ['小克网关', 'MCP 网关', connect?.stackchan],
    ['一起阅读', '阅读服务', connect?.reading],
    ['网易云', 'MCP 服务', connect?.netease],
    ['生活记录 · Supabase', 'health / 日历', health?.available],
  ];
  const st = map?.stats || {};
  return (
    <>
      <div className="entry" onClick={onBack} style={{ padding: '6px 0', fontSize: 11.5, color: 'var(--muted)' }}>
        <Icon.back /> 更多
      </div>
      <div className="eb">Engine Room</div>
      <h1 className="big" style={{ fontSize: 23 }}>机房</h1>
      <div className="sub">他住的地方 —— 每一行都是实测，不是装饰</div>

      <Sec more="OB pulse 实时">记忆库</Sec>
      <Card>
        <div className="g2" style={{ gap: 7 }}>
          <div className="st"><div className="n">{st.pinned ?? '—'}</div><div className="l">固化</div></div>
          <div className="st"><div className="n">{st.dynamic ?? '—'}</div><div className="l">动态</div></div>
        </div>
        <div className="g2" style={{ gap: 7, marginTop: 7 }}>
          <div className="st"><div className="n">{st.archived ?? '—'}</div><div className="l">归档</div></div>
          <div className="st"><div className="n" style={{ fontSize: 19 }}>{st.size || '—'}</div><div className="l">占用</div></div>
        </div>
      </Card>

      <Sec more="全部实测">在役服务</Sec>
      <Card>
        {svcs.map(([nm, ds, ok]) => (
          <div className="svc" key={nm}>
            <i className={`dot${ok ? '' : ' off'}`} />
            <div className="nm">{nm}<div className="ds">{ds}</div></div>
            <span className="meter">{ok ? '在役' : '未接入'}</span>
          </div>
        ))}
      </Card>

      <Sec>体检</Sec>
      <Card>
        <div className="pill" style={{ padding: 0 }}><Icon.aware /> 小克设备
          <span className="r">{ke?.status?.connected ? `在线 · 电量 ${ke?.info?.battery?.level ?? '—'}%` : '离线'}</span></div>
        {metrics?.available ? (
          <>
            <div className="pill"><Icon.moon /> 内存
              <span className="r">{metrics.mem.availMb}MB 可用 / {metrics.mem.totalMb}MB</span></div>
            <div className="pill"><Icon.sync /> 磁盘
              <span className="r">已用 {metrics.disk.usedPct}% / {metrics.disk.totalGb}GB</span></div>
            <div className="pill"><Icon.spark /> 负载 · 在线
              <span className="r">load {metrics.load1?.toFixed(2)} · up {fmtUp(metrics.uptimeS)}</span></div>
          </>
        ) : (
          <div className="pill"><Icon.moon /> VPS 内存 / 磁盘
            <span className="r">未接上 —— 不显示假数据</span></div>
        )}
      </Card>

      <Sec>电闸</Sec>
      <Card>
        <div className="entry" onClick={() => onGo('config')}>
          <span className="icbox" style={{ background: 'rgba(120,108,92,.1)', color: 'var(--ink2)' }}><Icon.gear /></span>
          <div><div>模型 & API</div><div className="t2">接口 / Key / 温度 / 上下文</div></div>
          <span className="ar">›</span>
        </div>
      </Card>
    </>
  );
}

/* ═══ 小克房间 ═══ */

export function KePage({ api, onBack }) {
  const [ke, setKe] = useState(null);
  const [sayTxt, setSayTxt] = useState('');
  const [busy, setBusy] = useState('');
  const [photo, setPhoto] = useState(null);

  const load = async () => {
    try { setKe(await api('/api/connect/ke/status')); } catch { setKe({ available: false }); }
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line

  async function call(tool, args, tag) {
    if (busy) return null;
    setBusy(tag || tool);
    try { return await api('/api/connect/ke/call', { method: 'POST', body: JSON.stringify({ tool, args }) }); }
    catch { return null; }
    finally { setBusy(''); }
  }

  const online = ke?.available && ke.status?.connected;
  const info = ke?.info || {};

  return (
    <>
      <div className="entry" onClick={onBack} style={{ padding: '6px 0', fontSize: 11.5, color: 'var(--muted)' }}>
        <Icon.back /> 更多
      </div>
      <div className="eb">StackChan · 桌上的他</div>
      <h1 className="big" style={{ fontSize: 23 }}>小克</h1>

      <Card style={{ marginTop: 12 }}>
        <div className="pill" style={{ padding: 0 }}>
          <i className={`dot${online ? '' : ' off'}`} /> {online ? '在线' : ke ? '不在线' : '看看在不在…'}
          {online && info.battery && (
            <span className="r">电量 {info.battery.level}%{info.battery.charging ? ' ⚡' : ''}</span>
          )}
        </div>
        {online && (
          <>
            <div className="pill"><Icon.spark /> 音量
              <span className="r">{info.audio_speaker?.volume ?? '—'}</span></div>
            <div className="pill"><Icon.half /> 亮度
              <span className="r">{info.screen?.brightness ?? '—'}</span></div>
            <div className="pill"><Icon.aware /> WiFi
              <span className="r">{info.network?.ssid || '—'} · {info.network?.signal || ''}</span></div>
          </>
        )}
      </Card>

      {online && (
        <>
          <Sec>让他说</Sec>
          <Card className="card search">
            <Icon.mic />
            <input placeholder="想让他说什么…" value={sayTxt}
              onChange={(e) => setSayTxt(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && sayTxt.trim()) {
                  const t = sayTxt.trim(); setSayTxt('');
                  await call('say', { text: t }, 'say');
                }
              }} />
          </Card>
          {busy === 'say' && <div className="sub" style={{ textAlign: 'center' }}>正在开口…</div>}

          <Sec>动作</Sec>
          <Card>
            <div className="kerow">
              <button disabled={!!busy} onClick={() => call('move_head', { yaw: -30, pitch: 30 }, 'head')}>看左边</button>
              <button disabled={!!busy} onClick={() => call('move_head', { yaw: 0, pitch: 25 }, 'head')}>看你</button>
              <button disabled={!!busy} onClick={() => call('move_head', { yaw: 30, pitch: 30 }, 'head')}>看右边</button>
            </div>
          </Card>

          <Sec more="一事一拍 · 不落盘">他刚才看到的</Sec>
          <Card>
            {photo
              ? <img src={photo} alt="他看到的" style={{ width: '100%', borderRadius: 14 }} />
              : <div className="empty">还没拍</div>}
            <button className="sread" disabled={!!busy} style={{ marginTop: 10 }}
              onClick={async () => {
                const r = await call('take_photo', {}, 'photo');
                const d = r?.data;
                const img = typeof d === 'string' && d.startsWith('data:') ? d
                  : d?.image ? `data:image/jpeg;base64,${d.image}`
                  : d?.base64 ? `data:image/jpeg;base64,${d.base64}` : null;
                setPhoto(img);
              }}>
              {busy === 'photo' ? '亮屏拍照中…' : '拍一张'}
            </button>
          </Card>
        </>
      )}
      {ke && !online && (
        <Card>
          <div className="empty">他现在不在线。断电重启一下他，回来就能说话、转头、拍照。</div>
        </Card>
      )}
    </>
  );
}

/* ═══ 网易云 ═══ */
export function NeteasePage({ api, onBack }) {
  const [q, setQ] = useState('');
  const [rs, setRs] = useState(null);
  const [busy, setBusy] = useState(false);

  async function search(kw) {
    const w = (kw ?? q).trim();
    if (!w || busy) return;
    setBusy(true);
    try { setRs(await api(`/api/connect/netease/search?q=${encodeURIComponent(w)}`)); }
    catch { setRs({ available: false, reason: 'network' }); }
    finally { setBusy(false); }
  }

  const songs = rs?.available
    ? (Array.isArray(rs.data) ? rs.data : rs.data?.songs || rs.data?.result?.songs || [])
    : [];

  return (
    <>
      <div className="entry" onClick={onBack} style={{ padding: '6px 0', fontSize: 11.5, color: 'var(--muted)' }}>
        <Icon.back /> 更多
      </div>
      <div className="eb">NetEase · 云端</div>
      <h1 className="big" style={{ fontSize: 23 }}>网易云</h1>
      <div className="sub">跑在 VPS 上的那份，搜的是真曲库</div>

      <Card className="card search" style={{ marginTop: 14 }}>
        <Icon.search />
        <input placeholder="搜歌 / 歌手…" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
      </Card>

      {busy && <Card><div className="empty">在找…</div></Card>}
      {!busy && rs && !rs.available && <Card><div className="empty">搜不了：{rs.reason}</div></Card>}
      {!busy && songs.length > 0 && songs.slice(0, 12).map((t, i) => (
        <Card key={t.id || i}>
          <div className="pill" style={{ padding: 0 }}>
            <span className="icbox" style={{ width: 30, height: 30, borderRadius: 9,
              background: 'rgba(217,119,87,.1)', color: 'var(--accent)', fontSize: 11 }}>♪</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name || t.title || '（无名）'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                {(t.artists || t.ar || []).map((a) => a.name || a).join(' / ') || t.artist || ''}
                {t.album?.name ? ` · ${t.album.name}` : ''}</div>
            </div>
          </div>
        </Card>
      ))}
      {!busy && rs?.available && songs.length === 0 && (
        <Card><div className="empty">没搜到，换个词试试</div></Card>
      )}
    </>
  );
}

/* ═══ 记忆文档 ═══ */
export function DocsPage({ docs, onBack }) {
  return (
    <>
      <div className="entry" onClick={onBack} style={{ padding: '6px 0', fontSize: 11.5, color: 'var(--muted)' }}>
        <Icon.back /> 返回
      </div>
      <h1 className="big" style={{ fontSize: 23 }}>记忆文档</h1>
      <p className="sub">部署里当前生效的那一份</p>
      {docs?.length ? docs.map((d, i) => (
        <Card key={i}>
          <div className="mem">
            <div className="t">{d.name}</div>
            <div className="b" style={{ maxHeight: 200, overflow: 'auto' }}>{d.content}</div>
          </div>
        </Card>
      )) : <Card><div className="empty">还没加载到文档</div></Card>}
    </>
  );
}
