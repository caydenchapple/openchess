// One online game: moves checked with chess.js, server-side clocks, resign, draw offers and takebacks that the opponent must accept.
// Runs unchanged in Node (self-hosted server) and in a Cloudflare Durable Object.
import { Chess } from 'chess.js';

export const TIME_CONTROLS = [
  [1, 0], [3, 0], [3, 2], [5, 0], [5, 3], [10, 0], [10, 5], [15, 10], [30, 0],
];
export const tcAllowed = (time, inc) => TIME_CONTROLS.some(([t, i]) => t === time && i === inc);

export const RECONNECT_GRACE_MS = 45_000;
const FIRST_MOVE_TIMEOUT_MS = 60_000;
const MAX_TAKEBACKS = 3;

const hex = (n) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
export const newToken = () => hex(12);
export const other = (c) => (c === 'w' ? 'b' : 'w');

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
    this.players = { w: { ...white, token: newToken() }, b: { ...black, token: newToken() } };
    this.sockets = { w: null, b: null };
    this.clocks = { w: time * 60_000, b: time * 60_000 };
    this.turnStartedAt = null;
    this.status = 'playing'; // playing | over
    this.result = '*';
    this.reason = '';
    this.drawOffer = null;
    this.takeback = null; // { by: 'w'|'b' } while the opponent is deciding
    this.takebacksUsed = { w: 0, b: 0 };
    this.snaps = []; // snaps[n] = clock state when n half-moves had been played (so a takeback can restore it)
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
      takeback: this.takeback,
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
    if (this.clockRunning) {
      const left = this.clocks[color] - (this.now() - this.turnStartedAt);
      if (left <= 0) { this.#flag(color); return 'Out of time'; }
    }
    let m;
    try {
      m = this.chess.move({ from, to, promotion });
    } catch { return 'Illegal move'; }
    const now = this.now();
    this.snaps[this.ply] = { clocks: { ...this.clocks } };
    if (this.ply >= 2) { // clock was running for the mover
      this.clocks[color] = this.clocks[color] - (now - this.turnStartedAt) + this.inc * 1000;
    }
    this.moves.push({ san: m.san, from: m.from, to: m.to });
    this.drawOffer = null;
    if (this.takeback) { const by = this.takeback.by; this.takeback = null; this.#sendTo(by, { t: 'takeback_declined', reason: 'The position changed.' }); }
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

  /** How many half-moves would be undone if `color` takes back their last move. */
  takebackPlies(color) {
    const mine = this.moves.filter((_, i) => (i % 2 === 0) === (color === 'w')).length;
    if (!mine) return 0;
    return this.turn === color ? 2 : 1; // opponent already replied: undo their reply too
  }

  /** Takebacks need the opponent's OK: request → accept / decline. */
  takebackAction(color, action) {
    if (this.status !== 'playing') return 'Game is over';
    if (action === 'request') {
      if (this.takeback) return 'A takeback is already waiting for an answer';
      if (!this.takebackPlies(color)) return 'You have no move to take back';
      if (this.takebacksUsed[color] >= MAX_TAKEBACKS) return `You can ask for ${MAX_TAKEBACKS} takebacks per game`;
      this.takebacksUsed[color]++;
      this.takeback = { by: color };
      this.#sendTo(other(color), { t: 'takeback_request', plies: this.takebackPlies(color), by: color });
      return null;
    }
    if (!this.takeback) return null;
    const by = this.takeback.by;
    if (color === by) { // the asker changed their mind
      if (action === 'cancel') { this.takeback = null; this.#sendTo(other(color), { t: 'takeback_cancelled' }); }
      return null;
    }
    if (action === 'decline') {
      this.takeback = null;
      this.#sendTo(by, { t: 'takeback_declined', reason: 'Your opponent said no.' });
      return null;
    }
    if (action !== 'accept') return null;
    const n = this.takebackPlies(by);
    if (!n) { this.takeback = null; return null; }
    const target = this.ply - n;
    for (let i = 0; i < n; i++) this.chess.undo();
    this.moves.length = target;
    const snap = this.snaps[target];
    if (snap) this.clocks = { ...snap.clocks };
    this.snaps.length = target;
    this.turnStartedAt = this.now();
    this.takeback = null;
    this.drawOffer = null;
    this.#armFlagTimer();
    this.#broadcast({ t: 'takeback', fen: this.chess.fen(), moves: this.moves.map((m) => m.san), clocks: this.liveClocks(), ply: this.ply, by });
    return null;
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
    this.takeback = null;
    clearTimeout(this.flagTimer);
    clearTimeout(this.firstMoveTimer);
    this.#broadcast({
      t: 'over', result, reason, pgn: this.pgn(), clocks: this.clocks, aborted: reason === 'aborted',
    });
    this.onEnd?.(this);
  }
}
