// 通话页图标：细线条 SVG，不用 emoji
const P = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const CI = {
  mic: () => <svg {...P}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></svg>,
  micOff: () => <svg {...P}><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-6 0v.5M5 11a7 7 0 0 0 11.4 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M9 21h6M4 4l16 16" /></svg>,
  end: () => <svg {...P} width="26" height="26" strokeWidth="1.8"><path d="M3.5 13.5c4.7-4.7 12.3-4.7 17 0l-2.4 2.4a1.5 1.5 0 0 1-1.9.2l-2.3-1.5a1.5 1.5 0 0 1-.6-1.6l.3-1.4a10 10 0 0 0-3.2 0l.3 1.4a1.5 1.5 0 0 1-.6 1.6l-2.3 1.5a1.5 1.5 0 0 1-1.9-.2z" fill="currentColor" stroke="none" /></svg>,
  speaker: () => <svg {...P}><path d="M4 10v4h3l4 3.5v-11L7 10zM15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" /></svg>,
  speakerOff: () => <svg {...P}><path d="M4 10v4h3l4 3.5v-11L7 10zM15.5 9.5l4 5M19.5 9.5l-4 5" /></svg>,
  keyboard: () => <svg {...P}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>,
  camera: () => <svg {...P}><rect x="3" y="7" width="12" height="10" rx="2" /><path d="M15 11l5-2.5v7L15 13" /></svg>,
  pencil: () => <svg {...P} width="14" height="14"><path d="M4 20l4-.8L19.5 7.7a1.5 1.5 0 0 0 0-2.1l-1.1-1.1a1.5 1.5 0 0 0-2.1 0L4.8 16z" /></svg>,
  phone: () => <svg {...P}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>,
};
