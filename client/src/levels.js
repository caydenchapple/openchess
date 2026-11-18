// Computer opponents. This module is shared by the browser and by the calibration scripts (scripts/calibrate-ladder.mjs measures the strengths by self-play;
// scripts/calibrate-levels.mjs checks that each level beats the one below it).
//
// Strength is fixed by a NODE budget (how many positions the engine may look at), not by time, so a slow phone plays exactly
// as strongly as a fast laptop. Elo values are on Stockfish's scale (measured by self-play, see below): useful for ordering and for
// "how much stronger", but NOT the same as a Chess.com, Lichess or FIDE rating.
import { Chess } from 'chess.js';
import { fischerMove } from './fischer.js';

/**
 * @typedef {{id:number, group:string, name:string, elo:number, uciElo?:number, skill?:number, nodes:number, randomness?:number, full?:boolean,
 *   style?:'beginner', blunder?:number, grab?:number, careful?:number, missMate?:number,
 *   temp?:number, slip?:number, hang?:boolean, multipv?:number,
 *   persona?:string, person?:{born:string, note:string}}} Level
 */

// How strong each level is was MEASURED (scripts/calibrate-ladder.mjs; every game is kept in calibration/games.jsonl): bots played each other,
// ~7,000 games in all, and a Bradley–Terry fit put them on one scale anchored so that "Stockfish at UCI_Elo 2000, 60,000 nodes" = 2000.
// The Elo labels below are the fitted values rounded to 25. HOW MUCH to trust them:
//   - Each fitted value has a 95% bootstrap interval of about ±70 to ±90 Elo (standard error ≈ 40). Treat neighbouring levels
//     100 apart as "probably in this order", not as a precise ruler. Head-to-head results are listed below the table.
//   - It is Stockfish's scale, the one these bots were played on. It is not a Chess.com, Lichess or FIDE rating, and nothing was measured
//     against people. Rough cross-check with Stockfish's own limiter on the same games: its "UCI_Elo 1320" bot fits 1480 and "1600" fits 1820,
//     so spacing here is, if anything, a bit compressed (large gaps are understated by up to about a quarter) and Elo here is higher than the
//     limiter's own label at the same strength. The anchor itself (UCI_Elo 2000 = 2000) is a convention.
//   - Bots that mix in random moves are lopsided opponents (anything steadier beats them far more often than their "Elo" suggests),
//     so strengths are not perfectly transitive; the ladder below is built from smooth one-parameter families to keep that small.
//   - This REPLACES the earlier labels (random mover 800, 90%-random 1025, ...), which came from a coarser, wider-gapped measurement. With dense
//     pairings and ~4x the games, a purely random mover measures about 350, not 800. Stockfish's strong settings (2000 and up) did not move:
//     measured 1-node 1850, 300 nodes 2075 (labels kept: inside the error), and 1k 2245, 3k 2450, 10k 2680, 30k 2800, 100k 2985 from the
//     earlier grid run (calibrate-grid.mjs), which these labels follow.
//
// Four ways of playing, from weakest to strongest (the first three need at most 1,000 engine nodes per move, so they are cheap on a phone):
//   1. 'beginner' (First steps, Wobbly Pawn): no engine. With chance `blunder` it deliberately plays a move that gives material away (hangs a
//      piece, walks into a capture), otherwise a random move; it plays a mate in one only half the time. Worse than random on purpose.
//   2. Rookie: a purely random mover (the old Rookie, unchanged).
//   3. Human-like (Sleepy Knight up to Expert): ask the engine for its 5 best moves (300 nodes, 1000 for Expert), then pick one at random with
//      weight exp(-(win% lost)/temp). A high `temp` plays natural-looking moves that are often not the best one; a low one nearly always finds
//      the best. `slip` is the chance of a plain blunder instead (a move that hangs material, never a random a4). Together they give mostly
//      sensible moves with occasional mistakes and rare blunders, instead of "perfect play with random junk" (the old 800–1850 scheme:
//      full strength with a chance of a random move). Both were analysed at depth 12 (calibration/perf-comparison.txt). At about 1100 the
//      old scheme (50% random, fits 1100) had a blunder (20+ points of win chance lost) on 11% of its moves and ACPL 110; Learner/Student
//      (fit 1000–1175) blunder on 4–6% and have ACPL 94–74. At about 1450 the old 30% bot (fits 1420) blundered 5% of the time, Club player 3%.
//      The new bots make more small slips and fewer disasters, which is how people at these levels look. Only the strength was calibrated to
//      be equal; "more human" here means that error profile, not a test against real players' moves.
//   4. 2000 and up: the engine at a node budget, no randomness. The legends are set to a player's peak rating (strength, not style).
//
// Measured table (id, name, label, fitted Elo [95% bootstrap interval]); each setting played 360 to 1,100 games, the two beginner bots 120 to 270:
//   20 First steps   125  134 [ 18,  225]   21 Wobbly Pawn   200  194 [ 88,  261]    1 Rookie         375  373 [291,  431]
//   22 Sleepy Knight 425  435 [354,  498]   23 Curious Bishop 525 520 [441,  580]   24 Distracted Rook 600  605 [520,  670]
//   25 Hopeful Queen 700  693 [613,  763]    2 Casual        875  868 [781,  934]    3 Learner        1000  998 [906, 1062]
//    4 Student      1175 1179 [1092, 1262]    5 Improver     1300 1306 [1221, 1378]    6 Club player    1475 1465 [1389, 1541]
//    7 Strong club  1575 1580 [1506, 1649]    8 Expert       1775 1782 [1710, 1844]
//    9 Candidate     2000 (250 nodes: 2047 [1929, 2185])   10 Master 2200 (800 nodes: 2294 [2189, 2423])   11 International master 2400 (2,300 nodes:
//    2681 [2541, 2890], only 40 games against Master; the earlier grid run gave 2450 for 3k nodes). The 2000+ labels were kept: they are within
//    or near the error of these small samples and agree with the earlier, larger run.
// Head to head (80 games per pair unless noted) the lower level scored 0.24 to 0.38 against the next one up, i.e. every level beats the one below it,
// with ONE exception: Rookie (a random mover) and Sleepy Knight score 50% against each other (151 games) although the overall fit puts Sleepy
// about 60 Elo higher. At the very bottom the families overlap, because random-looking play is hard to rank. First steps vs Wobbly Pawn: 0.34.
// Ids are unchanged, so saved games still find their opponent (their Elo labels did change, see above).
/** @type {Level[]} */
export const LEVELS = [
  // beginner bots: no engine, worse than a random mover because they actively hang pieces (see beginnerMove)
  { id: 20, group: 'learn', name: 'First steps', elo: 125, nodes: 1, style: 'beginner', blunder: 0.8 },
  { id: 21, group: 'learn', name: 'Wobbly Pawn', elo: 200, nodes: 1, style: 'beginner', blunder: 0.6 },
  { id: 1, group: 'learn', name: 'Rookie', elo: 375, nodes: 1, randomness: 1.0 },
  // human-like bots: the engine's five best moves, picked by softmax over win-chance lost (temp), plus slips that hang material (see softmaxMove)
  { id: 22, group: 'learn', name: 'Sleepy Knight', elo: 425, nodes: 300, temp: 30, slip: 0.6, hang: true },
  { id: 23, group: 'learn', name: 'Curious Bishop', elo: 525, nodes: 300, temp: 30, slip: 0.52, hang: true },
  { id: 24, group: 'learn', name: 'Distracted Rook', elo: 600, nodes: 300, temp: 30, slip: 0.43, hang: true },
  { id: 25, group: 'learn', name: 'Hopeful Queen', elo: 700, nodes: 300, temp: 30, slip: 0.34, hang: true },
  { id: 2, group: 'learn', name: 'Casual', elo: 875, nodes: 300, temp: 30, slip: 0.2, hang: true },
  { id: 3, group: 'learn', name: 'Learner', elo: 1000, nodes: 300, temp: 30, slip: 0.125, hang: true },
  { id: 4, group: 'learn', name: 'Student', elo: 1175, nodes: 300, temp: 30, slip: 0.05, hang: true },
  { id: 5, group: 'learn', name: 'Improver', elo: 1300, nodes: 300, temp: 15, slip: 0.055, hang: true },
  { id: 6, group: 'club', name: 'Club player', elo: 1475, nodes: 300, temp: 8, slip: 0.02, hang: true },
  { id: 7, group: 'club', name: 'Strong club', elo: 1575, nodes: 300, temp: 5, slip: 0.01, hang: true },
  { id: 8, group: 'club', name: 'Expert', elo: 1775, nodes: 1000, temp: 3, slip: 0.01, hang: true },
  { id: 9, group: 'club', name: 'Candidate', elo: 2000, nodes: 250 },
  { id: 10, group: 'club', name: 'Master', elo: 2200, nodes: 800 },
  { id: 11, group: 'club', name: 'International master', elo: 2400, nodes: 2_300 },
  // legends: set to the peak rating of the player they are named after (the strength, not the style)
  { id: 12, group: 'legend', name: 'Boris Spassky', elo: 2690, nodes: 11_000, person: { born: '1937', note: 'World Champion 1969–72. A universal player who handled sharp and quiet positions alike.' } },
  { id: 13, group: 'legend', name: 'Judit Polgár', elo: 2735, nodes: 16_000, person: { born: '1976', note: 'The strongest woman in chess history; reached the world top 10 with fearless attacking play.' } },
  { id: 14, group: 'legend', name: 'Anatoly Karpov', elo: 2780, nodes: 25_000, person: { born: '1951', note: 'World Champion 1975–85. A master of squeezing opponents slowly with tiny advantages.' } },
  { id: 15, group: 'legend', name: 'Viswanathan Anand', elo: 2817, nodes: 33_000, person: { born: '1969', note: 'World Champion 2007–13, famous for lightning-fast intuition and sharp tactics.' } },
  { id: 16, group: 'legend', name: 'Garry Kasparov', elo: 2851, nodes: 45_000, person: { born: '1963', note: 'World Champion 1985–2000. Dynamic, energetic and deeply prepared.' } },
  { id: 17, group: 'legend', name: 'Magnus Carlsen', elo: 2882, nodes: 55_000, person: { born: '1990', note: 'World Champion 2013–23. Wins "equal" positions by grinding in endgames.' } },
  // famous players that play in their own style (see fischer.js for what that means). The engine looks at his 4 best moves, so it gets 4× the nodes.
  { id: 101, group: 'famous', name: 'Bobby Fischer', elo: 2785, nodes: 100_000, persona: 'fischer', person: { born: '1943', note: 'World Champion 1972–75. Plays his repertoire (1.e4; the Najdorf and King\'s Indian as Black), loves bishops and the initiative, and squeezes out won positions.' } },
  // not measured: far above anything we could test against
  { id: 18, group: 'max', name: 'Stockfish, full strength', elo: 3000, full: true, nodes: 2_000_000 },
];

