// Online play: authoritative games, clocks, matchmaking and private invite rooms.
// No accounts: a player is just a random id + display name chosen by the browser.
import { Chess } from 'chess.js';
import { randomBytes } from 'node:crypto';

export const TIME_CONTROLS = [
  [1, 0], [3, 0], [3, 2], [5, 0], [5, 3], [10, 0], [10, 5], [15, 10], [30, 0],
];
const tcAllowed = (time, inc) => TIME_CONTROLS.some(([t, i]) => t === time && i === inc);

const RECONNECT_GRACE_MS = 45_000;
const FIRST_MOVE_TIMEOUT_MS = 60_000;
const FINISHED_KEEP_MS = 15 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const token = () => randomBytes(12).toString('hex');
const makeCode = () => Array.from(randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const other = (c) => (c === 'w' ? 'b' : 'w');

export function cleanName(name) {
  const n = String(name ?? '').replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, 20);
  return n || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}
export function cleanRating(r) {
  const n = Math.round(Number(r));
  return Number.isFinite(n) ? Math.max(100, Math.min(3000, n)) : 1000;
}

/** Whether `color` could ever deliver mate with the material it has left. */
function hasMatingMaterial(chess, color) {
  let minors = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color) continue;
      if (sq.type === 'p' || sq.type === 'r' || sq.type === 'q') return true;
      if (sq.type === 'n' || sq.type === 'b') minors++;
    }
  }
  return minors >= 2;
}

export class Game {
  constructor(id, white, black, time, inc, { onEnd, now = () => Date.now() } = {}) {
    this.id = id;
    this.now = now;
    this.onEnd = onEnd;
    this.time = time;
    this.inc = inc;
    this.chess = new Chess();
    this.players = { w: { ...white, token: token() }, b: { ...black, token: token() } };
    this.sockets = { w: null, b: null };
    this.clocks = { w: time * 60_000, b: time * 60_000 };
    this.turnStartedAt = null;
    this.status = 'playing'; // playing | over
    this.result = '*';
    this.reason = '';
    this.drawOffer = null;
    this.flagTimer = null;
    this.graceTimers = { w: null, b: null };
    this.createdAt = now();
    this.moves = []; // [{san, from, to}]
    this.#armFirstMoveTimer();
  }

  get turn() { return this.chess.turn(); }
  get ply() { return this.moves.length; }
  get clockRunning() { return this.status === 'playing' && this.ply >= 2; }

  liveClocks() {
    const c = { ...this.clocks };
    if (this.clockRunning && this.turnStartedAt != null) {
      c[this.turn] = Math.max(0, c[this.turn] - (this.now() - this.turnStartedAt));
    }
    return c;
  }

  publicState(color) {
    return {
      t: 'game',
      gameId: this.id,
      token: color ? this.players[color].token : undefined,
      color,
      fen: this.chess.fen(),
      moves: this.moves.map((m) => m.san),
      white: { name: this.players.w.name, rating: this.players.w.rating },
      black: { name: this.players.b.name, rating: this.players.b.rating },
      time: this.time,
      inc: this.inc,
      clocks: this.liveClocks(),
      status: this.status,
      result: this.result,
      reason: this.reason,
      pgn: this.status === 'over' ? this.pgn() : undefined,
      drawOffer: this.drawOffer,
    };
  }

  attach(color, send) {
    this.sockets[color] = send;
    clearTimeout(this.graceTimers[color]);
    this.graceTimers[color] = null;
    send(this.publicState(color));
    this.#sendTo(other(color), { t: 'opp_status', connected: true });
  }

  detach(color, send) {
    if (this.sockets[color] !== send) return;
    this.sockets[color] = null;
    if (this.status !== 'playing') return;
    this.#sendTo(other(color), { t: 'opp_status', connected: false, graceMs: RECONNECT_GRACE_MS });
    clearTimeout(this.graceTimers[color]);
    this.graceTimers[color] = setTimeout(() => {
      if (this.status === 'playing' && !this.sockets[color]) {
        if (this.ply < 2) this.#finish('*', 'aborted');
        else this.#finish(color === 'w' ? '0-1' : '1-0', 'abandoned');
      }
    }, RECONNECT_GRACE_MS);
    this.graceTimers[color].unref?.();
  }

