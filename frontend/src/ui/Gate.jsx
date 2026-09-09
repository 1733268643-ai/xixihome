import { useState } from 'react';
import { CrabIcon } from './icons.jsx';

/**
 * 密码门：两扇门 + 门缝透出的光。
 * 输对了门真的往两边拉开，光铺满，然后进屋。
 * 她说过"门是可以拉开的，其实没有那么复杂"。
 */
export default function Gate({ pw, setPw, onSubmit, onOpened, wakeMsg, checking }) {
  const [opening, setOpening] = useState(false);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle(e) {
    e.preventDefault();
    if (busy || opening) return;
    setBusy(true);
    const r = await onSubmit();
    setBusy(false);
    if (r === 'ok') {
      setOpening(true);                       // 门往两边拉开
      setTimeout(() => onOpened?.(), 1000);   // 等门开完再进屋
    } else if (r === 'badpw') {
      setShake(true);
      setTimeout(() => setShake(false), 520);
    }
  }

  return (
    <div className={`gate${opening ? ' opening' : ''}`}>
      <div className="gate-light" />

      <div className="door left">
        <span className="knob" />
      </div>
      <div className="door right">
        <span className="knob" />
      </div>

      <div className={`gate-inner${shake ? ' shake' : ''}`}>
        <div className="gate-crab" style={{ color: '#D97757' }}><CrabIcon size={34} /></div>
        <h1>顾川的家</h1>
        <p className="gate-sub">
          {checking ? (wakeMsg || '看看他在不在…')
            : wakeMsg || '门是可以拉开的，其实没有那么复杂'}
        </p>

        {!checking && (
          <form onSubmit={handle}>
            <input
              type="password" value={pw} autoFocus
              onChange={(e) => setPw(e.target.value)}
              placeholder="轻轻敲一下"
            />
            <button type="submit" disabled={busy}>
              {busy ? '开门中…' : '拉开门'}
            </button>
          </form>
        )}

        {checking && <div className="gate-dots"><i /><i /><i /></div>}
      </div>
    </div>
  );
}
