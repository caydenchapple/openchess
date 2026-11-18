// Pure game-review maths: turns raw engine evaluations into move classifications, accuracy,
// phase breakdown, estimated performance rating and mistake themes. No DOM, no workers.
import { Chess } from 'chess.js';
import { bookDepth, detectOpening } from './openings.js';
import { clamp, mean, round } from './util.js';
import { performanceFromAcpl } from './perf-model.js';

// Like Chess.com's Game Review: Brilliant (!!) = a sound sacrifice, Great (!) = the only move that keeps things together,
// Best / Excellent / Good = accurate, Book = known theory, Inaccuracy / Mistake / Blunder = costly, Miss = a chance left on the table.
export const CLASSES = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
/** Classes that count as "an error" for lessons, key moments and the mistake graph. */
export const ERROR_CLASSES = ['inaccuracy', 'mistake', 'miss', 'blunder'];
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE_CP = 10_000;

/** Convert an engine score (white POV) into centipawns, mapping mates to ±10000. */
export function scoreToCp(score) {
  if (score == null) return 0;
  if (score.mate != null) {
    return (score.mate > 0 ? 1 : -1) * (MATE_CP - Math.min(Math.abs(score.mate), 100) * 10);
  }
  return score.cp ?? 0;
}

/** Lichess' win-probability curve: centipawns → 0..100 for the side the cp is relative to. */
export function winPct(cp) {
  const c = clamp(cp, -1000, 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Per-move accuracy from win% lost (mover's perspective). */
export function moveAccuracy(loss) {
  return clamp(103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669, 0, 100);
}

export function classifyLoss(loss, isBest) {
  if (isBest) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
}

/** Mix of arithmetic and harmonic mean: punishes the odd disaster like Lichess does. */
export function aggregateAccuracy(accs) {
  if (!accs.length) return null;
  const arith = mean(accs);
  const harm = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return (arith + harm) / 2;
}

/** Estimated performance: a curve fitted to games between bots of known strength (see perf-model.js), shrunk toward your rating on short games. */
export function estimatePerformance(acpl, moves, prior = 100) {
  if (acpl == null || !moves) return null;
  return performanceFromAcpl(acpl, moves, prior);
}

function material(fen) {
  const board = fen.split(' ')[0];
  let w = 0; let b = 0;
  for (const ch of board) {
    const v = PIECE_VALUE[ch.toLowerCase()];
    if (!v || v === 1) continue;
    if (ch === ch.toUpperCase()) w += v; else b += v;
  }
  return w + b;
}

export function phaseOf(fen, ply) {
  const m = material(fen);
  if (m <= 26) return 'endgame';
  if (ply < 20) return 'opening';
  return 'middlegame';
}

/** UCI string → chess.js move on a given FEN (or null). */
export function uciToMove(fen, uci) {
  if (!uci || uci.length < 4) return null;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch { return null; }
}

export function pvToSan(fen, pv, max = 6) {
  const c = new Chess(fen);
  const out = [];
  for (const u of (pv ?? []).slice(0, max)) {
    try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; }
  }
  return out;
}


/** Material (pawn=1 … queen=9) from `color`'s point of view in a FEN. */
function materialFor(fen, color) {
  let d = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = PIECE_VALUE[ch.toLowerCase()];
    if (!v) continue;
    d += (ch === ch.toUpperCase()) === (color === 'w') ? v : -v;
  }
  return d;
}

/**
 * Was this move a real sacrifice? Follow the engine's line: after the move and the reply, is the mover at least a minor piece
 * down, and (unless it ends in mate) still down something a few moves later? Returns the piece given up, or null.
 */
export function sacrificeOf(fenBefore, uci, pv, color) {
  if (!pv?.length || pv[0] !== uci) return null;
  const c = new Chess(fenBefore);
  const start = materialFor(fenBefore, color);
  const at = [];
  for (const u of pv.slice(0, 6)) {
    try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; }
    at.push(materialFor(c.fen(), color) - start);
  }
  if (at.length < 2) return null;
  const afterReply = at[1];
  const later = at.length >= 4 ? at[at.length - (at.length % 2 === 0 ? 1 : 2)] : afterReply; // judged after one of the opponent's moves
  const ends = c.isCheckmate();
  if (afterReply > -2.5) return null;
  if (!ends && later > -1.5) return null; // wins the material straight back: an exchange, not a sacrifice
  const moved = new Chess(fenBefore).get(uci.slice(0, 2));
  const m = uciToMove(fenBefore, uci);
  return { piece: moved?.type ?? 'p', captured: m?.captured ?? null, net: afterReply, deficit: Math.round(-Math.min(...at)) };
}

