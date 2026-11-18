// Looking back through the moves of a game while it is still being played.
import { Chess } from 'chess.js';

/** @returns {{fen:string, from:string|null, to:string|null, san:string|null}[]} position after 0, 1, 2 … n half-moves */
export function positions(sans, startFen) {
  const c = new Chess(startFen);
  const out = [{ fen: c.fen(), from: null, to: null, san: null }];
  for (const san of sans) {
    const m = c.move(san);
    out.push({ fen: c.fen(), from: m.from, to: m.to, san: m.san });
  }
  return out;
}

/**
 * Where to look next. `view` is how many half-moves are shown (null = the live position), `live` how many have been played.
 * `dir`: -1 back, +1 forward, 'start', 'live'. Returns the new view, with null meaning live.
 */
export function stepView(view, live, dir) {
  const cur = view ?? live;
  let next = cur;
  if (dir === -1) next = cur - 1; else if (dir === 1) next = cur + 1; else if (dir === 'start') next = 0; else if (dir === 'live') next = live;
  else if (typeof dir === 'number') next = dir;
  next = Math.max(0, Math.min(live, next));
  return next >= live ? null : next;
}
