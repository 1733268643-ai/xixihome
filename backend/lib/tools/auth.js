// 顾川工具库统一鉴权。
// 优先使用 GUCHUAN_TOOLS_SECRET；没有配置时才兼容 ACTIVITY_SECRET。

export function getConfiguredToolsSecret() {
  return process.env.GUCHUAN_TOOLS_SECRET || process.env.ACTIVITY_SECRET || '';
}

export function readProvidedToolsSecret(req) {
  return String(
    req.query?.secret ||
      req.headers['x-guchuan-tools-secret'] ||
      req.headers['x-activity-secret'] ||
      ''
  );
}

export function requireToolsSecret(req, res, next) {
  const configured = getConfiguredToolsSecret();
  const provided = readProvidedToolsSecret(req);

  if (!configured || provided !== configured) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  next();
}
