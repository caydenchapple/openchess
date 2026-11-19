// OpenChess server: serves the site and runs private rooms over WebSockets. Players meet only through a shared room code.
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room, CODE_RE } from './room.js';
import { TIME_CONTROLS } from './game.js';
import { Hub, FRIEND_RE } from './friends.js';
import { Scores, routeScores, emptyBoards } from './scores.js';
import { readFileSync, writeFileSync } from 'node:fs';

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

/** Leaderboard scores: in memory, and in a JSON file too when SCORES_FILE is set (so they survive a restart). */
export function makeScores(file = process.env.SCORES_FILE) {
  let data = emptyBoards();
  if (file) { try { data = { ...data, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { /* first run */ } }
  return new Scores(data, { save: (d) => { if (file) { try { writeFileSync(file, JSON.stringify(d)); } catch { /* read-only disk */ } } } });
}

export function createApp({ rooms = new Rooms(), scores = makeScores() } = {}) {
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

  app.use('/scores', express.json({ limit: '2kb' }), async (req, res) => {
    const { status, json } = await routeScores(scores, req.method, req.path, new URLSearchParams(req.query), req.body);
    res.status(status).json(json);
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

export function attachWebSocket(server, rooms, hub = new Hub()) {
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
    const fm = url.pathname.match(/^\/friends\/([A-Za-z0-9]+)$/);
    if (fm) return friendSocket(ws, hub, fm[1].toUpperCase());
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

/** One browser's connection to its friends mailbox (/friends/<friend code>). */
function friendSocket(ws, hub, code) {
  if (!FRIEND_RE.test(code)) return ws.close(1008, 'bad friend code');
  const box = hub.box(code);
  const send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const conn = { send, authed: false, name: null, av: null, set(p) { this.name = p.name; this.av = p.av; } };
  box.live.add(conn);
  let budget = 20;
  const refill = setInterval(() => { budget = 20; }, 1000);
  ws.on('message', async (data) => {
    if (--budget < 0) return;
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') return send({ t: 'pong' });
    try {
      const err = msg.t === 'hello' ? (conn.authed ? null : await box.hello(conn, msg)) : await box.message(conn, msg);
      if (err) send({ t: 'error', message: err, ...(err === 'taken' ? { taken: true } : {}) });
    } catch (e) { send({ t: 'error', message: 'Something went wrong. Try again.' }); }
  });
  const gone = () => { clearInterval(refill); box.live.delete(conn); if (!box.claimed && !box.live.size) hub.boxes.delete(code); };
  ws.on('close', gone);
  ws.on('error', () => ws.terminate());
}

// Only start listening when run directly (so tests can import createApp).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rooms = new Rooms();
  const server = createServer(createApp({ rooms }));
  attachWebSocket(server, rooms);
  server.listen(PORT, () => { console.log(`OpenChess running at http://localhost:${PORT}`); });
}
