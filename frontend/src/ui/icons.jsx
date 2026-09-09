// 统一线性 icon：1.6px 描边、圆角端点。全部手绘，无 emoji。
const S = { className: 'ic', viewBox: '0 0 20 20' };

export const Icon = {
  star: (p) => <svg {...S} {...p}><path d="M10 2.8l1.9 4.4 4.8.4-3.6 3.1 1.1 4.7L10 12.9l-4.2 2.5 1.1-4.7L3.3 7.6l4.8-.4z" /></svg>,
  expand: (p) => <svg {...S} {...p}><path d="M7.5 3H3v4.5M12.5 3H17v4.5M17 12.5V17h-4.5M3 12.5V17h4.5" /></svg>,
  x: (p) => <svg {...S} {...p}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>,
  home: (p) => <svg {...S} {...p}><path d="M3 10l7-6 7 6v7.5a1 1 0 01-1 1h-4V13H8v5.5H4a1 1 0 01-1-1z" /></svg>,
  inner: (p) => <svg {...S} {...p}><path d="M10 3.2c-2.6 0-4.4 1.7-4.4 4 0 1.1.5 1.7.5 2.8s-1.3 1.6-1.3 3.3c0 1.7 1.4 3 3 3s3-1.2 3-2.6" /><path d="M10 3.2c2.6 0 4.4 1.7 4.4 4 0 1.1-.5 1.7-.5 2.8s1.3 1.6 1.3 3.3c0 1.7-1.4 3-3 3s-3-1.2-3-2.6V3.2z" /></svg>,
  chat: (p) => <svg {...S} {...p}><path d="M3.5 5h13v9.5h-8L3.5 18z" /></svg>,
  cal: (p) => <svg {...S} {...p}><rect x="3" y="4.5" width="14" height="12.5" rx="2.4" /><path d="M3 8.5h14M7 2.6v3.8M13 2.6v3.8" /></svg>,
  more: (p) => <svg {...S} {...p}><circle cx="4.5" cy="10" r="1.3" /><circle cx="10" cy="10" r="1.3" /><circle cx="15.5" cy="10" r="1.3" /></svg>,
  menu: (p) => <svg {...S} {...p}><path d="M3 6h14M3 10h14M3 14h10" /></svg>,
  plus: (p) => <svg {...S} {...p}><path d="M10 4v12M4 10h12" /></svg>,
  send: (p) => <svg {...S} {...p}><path d="M10 16V5M5 10l5-5 5 5" /></svg>,
  mic: (p) => <svg {...S} {...p}><rect x="7.6" y="2.8" width="4.8" height="9" rx="2.4" /><path d="M4.8 9.5a5.2 5.2 0 0010.4 0M10 14.7V17.2M7.5 17.2h5" /></svg>,
  copy: (p) => <svg {...S} {...p}><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" /></svg>,
  retry: (p) => <svg {...S} {...p}><path d="M16 8a6 6 0 10-1.5 5M16 4v4h-4" /></svg>,
  search: (p) => <svg {...S} {...p}><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>,
  moon: (p) => <svg {...S} {...p}><path d="M16 11.4A6.4 6.4 0 018.6 4a6.5 6.5 0 107.4 7.4z" /></svg>,
  half: (p) => <svg {...S} {...p}><circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 000 14z" fill="currentColor" stroke="none" /></svg>,
  aware: (p) => <svg {...S} {...p}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" /></svg>,
  bell: (p) => <svg {...S} {...p}><path d="M10 3.5A4.5 4.5 0 005.5 8c0 4-1.5 5-1.5 5h12s-1.5-1-1.5-5A4.5 4.5 0 0010 3.5z" /><path d="M8.6 16a1.6 1.6 0 002.8 0" /></svg>,
  gear: (p) => <svg {...S} {...p}><circle cx="10" cy="10" r="2.6" /><path d="M10 2.6l.9 2.1 2.2-.5 1 1.9-1.6 1.6.9 2.1 2.2.5v2.2l-2.2.5-.9 2.1 1.6 1.6-1 1.9-2.2-.5-.9 2.1H9.1l-.9-2.1-2.2.5-1-1.9 1.6-1.6-.9-2.1-2.2-.5V9.9l2.2-.5.9-2.1L5 5.7l1-1.9 2.2.5.9-2.1z" strokeWidth="1.2" /></svg>,
  book: (p) => <svg {...S} {...p}><path d="M4 4.5A1.5 1.5 0 015.5 3H15a1 1 0 011 1v11a1 1 0 01-1 1H5.5A1.5 1.5 0 004 17.5z" /><path d="M4 15.5A1.5 1.5 0 015.5 14H16" /></svg>,
  image: (p) => <svg {...S} {...p}><rect x="3" y="4.5" width="14" height="11" rx="2" /><circle cx="7.2" cy="8.4" r="1.3" /><path d="M3.4 13.4l3.8-3.2 3 2.4 2.6-2.2 3.6 3" /></svg>,
  sync: (p) => <svg {...S} {...p}><path d="M3.5 10a6.5 6.5 0 0111.2-4.5M16.5 10a6.5 6.5 0 01-11.2 4.5" /><path d="M14.5 2.5v3.2h-3.2M5.5 17.5v-3.2h3.2" /></svg>,
  back: (p) => <svg {...S} {...p}><path d="M12 4l-6 6 6 6" /></svg>,
  rain: (p) => <svg {...S} {...p}><path d="M6 12a3.5 3.5 0 01-.4-7A5 5 0 0115 6.4 3.3 3.3 0 0114.6 13" /><path d="M8 15l-.8 2M11 15l-.8 2M14 15l-.8 2" /></svg>,
  spark: (p) => <svg {...S} {...p}><path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" /></svg>,
  volume: (p) => <svg {...S} {...p}><path d="M4 8v4h3l3.5 2.8V5.2L7 8z" /><path d="M13.4 7.6a3.4 3.4 0 010 4.8" /></svg>,
  pause: (p) => <svg {...S} {...p}><path d="M7.6 5.5v9M12.4 5.5v9" /></svg>,
  chev: (p) => <svg {...S} {...p}><path d="M5.8 8l4.2 4.2L14.2 8" /></svg>,
};

