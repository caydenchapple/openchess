// Performance rating from average centipawn loss (ACPL), fitted to data instead of guessed.
//
// Where the numbers come from (scripts/calibrate-perf.mjs, raw games in calibration/perf-games.jsonl):
//   - 12 bots of known strength (the levels of levels.js, Elo 125 to 2882) played themselves and their neighbours on the ladder: 368 games from
//     short random openings (capped at 160 plies, about 55 moves per side on average), 717 player-sides with at least 10 moves.
//   - Every position was analysed the way the app's game review does it: Stockfish 19 lite, single thread, depth 12, one line.
//     ACPL is the mean centipawn loss per move (evals clamped to ±1000, each move capped at 500), as in analysis-core.js buildReview.
//   - Mean ACPL per level (sides in brackets), with the Lichess-style accuracy score in the last column:
//        Elo  125   350   700  1000  1175  1475  1575  1775  2000  2200  2690  2882
//       ACPL  381   249   117    95    74    65    58    57    46    33    15    17   (36 to 64 sides each)
//       acc.   22    42    64    71    78    83    86    85    90    93    97    98
//   - A cubic in Elo fits ln(ACPL) (residual about 0.11, i.e. 10% in ACPL, about 80 Elo); this file inverts it.
//
// How far to trust it (read this before showing a number to someone):
//   - It maps a BOT's ACPL to the strength (on Stockfish's scale, see levels.js: not Chess.com or FIDE) of bots that average that ACPL.
//     Bot errors are not human errors, so it is a proxy for people. Bots with a different mix of mistakes sit on a different curve: an old
//     "random move 30% of the time" bot of the same Elo has about the same ACPL as a human-like one 300 Elo weaker.
//   - ONE game is a very noisy measurement: the per-game estimate from ACPL alone is off by about 430 Elo (one standard deviation, 10 to 200
//     move games alike), because one blunder moves ACPL a lot and games differ in difficulty. So the result is shrunk toward `prior`
//     (the player's current rating): with 50 moves it keeps about 45% of what the game says, with 20 moves about 35%, with 100 moves about 52%.
//     Shrinking is the honest default; `eloFromAcpl` is the raw, unshrunk curve.
//   - Flat spots: ACPL hardly separates 1500 from 1800 (65, 58, 57) or 2700 from 2900 (15, 17): estimates there are good to about ±200.
//   - Depth 12 / lite engine only. The app also stops a position after 1.8 s, so a slow device may analyse shallower and read higher ACPL.

// ln(ACPL) = C[0]*x^3 + C[1]*x^2 + C[2]*x + C[3], x = (Elo - 1500) / 1000
const C = [-0.269, 0.085, -0.704, 4.118];
const lnAcplAt = (elo) => { const x = (elo - 1500) / 1000; return ((C[0] * x + C[1]) * x + C[2]) * x + C[3]; };

export const MIN_ELO = 100;
export const MAX_ELO = 3000;
/** Spread of per-game estimates (Elo, one s.d.) at 50 moves, and the assumed spread of players around their rating. */
const GAME_SD = 430;
const POOL_SD = 400;

/** Elo whose bots average this ACPL, from the fitted curve (not shrunk). Clamped to 100-3000, returned as a real number. */
export function eloFromAcpl(acpl) {
  if (!Number.isFinite(acpl) || acpl < 0) return null;
  const y = Math.log(Math.max(acpl, 0.5));
  if (y >= lnAcplAt(MIN_ELO)) return MIN_ELO;
  if (y <= lnAcplAt(MAX_ELO)) return MAX_ELO;
  let lo = MIN_ELO; let hi = MAX_ELO; // lnAcplAt falls as Elo rises on 100-3000, so bisect
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (lnAcplAt(mid) > y) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** How much of the game's own estimate to keep (0..1): more for long games, little for a handful of moves. */
export function evidenceWeight(moves) {
  if (!(moves > 0)) return 0;
  const sd = GAME_SD * Math.sqrt((1 + 30 / moves) / (1 + 30 / 50)); // noisier when the game is short
  return POOL_SD ** 2 / (POOL_SD ** 2 + sd ** 2);
}

/**
 * Performance rating for one side of a game.
 * @param {number} acpl average centipawn loss per move of that side
 * @param {number} moves how many moves that side played
 * @param {number} [prior] what to fall back on without evidence, normally the player's current rating
 * @returns {number|null} integer Elo between 100 and 3000, or null when there is nothing to go on
 */
export function performanceFromAcpl(acpl, moves, prior = 1000) {
  const raw = eloFromAcpl(acpl);
  if (raw == null || !(moves > 0)) return null;
  const w = evidenceWeight(moves);
  const p = Number.isFinite(prior) ? prior : 1000;
  return Math.round(Math.min(MAX_ELO, Math.max(MIN_ELO, w * raw + (1 - w) * p)));
}
