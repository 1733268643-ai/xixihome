// 调用端使用的顾川工具库 client。
// secret 只从运行环境变量读取，并统一通过 header 传递；不要拼进 URL，也不要打印。

const DEFAULT_BASE_URL = '';

const ALLOWED_PATHS = new Set([
  '/status',
  '/activity',
  // 预留给后续工具；只有这里列出的路径允许被代理。
  '/fishing/status',
  '/fishing/command',
  '/fishing/recent',
]);

function getBaseUrl() {
  return (process.env.GUCHUAN_TOOLS_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function getSecret() {
  return process.env.GUCHUAN_TOOLS_SECRET || '';
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export async function callGuchuanTool(path, params = {}) {
  if (!ALLOWED_PATHS.has(path)) {
    const err = new Error('tool path is not allowed');
    err.status = 400;
    throw err;
  }

  const secret = getSecret();
  if (!secret) {
    return { ok: false, error: 'missing guchuan tools secret' };
  }

  const url = `${getBaseUrl()}${path}${buildQuery(params)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-guchuan-tools-secret': secret,
      accept: 'application/json',
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, error: 'invalid tools response' };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error || `tools request failed with ${response.status}`,
    };
  }

  return payload;
}
