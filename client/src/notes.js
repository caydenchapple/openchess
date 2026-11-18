// Move-by-move notes for the review: what a move does (forks, pins, threats, sacrifices) and, for mistakes, what went wrong and
// what was missed. Plain rules of chess on top of Stockfish's numbers; no AI model, no network.
import { Chess } from 'chess.js';
import { uciToMove } from './analysis-core.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const DIRS = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
DIRS.q = [...DIRS.b, ...DIRS.r];
const FILES = 'abcdefgh';
const at = (f, r) => (f < 0 || f > 7 || r < 0 || r > 7 ? null : `${FILES[f]}${r + 1}`);
const an = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const nameOn = (p, sq) => `${NAME[p.type]} on ${sq}`;
const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pct = (x) => `${Math.round(x)}%`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const flip = (c) => (c === 'w' ? 'b' : 'w');

/** First one or two pieces met going from `sq` in direction `d`. */
function firstTwo(c, sq, d) {
  const out = [];
  let f = FILES.indexOf(sq[0]) + d[0]; let r = Number(sq[1]) - 1 + d[1];
  while (out.length < 2) {
    const s = at(f, r);
    if (!s) break;
    const p = c.get(s);
    if (p) out.push({ ...p, square: s });
    f += d[0]; r += d[1];
  }
  return out;
}

/** Enemy slider attacks on valuable pieces: [{ attacker, from, target, to }] (used for discovered attacks). */
function sliderHits(c, color) {
  const hits = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== color || !DIRS[p.type]) continue;
      for (const d of DIRS[p.type]) {
        const [a] = firstTwo(c, p.square, d);
        if (a && a.color !== color && VAL[a.type] >= 5) hits.push({ from: p.square, target: a.square });
      }
    }
  }
  return hits;
}

/**
 * What the move just played (`uci`, in `fenBefore`) does to the opponent: short phrases such as
 * "forks the rook on a8 and the knight on c6" or "pins the knight on c6 to the queen on d8".
 */
export function motifs(fenBefore, uci) {
  const before = new Chess(fenBefore);
  const m = uciToMove(fenBefore, uci);
  if (!m) return [];
  const mover = m.color; const enemy = flip(mover);
  const c = new Chess(fenBefore); c.move({ from: m.from, to: m.to, promotion: m.promotion });
  const out = [];
  const piece = c.get(m.to);
  if (c.isCheckmate()) return ['checkmates the king'];

  // forks: the moved piece hits several things that are loose or worth more than it
  const targets = [];
  for (const row of c.board()) {
    for (const t of row) {
      if (!t || t.color !== enemy || t.type === 'k') continue;
      if (!c.attackers(t.square, mover).includes(m.to)) continue;
      const loose = !c.attackers(t.square, enemy).length;
      if (loose || VAL[t.type] > VAL[piece.type]) targets.push({ ...t, loose });
    }
  }
  const check = c.inCheck();
  if (targets.length + (check ? 1 : 0) >= 2) {
    const bits = targets.map((t) => nameOn(t, t.square));
    out.push(check ? `gives check and attacks the ${list(bits)}` : `forks the ${list(bits)}`);
  } else if (targets.length === 1) {
    const t = targets[0];
    out.push(t.loose ? `attacks the undefended ${nameOn(t, t.square)}` : `attacks the ${nameOn(t, t.square)}`);
  } else if (check) out.push('gives check');

  // pins and skewers by a bishop, rook or queen
  if (DIRS[piece.type]) {
    const allowed = piece.type === 'q' ? DIRS.q : DIRS[piece.type];
    for (const d of allowed) {
      const [a, b] = firstTwo(c, m.to, d);
      if (!a || !b || a.color !== enemy || b.color !== enemy) continue;
      if (VAL[b.type] > VAL[a.type]) out.push(`pins the ${nameOn(a, a.square)} to the ${nameOn(b, b.square)}`);
      else if (VAL[a.type] > VAL[b.type] && VAL[a.type] >= 5) out.push(`skewers the ${nameOn(a, a.square)}, winning the ${nameOn(b, b.square)} behind it`);
    }
  }

  // discovered attack: moving away opens another piece's line to something valuable
  const hitsBefore = new Set(sliderHits(before, mover).map((h) => `${h.from}${h.target}`));
  const discovered = sliderHits(c, mover).filter((h) => h.from !== m.to && !hitsBefore.has(`${h.from}${h.target}`));
  if (discovered.length) {
    const t = c.get(discovered[0].target);
    out.push(`uncovers an attack from the ${nameOn(c.get(discovered[0].from), discovered[0].from)} on the ${nameOn(t, discovered[0].target)}`);
  }
  if (m.captured && !out.length) {
    const defended = c.attackers(m.to, enemy).length > 0;
    out.push(defended ? `captures a ${NAME[m.captured]}` : `wins a ${NAME[m.captured]} that was not defended`);
  }
  return [...new Set(out)];
}

