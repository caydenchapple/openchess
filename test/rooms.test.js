import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, makeCode, CODE_RE } from '../server/room.js';
import { Game } from '../server/game.js';

function conn(pid, rating = 1000) {
  const inbox = [];
  return { pid, name: pid, rating, send: (m) => inbox.push(m), inbox, color: null };
}
const last = (c, t) => [...c.inbox].reverse().find((m) => m.t === t);
const host = (room, c, extra = {}) => room.hello(c, { id: c.pid, name: c.pid, rating: c.rating, role: 'host', time: 5, inc: 0, color: 'w', ...extra });
const join = (room, c) => room.hello(c, { id: c.pid, name: c.pid, rating: c.rating, role: 'join' });

function started(color = 'w') {
  const room = new Room('ABC234');
  const a = conn('alice'); const b = conn('bob');
  assert.equal(host(room, a, { color }), null);
  assert.equal(join(room, b), null);
  return { room, a, b, white: color === 'w' ? a : b, black: color === 'w' ? b : a, g: room.game };
}
const play = (g, ...moves) => { for (const [c, f, t] of moves) assert.equal(g.move(c, { from: f, to: t }), null); };

test('room codes are short and unambiguous', () => {
  for (let i = 0; i < 50; i++) assert.match(makeCode(), CODE_RE);
  assert.ok(!CODE_RE.test('ABCO12') && !CODE_RE.test('AB'));
});

test('host then join starts a game with the host settings; the host picks their colour', () => {
  const { a, b } = started('b');
  assert.equal(last(a, 'game').color, 'b');
  assert.equal(last(b, 'game').color, 'w');
  assert.equal(last(a, 'game').time, 5);
  assert.ok(last(a, 'waiting').code === 'ABC234');
});

test('joining is refused for unknown rooms, your own room, a full room, and bad settings', () => {
  const room = new Room('ZZZ999');
  assert.match(join(room, conn('x')), /No game with that code/);
  const a = conn('alice');
  assert.match(host(room, a, { time: 7, inc: 7 }), /Unsupported/);
  assert.equal(host(room, a), null);
  assert.match(join(room, conn('alice')), /own game/);
  assert.equal(join(room, conn('bob')), null);
  assert.match(join(room, conn('carol')), /two players/);
  assert.match(host(room, conn('mallory')), /already in use/);
});

