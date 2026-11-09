// The one definition of "this exercise has a single clearly best answer", used by the generator and the verifier.
import { search } from './engine.mjs';

/** @returns {Promise<{ok:boolean, reason:string}>} */
export async function checkFind(fen, answers, depth = 18) {
  const mover = fen.split(' ')[1] === 'w' ? 1 : -1;
  const { lines } = await search(fen, { depth, multipv: 3 });
  const [a, b] = lines;
  if (!a) return { ok: false, reason: 'no engine line' };
  if (a.pv[0] !== answers[0]) return { ok: false, reason: `engine prefers ${a.pv[0]}, answer is ${answers[0]}` };
  if (!b) return { ok: true, reason: 'only move' };
  if (a.mate !== null && mover * a.mate > 0) { // a forced mate: no other move may mate as quickly
    if (b.mate !== null && mover * b.mate > 0 && Math.abs(b.mate) <= Math.abs(a.mate)) return { ok: false, reason: `another move also mates in ${Math.abs(b.mate)}` };
    return { ok: true, reason: `mate in ${Math.abs(a.mate)}` };
  }
  const gap = mover * (a.cp - b.cp);
  return gap >= 120 ? { ok: true, reason: `gap ${gap}` } : { ok: false, reason: `not clearly better (gap ${gap})` };
}
