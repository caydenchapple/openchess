import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createApp, attachWebSocket, Rooms } from '../server/index.js';
import { Hub } from '../server/friends.js';

const server = createServer(createApp({ rooms: new Rooms() }));
const wss = attachWebSocket(server, new Rooms(), new Hub());
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
test.after(() => { wss.close(); server.closeAllConnections?.(); server.close(); });

const A = 'AAAAAAAA'; const B = 'BBBBBBBB'; const C = 'CCCCCCCC';
const KEY = (c) => `${c}-secret-key-0123456789`;

function client(code, extra = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/friends/${code}`);
  const inbox = []; const waiters = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d)); waiters.splice(0).forEach((w) => w()); });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', key: KEY(code), name: `P-${code[0]}`, av: null, friends: [], ...extra })));
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

test('a friend request is delivered, accepted, and then both can see each other online', async () => {
  const b = client(B); await b.next('ready'); await b.next('events');
  const a = client(A); await a.next('ready'); await a.next('events');
  a.send({ t: 'request', to: B });
  assert.equal((await a.next('sent')).result, 'ok');
  const ev = (await b.next('event')).ev;
  assert.equal(ev.type, 'request'); assert.equal(ev.from, A); assert.equal(ev.name, 'P-A');
  b.send({ t: 'accept', to: A });
  const back = (await a.next('event')).ev;
  assert.equal(back.type, 'accepted'); assert.equal(back.from, B);
  a.send({ t: 'friends', list: [B] }); // what the browser does once it has handled the event
  a.send({ t: 'presence', list: [B] });
  let p = (await a.next('presence')).list[0];
  assert.deepEqual([p.friend, p.online, p.name], [true, true, 'P-B']);
  b.close();
  await new Promise((r) => setTimeout(r, 100));
  a.send({ t: 'presence', list: [B] });
  p = (await a.next('presence')).list[0];
  assert.equal(p.online, false);
  a.close();
});

test('strangers learn nothing: no presence and no challenges until both have added each other', async () => {
  const c = client(C); await c.next('ready');
  const a = client(A, { friends: [C] }); await a.next('ready');
  a.send({ t: 'presence', list: [C] });
  const p = (await a.next('presence')).list[0];
  assert.deepEqual([p.known, p.friend, p.online, p.name], [true, false, false, null]);
  a.send({ t: 'challenge', to: C, room: 'K7M2QX', time: 5, color: 'w' });
  assert.match((await a.next('error')).message, /not added you back/);
  c.send({ t: 'friends', list: [A] });
  a.send({ t: 'challenge', to: C, room: 'K7M2QX', time: 5, color: 'w' });
  const sent = await a.next('sent'); assert.equal(sent.online, true);
  const ev = (await c.next('event')).ev;
  assert.deepEqual([ev.type, ev.room, ev.time, ev.color, ev.from], ['challenge', 'K7M2QX', 5, 'w', A]);
  a.send({ t: 'retract', to: C, room: 'K7M2QX' });
  assert.deepEqual((await c.next('gone')).ids, [ev.id]);
  a.close(); c.close();
});

test('requests wait for an offline friend, and the secret key protects a code', async () => {
  const d = 'DDDDDDDD';
  const first = client(d); await first.next('ready'); first.close();
  const a = client(A); await a.next('ready');
  a.send({ t: 'request', to: d });
  assert.equal((await a.next('sent')).result, 'ok');
  const again = client(d); await again.next('ready');
  const list = (await again.next('events')).list;
  assert.deepEqual(list.map((e) => [e.type, e.from]), [['request', A]]);
  again.send({ t: 'ack', ids: [list[0].id] });
  const imposter = new WebSocket(`ws://127.0.0.1:${port}/friends/${d}`);
  const got = await new Promise((res) => { imposter.on('open', () => imposter.send(JSON.stringify({ t: 'hello', key: 'a-completely-different-key-xyz', name: 'x' }))); imposter.on('message', (m) => res(JSON.parse(m))); });
  assert.equal(got.t, 'error'); assert.equal(got.taken, true);
  a.send({ t: 'request', to: 'ZZZZZZZZ' });
  assert.match((await a.next('error')).message, /No one has that friend code/);
  imposter.close(); again.close(); a.close();
});
