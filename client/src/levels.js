// Computer opponents. This module is shared by the browser and by scripts/calibrate-levels.mjs, which measures the strengths by self-play.
//
// Strength is fixed by a NODE budget (how many positions the engine may look at), not by time, so a slow phone plays exactly
// as strongly as a fast laptop. Elo values are on Stockfish's scale (measured by self-play, see below): useful for ordering and for
// "how much stronger", but NOT the same as a Chess.com, Lichess or FIDE rating.
import { Chess } from 'chess.js';
import { fischerMove } from './fischer.js';

/** @typedef {{id:number, group:string, name:string, elo:number, uciElo?:number, skill?:number, nodes:number, randomness?:number, full?:boolean, person?:{born:string, note:string}}} Level */

// Strength is MEASURED, not guessed (scripts/calibrate-grid.mjs): many settings played each other, a Bradley–Terry fit put them on one
// scale, anchored so that "Stockfish at UCI_Elo 2000, 60,000 nodes" = 2000. The levels below pick the setting that lands on each Elo:
//   - up to about 1850: full-strength play, but with a chance (`randomness`) of a random legal move instead;
//   - 2000 and up: no randomness, just a bigger node budget.
// Measured: a purely random mover ≈ 800, 90% random ≈ 1025, 50% ≈ 1450, 30% ≈ 1620, 1 node ≈ 1870, 300 nodes ≈ 2020, 1k ≈ 2245, 3k ≈ 2450,
// 10k ≈ 2680, 30k ≈ 2800, 100k ≈ 2985. Each number carries an error of roughly ±100. Checked head-to-head (16 games per pair), every level beats the
// level below it; the exact spacing is approximate, because levels weakened by random mistakes win or lose very lopsidedly against each other.
/** @type {Level[]} */
export const LEVELS = [
  { id: 1, group: 'learn', name: 'Rookie', elo: 800, nodes: 1, randomness: 1.0 },
  { id: 2, group: 'learn', name: 'Casual', elo: 900, nodes: 1, randomness: 0.97 },
  { id: 3, group: 'learn', name: 'Learner', elo: 1025, nodes: 1, randomness: 0.9 },
  { id: 4, group: 'learn', name: 'Student', elo: 1150, nodes: 1, randomness: 0.8 },
  { id: 5, group: 'learn', name: 'Improver', elo: 1250, nodes: 1, randomness: 0.7 },
  { id: 6, group: 'club', name: 'Club player', elo: 1450, nodes: 1, randomness: 0.5 },
  { id: 7, group: 'club', name: 'Strong club', elo: 1600, nodes: 1, randomness: 0.3 },
  { id: 8, group: 'club', name: 'Expert', elo: 1800, nodes: 1, randomness: 0.15 },
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

/**
 * Pick the computer's move for a level. `search` is the engine: (fen, { nodes, strength, multipv }) → { best, lines }.
 * Shared by the browser (engine.js) and the calibration script.
 */
export async function chooseMove(search, fen, level, rand = Math.random, ctx = {}) {
  if (level.persona === 'fischer') return fischerMove(search, fen, level, ctx.sans ?? [], rand);
  const legal = new Chess(fen).moves({ verbose: true }).map(uciOf);
  if (level.randomness && rand() < level.randomness) return legal[Math.floor(rand() * legal.length)];
  const { best } = await search(fen, { nodes: level.nodes, strength: strengthOf(level) });
  return best && legal.includes(best) ? best : legal[Math.floor(rand() * legal.length)];
}
