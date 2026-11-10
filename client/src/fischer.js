// Bobby Fischer (1943–2008), 11th World Champion — a bot that plays the way he is known to have played.
//
// What this really is, so nobody is misled:
//  1. His documented repertoire. He opened 1.e4 as White and, as Black, defended with the Najdorf Sicilian (including his famous
//     Poisoned Pawn line) against 1.e4 and the King's Indian against 1.d4. The book below follows those lines, plus the opening of
//     his 1956 "Game of the Century" against Donald Byrne.
//  2. His taste, as a tilt on top of a strong engine's top choices: he loved bishops, took the initiative with checks and captures,
//     fought for the centre, kept his king safe, and when ahead he traded down and squeezed out the win.
//  3. Strength set to his peak FIDE rating (about 2785) with Stockfish's limiter.
// It cannot reproduce how he actually thought, and it is not a copy of his games. It is an approximation built from public knowledge.
import { Chess } from 'chess.js';

/** Lines Fischer played or is known for. `side` is the colour Fischer has in the line. Moves are SAN, both sides. */
const L = (side, text) => ({ side, moves: text.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean) });
export const FISCHER_BOOK = [
  // White: 1.e4 and the Ruy Lopez
  L('w', '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 7.Bb3 d6 8.c3 O-O 9.h3 Na5 10.Bc2 c5 11.d4 Qc7'),
  // White vs the Sicilian: the Sozin attack with Bc4
  L('w', '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bc4 e6 7.Bb3 b5 8.O-O Be7'),
  L('w', '1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 d6 6.Bc4 e6 7.O-O Be7 8.Be3 O-O'),
  // White vs the French: the King's Indian Attack
  L('w', '1.e4 e6 2.d3 d5 3.Nd2 Nf6 4.Ngf3 c5 5.g3 Nc6 6.Bg2 Be7 7.O-O O-O'),
  // Black: the Najdorf Sicilian
  L('b', '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bg5 e6 7.f4 Qb6 8.Qd2 Qxb2 9.Rb1 Qa3'), // the Poisoned Pawn
  L('b', '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be2 e5 7.Nb3 Be7 8.O-O O-O 9.Be3 Be6'),
  L('b', '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Bc4 e6 7.Bb3 b5 8.O-O Be7'),
  L('b', '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 6.Be3 e5 7.Nb3 Be6 8.f3 Be7 9.Qd2 O-O 10.O-O-O Nbd7'),
  // Black: the King's Indian
  L('b', '1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 O-O 6.Be2 e5 7.O-O Nc6 8.d5 Ne7 9.Ne1 Nd7'),
  // Black: the Grünfeld set-up of the "Game of the Century" (Byrne–Fischer, New York 1956)
  L('b', '1.Nf3 Nf6 2.c4 g6 3.Nc3 Bg7 4.d4 O-O 5.Bf4 d5 6.Qb3 dxc4 7.Qxc4 c6 8.e4 Nbd7 9.Rd1 Nb6 10.Qc5 Bg4 11.Bg5 Na4 12.Qa3 Nxc3 13.bxc3 Nxe4 14.Bxe7 Qb6 15.Bc4 Nxc3 16.Bc5 Rfe8+ 17.Kf1 Be6 18.Bxb6 Bxc4+ 19.Kg1 Ne2+ 20.Kf1 Nxd4+ 21.Kg1 Ne2+ 22.Kf1 Nc3+ 23.Kg1 axb6 24.Qb4 Ra4 25.Qxb6 Nxd1 26.h3 Rxa2 27.Kh2 Nxf2 28.Re1 Rxe1 29.Qd8+ Bf8 30.Nxe1 Bd5 31.Nf3 Ne4 32.Qb8 b5 33.h4 h5 34.Ne5 Kg7 35.Kg1 Bc5+ 36.Kf1 Ng3+ 37.Ke1 Bb4+ 38.Kd1 Bb3+ 39.Kc1 Ne2+ 40.Kb1 Nc3+ 41.Kc1 Rc2#'),
];

/** The next book move for Fischer, or null when the game has left his repertoire. */
export function bookMove(sans, color, rand = Math.random) {
  const options = new Map();
  for (const line of FISCHER_BOOK) {
    if (line.side !== color || line.moves.length <= sans.length) continue;
    if (!sans.every((m, i) => line.moves[i] === m)) continue;
    const next = line.moves[sans.length];
    options.set(next, (options.get(next) ?? 0) + 1);
  }
  if (!options.size) return null;
  const total = [...options.values()].reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [m, w] of options) { r -= w; if (r <= 0) return m; }
  return [...options.keys()][0];
}

const PIECE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const material = (fen) => [...fen.split(' ')[0]].reduce((n, ch) => n + (PIECE[ch.toLowerCase()] ?? 0), 0);

/**
 * Fischer's taste as a small bonus (in centipawns) added to an engine candidate. The engine's evaluation still dominates;
 * this only decides between moves it considers about equal.
 */
export function styleBonus(fen, move, evalForMe, plyCount) {
  const g = new Chess(fen);
  const me = g.turn();
  let m;
  try { m = g.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }); } catch { return 0; }
  let b = 0;
  if (m.piece === 'b') b += 6; // the bishops
  if (m.piece === 'b' && m.captured === 'n') b += 5; // bishop takes knight: keeps the better minor piece
  if (m.piece === 'n' && (m.to[0] === 'a' || m.to[0] === 'h')) b -= 6; // a knight on the rim is dim
  if (/[+#]$/.test(m.san)) b += 4; // initiative
  if (m.captured) b += 2;
  if (plyCount < 24 && m.piece === 'p' && ['e4', 'd4', 'c4', 'e5', 'd5'].includes(m.to)) b += 5; // fight for the centre
  if (plyCount < 30 && m.san.startsWith('O-O')) b += 4; // king safety first
  if (plyCount < 20 && m.piece === 'k' && !m.san.startsWith('O-O')) b -= 10;
  if (evalForMe >= 80 && m.captured && material(fen) > 20) b += 5; // ahead: trade down and win it
  if (evalForMe <= -80 && (/[+#]$/.test(m.san) || m.captured)) b += 4; // behind: complicate
  return b;
}

/**
 * Choose Fischer's move: his book first, then the engine's top candidates (at his rating) tilted toward his taste.
 * `search`: (fen, { nodes, multipv, strength }) → { best, lines } with scores from White's view.
 */
export async function fischerMove(search, fen, level, sans = [], rand = Math.random) {
  const chess = new Chess(fen);
  const color = chess.turn();
  const book = bookMove(sans, color, rand);
  if (book) { try { const m = chess.move(book); return m.from + m.to + (m.promotion ?? ''); } catch { /* the book line does not fit: leave it */ } }
  const { best, lines } = await search(fen, { nodes: level.nodes, multipv: 4, strength: level.uciElo ? { uciElo: level.uciElo } : null });
  if (!lines?.length) return best;
  const sign = color === 'w' ? 1 : -1;
  const top = sign * lines[0].cp;
  const pool = lines.filter((l) => top - sign * l.cp <= 35);
  let pick = lines[0]; let score = -Infinity;
  for (const l of pool) {
    const s = sign * l.cp + styleBonus(fen, l.pv[0], sign * l.cp, sans.length);
    if (s > score) { score = s; pick = l; }
  }
  return pick.pv[0];
}
