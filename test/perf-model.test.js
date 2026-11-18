import test from 'node:test';
import assert from 'node:assert/strict';
import { performanceFromAcpl, eloFromAcpl, evidenceWeight, MIN_ELO, MAX_ELO } from '../client/src/perf-model.js';

test('eloFromAcpl is monotone: lower ACPL never means a lower rating', () => {
  let prev = Infinity;
  for (let a = 0; a <= 600; a += 2.5) {
    const e = eloFromAcpl(a);
    assert.ok(e <= prev + 1e-9, `ACPL ${a}: ${e} should not exceed ${prev}`);
    prev = e;
  }
});

test('eloFromAcpl lands near the measured bot table', () => {
  // [mean ACPL of the bots, their Elo]; the fit is good to roughly 100-200 Elo
  for (const [acpl, elo, tol] of [[381, 125, 150], [249, 350, 200], [117, 700, 250], [95, 1000, 250], [74, 1175, 250], [65, 1475, 250], [46, 2000, 250], [33, 2200, 250], [15, 2700, 250]]) {
    const got = eloFromAcpl(acpl);
    assert.ok(Math.abs(got - elo) <= tol, `ACPL ${acpl}: expected about ${elo}, got ${Math.round(got)}`);
  }
});

test('performanceFromAcpl: integer, always within 100-3000, null without evidence', () => {
  for (const acpl of [0, 1, 8, 20, 50, 100, 250, 500, 5000]) {
    for (const moves of [1, 5, 20, 60, 200]) {
      for (const prior of [100, 800, 1500, 3000]) {
        const p = performanceFromAcpl(acpl, moves, prior);
        assert.ok(Number.isInteger(p) && p >= MIN_ELO && p <= MAX_ELO, `${acpl}/${moves}/${prior}: ${p}`);
      }
    }
  }
  assert.equal(performanceFromAcpl(null, 30), null);
  assert.equal(performanceFromAcpl(NaN, 30), null);
  assert.equal(performanceFromAcpl(40, 0), null);
  assert.equal(performanceFromAcpl(-5, 30), null);
});

test('performanceFromAcpl: monotone in ACPL, and longer games move the result further from the prior', () => {
  let prev = Infinity;
  for (let a = 0; a <= 500; a += 5) { const p = performanceFromAcpl(a, 50, 1000); assert.ok(p <= prev, `ACPL ${a}`); prev = p; }
  // a very good game (low ACPL) is rated above the prior, more so over more moves
  const short = performanceFromAcpl(20, 8, 1000); const mid = performanceFromAcpl(20, 40, 1000); const long = performanceFromAcpl(20, 120, 1000);
  assert.ok(short < mid && mid < long && short > 1000, `${short} < ${mid} < ${long}`);
  // a very bad game is rated below the prior, again more so with length
  assert.ok(performanceFromAcpl(300, 8, 1000) > performanceFromAcpl(300, 120, 1000));
  assert.ok(performanceFromAcpl(300, 120, 1000) < 1000);
  // the prior is what a game with no say would give back
  assert.ok(Math.abs(performanceFromAcpl(eloFromAcpl(80), 1, 1234) - 1234) < 400);
});

test('evidenceWeight: between 0 and 1 and rising with the number of moves', () => {
  assert.equal(evidenceWeight(0), 0);
  let prev = 0;
  for (const m of [1, 5, 10, 20, 40, 80, 160]) { const w = evidenceWeight(m); assert.ok(w > prev && w < 1, `${m}`); prev = w; }
});

test('sane values for typical games', () => {
  const p = (acpl, moves = 40) => performanceFromAcpl(acpl, moves, 1200);
  assert.ok(p(15) > 1300 && p(15) <= 3000);
  assert.ok(p(300) < 1100 && p(300) >= 100);
  assert.ok(p(60) > p(120));
});
