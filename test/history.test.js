import test from 'node:test';
import assert from 'node:assert/strict';
import { positions, stepView } from '../client/src/history.js';

test('positions: one entry per half-move plus the start, with the squares of each move', () => {
  const p = positions(['e4', 'e5', 'Nf3']);
  assert.equal(p.length, 4);
  assert.equal(p[0].fen.split(' ')[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.deepEqual([p[1].from, p[1].to, p[1].san], ['e2', 'e4', 'e4']);
  assert.deepEqual([p[3].from, p[3].to], ['g1', 'f3']);
  assert.match(p[2].fen, /4p3/);
});

test('stepView: back, forward, jump, and the live position is null', () => {
  assert.equal(stepView(null, 10, -1), 9); // from live, one back
  assert.equal(stepView(9, 10, 1), null); // forward to the end = live again
  assert.equal(stepView(3, 10, 1), 4);
  assert.equal(stepView(null, 10, 'start'), 0);
  assert.equal(stepView(0, 10, -1), 0); // cannot go before the start
  assert.equal(stepView(2, 10, 'live'), null);
  assert.equal(stepView(null, 0, -1), null); // no moves yet
  assert.equal(stepView(null, 10, 4), 4); // jump to a move
  assert.equal(stepView(null, 10, 99), null); // beyond the end is live
});
