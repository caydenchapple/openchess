// Thin wrapper joining chessground (board UI) with chess.js (rules).
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';
import { h, clear } from './util.js';

const full = (c) => (c === 'w' ? 'white' : 'black');

export function legalDests(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

export class Board {
  /**
   * @param {HTMLElement} el
   * @param {{orientation?:'w'|'b', onMove?:(m:{from:string,to:string,promotion?:string})=>void}} opts
   */
  constructor(el, { orientation = 'w', onMove } = {}) {
    this.el = el;
    this.onMove = onMove;
    this.chess = new Chess();
    this.canMove = null; // 'w' | 'b' | 'both' | null
    this.lastMove = null;
    this.cg = Chessground(el, {
      fen: this.chess.fen(),
      orientation: full(orientation),
      coordinates: true,
      animation: { enabled: true, duration: 160 },
      highlight: { lastMove: true, check: true },
      draggable: { showGhost: true, distance: 3 },
      selectable: { enabled: true },
      premovable: { enabled: false },
      drawable: { enabled: true, visible: true, autoShapes: [] },
      movable: { free: false, color: undefined, showDests: true, dests: new Map(), events: { after: (from, to) => this.#userMoved(from, to) } },
    });
  }

  get fen() { return this.chess.fen(); }
  get orientation() { return this.cg.state.orientation === 'white' ? 'w' : 'b'; }

  /** Show a FEN. `lastMove` = [from,to] */
  setPosition(fen, { lastMove = null } = {}) {
    this.chess = new Chess(fen);
    this.lastMove = lastMove;
    this.#sync();
  }

  /** Apply a move already known to be legal (remote or engine move). Returns the chess.js move. */
  applyMove(move) {
    const m = this.chess.move(move);
    this.lastMove = [m.from, m.to];
    this.#sync();
    return m;
  }

  setInteractive(who) { this.canMove = who; this.#sync(); }
  flip() { this.cg.toggleOrientation(); }
  setOrientation(c) { this.cg.set({ orientation: full(c) }); }

  setArrows(arrows) {
    // arrows: [{from,to,brush:'green'|'red'|'blue'|'paleBlue'}]
    this.cg.setAutoShapes(arrows.map((a) => ({ orig: a.from, dest: a.to, brush: a.brush ?? 'green' })));
  }

  #sync() {
    const turn = this.chess.turn();
    const movable = this.canMove === 'both' || this.canMove === turn;
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: full(turn),
      check: this.chess.inCheck() ? full(turn) : false,
      lastMove: this.lastMove ?? undefined,
      movable: {
        color: movable ? full(turn) : undefined,
        dests: movable ? legalDests(this.chess) : new Map(),
      },
    });
  }

  #userMoved(from, to) {
    const piece = this.chess.get(from);
    const needsPromo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
      && this.chess.moves({ verbose: true }).some((m) => m.from === from && m.to === to && m.promotion);
    if (!needsPromo) return this.onMove?.({ from, to });
    this.#askPromotion(to, piece.color, (promotion) => {
      if (!promotion) { this.#sync(); return; }
      this.onMove?.({ from, to, promotion });
    });
  }

  #askPromotion(square, color, done) {
    const roles = [['q', 'queen'], ['n', 'knight'], ['r', 'rook'], ['b', 'bishop']];
    const file = 'abcdefgh'.indexOf(square[0]);
    const flipped = this.orientation === 'b';
    const col = flipped ? 7 - file : file;
    const fromTop = (square[1] === '8') !== flipped;
    const wrap = h('div', { class: 'promo', style: { left: `${col * 12.5}%` , [fromTop ? 'top' : 'bottom']: '0' } });
    const close = (v) => { wrap.remove(); done(v); };
    const order = fromTop ? roles : [...roles].reverse();
    for (const [letter, role] of order) {
      const b = h('button', { type: 'button', 'aria-label': `Promote to ${role}`, onclick: () => close(letter) });
      b.append(h('piece', { class: `${role} ${full(color)}` }));
      wrap.append(b);
    }
    const backdrop = h('div', { class: 'promo-backdrop', onclick: () => { backdrop.remove(); close(null); } });
    this.el.append(backdrop, wrap);
    wrap.addEventListener('click', () => backdrop.remove());
  }

  destroy() { this.cg.destroy(); clear(this.el); }
}

/** Play the sound-worthy attributes of a move. */
export function moveKind(m, chess) {
  if (chess.isCheckmate()) return 'end';
  if (chess.inCheck()) return 'check';
  if (m.captured) return 'capture';
  if (m.san.startsWith('O-O')) return 'castle';
  return 'move';
}