/**
 * @param {object} p
 * @param {string[]} p.fens       fens[0] = start, fens[i+1] = after ply i
 * @param {object[]} p.moves      chess.js verbose moves (san, from, to, promotion, color)
 * @param {object[]} p.evals      evals[i] for fens[i]: { cp (white POV, mates → ±10000), mate?, best (uci), pv (uci[]) }
 * @param {'w'|'b'} p.playerColor
 * @param {{w:number,b:number}} p.priorRating
 */
export function buildReview({ fens, moves, evals, playerColor, priorRating = { w: 100, b: 100 } }) {
  const sans = moves.map((m) => m.san);
  const book = bookDepth(sans);
  const opening = detectOpening(sans);
  const plies = [];
  const tagsFor = [];

  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    const color = mv.color;
    const sign = color === 'w' ? 1 : -1;
    const before = evals[i];
    const after = evals[i + 1];
    const cpBefore = sign * before.cp;
    const cpAfter = sign * after.cp;
    const wpBefore = winPct(cpBefore);
    const wpAfter = winPct(cpAfter);
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const isBest = before.best === uci;
    let loss = Math.max(0, wpBefore - wpAfter);
    if (isBest) loss = Math.min(loss, 1);
    let cls = classifyLoss(loss, isBest);
    if (i < book && loss < 5 && cls !== 'best') cls = 'book';
    if (i < book && isBest) cls = 'book';
    // Great: the only move that holds the position together (the next best one is clearly worse)
    let altGap = null;
    if (before.alt && isBest) altGap = wpBefore - winPct(sign * before.alt.cp);
    const recapture = i > 0 && mv.captured && moves[i - 1].captured && moves[i - 1].to === mv.to; // taking back is obvious, not great
    if (cls === 'best' && !recapture && altGap != null && altGap >= 15 && wpBefore >= 12 && wpBefore <= 94) cls = 'great';
    // Brilliant: a sound sacrifice (the engine's own choice, and you are not already winning outright)
    let sac = null;
    if (isBest && loss < 2 && i >= book && wpBefore <= 88 && wpAfter >= 40 && !mv.promotion) {
      sac = sacrificeOf(fens[i], uci, before.pv, color);
      if (sac) cls = 'brilliant';
    }
    const bestMove = isBest ? mv : uciToMove(fens[i], before.best);
    const phase = phaseOf(fens[i], i);
    const ply = {
      i, color, san: mv.san, uci, cls, loss: round(loss, 1),
      acc: round(moveAccuracy(loss), 1),
      cpLoss: Math.min(500, Math.max(0, clamp(cpBefore, -1000, 1000) - clamp(cpAfter, -1000, 1000))),
      cpBefore, cpAfter, wpBefore, wpAfter,
      cpWhite: after.cp, mate: after.mate ?? null,
      bestUci: before.best, bestSan: bestMove?.san ?? null,
      pvSan: pvToSan(fens[i], before.pv, 6),
      refute: after.best ?? null, // engine's best reply to the move actually played
      altUci: before.alt?.best ?? null, altGap: altGap == null ? null : round(altGap, 0), sac: sac ? { piece: sac.piece, deficit: sac.deficit } : null,
      phase, tags: [],
    };
    if (loss >= 10) ply.tags = detectTags({ ply, fenBefore: fens[i], fenAfter: fens[i + 1], afterBest: after.best, bestMove });
    plies.push(ply);
    tagsFor.push(ply.tags);
  }

  // Miss: the opponent just erred, you were better for it, and you let them off the hook (without throwing the game away)
  for (let i = 1; i < plies.length; i++) {
    const p = plies[i]; const prev = plies[i - 1];
    if ((p.cls === 'mistake' || p.cls === 'blunder') && prev.loss >= 10 && p.wpBefore >= 60 && p.wpAfter >= 30) p.cls = 'miss';
  }

  const side = (c) => plies.filter((p) => p.color === c);
  const summarize = (c) => {
    const mine = side(c);
    const counts = Object.fromEntries(CLASSES.map((k) => [k, 0]));
    mine.forEach((p) => { counts[p.cls]++; });
    const phases = {};
    for (const ph of ['opening', 'middlegame', 'endgame']) {
      const xs = mine.filter((p) => p.phase === ph).map((p) => p.acc);
      phases[ph] = xs.length >= 3 ? round(aggregateAccuracy(xs), 0) : null;
    }
    const acpl = mean(mine.map((p) => p.cpLoss));
    return {
      accuracy: round(aggregateAccuracy(mine.map((p) => p.acc)), 1),
      acpl: round(acpl, 0),
      counts, phases,
      performance: estimatePerformance(acpl, mine.length, priorRating[c]),
      moves: mine.length,
    };
  };
  const w = summarize('w');
  const b = summarize('b');

  const mineSummary = playerColor === 'w' ? w : b;
  const themeCounts = {};
  side(playerColor).forEach((p) => p.tags.forEach((t) => { themeCounts[t] = (themeCounts[t] || 0) + 1; }));

  const keyMoments = side(playerColor)
    .filter((p) => p.loss >= 5)
    .sort((a, c) => c.loss - a.loss)
    .slice(0, 6)
    .sort((a, c) => a.i - c.i)
    .map((p) => p.i);

  return {
    version: 2,
    depthNote: 'stockfish-19-lite',
    plies,
    summary: { w, b },
    mine: mineSummary,
    opening: opening ? { ...opening, bookPlies: book } : { eco: '', name: '', plies: 0, bookPlies: book },
    themes: themeCounts,
    keyMoments,
    series: evals.map((e) => e.cp),
  };
}

