import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { LEVELS, GROUPS, chooseMove, strengthOf } from '../client/src/levels.js';
import { FISCHER_BOOK, bookMove, styleBonus, fischerMove } from '../client/src/fischer.js';

test('levels: unique ids, known groups, Elo rises with the id, named legends carry a note', () => {
  const groups = new Set(GROUPS.map((g) => g.id));
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  for (const l of LEVELS) { assert.ok(groups.has(l.group), l.name); assert.ok(l.nodes > 0, l.name); }
  const ladder = LEVELS.filter((l) => l.group !== 'famous').sort((a, b) => a.id - b.id);
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i].elo > ladder[i - 1].elo, `${ladder[i].name} should be stronger than ${ladder[i - 1].name}`);
  for (const l of LEVELS.filter((x) => x.group === 'legend' || x.group === 'famous')) assert.ok(l.person?.note, l.name);
  assert.ok(LEVELS.filter((l) => l.group === 'legend').length >= 6);
  assert.deepEqual(strengthOf({ uciElo: 1500 }), { uciElo: 1500 });
});

test('Fischer book: every line is legal chess, and each is filed under the colour he plays', () => {
  for (const line of FISCHER_BOOK) {
    const c = new Chess();
    for (const san of line.moves) assert.doesNotThrow(() => c.move(san), `${line.moves.slice(0, 6).join(' ')}…: ${san} is illegal`);
  }
  assert.ok(FISCHER_BOOK.some((l) => l.side === 'w') && FISCHER_BOOK.some((l) => l.side === 'b'));
});

test('Fischer opens 1.e4, answers 1.e4 with the Najdorf Sicilian and 1.d4 with the King\'s Indian', () => {
  assert.equal(bookMove([], 'w'), 'e4');
  const rand = () => 0;
  assert.equal(bookMove(['e4'], 'b', rand), 'c5');
  assert.equal(bookMove(['e4', 'c5', 'Nf3'], 'b'), 'd6');
  const najdorf = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'];
  assert.equal(bookMove(najdorf, 'b'), 'a6');
  assert.equal(bookMove(['d4'], 'b'), 'Nf6');
  assert.equal(bookMove(['d4', 'Nf6', 'c4'], 'b'), 'g6');
  // his poisoned pawn line after 6.Bg5 e6 7.f4
  assert.equal(bookMove([...najdorf, 'a6'].concat(['Bg5', 'e6', 'f4']), 'b'), 'Qb6');
  assert.equal(bookMove(['a3'], 'b'), null); // out of the repertoire: the engine takes over
});

test('the Game of the Century is in the book, so Fischer can answer Byrne move for move', () => {
  const moves = FISCHER_BOOK.find((l) => l.moves.at(-1) === 'Rc2#').moves;
  assert.equal(moves.length, 82);
  const c = new Chess(); for (const m of moves) c.move(m);
  assert.ok(c.isCheckmate());
  assert.equal(bookMove(moves.slice(0, 11), 'b'), moves[11]); // 6.Qb3 ... dxc4
});

test('style tilt: prefers a bishop move and checks over a rim knight when evaluations are equal', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  assert.ok(styleBonus(fen, 'f1c4', 0, 6) > styleBonus(fen, 'b1a3', 0, 6));
  assert.ok(styleBonus(fen, 'f1b5', 0, 6) >= 5);
});

test('Fischer after the book: picks among the engine\'s near-equal best moves using his taste', async () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'; // out of his lines for these moves
  const search = async () => ({ best: 'b1c3', lines: [{ cp: 20, pv: ['b1c3'] }, { cp: 15, pv: ['f1b5'] }, { cp: 10, pv: ['f1c4'] }, { cp: -120, pv: ['h2h4'] }] });
  const move = await fischerMove(search, fen, { nodes: 1000, uciElo: 2785 }, ['a3', 'a6', 'a4', 'a5', 'b3']);
  assert.match(move, /^f1[bc][45]$/); // a bishop move, not the engine's knight move and never the 120cp blunder
});

test('chooseMove: random moves at low levels, the engine otherwise, always legal', async () => {
  const fen = new Chess().fen();
  const asked = [];
  const search = async (f, o) => { asked.push(o); return { best: 'e2e4', lines: [] }; };
  assert.equal(await chooseMove(search, fen, { nodes: 10, randomness: 0 }), 'e2e4');
  const m = await chooseMove(search, fen, { nodes: 10, randomness: 1 }, () => 0);
  assert.match(m, /^[a-h][1-8][a-h][1-8]/);
  assert.equal(asked.length, 1);
  assert.equal(await chooseMove(async () => ({ best: 'zzzz', lines: [] }), fen, { nodes: 10 }, () => 0).then((x) => x.length >= 4), true); // an illegal engine answer is replaced
});
