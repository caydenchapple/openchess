// A private room: one host, one guest, one game. Players meet ONLY by sharing the room code — there is no public matchmaking.
// Used by the Node server (one Room per code in memory) and by the Cloudflare Durable Object (one Room per object).
import { Game, tcAllowed, cleanName, cleanRating, newToken, other } from './game.js';

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJKMNP-Z2-9]{4,8}$/;
export const makeCode = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

const WAIT_FOR_GUEST_MS = 15 * 60_000;
const KEEP_FINISHED_MS = 15 * 60_000;

/** A `conn` is { send(msg), pid, name, rating, color }. */
export class Room {
  constructor(code, { now = () => Date.now(), onClose } = {}) {
    this.code = code;
    this.now = now;
    this.onClose = onClose;
    this.conns = new Set();
    this.host = null; // the hosting connection while the room waits for a guest
    this.hostPid = null;
    this.settings = null; // { time, inc, color }
    this.game = null;
    this.timer = null;
    this.createdAt = now();
  }

  get state() { return this.game ? this.game.status : this.settings ? 'waiting' : 'new'; }

  /** First message of every connection. Returns an error string or null. */
  hello(conn, m) {
    conn.pid = String(m.id ?? '').replace(/[^\w-]/g, '').slice(0, 40);
    if (!conn.pid) return 'Missing player id';
    conn.name = cleanName(m.name);
    conn.rating = cleanRating(m.rating);

    // coming back to a game in progress (reload, lost connection)
    if (this.game && m.token) {
      const color = ['w', 'b'].find((c) => this.game.players[c].token === m.token);
      if (!color) return 'Invalid game token';
      this.#attach(conn, color);
      return null;
    }

    if (m.role === 'host') {
      if (this.game) return 'That code is already in use. Try a new one.';
      if (this.settings && this.hostPid !== conn.pid) return 'That code is already in use. Try a new one.';
      const time = Number(m.time); const inc = Number(m.inc);
      if (!tcAllowed(time, inc)) return 'Unsupported time control';
      this.settings = { time, inc, color: ['w', 'b'].includes(m.color) ? m.color : 'random' };
      this.hostPid = conn.pid;
      this.host = conn;
      this.conns.add(conn);
      this.#armWaitTimer();
      conn.send({ t: 'waiting', code: this.code, ...this.settings });
      return null;
    }

    if (m.role === 'join') {
      if (!this.settings) return 'No game with that code. Check the letters and ask your friend to host again.';
      if (this.game) return 'That game already has two players.';
      if (!this.host || !this.conns.has(this.host)) return 'The host left. Ask your friend to host again.';
      if (conn.pid === this.hostPid) return "You can't join your own game from the same browser.";
      this.conns.add(conn);
      this.#start(conn);
      return null;
    }
    return 'Unknown request';
  }

  /** Every later message. Returns an error string or null. */
  message(conn, m) {
    const g = this.game;
    switch (m.t) {
      case 'move':
        if (!g || !conn.color) return 'No active game';
        return g.move(conn.color, { from: String(m.from), to: String(m.to), promotion: m.promotion ? String(m.promotion).slice(0, 1) : undefined });
      case 'resign': g?.resign(conn.color); return null;
      case 'draw': g?.draw(conn.color, String(m.action)); return null;
      case 'takeback': return g ? g.takebackAction(conn.color, String(m.action)) : null;
      case 'leave': this.remove(conn); return null;
      default: return null;
    }
  }

  remove(conn) {
    this.conns.delete(conn);
    if (this.game && conn.color) this.game.detach(conn.color, conn.send);
    if (this.host === conn) this.host = null;
    this.#maybeClose();
  }

  dispose() {
    clearTimeout(this.timer);
    this.game?.dispose();
  }

  // --- internals ---
  #start(guest) {
    const { time, inc, color } = this.settings;
    const hostWhite = color === 'w' ? true : color === 'b' ? false : Math.random() < 0.5;
    const [w, b] = hostWhite ? [this.host, guest] : [guest, this.host];
    const mk = (c) => ({ pid: c.pid, name: c.name, rating: c.rating });
    this.game = new Game(newToken().slice(0, 12), mk(w), mk(b), time, inc, { now: this.now, onEnd: () => { this.endedAt = this.now(); this.#armCloseTimer(); } });
    clearTimeout(this.timer);
    this.#attach(w, 'w');
    this.#attach(b, 'b');
  }

  #attach(conn, color) {
    // a reconnecting player replaces their old connection
    for (const old of this.conns) if (old !== conn && old.color === color) { this.conns.delete(old); }
    this.conns.add(conn);
    conn.color = color;
    this.game.attach(color, conn.send);
  }

  #armWaitTimer() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (!this.game) this.#close(); }, WAIT_FOR_GUEST_MS);
    this.timer.unref?.();
  }
  #armCloseTimer() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#close(), KEEP_FINISHED_MS);
    this.timer.unref?.();
  }
  #maybeClose() {
    if (this.conns.size === 0 && this.game?.status === 'over') this.#close();
  }
  #close() {
    this.dispose();
    this.onClose?.(this);
  }
}

export { other };