  move(color, { from, to, promotion }) {
    if (this.status !== 'playing') return 'Game is over';
    if (color !== this.turn) return 'Not your turn';
    // Flag check before accepting the move.
    if (this.clockRunning) {
      const left = this.clocks[color] - (this.now() - this.turnStartedAt);
      if (left <= 0) { this.#flag(color); return 'Out of time'; }
    }
    let m;
    try {
      m = this.chess.move({ from, to, promotion });
    } catch { return 'Illegal move'; }
    const now = this.now();
    if (this.ply >= 2) { // clock was running for the mover
      this.clocks[color] = this.clocks[color] - (now - this.turnStartedAt) + this.inc * 1000;
    }
    this.moves.push({ san: m.san, from: m.from, to: m.to });
    this.drawOffer = null;
    clearTimeout(this.firstMoveTimer);
    this.turnStartedAt = now;
    this.#armFlagTimer();
    this.#broadcast({
      t: 'move', san: m.san, from: m.from, to: m.to, fen: this.chess.fen(),
      clocks: this.liveClocks(), ply: this.ply,
    });
    this.#checkEnd();
    return null;
  }

  resign(color) {
    if (this.status !== 'playing') return;
    if (this.ply < 2) return this.#finish('*', 'aborted');
    this.#finish(color === 'w' ? '0-1' : '1-0', 'resignation');
  }

  draw(color, action) {
    if (this.status !== 'playing' || this.ply < 2) return;
    if (action === 'offer') {
      if (this.drawOffer === color) return;
      if (this.drawOffer === other(color)) return this.#finish('1/2-1/2', 'agreement');
      this.drawOffer = color;
      this.#sendTo(other(color), { t: 'draw_offer' });
    } else if (action === 'accept' && this.drawOffer === other(color)) {
      this.#finish('1/2-1/2', 'agreement');
    } else if (action === 'decline' && this.drawOffer === other(color)) {
      this.drawOffer = null;
      this.#sendTo(other(color), { t: 'draw_declined' });
    }
  }

  pgn() {
    const c = new Chess();
    c.setHeader('Event', 'OpenChess online game');
    c.setHeader('Site', 'openchess');
    c.setHeader('Date', new Date(this.createdAt).toISOString().slice(0, 10).replaceAll('-', '.'));
    c.setHeader('White', this.players.w.name);
    c.setHeader('Black', this.players.b.name);
    c.setHeader('WhiteElo', String(this.players.w.rating));
    c.setHeader('BlackElo', String(this.players.b.rating));
    c.setHeader('TimeControl', `${this.time * 60}+${this.inc}`);
    c.setHeader('Result', this.result);
    for (const m of this.moves) c.move(m.san);
    return c.pgn();
  }

  dispose() {
    clearTimeout(this.flagTimer);
    clearTimeout(this.firstMoveTimer);
    clearTimeout(this.graceTimers.w);
    clearTimeout(this.graceTimers.b);
  }

  // --- internals ---
  #sendTo(color, msg) { this.sockets[color]?.(msg); }
  #broadcast(msg) { this.#sendTo('w', msg); this.#sendTo('b', msg); }

  #armFirstMoveTimer() {
    this.firstMoveTimer = setTimeout(() => {
      if (this.status === 'playing' && this.ply < 2) this.#finish('*', 'aborted');
    }, FIRST_MOVE_TIMEOUT_MS);
    this.firstMoveTimer.unref?.();
  }

  #armFlagTimer() {
    clearTimeout(this.flagTimer);
    if (!this.clockRunning) return;
    const color = this.turn;
    this.flagTimer = setTimeout(() => this.#flag(color), Math.max(0, this.clocks[color]) + 30);
    this.flagTimer.unref?.();
  }

  #flag(color) {
    if (this.status !== 'playing') return;
    const winner = other(color);
    if (!hasMatingMaterial(this.chess, winner)) this.#finish('1/2-1/2', 'timeout vs insufficient material');
    else this.#finish(winner === 'w' ? '1-0' : '0-1', 'timeout');
  }

  #checkEnd() {
    const c = this.chess;
    if (c.isCheckmate()) return this.#finish(c.turn() === 'w' ? '0-1' : '1-0', 'checkmate');
    if (c.isStalemate()) return this.#finish('1/2-1/2', 'stalemate');
    if (c.isInsufficientMaterial()) return this.#finish('1/2-1/2', 'insufficient material');
    if (c.isThreefoldRepetition()) return this.#finish('1/2-1/2', 'threefold repetition');
    if (c.isDrawByFiftyMoves()) return this.#finish('1/2-1/2', 'fifty-move rule');
  }

  #finish(result, reason) {
    if (this.status !== 'playing') return;
    if (this.clockRunning && this.turnStartedAt != null) {
      this.clocks = this.liveClocks();
    }
    this.status = 'over';
    this.result = result;
    this.reason = reason;
    this.drawOffer = null;
    clearTimeout(this.flagTimer);
    clearTimeout(this.firstMoveTimer);
    this.#broadcast({
      t: 'over', result, reason, pgn: this.pgn(), clocks: this.clocks, aborted: reason === 'aborted',
    });
    this.onEnd?.(this);
  }
}

