import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lobby, cleanName, cleanRating, TIME_CONTROLS } from './rooms.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

export function createApp({ lobby = new Lobby() } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self' ws: wss:",
        "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.get('/api/status', (req, res) => {
    res.json({ ...lobby.stats(), timeControls: TIME_CONTROLS });
  });

  app.use(express.static(path.join(here, '..', 'public'), {
    setHeaders(res, file) {
      if (file.endsWith('.wasm')) res.type('application/wasm');
      if (file.includes(`${path.sep}vendor${path.sep}`)) res.set('Cache-Control', 'public, max-age=604800');
    },
  }));
  return app;
}

export function attachWebSocket(server, lobby) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (origin) {
      let ok = allowed.includes(origin);
      try { ok ||= new URL(origin).host === req.headers.host; } catch { /* bad origin */ }
      if (!ok) return ws.close(1008, 'origin not allowed');
    }
    const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
    const conn = { send, pid: null, name: 'Guest', rating: 1000, game: null, color: null };
    let alive = true;
    let budget = 30; // messages per second
    const refill = setInterval(() => { budget = 30; }, 1000);
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false; ws.ping();
    }, 30_000);
    ws.on('pong', () => { alive = true; });

    ws.on('message', (data) => {
      if (--budget < 0) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      const err = handle(lobby, conn, m);
      if (err) send({ t: 'error', message: err });
    });
    ws.on('close', () => {
      clearInterval(refill); clearInterval(ping);
      lobby.remove(conn);
    });
    ws.on('error', () => ws.terminate());
  });

  const stats = setInterval(() => {
    const s = lobby.stats();
    for (const c of lobby.conns) c.send({ t: 'stats', ...s });
    lobby.sweep();
  }, 15_000);
  stats.unref();
  wss.on('close', () => clearInterval(stats));
  return wss;
}

function handle(lobby, conn, m) {
  if (m.t === 'hello') {
    if (conn.pid) return null;
    conn.pid = String(m.id ?? '').replace(/[^\w-]/g, '').slice(0, 40) || null;
    if (!conn.pid) return 'Missing player id';
    conn.name = cleanName(m.name);
    conn.rating = cleanRating(m.rating);
    lobby.add(conn);
    conn.send({ t: 'hello', ...lobby.stats() });
    return null;
  }
  if (!conn.pid) return 'Say hello first';
  switch (m.t) {
    case 'profile': conn.name = cleanName(m.name); conn.rating = cleanRating(m.rating); return null;
    case 'seek': return lobby.seek(conn, Number(m.time), Number(m.inc));
    case 'create': return lobby.createInvite(conn, Number(m.time), Number(m.inc), m.color);
    case 'join': return lobby.joinInvite(conn, m.code);
    case 'cancel': lobby.cancel(conn); conn.send({ t: 'cancelled' }); return null;
    case 'rejoin': return lobby.rejoin(conn, String(m.gameId), String(m.token));
    case 'move':
      if (!conn.game) return 'No active game';
      return conn.game.move(conn.color, {
        from: String(m.from), to: String(m.to),
        promotion: m.promotion ? String(m.promotion).slice(0, 1) : undefined,
      });
    case 'resign': conn.game?.resign(conn.color); return null;
    case 'draw': conn.game?.draw(conn.color, String(m.action)); return null;
    default: return null;
  }
}

// Only start listening when run directly (so tests can import createApp).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lobby = new Lobby();
  const server = createServer(createApp({ lobby }));
  attachWebSocket(server, lobby);
  server.listen(PORT, () => {
    console.log(`OpenChess running at http://localhost:${PORT}`);
  });
}