export const GROUPS = [
  { id: 'famous', title: 'Famous opponents', blurb: 'Bots that play in the style of a great player, not just at their strength.' },
  { id: 'learn', title: 'Learning', blurb: 'Gentle opponents that make mistakes.' },
  { id: 'club', title: 'Club and masters', blurb: 'Steady opponents from club level to international master.' },
  { id: 'legend', title: 'Legends', blurb: 'Set to the peak rating of a famous player. The strength matches, the style does not.' },
  { id: 'max', title: 'The machine', blurb: 'The strongest the engine can play here.' },
];

/** Engine settings for a level. */
export function strengthOf(level) {
  if (level.uciElo) return { uciElo: level.uciElo };
  if (level.skill != null) return { skill: level.skill };
  return null;
}

const uciOf = (m) => m.from + m.to + (m.promotion ?? '');
const pick = (list, rand) => list[Math.floor(rand() * list.length)];
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * How many pawns of material the mover ends up ahead or behind after playing `m`, looking only one reply deep:
 * what the move captures, minus the best capture the opponent then has (a defended piece is only worth the difference).
 * An allowed checkmate counts as -100. No search, a few microseconds per move.
 */
export function materialAfter(chess, m) {
  const mover = m.color;
  const net = (m.captured ? VAL[m.captured] : 0) + (m.promotion ? VAL[m.promotion] - 1 : 0);
  chess.move(m);
  let worst = 0;
  for (const san of chess.moves()) {
    if (san.endsWith('#')) { worst = 100; break; }
    if (!san.includes('x')) continue;
    const to = san.match(/x([a-h][1-8])/)[1];
    const victim = chess.get(to); // empty on en passant: a pawn
    const taken = victim ? VAL[victim.type] : 1;
    const piece = /^[NBRQK]/.test(san) ? VAL[san[0].toLowerCase()] : 1;
    const gain = chess.isAttacked(to, mover) ? taken - piece : taken; // recapture: the opponent only wins the difference
    if (gain > worst) worst = gain;
  }
  chess.undo();
  return net - worst;
}

