import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { CURRICULUM } from '../client/src/lessons-data.js';
import {
  emptyLearn, addDays, daysBetween, addPoints, currentStreak, weekView, reviewExercise, dueIds, INTERVALS,
  flatLessons, exerciseIndex, THEME_LESSONS, DAILY_GOAL, TOPIC_BASE, expectedScore, exerciseRating, playerLevel, recordResult,
  getSkill, topicChance, topicNeeds, planSession, TARGET_SUCCESS,
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

test('lessons named by the plan rules exist', () => {
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

test('every topic has a difficulty and exercises whose difficulty is in a sensible range', () => {
  for (const l of flatLessons(CURRICULUM)) {
    assert.ok(TOPIC_BASE[l.id], `${l.id} needs a base difficulty`);
    for (const ex of l.exercises) { const d = exerciseRating(l.id, ex); assert.ok(d > 400 && d < 2400, `${ex.id}: ${d}`); }
  }
});

test('player level: beginners start low, ratings and review performance raise it', () => {
  assert.equal(playerLevel({}), 800);
  assert.equal(playerLevel({ computer: 1000, games: 0 }), 800); // no games yet: a default rating tells us nothing
  assert.ok(playerLevel({ computer: 1400, online: 1300, performance: 1500, games: 20 }) > 1350);
  assert.ok(playerLevel({ computer: 3000, games: 50 }) <= 2200);
});

test('skill model: solving raises your rating, failing lowers it, and hard exercises count for more', () => {
  const L = emptyLearn();
  const hard = 1300; const easy = 700;
  const a = recordResult(L, 'forks', hard, true, 1000).r;
  assert.ok(a > 1000);
  const L2 = emptyLearn();
  const b = recordResult(L2, 'forks', easy, true, 1000).r;
  assert.ok(b > 1000 && b < a, 'beating an easy exercise gains less');
  const L3 = emptyLearn();
  assert.ok(recordResult(L3, 'forks', easy, false, 1000).r < 1000);
  assert.ok(expectedScore(1000, 1000) === 0.5 && expectedScore(1400, 1000) > 0.9);
  assert.ok(topicChance(L, 'forks', 1000) > topicChance(emptyLearn(), 'forks', 1000));
});

test('what your games say about you steers the topics', () => {
  const { needs } = topicNeeds({ 'hung-piece': 6, 'missed-tactic': 2 });
  assert.ok(needs.free > needs.forks && needs.routine > 0);
  assert.deepEqual(topicNeeds({}).needs, {});
});

const sessionOf = (L, ctx, seed = 1) => { let x = seed; const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647); return planSession(CURRICULUM, L, ctx, '2026-11-09', rand); };

test('training plan: a beginner starts with simple topics, with a short lesson first, and never sees advanced ones', () => {
  const plan = sessionOf(emptyLearn(), { level: 600, themes: {} });
  const exs = plan.items.filter((i) => i.type === 'ex');
  assert.equal(exs.length, 8);
  assert.equal(plan.items[0].type, 'intro'); // a new topic is taught before it is tested
  const topics = new Set(exs.map((e) => e.topic));
  assert.ok(![...topics].some((t) => TOPIC_BASE[t] > 900 + 100), `advanced topics for a 600 player: ${[...topics]}`);
  assert.equal(new Set(exs.map((e) => e.id)).size, 8);
});

test('training plan: a strong player skips the basics and gets exercises near the 3-in-4 target', () => {
  const L = emptyLearn();
  const plan = sessionOf(L, { level: 1700, themes: {} });
  assert.ok(plan.items.every((i) => i.type !== 'intro' || TOPIC_BASE[i.topic] > 1200), 'no lessons on things far below their level');
  const idx = exerciseIndex(CURRICULUM);
  for (const it of plan.items.filter((i) => i.type === 'ex')) {
    const p = expectedScore(getSkill(L, it.topic, 1700).r, exerciseRating(it.topic, idx.get(it.id).ex));
    assert.ok(p > 0.5, `${it.id} is too hard for them (${p.toFixed(2)})`);
  }
});

test('training plan: your own mistakes steer it, and missed exercises come back first', () => {
  const counts = {}; let runs = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const it of sessionOf(emptyLearn(), { level: 1000, themes: { 'hung-piece': 10 } }, seed).items) if (it.type === 'ex') { counts[it.topic] = (counts[it.topic] ?? 0) + 1; runs++; }
  }
  assert.ok(counts.free / runs > 0.3, `free pieces should dominate when the games show hung pieces: ${JSON.stringify(counts)}`);
  const L = emptyLearn();
  L.skills.free = { r: 1000, n: 5, intro: true };
  reviewExercise(L, 'free-3', false, '2026-11-08');
  const plan = sessionOf(L, { level: 1000, themes: {} }, 7);
  assert.equal(plan.items.find((i) => i.type === 'ex').id, 'free-3');
  assert.match(plan.items.find((i) => i.type === 'ex').reason, /sticks/);
});

test('the target success rate is 3 in 4', () => { assert.equal(TARGET_SUCCESS, 0.75); });
