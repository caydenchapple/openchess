// The ladder: you start at 100 and climb. An opponent is open to you when you are rated within reach of it,
// or when you have beaten the opponent just below it. (Settings → "Unlock every opponent" turns this off.)
import { LEVELS } from './levels.js';
import { get, save } from './store.js';

const REACH = 150; // a level up to this far above your rating is open without beating the one below

export const sequence = () => [...LEVELS].sort((a, b) => a.elo - b.elo || a.id - b.id);

/** Highest index in the sequence that you have beaten, or -1. */
function topBeaten(seq, beaten) {
  let top = -1;
  seq.forEach((l, i) => { if (beaten[l.id]) top = i; });
  return top;
}

export function isUnlocked(level, st = get()) {
  if (st.settings.unlockAll) return true;
  const seq = sequence();
  const i = seq.findIndex((l) => l.id === level.id);
  if (i <= 0) return true;
  if (level.elo <= st.ratings.computer.r + REACH) return true;
  return i <= topBeaten(seq, st.ladder?.beaten ?? {}) + 1;
}

/** What to beat to open this level, e.g. "Beat Casual to unlock". */
export function unlockHint(level) {
  const seq = sequence();
  const i = seq.findIndex((l) => l.id === level.id);
  return i > 0 ? `Beat ${seq[i - 1].name} (${seq[i - 1].elo}) or reach a rating of ${Math.max(100, level.elo - REACH)} to unlock` : '';
}

/** The opponent that suits your rating best right now: the strongest open level not far above you. */
export function suggestedLevel(st = get()) {
  const open = sequence().filter((l) => !l.full && isUnlocked(l, st));
  const near = open.filter((l) => l.elo <= st.ratings.computer.r + 100);
  return (near.length ? near : open).at(-1) ?? open[0];
}

/** Record a win. Returns the level that this win newly opened (or null). */
export function markBeaten(levelId) {
  const st = get();
  st.ladder ??= { beaten: {} };
  const seq = sequence();
  const before = new Set(seq.filter((l) => isUnlocked(l, st)).map((l) => l.id));
  st.ladder.beaten[levelId] = true;
  save();
  return seq.find((l) => isUnlocked(l, st) && !before.has(l.id)) ?? null;
}
