// Drives Stockfish over every position of a game and feeds the numbers to analysis-core.
import { Chess } from 'chess.js';
import { engine } from './engine.js';
import { buildReview } from './analysis-core.js';

const MATE_CP = 10_000;

export function parsePgn(pgn) {
  const chess = new Chess();
  chess.loadPgn(pgn); // throws on bad PGN
  const headers = chess.getHeaders();
  const moves = chess.history({ verbose: true });
  const start = headers.FEN || undefined;
  const replay = new Chess(start);
  const fens = [replay.fen()];
  for (const m of moves) {
    replay.move(m.san);
    fens.push(replay.fen());
  }
  return { headers, moves, fens };
}

function terminalEval(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) {
    return { cp: c.turn() === 'w' ? -MATE_CP : MATE_CP, mate: 0, best: null, pv: [], depth: 0 };
  }
  if (c.isGameOver()) return { cp: 0, mate: null, best: null, pv: [], depth: 0 };
  return null;
}

/**
 * @param {string} pgn
 * @param {{playerColor:'w'|'b', priorRating?:{w:number,b:number}, depth?:number, onProgress?:(done:number,total:number)=>void, signal?:{cancelled:boolean}}} opts
 */
export async function reviewPgn(pgn, { playerColor = 'w', priorRating, depth = 12, onProgress, signal } = {}) {
  const { moves, fens } = parsePgn(pgn);
  if (!moves.length) throw new Error('That game has no moves to review.');
  const cache = new Map();
  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    if (signal?.cancelled) throw new Error('cancelled');
    const fen = fens[i];
    let e = terminalEval(fen) ?? cache.get(fen.split(' ').slice(0, 4).join(' '));
    if (!e) {
      const { lines } = await engine.search(fen, { depth, movetime: 1800 });
      const top = lines[0];
      e = top
        ? { cp: top.cp, mate: top.mate, best: top.pv[0] ?? null, pv: top.pv, depth: top.depth }
        : { cp: 0, mate: null, best: null, pv: [], depth: 0 };
      cache.set(fen.split(' ').slice(0, 4).join(' '), e);
    }
    evals.push(e);
    onProgress?.(i + 1, fens.length);
  }
  return buildReview({ fens, moves, evals, playerColor, priorRating });
}

/** Multi-line analysis of one position (used by "Ask the coach" and the review sidebar). */
export async function analyzePosition(fen, { multipv = 3, depth = 14, movetime = 2500, onInfo } = {}) {
  const t = terminalEval(fen);
  if (t) return [];
  const { lines } = await engine.search(fen, { multipv, depth, movetime, onInfo });
  return lines;
}
