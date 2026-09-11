// Bark 推送。

// 可选自定义图标；不配置时由 Bark 使用默认图标。
const AVATAR = process.env.BARK_ICON_URL || '';
const BARK_BASE = process.env.BARK_URL || 'https://api.day.app';

export async function pushBark({ key, title = 'XixiHome', body, group = 'xixihome' }) {
  if (!key) throw new Error('缺少 BARK_KEY');

  const res = await fetch(`${BARK_BASE.replace(/\/$/, '')}/${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title,
      body,
      group,
      ...(AVATAR ? { icon: AVATAR } : {}),
      sound: 'silence',
      level: 'timeSensitive',
    }),
  });

  if (!res.ok) {
    throw new Error(`Bark 推送失败 ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
