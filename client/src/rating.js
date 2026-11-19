// Local rating, in the style of Glicko: a rating plus how sure we are of it (the deviation, "RD").
// A new player's rating moves a lot at first and settles after about ten games; after a long break the doubt grows back a little.
// Your rating is stored in your browser; there is no central ladder (and no sign-up).
import { clamp } from './util.js';

export const START_RD = 350;
export const MIN_RD = 45; // never fully frozen: a rating can always move
export const SETTLED_RD = 110; // below this the number is trustworthy enough to stop saying "still settling"
const MAX_STEP = 200; // one game never moves you more than this
const Q = Math.LN10 / 400;
const DAY = 86_400_000;
const COMPUTER_RD = 80; // levels were measured by self-play, about ±80
const HUMAN_RD = 120; // another player's rating is an estimate too

/** Kept for older callers: how many games before the number can be trusted. */
export const PROVISIONAL_GAMES = 12;
/** Older, plain-Elo step size (used only to describe how fast a rating moves for a given game count). */
export function kFactor(games) {
  if (games < PROVISIONAL_GAMES) return 48;
  if (games < 40) return 32;
  return 20;
}

const g = (rd) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / Math.PI ** 2);
/** Chance of scoring against an opponent: 1 win, .5 draw. With `oppRd` 0 this is the classic Elo curve. */
export function expected(r, opp, oppRd = 0) { return 1 / (1 + 10 ** ((-g(oppRd) * (r - opp)) / 400)); }

/** How unsure we are after this many games, for pools saved before deviations were tracked. */
export const rdForGames = (games) => Math.max(MIN_RD, START_RD * 0.88 ** games);

/** The deviation right now: it grows slowly while you are away from the board. */
export function currentRd(pool, now = Date.now()) {
  const base = pool.rd ?? rdForGames(pool.games ?? 0);
  const last = pool.history?.[pool.history.length - 1]?.t;
  const days = last ? Math.max(0, (now - last) / DAY) : 0;
  return Math.min(START_RD, Math.sqrt(base * base + 14 * 14 * days));
}

/** One game. Returns the new rating (unrounded) and deviation. */
export function glicko(r, rd, opp, oppRd, score) {
  const gg = g(oppRd); const e = expected(r, opp, oppRd);
  const invD2 = Q * Q * gg * gg * e * (1 - e);
  const denom = 1 / (rd * rd) + invD2;
  const step = clamp((Q / denom) * gg * (score - e), -MAX_STEP, MAX_STEP);
  return { r: r + step, rd: Math.max(MIN_RD, Math.sqrt(1 / denom)) };
}

/** score: 1 win, .5 draw, 0 loss. Returns the new rating (rounded). */
export function updateRating(r, games, oppRating, score, { rd, oppRd = COMPUTER_RD } = {}) {
  return Math.round(clamp(glicko(r, rd ?? rdForGames(games), oppRating, oppRd, score).r, 100, 3000));
}

/** Record a finished rated game in `pool` ({ r, games, history, rd?, peak? }). `human`: the opponent was a person. */
export function applyResult(pool, oppRating, score, { human = false } = {}) {
  const before = pool.r; const titleBefore = title(before);
  const res = glicko(pool.r, currentRd(pool), oppRating, human ? HUMAN_RD : COMPUTER_RD, score);
  pool.r = Math.round(clamp(res.r, 100, 3000));
  pool.rd = Math.round(res.rd);
  pool.games += 1;
  pool.peak = Math.max(pool.peak ?? before, pool.r);
  pool.history.push({ t: Date.now(), r: pool.r });
  if (pool.history.length > 300) pool.history.shift();
  return { before, after: pool.r, delta: pool.r - before, rd: pool.rd, titleBefore, titleAfter: title(pool.r) };
}

export const isProvisional = (pool) => currentRd(pool) > SETTLED_RD;
/** "± 120" style description of how sure the number is. */
export const certainty = (pool) => Math.round(currentRd(pool) / 5) * 5;
export const peakRating = (pool) => Math.max(pool.peak ?? 0, pool.r, ...(pool.history ?? []).map((x) => x.r));

const TITLES = [[0, 'Beginner'], [600, 'Novice'], [900, 'Improver'], [1200, 'Club player'], [1500, 'Strong club player'], [1800, 'Expert'], [2100, 'Candidate master'], [2400, 'Master level']];
export function title(r) {
  let name = TITLES[0][1];
  for (const [from, t] of TITLES) if (r >= from) name = t;
  return name;
}
/** Progress to the next title: { next, at, pct } or null at the top. */
export function nextTitle(r) {
  const i = TITLES.findLastIndex(([from]) => r >= from);
  const nxt = TITLES[i + 1]; if (!nxt) return null;
  const from = TITLES[i][0];
  return { next: nxt[1], at: nxt[0], pct: Math.round(clamp(((r - from) / (nxt[0] - from)) * 100, 0, 100)) };
}