/** Pieces of `color` that are attacked and not adequately defended: [{ type, square }]. */
function loose(c, color) {
  const out = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const att = c.attackers(p.square, flip(color));
      if (!att.length) continue;
      const defended = c.attackers(p.square, color).length > 0;
      const cheapest = Math.min(...att.map((a) => VAL[c.get(a).type]));
      if (!defended || cheapest < VAL[p.type]) out.push({ type: p.type, square: p.square, undefended: !defended });
    }
  }
  return out;
}

/** Short description of a quiet move: development, castling, centre, activity. */
export function quietIdea(m) {
  if (!m) return '';
  if (m.san.startsWith('O-O')) return 'castles, getting the king to safety and bringing a rook into play';
  if (m.promotion) return `promotes to a ${NAME[m.promotion]}`;
  const back = m.color === 'w' ? '1' : '8';
  if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === back) return `develops the ${NAME[m.piece]}`;
  if (m.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(m.to)) return 'takes space in the centre';
  if (m.piece === 'p') return 'advances a pawn';
  if (m.piece === 'r' && ['d', 'e', 'c'].includes(m.to[0])) return 'puts the rook on a more active file';
  if (m.piece === 'k') return 'tidies up the king';
  if (m.piece === 'q') return 'repositions the queen';
  return `improves the ${NAME[m.piece]}`;
}

/** What the engine's best move would have done (tactical phrases first, then a quiet description). */
function whatItDoes(fen, uci) {
  const mo = motifs(fen, uci);
  if (mo.length) return mo[0];
  return quietIdea(uciToMove(fen, uci));
}

/**
 * The note shown under the board for one move.
 * @param {object} ply review ply
 * @param {{fenBefore:string, fenAfter:string, mine:boolean, openingName?:string}} ctx
 * @returns {string[]} sentences (the UI joins them)
 */
