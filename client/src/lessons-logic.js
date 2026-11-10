// The learning engine: progress and stars, spaced repetition, daily practice, streaks and recommendations.
// Pure functions over a plain `learn` object (see store.js) so they can be tested with fake dates.

/** Local calendar day, e.g. "2026-11-09". */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (k, n) => dayKey(new Date(parse(k).getTime() + n * 86_400_000));
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);

export const emptyLearn = () => ({
  skills: {}, // topicId -> { r: skill rating, n: exercises answered, intro: has seen the teaching cards }
  ex: {}, // exerciseId -> { box, due, seen, wrong }
  sessions: 0,
  streak: { count: 0, best: 0, last: null, freezes: 0, days: {} }, // days: dayKey -> points
});

// ---------------------------------------------------------------- streaks
export const DAILY_GOAL = 5; // points per day: 1 per exercise solved, +5 for finishing a lesson (which alone is enough)

/** The streak to show today: still alive if you practised today, yesterday, or a freeze can cover one missed day. */
export function currentStreak(s, today) {
  if (!s.last) return { count: 0, today: false, atRisk: false };
  const gap = daysBetween(s.last, today);
  if (gap <= 0) return { count: s.count, today: true, atRisk: false };
  if (gap === 1) return { count: s.count, today: false, atRisk: true }; // practise today to keep it
  if (gap === 2 && s.freezes > 0) return { count: s.count, today: false, atRisk: true, usesFreeze: true };
  return { count: 0, today: false, atRisk: false };
}

/** Add practice points for today; extends the streak the first time the daily goal is reached. Returns what changed. */
export function addPoints(learn, points, today) {
  const s = learn.streak;
  const before = s.days[today] ?? 0;
  s.days[today] = before + points;
  const out = { reachedGoal: false, extended: false, usedFreeze: false, earnedFreeze: false, count: s.count };
  if (before >= DAILY_GOAL || s.days[today] < DAILY_GOAL) return out;
  out.reachedGoal = true;
  if (s.last === today) return out;
  const gap = s.last ? daysBetween(s.last, today) : null;
  if (gap === null) s.count = 1;
  else if (gap === 1) s.count += 1;
  else if (gap === 2 && s.freezes > 0) { s.freezes -= 1; s.count += 1; out.usedFreeze = true; }
  else s.count = 1;
  s.last = today;
  s.best = Math.max(s.best, s.count);
  if (s.count % 7 === 0 && s.freezes < 2) { s.freezes += 1; out.earnedFreeze = true; }
  out.extended = true; out.count = s.count;
  // keep the calendar small
  const keys = Object.keys(s.days).sort();
  while (keys.length > 60) delete s.days[keys.shift()];
  return out;
}

/** The last 7 days (oldest first) for the little calendar: { day, points, goal } */
export function weekView(s, today) {
  return Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); const points = s.days[day] ?? 0; return { day, points, goal: points >= DAILY_GOAL, today: day === today }; });
}

// ---------------------------------------------------------------- spaced repetition (Leitner boxes)
export const INTERVALS = [1, 1, 3, 7, 14, 30]; // days until an exercise is due again, by box

/** Record one exercise result. Wrong answers go back to box 0 and return tomorrow; right ones move up a box. */
export function reviewExercise(learn, id, firstTry, today) {
  const e = learn.ex[id] ?? { box: 0, due: today, seen: 0, wrong: 0 };
  e.seen += 1;
  if (firstTry) e.box = Math.min(5, e.box + 1); else { e.box = 0; e.wrong += 1; }
  e.due = addDays(today, INTERVALS[e.box]);
  learn.ex[id] = e;
  return e;
}

export const dueIds = (learn, today) => Object.entries(learn.ex).filter(([, e]) => e.due <= today).sort((a, b) => a[1].box - b[1].box || (a[1].due < b[1].due ? -1 : 1)).map(([id]) => id);

