import crypto from 'node:crypto';

function readBearerToken(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function readProvidedKey(req) {
  return String(
    req.headers['x-chat-actions-key'] ||
    req.headers['x-api-key'] ||
    readBearerToken(req.headers.authorization) ||
    ''
  ).trim();
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function requireChatActionKey(req, res, next) {
  const configured = String(process.env.CHAT_ACTIONS_API_KEY || '').trim();
  if (!configured) {
    return res.status(503).json({ ok: false, error: 'missing chat actions api key config' });
  }

  const provided = readProvidedKey(req);
  if (!safeEqual(provided, configured)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  next();
}
