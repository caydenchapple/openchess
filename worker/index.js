// Cloudflare Worker + Durable Object that runs OpenChess rooms, so online play works when the site itself is static (Cloudflare Pages).
// One Durable Object per room code. Same Room/Game code as the Node server.
import { Room, CODE_RE } from '../server/room.js';

export class RoomDO {
  constructor(state, env) { this.state = state; this.env = env; this.room = null; }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const code = new URL(request.url).pathname.split('/').pop().toUpperCase();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const conn = { send: (m) => { try { server.send(JSON.stringify(m)); } catch { /* socket closed */ } }, pid: null, name: 'Guest', rating: 1000, color: null };
    let room = null; let budget = 30;
    const refill = setInterval(() => { budget = 30; }, 1000);

    server.addEventListener('message', (ev) => {
      if (--budget < 0 || typeof ev.data !== 'string' || ev.data.length > 4096) return;
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      let err = null;
      if (msg.t === 'hello') {
        if (room) return;
        if (!this.room && msg.role === 'host') this.room = new Room(code, { onClose: () => { this.room = null; } });
        if (!this.room) err = 'No game with that code. Check the letters and ask your friend to host again.';
        else { err = this.room.hello(conn, msg); if (!err) room = this.room; }
      } else if (room) err = room.message(conn, msg);
      if (err) conn.send({ t: 'error', message: err });
    });
    const gone = () => { clearInterval(refill); room?.remove(conn); room = null; };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}

const originAllowed = (origin, env) => {
  if (!origin) return true;
  try {
    const h = new URL(origin).hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.pages.dev')) return true;
    return (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
  } catch { return false; }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (!m) return new Response('OpenChess rooms. Connect with a WebSocket to /ws/<CODE>.', { status: 200, headers: { 'content-type': 'text/plain' } });
    const code = m[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response('Bad room code', { status: 400 });
    if (!originAllowed(request.headers.get('Origin'), env)) return new Response('Origin not allowed', { status: 403 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  },
};