// ---------------------------------------------------------------- the player model: you do not pick lessons, the plan fits you
// Every topic (a lesson from the curriculum) has a skill rating for YOU, and every exercise has a difficulty on the same scale
// (the Elo idea: the chance of solving it is 1 / (1 + 10^((difficulty - skill) / 400))). Training picks exercises you should solve
// about 3 times in 4: hard enough to teach you, easy enough to keep going. Results move your skill up or down.

/** How hard a typical exercise of each topic is, on an Elo-like scale. */
export const TOPIC_BASE = { mate1: 700, free: 800, open1: 900, castle: 950, forks: 1100, skewers: 1250, pins: 1300, mate2: 1500, kp: 1600, routine: 1450 };
export const TARGET_SUCCESS = 0.75;

export const pieceCount = (fen) => [...fen.split(' ')[0]].filter((c) => /[a-z]/i.test(c)).length;
export const exerciseRating = (topicId, ex) => (TOPIC_BASE[topicId] ?? 1000) + (pieceCount(ex.fen) - 6) * 18;
export const expectedScore = (skill, difficulty) => 1 / (1 + 10 ** ((difficulty - skill) / 400));

/** Your general level from what we know about you: ratings from games, performance in reviews. Beginners start low. */
export function playerLevel({ computer, online, performance, games = 0 } = {}) {
  const parts = [];
  if (performance) parts.push([performance, 2]);
  if (computer && games) parts.push([computer, 1]);
  if (online && games) parts.push([online, 1]);
  if (!parts.length) return 800;
  const w = parts.reduce((n, [, k]) => n + k, 0);
  return Math.round(Math.max(400, Math.min(2200, parts.reduce((n, [v, k]) => n + v * k, 0) / w)));
}

export const getSkill = (L, topic, level) => L.skills[topic] ?? { r: level, n: 0, intro: false };

/** Record how an exercise went. `success` means right on the first try without a hint. */
export function recordResult(L, topic, difficulty, success, level) {
  const s = getSkill(L, topic, level);
  const K = Math.max(18, 48 - 3 * s.n);
  s.r = Math.round((s.r + K * ((success ? 1 : 0) - expectedScore(s.r, difficulty))) * 10) / 10;
  s.n += 1;
  L.skills[topic] = s;
  return s;
}

/** The chance you would solve a typical exercise of the topic, as a percentage (for the skills display). */
export const topicChance = (L, topic, level) => Math.round(100 * expectedScore(getSkill(L, topic, level).r, TOPIC_BASE[topic] ?? 1000));

export const flatLessons = (curriculum) => curriculum.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u.id, unitTitle: u.title })));
export const exerciseIndex = (curriculum) => {
  const map = new Map();
  for (const l of flatLessons(curriculum)) for (const ex of l.exercises) map.set(ex.id, { lesson: l, ex });
  return map;
};

/** What each kind of mistake found in your reviewed games says to study. */
export const THEME_LESSONS = {
  'hung-piece': ['free', 'routine'],
  'missed-tactic': ['forks', 'skewers', 'pins'],
  'missed-mate': ['mate1', 'mate2'],
  'allowed-mate': ['castle', 'routine'],
  'blown-advantage': ['kp', 'routine'],
  'opening-mistake': ['open1', 'castle'],
  'endgame-error': ['kp'],
};
export const THEME_REASON = {
  'hung-piece': 'pieces left undefended',
  'missed-tactic': 'missed tactics',
  'missed-mate': 'missed checkmates',
  'allowed-mate': 'king-safety problems',
  'blown-advantage': 'winning positions that slipped',
  'opening-mistake': 'opening mistakes',
  'endgame-error': 'endgame slips',
};

/** How much each topic matters to YOU, from the mistakes found in your own reviewed games (0..1 shares). */
export function topicNeeds(themes = {}) {
  const total = Object.values(themes).reduce((a, b) => a + b, 0) || 0;
  const out = {}; const why = {};
  if (!total) return { needs: out, why };
  for (const [theme, n] of Object.entries(themes)) {
    for (const t of THEME_LESSONS[theme] ?? []) {
      out[t] = (out[t] ?? 0) + n / total;
      if (!why[t] || n > (themes[why[t]] ?? 0)) why[t] = theme;
    }
  }
  return { needs: out, why };
}

