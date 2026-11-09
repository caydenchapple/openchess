// Starter puzzles for players who have no mistakes of their own to practise yet: checkmate in one move.
// Any move that delivers mate is correct, and a test replays every position with chess.js to prove one exists.
import { Chess } from 'chess.js';

export const STARTER_FENS = [
  '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', // back-rank mate
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', // Scholar's mate
  'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', // Fool's mate (Black to move)
  'k7/8/1K6/8/8/8/8/7R w - - 0 1', // rook and king
  '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', // queen and king
  'r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', // take the rook with mate
];

export function matingMoves(fen) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).filter((m) => { const d = new Chess(fen); d.move(m.san); return d.isCheckmate(); });
}

/** Shaped like a saved mistake so the Train screen can treat them the same way. */
export function starterPuzzles() {
  return STARTER_FENS.map((fen) => {
    const m = matingMoves(fen)[0];
    return { fen, best: m.from + m.to + (m.promotion ?? ''), bestSan: m.san, played: '', cls: 'starter', starter: true, gameId: null, opening: '', solved: 0, attempts: 0, t: 0 };
  });
}
