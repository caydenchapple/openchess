// Local Elo. Your rating is stored in your browser; there is no central ladder (and no sign-up).
import { clamp } from './util.js';

export const PROVISIONAL_GAMES = 12;

export function kFactor(games) {
  if (games < PROVISIONAL_GAMES) return 48;
  if (games < 40) return 32;
  return 20;
}

export function expected(r, opp) { return 1 / (1 + 10 ** ((opp - r) / 400)); }

/** score: 1 win, .5 draw, 0 loss. Returns the new rating (rounded). */
export function updateRating(r, games, oppRating, score) {
  return Math.round(clamp(r + kFactor(games) * (score - expected(r, oppRating)), 100, 3000));
}

export function applyResult(pool, oppRating, score) {
  const before = pool.r;
  pool.r = updateRating(pool.r, pool.games, oppRating, score);
  pool.games += 1;
  pool.history.push({ t: Date.now(), r: pool.r });
  if (pool.history.length > 300) pool.history.shift();
  return { before, after: pool.r, delta: pool.r - before };
}

export const isProvisional = (pool) => pool.games < PROVISIONAL_GAMES;

export function title(r) {
  if (r < 600) return 'Beginner';
  if (r < 900) return 'Novice';
  if (r < 1200) return 'Improver';
  if (r < 1500) return 'Club player';
  if (r < 1800) return 'Strong club player';
  if (r < 2100) return 'Expert';
  if (r < 2400) return 'Candidate master';
  return 'Master level';
}