test('moves are validated, turn order enforced, checkmate ends the game', () => {
  const { room, a, white, black, g } = started();
  assert.equal(g.move(black.color, { from: 'e7', to: 'e5' }), 'Not your turn');
  assert.equal(room.message(white, { t: 'move', from: 'e2', to: 'e5' }), 'Illegal move');
  play(g, ['w', 'f2', 'f3'], ['b', 'e7', 'e5'], ['w', 'g2', 'g4'], ['b', 'd8', 'h4']);
  assert.equal(g.status, 'over'); assert.equal(g.result, '0-1'); assert.equal(g.reason, 'checkmate');
  assert.match(last(a, 'over').pgn, /Qh4#/);
  assert.equal(g.move('w', { from: 'a2', to: 'a3' }), 'Game is over');
});

test('clock: increments, flagging and insufficient-material timeouts', () => {
  let t = 1_000_000;
  const g = new Game('x', { name: 'w', rating: 1000 }, { name: 'b', rating: 1000 }, 1, 2, { now: () => t });
  g.attach('w', () => {}); g.attach('b', () => {});
  g.move('w', { from: 'e2', to: 'e4' });
  t += 5000;
  g.move('b', { from: 'e7', to: 'e5' }); // clocks start now
  assert.deepEqual(g.liveClocks(), { w: 60000, b: 60000 });
  t += 10_000;
  g.move('w', { from: 'g1', to: 'f3' });
  assert.equal(g.clocks.w, 60000 - 10000 + 2000);
  t += 70_000;
  assert.equal(g.move('b', { from: 'b8', to: 'c6' }), 'Out of time');
  assert.equal(g.result, '1-0'); assert.equal(g.reason, 'timeout');
  g.dispose();
});

test('resign before move 2 aborts; later it concedes; draw offers need agreement', () => {
  const mk = () => { const g = new Game('x', { name: 'w', rating: 1 }, { name: 'b', rating: 1 }, 5, 0); g.attach('w', () => {}); g.attach('b', () => {}); return g; };
  let g = mk(); g.resign('w'); assert.equal(g.reason, 'aborted'); g.dispose();
  g = mk(); play(g, ['w', 'e2', 'e4'], ['b', 'e7', 'e5']);
  g.draw('w', 'offer'); assert.equal(g.drawOffer, 'w');
  g.draw('w', 'accept'); assert.equal(g.status, 'playing');
  g.draw('b', 'accept'); assert.equal(g.result, '1/2-1/2'); g.dispose();
  g = mk(); play(g, ['w', 'e2', 'e4'], ['b', 'e7', 'e5']); g.resign('b'); assert.equal(g.result, '1-0'); g.dispose();
});

test('reconnect restores the game with the player token, and refuses a wrong one', () => {
  const { room, g, black } = started();
  play(g, ['w', 'e2', 'e4']);
  const tok = last(black, 'game').token;
  const b2 = conn('bob');
  assert.match(room.hello(b2, { id: 'bob', token: 'nope' }), /Invalid/);
  assert.equal(room.hello(b2, { id: 'bob', token: tok }), null);
  assert.deepEqual(last(b2, 'game').moves, ['e4']); assert.equal(last(b2, 'game').color, 'b');
  g.dispose();
});

// ---------------- takebacks ----------------
test('takeback: the opponent must accept; one half-move is undone when you just moved', () => {
  const { room, g, white, black } = started();
  play(g, ['w', 'e2', 'e4']);
  assert.equal(room.message(white, { t: 'takeback', action: 'request' }), null);
  assert.deepEqual(last(black, 'takeback_request'), { t: 'takeback_request', plies: 1, by: 'w' });
  assert.equal(g.ply, 1); // nothing happens until the opponent agrees
  room.message(black, { t: 'takeback', action: 'accept' });
  assert.equal(g.ply, 0); assert.equal(g.turn, 'w');
  assert.equal(last(white, 'takeback').fen.split(' ')[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  assert.equal(g.move('w', { from: 'd2', to: 'd4' }), null); // the move can be replayed differently
  g.dispose();
});

test('takeback after the opponent replied undoes both half-moves, and restores the clocks', () => {
  let t = 5_000_000;
  const g = new Game('x', { name: 'w', rating: 1 }, { name: 'b', rating: 1 }, 5, 0, { now: () => t });
  const inbox = { w: [], b: [] };
  g.attach('w', (m) => inbox.w.push(m)); g.attach('b', (m) => inbox.b.push(m));
  play(g, ['w', 'e2', 'e4'], ['b', 'e7', 'e5']);
  t += 20_000; play(g, ['w', 'g1', 'f3']);
  const before = g.liveClocks();
  t += 15_000; play(g, ['b', 'b8', 'c6']);
  assert.equal(g.takebackAction('b', 'request'), null); // black asks to undo ...Nc6
  assert.equal(g.takebackPlies('b'), 1);
  g.takebackAction('w', 'decline');
  assert.equal(g.ply, 4); assert.ok(inbox.b.some((m) => m.t === 'takeback_declined'));
  assert.equal(g.takebackAction('w', 'request'), null); // white asks; black has replied since, so 2 half-moves go
  assert.equal(g.takebackPlies('w'), 2);
  g.takebackAction('b', 'accept');
  assert.equal(g.ply, 2); assert.equal(g.turn, 'w');
  assert.equal(g.clocks.w, 300000); // the clock is back to what it was before the undone moves
  assert.ok(before.w < 300000);
  g.dispose();
});

test('takeback rules: nothing to take back, one request at a time, a cap, and a move cancels the request', () => {
  const { g } = started();
  assert.match(g.takebackAction('w', 'request'), /no move to take back/);
  play(g, ['w', 'e2', 'e4']);
  assert.match(g.takebackAction('b', 'request'), /no move to take back/);
  assert.equal(g.takebackAction('w', 'request'), null);
  assert.match(g.takebackAction('w', 'request'), /already waiting/);
  assert.equal(g.takebackAction('w', 'accept'), null); // the asker cannot accept their own request
  assert.equal(g.ply, 1);
  g.takebackAction('w', 'cancel'); assert.equal(g.takeback, null);
  for (let i = 0; i < 2; i++) { g.takebackAction('w', 'request'); g.takebackAction('b', 'decline'); }
  g.takebackAction('w', 'request');
  g.move('b', { from: 'e7', to: 'e5' }); // the position changed: request is void
  assert.equal(g.takeback, null);
  assert.match(g.takebackAction('w', 'request'), /3 takebacks/);
  g.dispose();
});