/** 方块蟹小图标（我们自己的形象，非 emoji） */
export function CrabIcon({ size = 20, className = 'ic', ...rest }) {
  return (
    <svg className={className} viewBox="0 0 20 20" width={size} style={{ stroke: 'none' }} {...rest}>
      <g fill="currentColor">
        <rect x="4.5" y="5.5" width="11" height="8" rx="2.4" />
        <rect x="1.5" y="8" width="2.6" height="3.4" rx="1.3" />
        <rect x="15.9" y="8" width="2.6" height="3.4" rx="1.3" />
        <rect x="5.6" y="13" width="1.8" height="2.8" rx=".9" />
        <rect x="8.3" y="13.4" width="1.8" height="2.8" rx=".9" />
        <rect x="10.6" y="13.4" width="1.8" height="2.8" rx=".9" />
        <rect x="13" y="13" width="1.8" height="2.8" rx=".9" />
      </g>
      <rect x="7" y="7.8" width="1.9" height="2.4" rx=".6" fill="#241512" />
      <rect x="11.4" y="7.8" width="1.9" height="2.4" rx=".6" fill="#241512" />
    </svg>
  );
}

/** 右下角浮着的小螃蟹挂件 */
export function CrabMascot({ up }) {
  return (
    // 小克有自己的颜色，不跟主题变——他是个实体，不是界面的一部分
    <svg className={`crab${up ? ' up' : ''}`} viewBox="0 0 220 200" aria-hidden="true">
      <g fill="#D97757">
        <rect x="52" y="56" width="116" height="84" rx="22" />
        <rect x="34" y="98" width="26" height="30" rx="12" />
        <rect x="160" y="98" width="26" height="30" rx="12" />
        <rect x="64" y="130" width="16" height="26" rx="8" />
        <rect x="90" y="136" width="16" height="26" rx="8" />
        <rect x="114" y="136" width="16" height="26" rx="8" />
        <rect x="140" y="130" width="16" height="26" rx="8" />
      </g>
      <rect x="76" y="80" width="15" height="17" rx="3.5" fill="#241512" />
      <rect x="129" y="80" width="15" height="17" rx="3.5" fill="#241512" />
      <path d="M96,112 Q110,122 124,112" stroke="#241512" strokeWidth="4.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
