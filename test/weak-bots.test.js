import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { LEVELS, chooseMove, beginnerMove, softmaxMove, materialAfter } from '../client/src/levels.js';

const moveOf = (fen, uci) => new Chess(fen).moves({ verbose: true }).find((m) => m.from + m.to + (m.promotion ?? '') === uci);

test('materialAfter: sees a hung queen, a free pawn, a defended capture and an allowed mate', () => {
  // White queen on d4 can be taken by the knight on c6 if it stays on d4
  const hang = 'r1bqkbnr/pppp1ppp/2n5/8/3QP3/8/PPP2PPP/RNB1KBNR w KQkq - 0 1';
  const g = new Chess(hang);
  assert.ok(materialAfter(g, moveOf(hang, 'd4b4')) <= -8, 'putting the queen where the knight takes it');
  assert.ok(materialAfter(g, moveOf(hang, 'd4d3')) >= 0, 'a safe queen move');
  // a free pawn: white queen takes an undefended pawn
  const free = 'rnb1kbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 1';
  assert.equal(materialAfter(new Chess(free), moveOf(free, 'd4a7')) <= 1, true);
  // the position is restored after scoring
  assert.equal(g.fen(), hang);
});

test('beginnerMove: always legal; the worst bot hangs material, the careful one does not, and mate in one is usually found', () => {
  const rand = (() => { let x = 7; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); })();
  const fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', '4k3/8/8/8/8/8/4Q3/4K2R w K - 0 1'];
  let worstLoss = 0; let carefulLoss = 0; let n = 0;
  for (const fen of fens) {
    for (let i = 0; i < 12; i++) {
      const legal = new Chess(fen).moves({ verbose: true });
      for (const [lvl, add] of [[{ style: 'beginner', blunder: 1, missMate: 1 }, 'w'], [{ style: 'beginner', careful: 1, missMate: 1 }, 'c']]) {
        const uci = beginnerMove(fen, lvl, rand);
        const m = legal.find((x) => x.from + x.to + (x.promotion ?? '') === uci);
        assert.ok(m, `legal: ${uci}`);
        const loss = Math.min(0, materialAfter(new Chess(fen), m));
        if (add === 'w') worstLoss += loss; else carefulLoss += loss;
      }
      n++;
    }
  }
  assert.ok(worstLoss < carefulLoss, `blunder bot loses more material (${worstLoss}) than careful bot (${carefulLoss}) over ${n} moves`);
  // mate in one on the board: found unless the level misses it
  const mateFen = '6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1';
  assert.equal(beginnerMove(mateFen, { style: 'beginner', blunder: 1, missMate: 0 }, () => 0.3), 'a1a8');
});

test('softmaxMove: temperature decides how often the best move is chosen; slip gives a random legal move', async () => {
  const fen = new Chess().fen();
  const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to);
  const lines = [{ cp: 30, pv: ['e2e4'] }, { cp: 20, pv: ['d2d4'] }, { cp: -150, pv: ['f2f3'] }];
  const search = async () => ({ best: 'e2e4', lines });
  const rng = (seed) => { let x = seed; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
  const count = async (temp, slip = 0) => {
    const r = rng(99); const c = { e2e4: 0, d2d4: 0, f2f3: 0, other: 0 };
    for (let i = 0; i < 600; i++) { const m = await softmaxMove(search, fen, { nodes: 300, temp, slip }, r, legal); c[m in c ? m : 'other']++; }
    return c;
  };
  const cold = await count(0.05); const warm = await count(12); const slipped = await count(0.05, 0.5);
  assert.ok(cold.e2e4 >= 590, 'near-zero temperature plays the engine move');
  assert.ok(warm.d2d4 > 100 && warm.e2e4 > 100 && warm.f2f3 > 0 && warm.f2f3 < warm.e2e4 / 2, 'warm: mostly good moves, sometimes the bad one');
  assert.ok(slipped.other > 100, 'slip plays other moves');
  // lines that are not legal moves are ignored
  assert.equal(await softmaxMove(async () => ({ best: null, lines: [{ cp: 0, pv: ['a1a8'] }] }), fen, { nodes: 1, temp: 5 }, () => 0, legal), legal[0]);
  // black to move: scores are White's view
  const bfen = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1').fen();
  const blegal = new Chess(bfen).moves({ verbose: true }).map((m) => m.from + m.to);
  const m = await softmaxMove(async () => ({ best: 'e7e5', lines: [{ cp: 40, pv: ['a7a6'] }, { cp: -30, pv: ['e7e5'] }] }), bfen, { nodes: 1, temp: 0.5 }, () => 0.5, blegal);
  assert.equal(m, 'e7e5'); // -30 for White is the better score for Black
});

test('chooseMove handles every level shape: beginner bots never call the engine, human-like bots ask for several lines', async () => {
  const fen = new Chess().fen();
  const calls = [];
  const search = async (f, o) => { calls.push(o); return { best: 'e2e4', lines: [{ cp: 10, pv: ['e2e4'] }, { cp: 5, pv: ['d2d4'] }] }; };
  const beg = LEVELS.find((l) => l.style === 'beginner');
  assert.ok(beg, 'there are beginner levels');
  const m = await chooseMove(search, fen, beg, () => 0.4);
  assert.match(m, /^[a-h][1-8][a-h][1-8]/);
  assert.equal(calls.length, 0);
  const hum = LEVELS.find((l) => l.temp);
  if (hum) { await chooseMove(search, fen, hum, () => 0.9); assert.equal(calls.length, 1); assert.ok(calls[0].multipv >= 2); }
  for (const l of LEVELS) assert.ok(l.nodes > 0 && l.elo > 0, l.name);
});

test('the ladder is sorted by Elo, ids are unique, and it reaches down to about 100', () => {
  const elos = LEVELS.map((l) => l.elo);
  const nonFamous = LEVELS.filter((l) => l.group !== 'famous');
  for (let i = 1; i < nonFamous.length; i++) assert.ok(nonFamous[i].elo > nonFamous[i - 1].elo, `${nonFamous[i].name} (${nonFamous[i].elo}) should be above ${nonFamous[i - 1].name}`);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  assert.ok(Math.min(...elos) <= 150, 'a rung near 100');
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 101]) assert.ok(LEVELS.some((l) => l.id === id), `level ${id} still exists`);
});
