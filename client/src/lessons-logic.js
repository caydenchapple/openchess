// The learning engine: progress and stars, spaced repetition, daily practice, streaks and recommendations.
// Pure functions over a plain `learn` object (see store.js) so they can be tested with fake dates.

/** Local calendar day, e.g. "2026-11-09". */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (k, n) => dayKey(new Date(parse(k).getTime() + n * 86_400_000));
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);

export const emptyLearn = () => ({
  done: {}, // lessonId -> { stars, firstTry, total, t }
  ex: {}, // exerciseId -> { box, due, seen, wrong }
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

// ---------------------------------------------------------------- lessons, stars, unlocking
export const starsFor = (firstTry, total) => { const r = total ? firstTry / total : 0; return r >= 0.9 ? 3 : r >= 0.7 ? 2 : 1; };

export function completeLesson(learn, lessonId, firstTry, total, now = Date.now()) {
  const prev = learn.done[lessonId];
  const stars = starsFor(firstTry, total);
  // keep the best result
  if (!prev || stars >= prev.stars) learn.done[lessonId] = { stars, firstTry, total, t: now };
  return learn.done[lessonId];
}

export const flatLessons = (curriculum) => curriculum.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u.id, unitTitle: u.title })));

/** done / next / locked, in order: a lesson opens when the one before it is done. */
export function statuses(curriculum, learn) {
  const out = {}; let open = true;
  for (const l of flatLessons(curriculum)) {
    if (learn.done[l.id]) out[l.id] = 'done';
    else if (open) { out[l.id] = 'next'; open = false; } else out[l.id] = 'locked';
  }
  return out;
}

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

/**
 * Pick what to study next: the next lesson in order, unless your own games point at an unlocked lesson you have not
 * mastered (fewer than 3 stars). `themes` is { themeName: count } from your reviewed games.
 */
export function recommend(curriculum, learn, themes = {}) {
  const st = statuses(curriculum, learn);
  const all = flatLessons(curriculum);
  const next = all.find((l) => st[l.id] === 'next') ?? null;
  for (const [theme] of Object.entries(themes).sort((a, b) => b[1] - a[1])) {
    for (const id of THEME_LESSONS[theme] ?? []) {
      const l = all.find((x) => x.id === id);
      if (!l || st[id] === 'locked') continue;
      const done = learn.done[id];
      if (!done || done.stars < 3) return { lesson: l, reason: `Your reviewed games show ${THEME_REASON[theme] ?? theme}.`, personal: true };
    }
  }
  return next ? { lesson: next, reason: 'The next step in your path.', personal: false } : { lesson: null, reason: 'You finished every lesson. Keep your streak with daily practice.', personal: false };
}

export const THEME_REASON = {
  'hung-piece': 'pieces left undefended',
  'missed-tactic': 'missed tactics',
  'missed-mate': 'missed checkmates',
  'allowed-mate': 'king-safety problems',
  'blown-advantage': 'winning positions that slipped',
  'opening-mistake': 'opening mistakes',
  'endgame-error': 'endgame slips',
};

// ---------------------------------------------------------------- daily practice
export const exerciseIndex = (curriculum) => {
  const map = new Map();
  for (const l of flatLessons(curriculum)) for (const ex of l.exercises) map.set(ex.id, { lesson: l, ex });
  return map;
};

/**
 * Today's practice: exercises that are due for review first (hardest boxes first), then fresh repeats from finished lessons,
 * leaning on lessons with fewer stars and on your weak themes. Never more than `size` items.
 */
export function dailyPlan(curriculum, learn, today, themes = {}, size = 5, rand = Math.random) {
  const idx = exerciseIndex(curriculum);
  const picked = [];
  for (const id of dueIds(learn, today)) { if (idx.has(id) && picked.length < size) picked.push(id); }
  if (picked.length < size) {
    const weakLessons = new Set(Object.keys(themes).flatMap((t) => THEME_LESSONS[t] ?? []));
    const pool = [];
    for (const [lessonId, d] of Object.entries(learn.done)) {
      const l = flatLessons(curriculum).find((x) => x.id === lessonId); if (!l) continue;
      const weight = (4 - d.stars) + (weakLessons.has(lessonId) ? 2 : 0);
      for (const ex of l.exercises) if (!picked.includes(ex.id)) for (let i = 0; i < weight; i++) pool.push(ex.id);
    }
    while (picked.length < size && pool.length) {
      const id = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      if (!picked.includes(id)) picked.push(id);
    }
  }
  return picked;
}
