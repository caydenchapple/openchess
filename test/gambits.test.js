import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMBITS, allLines } from '../client/src/gambits-data.js';
import { buildSteps, isBookMove, recordRun, lineStatus, dueLines, emptyGambits, gambitSummary, lineKey } from '../client/src/gambits-logic.js';

test('every gambit line replays legally and every note sits on a real move', () => {
  assert.ok(GAMBITS.length >= 10);
  for (const g of GAMBITS) {
    assert.ok(['w', 'b'].includes(g.side));
    for (const l of g.lines) {
      const steps = buildSteps(g, l); // throws on an illegal move
      assert.ok(steps.length >= 8, `${g.id}/${l.id} is too short`);
      assert.ok(steps.some((s) => s.mine), `${g.id}/${l.id} has no move for you`);
      const keys = new Set(steps.map((s) => s.key));
      for (const k of Object.keys(l.notes)) assert.ok(keys.has(k), `${g.id}/${l.id}: note ${k} is not on a move`);
      assert.ok(steps.some((s) => s.mine && s.note), `${g.id}/${l.id} should explain at least one of your moves`);
    }
  }
  assert.equal(new Set(allLines().map((l) => l.key)).size, allLines().length, 'line keys are unique');
});

test('the Budapest trap really ends in checkmate, and the Lasker trap in an underpromotion', () => {
  const trap = buildSteps(GAMBITS.find((g) => g.id === 'budapest'), GAMBITS.find((g) => g.id === 'budapest').lines.find((l) => l.id === 'trap'));
  assert.match(trap.at(-1).san, /Nd3#/);
  const lasker = buildSteps(GAMBITS.find((g) => g.id === 'albin'), GAMBITS.find((g) => g.id === 'albin').lines.find((l) => l.id === 'lasker'));
  assert.equal(lasker.at(-1).promotion, 'n');
});

test('isBookMove accepts only the book move (promotion and castling included)', () => {
  const g = GAMBITS.find((x) => x.id === 'albin'); const l = g.lines.find((x) => x.id === 'lasker');
  const steps = buildSteps(g, l); const last = steps.at(-1);
  assert.ok(isBookMove(last, { from: last.from, to: last.to, promotion: 'n' }));
  assert.ok(!isBookMove(last, { from: last.from, to: last.to, promotion: 'q' }));
  const q = GAMBITS.find((x) => x.id === 'queens'); const qs = buildSteps(q, q.lines[0]);
  assert.ok(isBookMove(qs[2], { from: 'c2', to: 'c4' }));
  assert.ok(!isBookMove(qs[2], { from: 'e2', to: 'e4' }));
  const o = qs.find((s) => s.san === 'O-O'); assert.ok(isBookMove(o, { from: 'e1', to: 'g1' }));
});

test('spaced repetition: clean runs climb and come back later, messy runs come back tomorrow', () => {
  const G = emptyGambits(); const key = lineKey('queens', 'accepted');
  assert.equal(lineStatus(G, key, '2026-01-01'), 'new');
  recordRun(G, key, { clean: true }, '2026-01-01');
  assert.equal(G.lines[key].box, 1);
  assert.equal(lineStatus(G, key, '2026-01-01'), 'learning');
  recordRun(G, key, { clean: true }, '2026-01-02'); recordRun(G, key, { clean: true }, '2026-01-03'); recordRun(G, key, { clean: true }, '2026-01-10');
  assert.equal(lineStatus(G, key, '2026-01-10'), 'mastered');
  assert.equal(lineStatus(G, key, '2026-03-01'), 'due');
  recordRun(G, key, { clean: false, mistakes: 3 }, '2026-03-01');
  assert.ok(G.lines[key].box <= 1);
  assert.deepEqual(dueLines(G, '2026-03-02').map((l) => l.key), [key]);
  const s = gambitSummary(G, GAMBITS.find((g) => g.id === 'queens'), '2026-03-02');
  assert.deepEqual([s.total, s.due], [2, 1]);
});
