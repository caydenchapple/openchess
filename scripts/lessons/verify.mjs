// Re-checks every lesson exercise with Stockfish 19: `npm run verify:lessons`
//  - find: the stored answer is the engine's best move and clearly better than the next one (or a mate for "mate" exercises)
//  - quiz: exactly one correct option, and it is the engine's best of the options
import { Chess } from 'chess.js';
import { CURRICULUM } from '../../client/src/lessons-data.js';
import { search, quit } from './engine.mjs';
import { checkFind } from './check.mjs';

let bad = 0; let checked = 0;
const fail = (id, msg) => { bad++; console.log(`FAIL ${id}: ${msg}`); };
const uciOf = (m) => m.from + m.to + (m.promotion ?? '');

for (const unit of CURRICULUM) for (const lesson of unit.lessons) for (const ex of lesson.exercises) {
  checked++;
  let chess;
  try { chess = new Chess(ex.fen); } catch { fail(ex.id, 'illegal FEN'); continue; }
  const mover = chess.turn() === 'w' ? 1 : -1;
  if (ex.type === 'find') {
    if (ex.mate) {
      const mates = chess.moves({ verbose: true }).filter((m) => { const c = new Chess(ex.fen); c.move(m.san); return c.isCheckmate(); });
      if (!mates.length) fail(ex.id, 'no checkmate in one');
      continue;
    }
    const legal = chess.moves({ verbose: true }).map(uciOf);
    if (!ex.answers.length || !ex.answers.every((a) => legal.includes(a))) { fail(ex.id, 'answer is not a legal move'); continue; }
    const r = await checkFind(ex.fen, ex.answers);
    if (!r.ok) fail(ex.id, r.reason);
  } else if (ex.type === 'quiz') {
    const oks = ex.options.filter((o) => o.ok);
    if (oks.length !== 1) { fail(ex.id, 'needs exactly one correct option'); continue; }
    const scored = [];
    for (const o of ex.options) {
      let m; try { m = chess.move(o.san); chess.undo(); } catch { fail(ex.id, `option ${o.san} is illegal`); continue; }
      const { lines } = await search(ex.fen, { depth: 16, multipv: 1, searchmoves: [uciOf(m)] });
      scored.push({ san: o.san, ok: o.ok, cp: mover * lines[0].cp });
    }
    const best = [...scored].sort((x, y) => y.cp - x.cp)[0];
    const right = scored.find((s) => s.ok);
    if (!best.ok) fail(ex.id, `engine prefers ${best.san} (${best.cp}) over the answer ${right?.san} (${right?.cp})`);
    else if (best.cp - Math.max(...scored.filter((s) => !s.ok).map((s) => s.cp)) < 30) console.log(`  note ${ex.id}: the answer is only slightly better than the others (${scored.map((s) => `${s.san} ${s.cp}`).join(', ')})`);
  }
}
console.log(`${checked} exercises checked, ${bad} problem(s)`);
quit(bad ? 1 : 0);
