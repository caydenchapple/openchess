// Cloudflare Worker + Durable Object that runs OpenChess rooms, so online play works when the site itself is static (Cloudflare Pages).
// One Durable Object per room code. Same Room/Game code as the Node server.
import { Room, CODE_RE } from '../server/room.js';
import { Mailbox, emptyData, FRIEND_RE } from '../server/friends.js';
import { Scores, routeScores, emptyBoards } from '../server/scores.js';

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

/**
 * One Durable Object per friend code: that player's mailbox (friend requests, challenges) and whether they are online.
 * It uses WebSocket hibernation, so an idle open tab costs nothing; the mailbox is saved to storage after every change.
 */
export class InboxDO {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.code = null; this.loaded = null; this.box = null; this.wrapped = new WeakMap();
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    state.blockConcurrencyWhile(async () => { const m = await state.storage.get('m'); if (m) { this.code = m.code; this.loaded = m.data; } });
  }

  #mailbox() {
    if (!this.box) {
      const stub = (code) => this.env.INBOX.get(this.env.INBOX.idFromName(code));
      const call = async (code, path, body) => (await stub(code).fetch(`https://inbox${path}`, { method: 'POST', body: JSON.stringify(body) })).json();
      this.box = new Mailbox(this.code, this.loaded ?? emptyData(), {
        conns: () => this.state.getWebSockets().map((ws) => this.#wrap(ws)),
        hub: {
          deliver: async (code, ev) => (await call(code, '/deliver', { code, ev })).result,
          probe: async (code, asker) => (await call(code, '/probe', { code, asker })).peek,
        },
        save: (data) => this.state.storage.put('m', { code: this.code, data }),
      });
    }
    return this.box;
  }

  /** A connection as the mailbox sees it; what must survive hibernation lives in the socket's attachment. */
  #wrap(ws) {
    let c = this.wrapped.get(ws);
    if (c) return c;
    const att = ws.deserializeAttachment() ?? {};
    const keep = () => { try { ws.serializeAttachment({ authed: c.authed, name: c.name, av: c.av }); } catch { /* closed */ } };
    c = {
      send: (m) => { try { ws.send(JSON.stringify(m)); } catch { /* socket closed */ } },
      name: att.name ?? null, av: att.av ?? null, _authed: !!att.authed, win: 0, n: 0,
      get authed() { return this._authed; },
      set authed(v) { this._authed = v; keep(); },
      set(p) { this.name = p.name; this.av = p.av; keep(); },
    };
    this.wrapped.set(ws, c);
    return c;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/deliver') {
      const { ev } = await request.json();
      const result = this.code ? await this.#mailbox().receive(ev) : 'unknown';
      return Response.json({ result });
    }
    if (request.method === 'POST' && url.pathname === '/probe') {
      const { asker } = await request.json();
      return Response.json({ peek: this.code ? this.#mailbox().peek(asker) : null });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const code = url.pathname.split('/').pop().toUpperCase();
    if (!FRIEND_RE.test(code)) return new Response('Bad friend code', { status: 400 });
    if (!this.code) this.code = code;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 4096) return;
    const c = this.#wrap(ws);
    const now = Date.now();
    if (now - c.win > 1000) { c.win = now; c.n = 0; }
    if (++c.n > 20) return;
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const box = this.#mailbox();
    try {
      const err = msg.t === 'hello' ? (c.authed ? null : await box.hello(c, msg)) : await box.message(c, msg);
      if (err) c.send({ t: 'error', message: err, ...(err === 'taken' ? { taken: true } : {}) });
    } catch { c.send({ t: 'error', message: 'Something went wrong. Try again.' }); }
  }

  webSocketClose(ws) { try { ws.close(); } catch { /* already closed */ } }
}

/** The Piece Rain leaderboard: one Durable Object holds every board (they are small) and checks every score. */
export class ScoresDO {
  constructor(state) {
    this.state = state; this.scores = null;
    state.blockConcurrencyWhile(async () => {
      const data = (await state.storage.get('boards')) ?? emptyBoards();
      this.scores = new Scores(data, { save: (d) => state.storage.put('boards', d) });
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    let body = null;
    if (request.method === 'POST') { try { const text = await request.text(); body = text.length < 2048 ? JSON.parse(text) : null; } catch { body = null; } }
    const { status, json } = await routeScores(this.scores, request.method, url.pathname.replace(/^\/scores/, ''), url.searchParams, body);
    return Response.json(json, { status });
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
    if (url.pathname.startsWith('/scores/') || url.pathname === '/scores') {
      const origin = request.headers.get('Origin');
      const cors = { 'Access-Control-Allow-Origin': origin ?? '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' };
      if (!originAllowed(origin, env)) return new Response('Origin not allowed', { status: 403 });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      const res = await env.SCORES.get(env.SCORES.idFromName('global')).fetch(request);
      return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
    }
    const f = url.pathname.match(/^\/friends\/([A-Za-z0-9]{8})$/);
    if (f) {
      const code = f[1].toUpperCase();
      if (!FRIEND_RE.test(code)) return new Response('Bad friend code', { status: 400 });
      if (!originAllowed(request.headers.get('Origin'), env)) return new Response('Origin not allowed', { status: 403 });
      return env.INBOX.get(env.INBOX.idFromName(code)).fetch(request);
    }
    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]+)$/);
    if (!m) return new Response('OpenChess rooms. Connect with a WebSocket to /ws/<CODE>.', { status: 200, headers: { 'content-type': 'text/plain' } });
    const code = m[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response('Bad room code', { status: 400 });
    if (!originAllowed(request.headers.get('Origin'), env)) return new Response('Origin not allowed', { status: 403 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(request);
  },
};
