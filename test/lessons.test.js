import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { CURRICULUM } from '../client/src/lessons-data.js';
import {
  emptyLearn, addDays, daysBetween, addPoints, currentStreak, weekView, reviewExercise, dueIds, INTERVALS, starsFor,
  completeLesson, statuses, recommend, dailyPlan, flatLessons, exerciseIndex, THEME_LESSONS, DAILY_GOAL,
} from '../client/src/lessons-logic.js';

const uciOf = (m) => m.from + m.to + (m.promotion ?? '');
const SQUARE = /^[a-h][1-8]$/;

test('the curriculum is well formed: legal positions, unique ids, one right quiz answer, real mates', () => {
  const ids = new Set(); let exercises = 0;
  for (const l of flatLessons(CURRICULUM)) {
    assert.ok(l.cards.length >= 2 && l.exercises.length >= 2 && l.why && l.minutes, l.id);
    for (const c of l.cards) {
      if (c.fen) assert.doesNotThrow(() => new Chess(c.fen), `${l.id} card`);
      for (const a of c.arrows ?? []) assert.ok(SQUARE.test(a.from) && SQUARE.test(a.to), `${l.id} arrow`);
    }
    for (const ex of l.exercises) {
      exercises++;
      assert.ok(!ids.has(ex.id), `duplicate id ${ex.id}`); ids.add(ex.id);
      const c = new Chess(ex.fen);
      assert.ok(ex.prompt && ex.hint && ex.explain, ex.id);
      if (ex.type === 'find') {
        const legal = c.moves({ verbose: true });
        if (ex.mate) assert.ok(legal.some((m) => { const d = new Chess(ex.fen); d.move(m.san); return d.isCheckmate(); }), `${ex.id}: no mate`);
        else { assert.ok(ex.answers.length >= 1, ex.id); for (const a of ex.answers) assert.ok(legal.map(uciOf).includes(a), `${ex.id}: ${a} illegal`); }
      } else {
        assert.equal(ex.type, 'quiz');
        assert.equal(ex.options.filter((o) => o.ok).length, 1, `${ex.id}: needs one right option`);
        for (const o of ex.options) assert.doesNotThrow(() => new Chess(ex.fen).move(o.san), `${ex.id}: ${o.san}`);
      }
    }
  }
  assert.ok(exercises >= 40, `only ${exercises} exercises`);
});

test('lessons named by the recommendation rules exist', () => {
  const ids = new Set(flatLessons(CURRICULUM).map((l) => l.id));
  for (const list of Object.values(THEME_LESSONS)) for (const id of list) assert.ok(ids.has(id), id);
});

test('dates: adding days and counting gaps work across months', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-01', '2026-11-09'), 8);
});

test('streak: starts after the daily goal, grows daily, resets after a gap', () => {
  const L = emptyLearn();
  let r = addPoints(L, DAILY_GOAL - 1, '2026-11-01');
  assert.equal(r.extended, false); assert.equal(L.streak.count, 0);
  r = addPoints(L, 1, '2026-11-01');
  assert.equal(r.extended, true); assert.equal(L.streak.count, 1);
  assert.equal(addPoints(L, 3, '2026-11-01').extended, false); // already counted today
  addPoints(L, DAILY_GOAL, '2026-11-02'); assert.equal(L.streak.count, 2);
  assert.deepEqual(currentStreak(L.streak, '2026-11-02'), { count: 2, today: true, atRisk: false });
  assert.equal(currentStreak(L.streak, '2026-11-03').atRisk, true);
  assert.equal(currentStreak(L.streak, '2026-11-05').count, 0);
  addPoints(L, DAILY_GOAL, '2026-11-06'); assert.equal(L.streak.count, 1); assert.equal(L.streak.best, 2);
});