/**
 * The beginner bots (no engine, no search). They are WORSE than a random mover on purpose, in the ways beginners are bad:
 *   blunder  chance of deliberately playing a move that loses material (walks into a capture, hangs a piece);
 *   grab     chance of taking the best free capture when there is one;
 *   careful  chance of picking a random move that does not lose material;
 *   missMate chance of not playing a mate in one when it is there.
 * Whatever is left over is a uniformly random move.
 */
export function beginnerMove(fen, level, rand = Math.random) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  const mates = moves.filter((m) => m.san.endsWith('#'));
  if (mates.length && rand() >= (level.missMate ?? 0.5)) return uciOf(pick(mates, rand));
  const { blunder = 0, grab = 0, careful = 0 } = level;
  if (!blunder && !grab && !careful) return uciOf(pick(moves, rand));
  const r = rand();
  const scored = () => moves.map((m) => ({ m, net: materialAfter(chess, m) }));
  if (r < blunder) {
    const all = scored(); const worst = Math.min(...all.map((x) => x.net));
    const bad = all.filter((x) => x.net <= Math.min(-1, worst + 2));
    return uciOf(pick(bad.length ? bad : all, rand).m);
  }
  if (rand() < grab) {
    const all = scored(); const top = Math.max(...all.map((x) => x.net));
    if (top > 0) return uciOf(pick(all.filter((x) => x.net === top), rand).m);
  }
  if (rand() < careful) {
    const ok = scored().filter((x) => x.net >= 0);
    if (ok.length) return uciOf(pick(ok, rand).m);
  }
  return uciOf(pick(moves, rand));
}

