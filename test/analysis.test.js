import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { OPENINGS, detectOpening, bookDepth } from '../client/src/openings.js';
import {
  winPct, moveAccuracy, classifyLoss, aggregateAccuracy, estimatePerformance, scoreToCp,
  buildReview, compactReview, hydrateReview, phaseOf,
} from '../client/src/analysis-core.js';
import { updateRating, expected } from '../client/src/rating.js';

test('every opening line is legal chess', () => {
  for (const o of OPENINGS) {
    const c = new Chess();
    for (const san of o.moves) {
      assert.doesNotThrow(() => c.move(san), `${o.eco} ${o.name}: illegal ${san}`);
    }
  }
});

test('opening detection picks the longest match', () => {
  const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1'];
  assert.match(detectOpening(sans).name, /Ruy Lopez/);
  assert.equal(detectOpening(['d4', 'd5', 'c4', 'e6']).name, "Queen's Gambit Declined");
  assert.equal(detectOpening(['a3']), null);
  assert.ok(bookDepth(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4']) >= 7);
});

test('win probability, accuracy and classification maths', () => {
  assert.ok(Math.abs(winPct(0) - 50) < 1e-9);
  assert.ok(winPct(300) > 70 && winPct(300) < 80);
  assert.ok(winPct(-300) < 30);
  assert.ok(moveAccuracy(0) > 99.9);
  assert.ok(moveAccuracy(50) < 15);
  assert.equal(classifyLoss(0, true), 'best');
  assert.equal(classifyLoss(1, false), 'excellent');
  assert.equal(classifyLoss(3, false), 'good');
  assert.equal(classifyLoss(7, false), 'inaccuracy');
  assert.equal(classifyLoss(15, false), 'mistake');
  assert.equal(classifyLoss(40, false), 'blunder');
  assert.ok(aggregateAccuracy([100, 100, 100, 5]) < 100 * 0.75); // harmonic penalty
  assert.equal(scoreToCp({ mate: 3 }), 9970);
  assert.equal(scoreToCp({ mate: -1 }), -9990);
});

test('performance estimate is monotonic and shrinks on short games', () => {
  const a = estimatePerformance(20, 40); const b = estimatePerformance(60, 40); const c = estimatePerformance(120, 40);
  assert.ok(a > b && b > c);
  assert.ok(Math.abs(estimatePerformance(20, 4, 1000) - 1000) < Math.abs(a - 1000));
});

test('phases follow material', () => {
  assert.equal(phaseOf(new Chess().fen(), 0), 'opening');
  assert.equal(phaseOf(new Chess().fen(), 30), 'middlegame');
  assert.equal(phaseOf('8/5k2/8/8/8/3K4/4R3/8 w - - 0 1', 60), 'endgame');
});

test('elo maths', () => {
  assert.equal(expected(1000, 1000), 0.5);
  assert.ok(updateRating(1000, 20, 1000, 1) > 1000);
  assert.ok(updateRating(1000, 20, 1000, 0) < 1000);
  assert.equal(updateRating(1000, 20, 1000, 0.5), 1000);
});

function replay(sans) {
  const c = new Chess();
  const fens = [c.fen()];
  const moves = sans.map((s) => { const m = c.move(s); fens.push(c.fen()); return m; });
  return { fens, moves };
}

test('buildReview flags a hung queen as a blunder with themes, and survives compaction', () => {
  // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#  (black's 3rd move allows mate)
  const { fens, moves } = replay(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
  const mk = (cp, best, pv = [best]) => ({ cp, best, pv });
  // white-POV evals for each of the 8 positions
  const evals = [
    mk(30, 'e2e4'), mk(30, 'e7e5'), mk(35, 'g1f3'), mk(30, 'g8f6'), mk(40, 'f1c4'),
    mk(60, 'g8f6'), // black to move after 3.Bc4: best Nf6? let's say best is g7g6 (defend); played Nf6 is a blunder
    mk(9990, 'h5f7'), mk(10000, null),
  ];
  evals[5] = mk(60, 'g7g6', ['g7g6']);
  evals[6] = mk(9990, 'h5f7', ['h5f7']);
  const r = buildReview({ fens, moves, evals, playerColor: 'b', priorRating: { w: 1200, b: 1000 } });
  const blunder = r.plies[5];
  assert.equal(blunder.san, 'Nf6');
  assert.equal(blunder.cls, 'blunder');
  assert.ok(blunder.loss > 40);
  assert.equal(blunder.bestSan, 'g6');
  assert.ok(blunder.tags.includes('allowed-mate'));
  assert.equal(r.plies[0].cls, 'book');
  assert.deepEqual(r.keyMoments, [5]);
  assert.ok(r.mine.accuracy < r.summary.w.accuracy);
  assert.equal(r.mine.counts.blunder, 1);
  assert.match(r.opening.name, /Bishop|King's Pawn|Vienna|Italian|King's Knight/);

  const h = hydrateReview(JSON.parse(JSON.stringify(compactReview(r))));
  assert.equal(h.plies[5].cpAfter, r.plies[5].cpAfter);
  assert.equal(h.plies[5].cls, 'blunder');
  assert.ok(JSON.stringify(compactReview(r)).length < JSON.stringify(r).length);
});