test('streak: a lesson alone is enough, a freeze is earned at 7 days and saves one missed day', () => {
  const L = emptyLearn();
  for (let d = 1; d <= 7; d++) addPoints(L, DAILY_GOAL, addDays('2026-11-01', d - 1));
  assert.equal(L.streak.count, 7); assert.equal(L.streak.freezes, 1);
  // miss 2026-11-08, practise on the 9th: the freeze covers the gap
  assert.equal(currentStreak(L.streak, '2026-11-09').usesFreeze, true);
  const r = addPoints(L, DAILY_GOAL, '2026-11-09');
  assert.equal(r.usedFreeze, true); assert.equal(L.streak.count, 8); assert.equal(L.streak.freezes, 0);
  // two missed days: nothing saves it
  addPoints(L, DAILY_GOAL, '2026-11-13'); assert.equal(L.streak.count, 1);
  assert.equal(weekView(L.streak, '2026-11-13').length, 7);
});

test('spaced repetition: right answers climb the boxes, a miss goes back and returns tomorrow', () => {
  const L = emptyLearn();
  reviewExercise(L, 'x', true, '2026-11-01'); assert.equal(L.ex.x.box, 1); assert.equal(L.ex.x.due, addDays('2026-11-01', INTERVALS[1]));
  reviewExercise(L, 'x', true, '2026-11-02'); assert.equal(L.ex.x.box, 2); assert.equal(L.ex.x.due, '2026-11-05');
  reviewExercise(L, 'x', false, '2026-11-05'); assert.equal(L.ex.x.box, 0); assert.equal(L.ex.x.due, '2026-11-06');
  for (let i = 0; i < 8; i++) reviewExercise(L, 'y', true, '2026-11-01');
  assert.equal(L.ex.y.box, 5);
  assert.deepEqual(dueIds(L, '2026-11-06'), ['x']);
  assert.deepEqual(dueIds(L, '2026-10-01'), []);
});

test('stars: first-try accuracy, best result is kept', () => {
  assert.equal(starsFor(5, 5), 3); assert.equal(starsFor(4, 5), 2); assert.equal(starsFor(2, 5), 1);
  const L = emptyLearn();
  completeLesson(L, 'mate1', 5, 6); assert.equal(L.done.mate1.stars, 2);
  completeLesson(L, 'mate1', 2, 6); assert.equal(L.done.mate1.stars, 2); // a worse retry does not lower it
  completeLesson(L, 'mate1', 6, 6); assert.equal(L.done.mate1.stars, 3);
});

test('path: lessons unlock in order; recommendations follow your weak spots when they apply', () => {
  const L = emptyLearn();
  const order = flatLessons(CURRICULUM).map((l) => l.id);
  let st = statuses(CURRICULUM, L);
  assert.equal(st[order[0]], 'next'); assert.equal(st[order[1]], 'locked');
  assert.equal(recommend(CURRICULUM, L, {}).lesson.id, order[0]);
  // hung pieces are a weakness, but that lesson is still locked: stay on the path
  assert.equal(recommend(CURRICULUM, L, { 'hung-piece': 5 }).personal, false);
  completeLesson(L, order[0], 6, 6);
  completeLesson(L, order[1], 3, 6); // free pieces: 1 star
  st = statuses(CURRICULUM, L); assert.equal(st[order[2]], 'next');
  const rec = recommend(CURRICULUM, L, { 'hung-piece': 5 });
  assert.equal(rec.personal, true); assert.equal(rec.lesson.id, 'free'); assert.match(rec.reason, /undefended/);
});

test('daily practice: due exercises first, then repeats weighted toward weak lessons', () => {
  const L = emptyLearn();
  const idx = exerciseIndex(CURRICULUM);
  assert.deepEqual(dailyPlan(CURRICULUM, L, '2026-11-09'), []); // nothing learned yet
  completeLesson(L, 'mate1', 3, 6); // 1 star
  const m = [...idx.keys()].filter((id) => id.startsWith('mate1'));
  reviewExercise(L, m[0], false, '2026-11-08'); // due on the 9th
  const plan = dailyPlan(CURRICULUM, L, '2026-11-09', {}, 5, () => 0.3);
  assert.equal(plan[0], m[0]); assert.equal(plan.length, 5); assert.equal(new Set(plan).size, 5);
});