/**
 * Today's training, built for you. Returns { items, focus } where items is a list of
 *   { type: 'intro', topic }  a short lesson, shown the first time a topic comes up (skipped when it is far below your level)
 *   { type: 'ex', id, topic, reason }
 * Exercises you missed before come back first; the rest are picked from the topics your games and your results say you need,
 * at a difficulty you should solve about 3 times in 4.
 */
export function planSession(curriculum, learn, { level = 800, themes = {} } = {}, today, rand = Math.random, size = 8) {
  const lessons = flatLessons(curriculum);
  const idx = exerciseIndex(curriculum);
  const { needs, why } = topicNeeds(themes);
  const used = new Set(); const items = []; const introduced = new Set();
  const eligible = lessons.filter((l) => (TOPIC_BASE[l.id] ?? 1000) <= level + 300 || learn.skills[l.id]?.n > 0);

  const reasonFor = (t) => {
    const sk = getSkill(learn, t.id, level);
    if (needs[t.id] && why[t.id]) return `Your games show ${THEME_REASON[why[t.id]]}.`;
    if (!sk.intro && sk.n === 0) return 'A new idea for you.';
    if (sk.r < level - 80) return 'This needs more practice.';
    return 'Keeping it sharp.';
  };
  const addIntro = (t) => {
    const sk = getSkill(learn, t.id, level);
    if (sk.intro || introduced.has(t.id)) return;
    introduced.add(t.id);
    if (level - (TOPIC_BASE[t.id] ?? 1000) >= 500) return; // far below your level: no need to teach it
    items.push({ type: 'intro', topic: t.id });
  };
  const addEx = (ex, t, reason) => { addIntro(t); used.add(ex.id); items.push({ type: 'ex', id: ex.id, topic: t.id, reason }); };

  // 1. exercises that are due for review (hardest first), at most 3
  for (const id of dueIds(learn, today)) {
    const hit = idx.get(id); if (!hit || items.filter((i) => i.type === 'ex').length >= 3) continue;
    addEx(hit.ex, hit.lesson, 'Coming back so it sticks.');
  }
  // 2. the rest from the topics you need most
  const weight = (t) => {
    const sk = getSkill(learn, t.id, level);
    const weak = Math.max(-1, Math.min(2, (level - sk.r) / 150));
    return Math.max(0.2, 1 + 0.6 * weak + 5 * (needs[t.id] ?? 0) + (sk.n === 0 ? 0.8 : 0));
  };
  let guard = 0;
  while (items.filter((i) => i.type === 'ex').length < size && guard++ < 200) {
    const pool = eligible.filter((t) => t.exercises.some((e) => !used.has(e.id)));
    if (!pool.length) break;
    const ws = pool.map(weight); let r = rand() * ws.reduce((a, b) => a + b, 0); let t = pool[0];
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) { t = pool[i]; break; } }
    const sk = getSkill(learn, t.id, level);
    const cands = t.exercises.filter((e) => !used.has(e.id) && !(learn.ex[e.id]?.due > today));
    const list = cands.length ? cands : t.exercises.filter((e) => !used.has(e.id));
    const best = list.reduce((a, e) => (Math.abs(expectedScore(sk.r, exerciseRating(t.id, e)) - TARGET_SUCCESS) < Math.abs(expectedScore(sk.r, exerciseRating(t.id, a)) - TARGET_SUCCESS) ? e : a), list[0]);
    addEx(best, t, reasonFor(t));
  }
  const focus = [];
  for (const it of items) { if (it.type === 'ex' && !focus.find((f) => f.topic === it.topic)) focus.push({ topic: it.topic, reason: it.reason }); }
  return { items, focus: focus.slice(0, 3), level };
}
