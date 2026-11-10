import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createApp, attachWebSocket, Rooms } from '../server/index.js';

const rooms = new Rooms();
const server = createServer(createApp({ rooms }));
const wss = attachWebSocket(server, rooms);
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
test.after(() => { wss.close(); server.closeAllConnections?.(); server.close(); });

function client(code, hello, origin) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${code}`, origin ? { headers: { Origin: origin } } : undefined);
  const inbox = []; const waiters = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d)); waiters.splice(0).forEach((w) => w()); });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', ...hello })));
  const next = async (type, ms = 2000) => {
    const t0 = Date.now();
    for (;;) {
      const i = inbox.findIndex((m) => m.t === type);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${type}; got ${inbox.map((m) => m.t)}`);
      await new Promise((r) => { waiters.push(r); setTimeout(r, 50); });
    }
  };
  return { ws, next, send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
}
const H = (id, name, rating = 1000) => ({ id, name, rating });

test('host a room, join it with the code, play to checkmate and see the same PGN', async () => {
  const a = client('K7M2QX', { ...H('pa', 'Alice', 1100), role: 'host', time: 5, inc: 0, color: 'w' });
  const w = await a.next('waiting'); assert.equal(w.code, 'K7M2QX');
  const b = client('K7M2QX', { ...H('pb', 'Bob<script>', 900), role: 'join' });
  const ga = await a.next('game'); const gb = await b.next('game');
  assert.equal(ga.color, 'w'); assert.equal(gb.color, 'b'); assert.equal(ga.gameId, gb.gameId);
  assert.ok(!JSON.stringify(ga).includes('<script>')); // names are sanitised
  const seq = [[a, 'f2', 'f3'], [b, 'e7', 'e5'], [a, 'g2', 'g4'], [b, 'd8', 'h4']];
  for (const [who, from, to] of seq) {
    who.send({ t: 'move', from, to });
    const m1 = await a.next('move'); const m2 = await b.next('move');
    assert.equal(m1.from, from); assert.equal(m2.to, to);
  }
  const oa = await a.next('over'); const ob = await b.next('over');
  assert.equal(oa.result, '0-1'); assert.equal(oa.pgn, ob.pgn); assert.match(oa.pgn, /Qh4#/);
  a.close(); b.close();
});

test('there is no matchmaking: an unknown code is an error, and a bad code is refused', async () => {
  const x = client('NQRM27', { ...H('px', 'X'), role: 'join' });
  assert.match((await x.next('error')).message, /No game with that code/);
  const bad = new WebSocket(`ws://127.0.0.1:${port}/ws/not-a-code!`);
  const code = await new Promise((r) => { bad.on('close', (c) => r(c)); bad.on('error', () => {}); });
  assert.equal(code, 1008);
  x.close();
});

test('cheating moves are rejected; takebacks need the opponent to accept', async () => {
  const a = client('TB4444', { ...H('pc', 'C'), role: 'host', time: 3, inc: 2, color: 'w' });
  await a.next('waiting');
  const b = client('TB4444', { ...H('pd', 'D'), role: 'join' });
  await a.next('game'); await b.next('game');
  b.send({ t: 'move', from: 'e7', to: 'e5' });
  assert.match((await b.next('error')).message, /Not your turn/);
  a.send({ t: 'move', from: 'e2', to: 'e4' });
  await a.next('move'); await b.next('move');
  a.send({ t: 'takeback', action: 'request' });
  assert.equal((await b.next('takeback_request')).plies, 1);
  b.send({ t: 'takeback', action: 'accept' });
  const ta = await a.next('takeback'); const tb = await b.next('takeback');
  assert.deepEqual(ta.moves, []); assert.equal(tb.ply, 0);
  a.close(); b.close();
});

test('foreign origins are refused', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/ABCDEF`, { headers: { Origin: 'https://evil.example' } });
  const code = await new Promise((r) => { ws.on('close', (c) => r(c)); ws.on('error', () => {}); });
  assert.equal(code, 1008);
});
