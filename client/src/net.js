// WebSocket client for private rooms. A room is joined by its code; there is no public matchmaking.
import { get } from './store.js';

/** Where rooms live: the same site (Node server) unless public/config.js points at a Cloudflare Worker. */
function serverBase() {
  const cfg = typeof window !== 'undefined' ? window.OPENCHESS_SERVER : '';
  if (cfg) return cfg.replace(/\/$/, '');
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
export const cleanCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').slice(0, 8);
export const validCode = (s) => /^[A-HJKMNP-Z2-9]{4,8}$/.test(s);

export class Net {
  constructor() {
    this.ws = null; this.handlers = new Map();
    this.code = null; this.hello = null; // what to say when (re)connecting
    this.open = false; this.retry = 0; this.failed = 0; this.unavailable = false; this.closing = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }
  #emit(type, msg) { [...(this.handlers.get(type) ?? [])].forEach((f) => f(msg)); }

  /**
   * Connect to a room. `role`: 'host' (settings: time, inc, color) or 'join'; `token` rejoins a game in progress.
   * Resolves nothing: listen for 'waiting', 'game' and 'error'.
   */
  enter(code, { role, time, inc, color, token } = {}) {
    this.leave();
    const { player, ratings } = get();
    this.code = code; this.closing = false; this.unavailable = false; this.failed = 0; this.retry = 0;
    this.hello = { t: 'hello', id: player.id, name: player.name, rating: ratings.online.r, role, time, inc, color, token };
    this.#connect();
  }

  #connect() {
    if (this.closing || !this.code) return;
    const ws = new WebSocket(`${serverBase()}/ws/${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true; this.retry = 0; this.failed = 0;
      ws.send(JSON.stringify(this.hello));
      this.#emit('open', {});
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'game' && m.token) this.hello = { ...this.hello, token: m.token, role: this.hello.role }; // reconnect into this game
      this.#emit(m.t, m);
    };
    ws.onclose = () => {
      const wasOpen = this.open; this.open = false;
      this.#emit('close', {});
      if (this.closing) return;
      if (!wasOpen && ++this.failed >= 3) { this.unavailable = true; this.closing = true; this.#emit('unavailable', {}); return; }
      setTimeout(() => this.#connect(), Math.min(8000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }

  send(msg) { if (this.open) this.ws.send(JSON.stringify(msg)); }

  leave() {
    this.closing = true;
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch { /* ignore */ } }
    this.ws = null; this.open = false; this.code = null;
  }
}

export const net = new Net();