export function moveNote(ply, { fenBefore, fenAfter, mine, openingName, withLine = false }) {
  const played = uciToMove(fenBefore, ply.uci);
  const best = ply.bestUci ? uciToMove(fenBefore, ply.bestUci) : null;
  const reply = ply.refute ? uciToMove(fenAfter, ply.refute) : null;
  const who = mine ? 'You' : 'Your opponent';
  const my = mine ? 'your' : 'their';
  const out = [];
  const mo = played ? motifs(fenBefore, ply.uci) : [];
  const idea = mo[0] ?? quietIdea(played);

  switch (ply.cls) {
    case 'brilliant': {
      const d = ply.sac?.deficit ?? 3;
      const what = d >= 8 ? 'a queen\'s worth of material' : d >= 5 ? 'a rook\'s worth of material' : 'a piece';
      out.push(`${mine ? 'Brilliant! You' : 'A brilliant move: they'} offered ${what}${played ? ` with ${played.san}` : ''}. ${reply?.captured ? `${reply.san} wins ${an(NAME[reply.captured])} ${NAME[reply.captured]}, but` : 'It looks like a loss of material, but'} the engine shows it is the strongest idea.`);
      if (ply.cpAfter >= 9000 - 1100 || /#/.test(ply.pvSan?.join(' ') ?? '')) out.push('The sacrifice leads to checkmate.');
      else out.push(`It pays off: ${my} position is ${pct(ply.wpAfter)} to win afterwards.`);
      if (withLine && ply.pvSan?.length > 1) out.push(`The idea: ${ply.pvSan.join(' ')}.`);
      break;
    }
    case 'great': {
      const alt = ply.altUci ? uciToMove(fenBefore, ply.altUci) : null;
      out.push(`${mine ? 'Great find!' : 'A great move by your opponent.'} ${ply.san} was the only move that keeps ${my} position together${idea ? ` — it ${idea}` : ''}.`);
      if (alt && ply.altGap != null) out.push(`The next-best move, ${alt.san}, would have cost about ${Math.round(ply.altGap)} points of winning chances.`);
      break;
    }
    case 'best':
      out.push(`${cap(ply.san)} was the best move${idea ? `: it ${idea}` : ''}.`);
      break;
    case 'excellent':
    case 'good': {
      out.push(`${ply.cls === 'excellent' ? 'An excellent' : 'A good'} move${idea ? ` — it ${idea}` : ''}.`);
      if (best && best.san !== ply.san) out.push(`The engine's top choice was ${best.san}${whatItDoes(fenBefore, ply.bestUci) ? ` (it ${whatItDoes(fenBefore, ply.bestUci)})` : ''}, but ${ply.san} is nearly as good.`);
      break;
    }
    case 'book':
      out.push(`A book move${openingName ? ` in the ${openingName}` : ''}: well-known opening theory.`);
      break;
    default: { // inaccuracy, mistake, miss, blunder
      const label = ply.cls === 'miss' ? 'a missed chance' : an(ply.cls) + ' ' + ply.cls;
      out.push(`${ply.san} was ${label}: ${my} winning chances went from ${pct(ply.wpBefore)} to ${pct(ply.wpAfter)}.`);
      const tags = ply.tags ?? [];
      const c = new Chess(fenAfter);
      const hung = loose(c, played?.color ?? 'w').filter((p) => p.square === played?.to || reply?.to === p.square);
      let bestSaid = false;
      if (tags.includes('allowed-mate')) {
        out.push(`It allows a forced checkmate${reply ? `, starting with ${reply.san}` : ''}.`);
        if (best) { const bi = whatItDoes(fenBefore, ply.bestUci); out.push(`${best.san} kept you safe${bi ? ` (it ${bi})` : ''}.`); bestSaid = true; }
      }
      else if (reply?.captured && (VAL[reply.captured] >= 3 || ply.loss >= 15)) {
        const rm = motifs(fenAfter, ply.refute);
        out.push(reply.to === played?.to
          ? `The ${NAME[played.piece]} on ${played.to} can simply be taken: ${reply.san} wins ${an(NAME[reply.captured])} ${NAME[reply.captured]}${rm.length > 1 ? ` and ${rm[1]}` : ''}.`
          : `It leaves the ${NAME[reply.captured]} on ${reply.to} unprotected, and ${reply.san} wins it.`);
      } else if (reply) {
        const rm = motifs(fenAfter, ply.refute);
        if (rm.length) out.push(`${cap(ply.color === 'w' ? 'Black' : 'White')} gets ${reply.san}, which ${rm[0]}.`);
        else if (hung.length) out.push(`The ${nameOn(hung[0], hung[0].square)} is left ${hung[0].undefended ? 'undefended' : 'attacked by a cheaper piece'}.`);
      }
      if (best && !bestSaid) {
        const bi = whatItDoes(fenBefore, ply.bestUci);
        const verb = ply.cls === 'miss' ? 'You could have played' : mine ? 'Better was' : 'Better for them was';
        out.push(`${verb} ${best.san}${bi ? `, which ${bi}` : ''}.`);
        if (withLine && ply.pvSan?.length > 2) out.push(`A likely continuation: ${ply.pvSan.join(' ')}.`);
      }
      if (tags.includes('blown-advantage') && !out.some((s) => /advantage/.test(s))) out.push(`You were ${ply.cpBefore >= 250 ? 'clearly winning' : 'better'} before this move — keep pieces safe and trade when ahead.`);
      if (ply.cls === 'miss' && !mine) break;
      if (mine && ply.phase === 'opening' && ply.loss >= 5) out.push('In the opening, finish developing your pieces and fight for the centre before starting side-plans.');
      if (mine && ply.phase === 'endgame' && ply.loss >= 5) out.push('In endgames, activate your king and calculate pawn races exactly.');
    }
  }
  return out;
}

/** Highlights of the player's game: their brilliant and great moves. */
export function highlights(review, color) {
  return review.plies.filter((p) => p.color === color && (p.cls === 'brilliant' || p.cls === 'great')).slice(0, 4).map((p) => p.i);
}
