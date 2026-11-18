import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from '../client/src/store.js';
import { sequence, isUnlocked, markBeaten, suggestedLevel, unlockHint } from '../client/src/ladder.js';

test('a new player starts at 100 and only the bottom rungs are open', () => {
  const st = get();
  assert.equal(st.ratings.computer.r, 100);
  assert.equal(st.ratings.online.r, 100);
  const seq = sequence();
  assert.ok(isUnlocked(seq[0]));
  assert.ok(!isUnlocked(seq.at(-1)));
  assert.ok(seq.filter((l) => isUnlocked(l)).length <= 3);
  assert.match(unlockHint(seq.at(-1)), /^Beat /);
  assert.ok(isUnlocked(suggestedLevel()));
});

test('beating a level opens the next one up', () => {
  const seq = sequence();
  const i = seq.findIndex((l) => !isUnlocked(l));
  assert.ok(i > 0);
  const opened = markBeaten(seq[i - 1].id);
  assert.equal(opened?.id, seq[i].id);
  assert.ok(isUnlocked(seq[i]));
  assert.ok(!isUnlocked(seq[i + 1] ?? { id: -1, elo: 99999 }));
});

test('"unlock everything" opens the whole ladder', () => {
  get().settings.unlockAll = true;
  assert.ok(sequence().every((l) => isUnlocked(l)));
  get().settings.unlockAll = false;
});