// Lichess' win-probability curve (same as analysis-core.js; repeated here so the calibration scripts do not need the review code).
const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);

/** A blunder: a move that gives material away (hangs a piece, walks into a capture) when there is one, otherwise any legal move. */
export function slipMove(fen, legal, rand = Math.random) {
  const chess = new Chess(fen);
  const bad = chess.moves({ verbose: true }).filter((m) => materialAfter(chess, m) <= -1);
  return bad.length ? uciOf(pick(bad, rand)) : pick(legal, rand);
}

/**
 * The human-like bots: ask the engine for its few best moves (a small node budget, `multipv` lines), then pick one at random, weighted
 * by exp(-loss / temp) where `loss` is the win-chance (in points) that move gives up compared with the best. A high temperature plays
 * natural moves but often not the best one; a low temperature nearly always finds the best. `slip` is the (small) chance of a
 * completely random move; with `hang` the slip is instead a move that gives material away, the kind of blunder a person makes when distracted.
 */
export async function softmaxMove(search, fen, level, rand, legal) {
  if (level.slip && rand() < level.slip) return level.hang ? slipMove(fen, legal, rand) : pick(legal, rand);
  const { best, lines } = await search(fen, { nodes: level.nodes, multipv: level.multipv ?? 5, strength: strengthOf(level) });
  const sign = fen.split(' ')[1] === 'b' ? -1 : 1;
  const cands = (lines ?? []).filter((l) => l.pv?.[0] && legal.includes(l.pv[0])).map((l) => ({ uci: l.pv[0], wp: winPct(sign * l.cp) }));
  if (!cands.length) return best && legal.includes(best) ? best : pick(legal, rand);
  const top = Math.max(...cands.map((c) => c.wp));
  const w = cands.map((c) => Math.exp(-(top - c.wp) / level.temp));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return cands[i].uci; }
  return cands[0].uci;
}

/**
 * Pick the computer's move for a level. `search` is the engine: (fen, { nodes, strength, multipv }) → { best, lines }.
 * Shared by the browser (engine.js) and the calibration script.
 */
export async function chooseMove(search, fen, level, rand = Math.random, ctx = {}) {
  if (level.persona === 'fischer') return fischerMove(search, fen, level, ctx.sans ?? [], rand);
  if (level.style === 'beginner') return beginnerMove(fen, level, rand);
  const legal = new Chess(fen).moves({ verbose: true }).map(uciOf);
  if (level.temp) return softmaxMove(search, fen, level, rand, legal);
  if (level.randomness && rand() < level.randomness) return legal[Math.floor(rand() * legal.length)];
  const { best } = await search(fen, { nodes: level.nodes, strength: strengthOf(level) });
  return best && legal.includes(best) ? best : legal[Math.floor(rand() * legal.length)];
}
