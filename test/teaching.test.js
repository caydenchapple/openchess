import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial } from '../client/src/tutorial/tutorial.js';
import { reviewSteps } from '../client/src/review-steps.js';

function make(world, saved = null, extra = {}) {
  let t = 0; let store = saved;
  const tut = createTutorial({
    version: 1, steps: reviewSteps, now: () => t, context: () => world,
    skipIfPlayed: (w) => w.reviewedBefore, load: () => store, save: (p) => { store = JSON.parse(JSON.stringify(p)); }, ...extra,
  });
  return { tut, advance: (ms) => { t += ms; tut.tick(); }, saved: () => store };
}
const fresh = () => ({ hasMistakes: true, onMistake: false, viewingBetter: false, stepped: false, reviewedBefore: false });

test('steps are short, and each finishes on a state of the world', () => {
  for (const s of reviewSteps) {
    assert.ok(s.say.replace(/\{\w+\}/g, 'x').split(/\s+/).length <= 12, `${s.id} is too long`);
    assert.ok(s.done?.when, `${s.id} must finish on a state, not an event`);
    assert.ok(s.target, `${s.id} needs a target`);
  }
});

test('walks next-mistake → better-move → step-through as the player does them', () => {
  const w = fresh(); const { tut, advance } = make(w);
  tut.start(); advance(1000);
  assert.equal(tut.view().id, 'next-mistake');
  w.onMistake = true; advance(100);
  assert.equal(tut.view().id, 'better-move');
  w.viewingBetter = true; advance(100);
  assert.equal(tut.view().id, 'step-through');
  w.stepped = true; advance(100);
  assert.equal(tut.view().finished, true);
});

test('a player who did things early is never taught them', () => {
  const w = { ...fresh(), onMistake: true, viewingBetter: true };
  const { tut, advance } = make(w); tut.start(); advance(1000);
  assert.equal(tut.view().id, 'step-through');
});

test('a game with no mistakes skips the mistake steps', () => {
  const { tut, advance } = make({ ...fresh(), hasMistakes: false }); tut.start(); advance(1000);
  assert.equal(tut.view().id, 'step-through');
});

test('someone who already reviewed games is never taught', () => {
  const { tut } = make({ ...fresh(), reviewedBefore: true }); tut.start();
  assert.equal(tut.view().skipped, 'experienced');
  assert.equal(tut.view().visible, false);
});

test('skip is remembered, and a finished tutorial does not return after a reload', () => {
  const a = make(fresh()); a.tut.start(); a.advance(1000); a.tut.skip();
  const b = make(fresh(), a.saved()); b.tut.start();
  assert.equal(b.tut.view().skipped, 'player');
  assert.equal(b.tut.view().active, false);

  const w = fresh(); const c = make(w); c.tut.start(); c.advance(1000);
  Object.assign(w, { onMistake: true, viewingBetter: true, stepped: true }); c.advance(100);
  const d = make(fresh(), c.saved()); d.tut.start();
  assert.equal(d.tut.view().finished, true);
  assert.equal(d.tut.view().active, false);
});

test('a half-done tutorial resumes after the steps already done', () => {
  const w = fresh(); const a = make(w); a.tut.start(); a.advance(1000);
  w.onMistake = true; a.advance(100);
  const b = make(fresh(), a.saved()); b.tut.start(); b.advance(1000);
  assert.equal(b.tut.view().id, 'better-move');
});
