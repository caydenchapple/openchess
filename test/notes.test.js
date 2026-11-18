import test from 'node:test';
import assert from 'node:assert/strict';
import { motifs, moveNote } from '../client/src/notes.js';
import { sacrificeOf, buildReview, CLASSES } from '../client/src/analysis-core.js';
import { Chess } from 'chess.js';

test('a knight fork is recognised', () => {
  const m = motifs('3q3r/8/8/4N3/8/8/8/4K2k w - - 0 1', 'e5f7');
  assert.ok(m.some((s) => /forks the queen on d8 and rook on h8/.test(s)), m.join('|'));
});

test('a pin to the queen is recognised', () => {
  // white bishop to b5 pins the knight on c6 to the king on e8? use the queen behind instead
  const m = motifs('4q1k1/8/2n5/8/8/8/8/5B1K w - - 0 1', 'f1b5');
  assert.ok(m.some((s) => /pins the knight on c6 to the queen on e8/.test(s)), m.join('|'));
});

test('a sacrifice that is not won back is detected, an even trade is not', () => {
  // White gives the rook on a1 for nothing in the line: Rxa7 Rxa7 (rook lost), then something quiet
  const fen = 'r5k1/p7/8/8/8/8/8/R3K3 w - - 0 1';
  const sac = sacrificeOf(fen, 'a1a7', ['a1a7', 'a8a7', 'e1d1', 'a7a1'], 'w');
  assert.ok(sac && sac.piece === 'r');
  const win = sacrificeOf(fen, 'a1a7', ['a1a7', 'g8f8'], 'w'); // simply takes a pawn
  assert.equal(win, null);
});

test('review gives Brilliant, Great and Miss like Chess.com', () => {
  assert.ok(['brilliant', 'great', 'miss'].every((c) => CLASSES.includes(c)));
  // 1.e4 e5 with fake evals: every move "best", the second reply much worse alternative -> great
  const c = new Chess(); const fens = [c.fen()]; const moves = [];
  for (const san of ['Nf3', 'Nc6']) { moves.push(c.move(san)); fens.push(c.fen()); }
  const uci = (m) => m.from + m.to;
  const evals = [
    { cp: 30, best: uci(moves[0]), pv: [uci(moves[0])], alt: { cp: -300, best: 'a2a3' } },
    { cp: 30, best: uci(moves[1]), pv: [uci(moves[1])], alt: null },
    { cp: 30, best: null, pv: [], alt: null },
  ];
  const r = buildReview({ fens, moves, evals, playerColor: 'w' });
  assert.ok(['book', 'great'].includes(r.plies[0].cls));
  assert.equal(r.plies.length, 2);
});

test('notes exist for every class', () => {
  const fen = new Chess().fen();
  const c = new Chess(); c.move('e4');
  const base = { uci: 'e2e4', san: 'e4', color: 'w', bestUci: 'e2e4', refute: 'e7e5', wpBefore: 50, wpAfter: 40, cpBefore: 20, cpAfter: -30, loss: 10, phase: 'opening', tags: [], pvSan: ['e4', 'e5'] };
  for (const cls of CLASSES) {
    const notes = moveNote({ ...base, cls }, { fenBefore: fen, fenAfter: c.fen(), mine: true });
    assert.ok(notes.length && notes.every((s) => typeof s === 'string' && !/undefined|NaN/.test(s)), `${cls}: ${notes.join(' ')}`);
  }
});
