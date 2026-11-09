import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { buildReview } from '../client/src/analysis-core.js';
import {
  standing, explainPly, reviewReport, openingNotes, positionInsight, loosePieces, trainingPlan, describeMove,
} from '../client/src/coach.js';
import { detectOpening } from '../client/src/openings.js';
import { OPENINGS } from '../client/src/openings.js';
import { aggregate } from '../client/src/stats.js';

function replay(sans) {
  const c = new Chess(); const fens = [c.fen()];
  const moves = sans.map((s) => { const m = c.move(s); fens.push(c.fen()); return m; });
  return { fens, moves };
}
const mk = (cp, best, pv = [best], extra = {}) => ({ cp, best, pv, ...extra });

// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
function scholars() {
  const { fens, moves } = replay(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
  const evals = [mk(30, 'e2e4'), mk(30, 'e7e5'), mk(35, 'g1f3'), mk(30, 'g8f6'), mk(40, 'f1c4'),
    mk(60, 'g7g6'), mk(9990, 'h5f7'), mk(10000, null)];
  const review = buildReview({ fens, moves, evals, playerColor: 'b', priorRating: { w: 1200, b: 1000 } });
  return { fens, moves, review };
}

test('standing() turns centipawns into words', () => {
  assert.equal(standing(0), 'about equal');
  assert.equal(standing(50), 'slightly better');
  assert.equal(standing(-150), 'clearly worse');
  assert.equal(standing(400), 'much better');
  assert.equal(standing(900), 'winning');
  assert.equal(standing(-9990), 'getting checkmated');
});

test('explainPly names the mate that was allowed and the better move', () => {
  const { fens, review } = scholars();
  const text = explainPly(review.plies[5], fens[5], fens[6]);
  assert.match(text, /allows a forced checkmate, starting with Qxf7#/);
  assert.match(text, /g6 kept you safe/);
});

test('explainPly spots a hung piece and what captures it', () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.Nxe5?? Nxe5 (white drops a knight)
  const { fens, moves } = replay(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Nxe5', 'Nxe5']);
  const evals = [mk(30, 'e2e4'), mk(30, 'e7e5'), mk(30, 'g1f3'), mk(30, 'b8c6'), mk(30, 'f1c4'), mk(30, 'f8c5'),
    mk(40, 'c2c3'), mk(-250, 'c6e5', ['c6e5']), mk(-250, 'f1e2')];
  const review = buildReview({ fens, moves, evals, playerColor: 'w', priorRating: { w: 1000, b: 1000 } });
  const p = review.plies[6];
  assert.ok(p.tags.includes('hung-piece'));
  assert.match(explainPly(p, fens[6], fens[7]), /Nxe5 .*(wins a knight|can simply be captured)|knight/i);
});

test('reviewReport produces a summary, strengths, three lessons and key moments', () => {
  const { fens, review } = scholars();
  const game = { color: 'b', outcome: 'loss', opponent: { name: 'Alice', rating: 1200 }, reason: 'checkmate' };
  const r = reviewReport({ review, game, fens });
  assert.match(r.summary, /You lost to Alice as Black/);
  assert.match(r.summary, /turning point was 3\.\.\. Nf6/);
  assert.equal(r.lessons.length, 3);
  assert.ok(r.lessons.every((l) => l.title && l.body && l.drill));
  assert.ok(r.strengths.length >= 1);
  assert.deepEqual(r.keyMoments.map((k) => k.id), [5]);
  assert.ok(r.opening.comment.includes('Bishop') || r.opening.comment.includes('King'));
});

test('every opening in the book gets specific notes, not the generic fallback', () => {
  const generic = openingNotes('Totally Unknown', '');
  for (const o of OPENINGS) {
    const notes = openingNotes(o.name, o.eco);
    assert.ok(notes.idea && notes.plans.length && notes.pitfalls.length, o.name);
    assert.notEqual(notes.idea, generic.idea, `${o.name} fell through to generic notes`);
  }
});

test('opening notes match the right family (ordering of patterns)', () => {
  assert.match(openingNotes("King's Indian Defense: Classical").idea, /centre, then attacks/);
  assert.match(openingNotes("English Opening: Reversed Sicilian").idea, /d5 and the centre from the flank/);
  assert.match(openingNotes('Four Knights Game: Scotch Variation').idea, /symmetrical/i);
  assert.match(openingNotes('Italian Game: Two Knights, Fried Liver Attack').idea, /sacrifices a knight on f7/);
});

test('loosePieces finds attacked undefended pieces', () => {
  const loose = loosePieces('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  assert.deepEqual(loose, []);
  const l2 = loosePieces('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3'); // Black queen attacks e4? and f2
  assert.ok(Array.isArray(l2));
  const l3 = loosePieces('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
  assert.ok(l3.some((x) => x.piece === 'q' && x.square === 'd5')); // queens face each other: d5 attacked by Qd1, defended by nothing
});

test('positionInsight combines engine lines and rule-based notes', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const ins = positionInsight(fen, [{ cp: 30, pv: ['e2e4', 'e7e5'], mate: null }, { cp: 25, pv: ['d2d4', 'd7d5'], mate: null }]);
  assert.match(ins.headline, /White to move and about equal/);
  assert.equal(ins.candidates[0].san, 'e4');
  assert.match(ins.candidates[0].does, /centre/);
  assert.ok(ins.notes.some((n) => /Material is equal/.test(n)));
  assert.match(positionInsight('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', []).headline, /Checkmate|drawn/);
});

test('describeMove phrases', () => {
  const c = new Chess();
  assert.equal(describeMove(c.move('Nf3')), 'develops the knight');
  assert.equal(describeMove(new Chess().move('e4')), 'fights for the centre');
});

test('trainingPlan and aggregate work from stored reviews', () => {
  const { review } = scholars();
  const games = [{ review: { mine: review.mine, themes: review.themes, opening: review.opening }, outcome: 'loss', color: 'b' }];
  const agg = aggregate(games);
  assert.equal(agg.reviewed, 1);
  const plan = trainingPlan(agg);
  assert.equal(plan.focus.length, 3);
  assert.match(plan.summary, /1 reviewed game/);
  assert.equal(plan.weekly.length, 5);
});
