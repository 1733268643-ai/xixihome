import { Icon } from './icons.jsx';

function ago(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return '';
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} 天` : new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export default function ChatDirectory({ sessions, currentId, onOpen, onNew }) {
  return (
    <section className="chat-directory" aria-label="对话目录">
      <header className="chat-directory-head">
        <div>
          <div className="eb">CONVERSATIONS</div>
          <h1>对话</h1>
          <p>每一扇窗口，都保存在晞晞的主机里。</p>
        </div>
        <span className="chat-directory-count">{sessions.length}</span>
      </header>

      <div className="chat-directory-label">
        <span>Sessions</span><span>全部</span>
      </div>

      <div className="chat-directory-list">
        {sessions.map((session) => (
          <button className={`session-card${session.id === currentId ? ' current' : ''}`} key={session.id}
            onClick={() => onOpen(session.id, session.name)}>
            <span className="session-orbit"><i /></span>
            <span className="session-copy">
              <b>{session.name || '新的对话'}</b>
              <small>{session.id === currentId ? '当前窗口' : '晞晞主机'} · Claude -p</small>
            </span>
            <span className="session-time">{ago(session.updated_at)}</span>
          </button>
        ))}
        {!sessions.length && <div className="chat-directory-empty">还没有窗口。新建一个，跟她说第一句话。</div>}
      </div>

      <button className="new-session" onClick={onNew}><Icon.plus /> 新对话</button>
    </section>
  );
}
