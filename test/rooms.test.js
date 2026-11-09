import test from 'node:test';
import assert from 'node:assert/strict';
import { Lobby, Game } from '../server/rooms.js';

function conn(pid, rating = 1000) {
  const inbox = [];
  return { pid, name: pid, rating, send: (m) => inbox.push(m), inbox, game: null, color: null };
}
const last = (c, t) => [...c.inbox].reverse().find((m) => m.t === t);

test('quick-match pairs two players with the same time control', () => {
  const lobby = new Lobby();
  const a = conn('a'); const b = conn('b'); const c = conn('c');
  [a, b, c].forEach((x) => lobby.add(x));
  assert.equal(lobby.seek(a, 5, 0), null);
  assert.ok(last(a, 'waiting'));
  assert.equal(lobby.seek(c, 3, 2), null); // different TC: no match
  assert.equal(a.game, null);
  assert.equal(lobby.seek(b, 5, 0), null);
  assert.ok(a.game && a.game === b.game);
  assert.notEqual(a.color, b.color);
  assert.equal(last(a, 'game').fen.split(' ')[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
});

test('rejects unsupported time controls and self-matching', () => {
  const lobby = new Lobby();
  const a = conn('a'); const a2 = conn('a');
  lobby.add(a); lobby.add(a2);
  assert.match(lobby.seek(a, 7, 7), /Unsupported/);
  lobby.seek(a, 5, 0);
  lobby.seek(a2, 5, 0); // same pid, must not pair with itself
  assert.equal(a.game, null);
});

test('private invite codes work once', () => {
  const lobby = new Lobby();
  const a = conn('a'); const b = conn('b'); const c = conn('c');
  [a, b, c].forEach((x) => lobby.add(x));
  lobby.createInvite(a, 10, 0, 'w');
  const { code } = last(a, 'waiting');
  assert.equal(lobby.joinInvite(b, code), null);
  assert.equal(a.color, 'w');
  assert.equal(b.color, 'b');
  assert.match(lobby.joinInvite(c, code), /expired/);
});

test('moves are validated, turn order enforced, checkmate ends the game', () => {
  const lobby = new Lobby();
  const a = conn('a'); const b = conn('b');
  lobby.add(a); lobby.add(b);
  lobby.createInvite(a, 5, 0, 'w'); lobby.joinInvite(b, last(a, 'waiting').code);
  const g = a.game;
  assert.equal(g.move('b', { from: 'e7', to: 'e5' }), 'Not your turn');
  assert.equal(g.move('w', { from: 'e2', to: 'e5' }), 'Illegal move');
  for (const [c, f, t] of [['w', 'f2', 'f3'], ['b', 'e7', 'e5'], ['w', 'g2', 'g4'], ['b', 'd8', 'h4']]) {
    assert.equal(g.move(c, { from: f, to: t }), null);
  }
  assert.equal(g.status, 'over');
  assert.equal(g.result, '0-1');
  assert.equal(g.reason, 'checkmate');
  assert.match(last(a, 'over').pgn, /Qh4#/);
  assert.equal(g.move('w', { from: 'a2', to: 'a3' }), 'Game is over');
});

test('clock: increments, flagging and insufficient-material timeouts', () => {
  let t = 1_000_000;
  const now = () => t;
  const g = new Game('x', { name: 'w', rating: 1000 }, { name: 'b', rating: 1000 }, 1, 2, { now });
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
  assert.equal(g.result, '1-0');
  assert.equal(g.reason, 'timeout');
  g.dispose();
});

test('resign before move 2 aborts; later it concedes; draw offers need agreement', () => {
  const mk = () => { const g = new Game('x', { name: 'w', rating: 1 }, { name: 'b', rating: 1 }, 5, 0); g.attach('w', () => {}); g.attach('b', () => {}); return g; };
  let g = mk(); g.resign('w'); assert.equal(g.reason, 'aborted'); g.dispose();
  g = mk(); g.move('w', { from: 'e2', to: 'e4' }); g.move('b', { from: 'e7', to: 'e5' });
  g.draw('w', 'offer'); assert.equal(g.drawOffer, 'w');
  g.draw('w', 'accept'); assert.equal(g.status, 'playing'); // can't accept own offer
  g.draw('b', 'accept'); assert.equal(g.result, '1/2-1/2'); g.dispose();
  g = mk(); g.move('w', { from: 'e2', to: 'e4' }); g.move('b', { from: 'e7', to: 'e5' });
  g.resign('b'); assert.equal(g.result, '1-0'); g.dispose();
});

test('reconnect restores state with the player token', () => {
  const lobby = new Lobby();
  const a = conn('a'); const b = conn('b');
  lobby.add(a); lobby.add(b);
  lobby.createInvite(a, 5, 0, 'w'); lobby.joinInvite(b, last(a, 'waiting').code);
  a.game.move('w', { from: 'e2', to: 'e4' });
  const { gameId, token } = last(b, 'game');
  const b2 = conn('b'); lobby.add(b2);
  assert.match(lobby.rejoin(b2, gameId, 'nope'), /Invalid/);
  assert.equal(lobby.rejoin(b2, gameId, token), null);
  assert.deepEqual(last(b2, 'game').moves, ['e4']);
  assert.equal(last(b2, 'game').color, 'b');
  a.game.dispose();
});
