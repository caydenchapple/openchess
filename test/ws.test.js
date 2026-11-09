import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createApp, attachWebSocket } from '../server/index.js';
import { Lobby } from '../server/rooms.js';

const lobby = new Lobby();
const server = createServer(createApp({ lobby }));
const wss = attachWebSocket(server, lobby);
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
test.after(() => { wss.close(); server.closeAllConnections?.(); server.close(); });

function client(id, name, rating = 1000) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = []; const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d); inbox.push(m);
    waiters.splice(0).forEach((w) => w());
  });
  const ready = new Promise((r) => ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', id, name, rating })); r(); }));
  const next = async (type, ms = 2000) => {
    const t0 = Date.now();
    for (;;) {
      const i = inbox.findIndex((m) => m.t === type);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${type}; got ${inbox.map((m) => m.t)}`);
      await new Promise((r) => { waiters.push(r); setTimeout(r, 50); });
    }
  };
  return { ws, ready, next, send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
}

test('two websocket clients get paired, play to a result and see the same PGN', async () => {
  const a = client('pa', 'Alice', 1100); const b = client('pb', 'Bob<script>', 900);
  await Promise.all([a.ready, b.ready]);
  await a.next('hello'); await b.next('hello');
  a.send({ t: 'seek', time: 5, inc: 0 });
  await a.next('waiting');
  b.send({ t: 'seek', time: 5, inc: 0 });
  const ga = await a.next('game'); const gb = await b.next('game');
  assert.equal(ga.gameId, gb.gameId);
  assert.notEqual(ga.color, gb.color);
  assert.ok(!JSON.stringify(ga).includes('<script>') && !JSON.stringify(gb).includes('<script>')); // names sanitised
  const white = ga.color === 'w' ? a : b; const black = white === a ? b : a;
  const seq = [[white, 'f2', 'f3'], [black, 'e7', 'e5'], [white, 'g2', 'g4'], [black, 'd8', 'h4']];
  for (const [who, from, to] of seq) {
    who.send({ t: 'move', from, to });
    const m1 = await a.next('move'); const m2 = await b.next('move');
    assert.equal(m1.from, from); assert.equal(m2.to, to);
  }
  const oa = await a.next('over'); const ob = await b.next('over');
  assert.equal(oa.result, '0-1'); assert.equal(oa.pgn, ob.pgn);
  assert.match(oa.pgn, /Qh4#/);
  a.close(); b.close();
});

test('cheating moves are rejected with an error message', async () => {
  const a = client('pc', 'C'); const b = client('pd', 'D');
  await Promise.all([a.ready, b.ready]);
  a.send({ t: 'create', time: 3, inc: 2, color: 'w' });
  const { code } = await a.next('waiting');
  b.send({ t: 'join', code });
  await a.next('game'); await b.next('game');
  b.send({ t: 'move', from: 'e7', to: 'e5' }); // black moving first
  assert.match((await b.next('error')).message, /Not your turn/);
  a.send({ t: 'move', from: 'e2', to: 'e5' });
  assert.match((await a.next('error')).message, /Illegal/);
  a.close(); b.close();
});

test('foreign origins are refused', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: 'https://evil.example' } });
  const code = await new Promise((r) => { ws.on('close', (c) => r(c)); ws.on('error', () => {}); });
  assert.equal(code, 1008);
});