export class Lobby {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.games = new Map(); // id -> Game
    this.seeks = []; // {conn, time, inc}
    this.invites = new Map(); // code -> {conn, time, inc, color}
    this.conns = new Set();
  }

  stats() {
    let playing = 0;
    for (const g of this.games.values()) if (g.status === 'playing') playing++;
    return { online: this.conns.size, playing, seeking: this.seeks.length };
  }

  /** A `conn` is { send(msg), pid, name, rating, game?, color? } */
  add(conn) { this.conns.add(conn); }

  remove(conn) {
    this.conns.delete(conn);
    this.cancel(conn);
    if (conn.game) conn.game.detach(conn.color, conn.send);
  }

  cancel(conn) {
    this.seeks = this.seeks.filter((s) => s.conn !== conn);
    for (const [code, inv] of this.invites) if (inv.conn === conn) this.invites.delete(code);
  }

  seek(conn, time, inc) {
    if (!tcAllowed(time, inc)) return 'Unsupported time control';
    if (conn.game?.status === 'playing') return 'Already in a game';
    this.cancel(conn);
    // pick the closest-rated compatible opponent who isn't the same person
    let best = -1; let bestDiff = Infinity;
    this.seeks.forEach((s, i) => {
      if (s.time !== time || s.inc !== inc || s.conn.pid === conn.pid) return;
      const d = Math.abs(s.conn.rating - conn.rating);
      if (d < bestDiff) { best = i; bestDiff = d; }
    });
    if (best >= 0) {
      const [opp] = this.seeks.splice(best, 1);
      const flip = Math.random() < 0.5;
      this.#start(flip ? conn : opp.conn, flip ? opp.conn : conn, time, inc);
    } else {
      this.seeks.push({ conn, time, inc });
      conn.send({ t: 'waiting', kind: 'seek', time, inc });
    }
    return null;
  }

  createInvite(conn, time, inc, color) {
    if (!tcAllowed(time, inc)) return 'Unsupported time control';
    if (conn.game?.status === 'playing') return 'Already in a game';
    this.cancel(conn);
    let code; do { code = makeCode(); } while (this.invites.has(code));
    this.invites.set(code, { conn, time, inc, color: ['w', 'b'].includes(color) ? color : 'random' });
    conn.send({ t: 'waiting', kind: 'invite', code, time, inc });
    return null;
  }

  joinInvite(conn, code) {
    code = String(code ?? '').toUpperCase().trim();
    const inv = this.invites.get(code);
    if (!inv || !this.conns.has(inv.conn)) return 'That invite link has expired';
    if (inv.conn === conn || inv.conn.pid === conn.pid) return "You can't join your own invite";
    if (conn.game?.status === 'playing') return 'Already in a game';
    this.invites.delete(code);
    this.cancel(conn);
    const hostWhite = inv.color === 'w' ? true : inv.color === 'b' ? false : Math.random() < 0.5;
    if (hostWhite) this.#start(inv.conn, conn, inv.time, inv.inc);
    else this.#start(conn, inv.conn, inv.time, inv.inc);
    return null;
  }

  rejoin(conn, gameId, tok) {
    const g = this.games.get(gameId);
    if (!g) return 'Game not found';
    const color = ['w', 'b'].find((c) => g.players[c].token === tok);
    if (!color) return 'Invalid game token';
    if (conn.game && conn.game !== g) conn.game.detach(conn.color, conn.send);
    conn.game = g; conn.color = color;
    g.attach(color, conn.send);
    return null;
  }

  sweep() {
    const t = this.now();
    for (const [id, g] of this.games) {
      if (g.status === 'over' && t - (g.endedAt ?? 0) > FINISHED_KEEP_MS) { g.dispose(); this.games.delete(id); }
    }
  }

  #start(whiteConn, blackConn, time, inc) {
    const id = randomBytes(6).toString('hex');
    const g = new Game(
      id,
      { pid: whiteConn.pid, name: whiteConn.name, rating: whiteConn.rating },
      { pid: blackConn.pid, name: blackConn.name, rating: blackConn.rating },
      time, inc,
      { now: this.now, onEnd: (game) => { game.endedAt = this.now(); } },
    );
    this.games.set(id, g);
    for (const [conn, color] of [[whiteConn, 'w'], [blackConn, 'b']]) {
      if (conn.game && conn.game !== g) conn.game.detach(conn.color, conn.send);
      conn.game = g; conn.color = color;
      g.attach(color, conn.send);
    }
    return g;
  }
}
