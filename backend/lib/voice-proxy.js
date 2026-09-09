// 实时通话反代：PaiHome `/voice/*` → 本机或受保护网络中的 realtime-server。
// HTTP（测试页、健康）和 WebSocket upgrade 都转。REALTIME_TOKEN 设了就由这里自动带上，前端不用管。

import http from 'node:http';
import net from 'node:net';

const TARGET_HOST = process.env.REALTIME_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.REALTIME_PORT || 8780);
const TOKEN = process.env.REALTIME_TOKEN || '';

function withToken(url) {
  if (!TOKEN) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN);
}

export function voiceHttpProxy(req, res) {
  const upstream = http.request({
    host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: withToken(req.url),
    headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
  }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: '通话服务没醒（realtime-server 8780）' }));
  });
  req.pipe(upstream);
}

export function attachVoiceUpgrade(server) {
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/voice/')) { socket.destroy(); return; }
    const up = net.connect(TARGET_PORT, TARGET_HOST, () => {
      const lines = [`${req.method} ${withToken(req.url)} HTTP/1.1`];
      for (const [k, v] of Object.entries(req.headers)) {
        if (k === 'host') continue;
        lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      }
      lines.push(`Host: ${TARGET_HOST}:${TARGET_PORT}`, '', '');
      up.write(lines.join('\r\n'));
      if (head && head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    const bye = () => { try { socket.destroy(); } catch { /* ignore */ } try { up.destroy(); } catch { /* ignore */ } };
    up.on('error', bye); socket.on('error', bye);
    socket.setNoDelay(true); up.setNoDelay(true);
  });
}
