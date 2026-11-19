import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Scores, routeScores } from '../server/scores.js';
import { createApp, Rooms, makeScores } from '../server/index.js';

test('a score needs a signed start token and has to be possible in the time that passed', async () => {
  let t = 1_700_000_000_000;
  const s = new Scores(undefined, { now: () => t });
  const { token } = await s.start();
  t += 10_000;
  assert.match((await s.submit({ token: 'x.y', score: 5 })).error, /could not be checked/);
  assert.match((await s.submit({ token, score: 500, name: 'Cheat', pid: 'p1' })).error, /not possible/);
  const ok = await s.submit({ token, score: 20, color: 'b', name: 'Ann<b>', av: 'wk-1', pid: 'p1' });
  assert.deepEqual([ok.ok, ok.rank, ok.best], [true, 1, true]);
  assert.match((await s.submit({ token, score: 20, pid: 'p1' })).error, /already posted/);
  const top = s.top('all').entries; assert.equal(top.length, 1); assert.equal(top[0].name, 'Annb'); assert.equal(top[0].color, 'b');
});

test('one best entry per player, sorted high to low, with a daily board that resets', async () => {
  let t = 1_700_000_000_000;
  const s = new Scores(undefined, { now: () => t });
  const run = async (pid, name, score) => { const { token } = await s.start(); t += 30_000; return s.submit({ token, score, pid, name, color: 'w' }); };
  await run('a', 'Ann', 10); await run('b', 'Ben', 25);
  const r = await run('a', 'Ann', 15);
  assert.deepEqual([r.rank, r.best], [2, true]);
  assert.equal((await run('a', 'Ann', 5)).best, false); // a worse run does not replace the best
  assert.deepEqual(s.top('all').entries.map((e) => [e.name, e.score]), [['Ben', 25], ['Ann', 15]]);
  assert.equal(s.top('day').entries.length, 2);
  t += 86_400_000;
  assert.equal(s.top('day').entries.length, 0); // a new day: the daily board is empty
  assert.equal(s.top('all').entries.length, 2);
});

test('the HTTP routes work on the Node server', async () => {
  const server = createServer(createApp({ rooms: new Rooms(), scores: makeScores(null) }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { token } = await (await fetch(`${base}/scores/start`, { method: 'POST' })).json();
    await new Promise((r) => setTimeout(r, 1200));
    const post = await fetch(`${base}/scores/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, score: 2, color: 'w', name: 'Zed', pid: 'z' }) });
    assert.equal(post.status, 200);
    const top = await (await fetch(`${base}/scores/top?range=all`)).json();
    assert.deepEqual(top.entries.map((e) => [e.name, e.score]), [['Zed', 2]]);
    assert.equal((await fetch(`${base}/scores/nope`)).status, 404);
  } finally { server.closeAllConnections?.(); server.close(); }
});
