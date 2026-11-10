// OpenChess server: serves the site and runs private rooms over WebSockets. Players meet only through a shared room code.
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, CODE_RE } from './room.js';
import { TIME_CONTROLS } from './game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

/** The set of live rooms, by code. */
export class Rooms {
  constructor({ now } = {}) { this.map = new Map(); this.now = now; }
  get(code, create) {
    let r = this.map.get(code);
    if (!r && create) { r = new Room(code, { now: this.now, onClose: () => this.map.delete(code) }); this.map.set(code, r); }
    return r;
  }
  get size() { return this.map.size; }
}

export function createApp({ rooms = new Rooms() } = {}) {
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

  app.get('/api/status', (req, res) => res.json({ rooms: rooms.size, timeControls: TIME_CONTROLS }));

  app.use(express.static(path.join(here, '..', 'public'), {
    setHeaders(res, file) {
      if (file.endsWith('.wasm')) res.type('application/wasm');
      if (file.includes(`${path.sep}vendor${path.sep}`)) res.set('Cache-Control', 'public, max-age=604800');
    },
  }));
  return app;
}

export function attachWebSocket(server, rooms) {
  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (origin) {
      let ok = allowed.includes(origin);
      try { ok ||= new URL(origin).host === req.headers.host; } catch { /* bad origin */ }
      if (!ok) return ws.close(1008, 'origin not allowed');
    }
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    const code = m?.[1]?.toUpperCase();
    if (!code || !CODE_RE.test(code)) return ws.close(1008, 'bad room code');

    const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
    const conn = { send, pid: null, name: 'Guest', rating: 1000, color: null };
    let room = null; let budget = 30;
    const refill = setInterval(() => { budget = 30; }, 1000);
    let alive = true;
    const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 30_000);
    ws.on('pong', () => { alive = true; });

    ws.on('message', (data) => {
      if (--budget < 0) return;
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      let err = null;
      if (msg.t === 'hello') {
        if (room) return;
        room = rooms.get(code, msg.role === 'host');
        if (!room) err = 'No game with that code. Check the letters and ask your friend to host again.';
        else { err = room.hello(conn, msg); if (err) { if (!room.conns.size && room.state === 'new') rooms.map.delete(code); room = null; } }
      } else if (room) err = room.message(conn, msg);
      if (err) send({ t: 'error', message: err });
    });
    ws.on('close', () => { clearInterval(refill); clearInterval(ping); room?.remove(conn); });
    ws.on('error', () => ws.terminate());
  });
  return wss;
}

// Only start listening when run directly (so tests can import createApp).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rooms = new Rooms();
  const server = createServer(createApp({ rooms }));
  attachWebSocket(server, rooms);
  server.listen(PORT, () => { console.log(`OpenChess running at http://localhost:${PORT}`); });
}