/** Strip derived numbers before saving to localStorage (cpBefore/After and win% are recomputed on load). */
export function compactReview(r) {
  return {
    ...r,
    plies: r.plies.map((p) => ({
      color: p.color, san: p.san, uci: p.uci, cls: p.cls, loss: p.loss, acc: p.acc, cpLoss: p.cpLoss,
      bestUci: p.bestUci, bestSan: p.bestSan, pvSan: p.loss >= 5 || p.cls === 'brilliant' || p.cls === 'great' ? p.pvSan : [], refute: p.loss >= 5 || p.cls === 'brilliant' ? p.refute : null, phase: p.phase, tags: p.tags,
      altUci: p.altUci, altGap: p.altGap, sac: p.sac,
    })),
  };
}

export function hydrateReview(c) {
  const plies = c.plies.map((p, i) => {
    const sign = p.color === 'w' ? 1 : -1;
    const cpBefore = sign * c.series[i];
    const cpAfter = sign * c.series[i + 1];
    return { ...p, i, cpBefore, cpAfter, wpBefore: winPct(cpBefore), wpAfter: winPct(cpAfter), cpWhite: c.series[i + 1] };
  });
  return { ...c, plies };
}

export function detectTags({ ply, fenBefore, fenAfter, afterBest, bestMove }) {
  const tags = [];
  const mateBefore = ply.cpBefore >= MATE_CP - 1100;
  const mateAgainst = ply.cpAfter <= -(MATE_CP - 1100);
  if (mateBefore && ply.cpAfter < MATE_CP - 1100) tags.push('missed-mate');
  if (mateAgainst && ply.cpBefore > -(MATE_CP - 1100)) tags.push('allowed-mate');

  const reply = uciToMove(fenAfter, afterBest);
  if (ply.loss >= 15 && reply?.captured && PIECE_VALUE[reply.captured] >= 3) tags.push('hung-piece');

  if (ply.loss >= 15 && !tags.includes('hung-piece') && !tags.includes('missed-mate') && bestMove) {
    const capture = bestMove.captured && PIECE_VALUE[bestMove.captured] >= 3;
    const check = /[+#]$/.test(bestMove.san);
    if (capture || check) tags.push('missed-tactic');
  }
  if (ply.cpBefore >= 250 && ply.cpAfter <= 80) tags.push('blown-advantage');
  if (ply.phase === 'opening') tags.push('opening-mistake');
  if (ply.phase === 'endgame') tags.push('endgame-error');
  return tags;
}

export const THEME_LABELS = {
  'hung-piece': 'Leaving pieces undefended',
  'missed-tactic': 'Missing tactics',
  'missed-mate': 'Missing checkmates',
  'allowed-mate': 'Allowing checkmate',
  'blown-advantage': 'Letting winning positions slip',
  'opening-mistake': 'Opening inaccuracies',
  'endgame-error': 'Endgame technique',
};

export const THEME_ADVICE = {
  'hung-piece': 'Before every move, ask: "What does my opponent threaten after this?" Check each piece that can be captured.',
  'missed-tactic': 'Scan checks, captures and threats for both sides every move. Practise tactic puzzles daily.',
  'missed-mate': 'When the enemy king is exposed, look at every check first. Practise mate-in-one and mate-in-two puzzles.',
  'allowed-mate': 'Keep your king safe: before moving pieces away from it, check your opponent\'s checks and sacrifices.',
  'blown-advantage': 'When you are winning, trade pieces, keep your king safe and avoid risky plans. Simplify.',
  'opening-mistake': 'Learn the main ideas of one opening for each colour rather than memorising lines.',
  'endgame-error': 'Study basic endgames: king and pawn, rook endings, and the opposition.',
};
