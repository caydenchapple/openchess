// Learn: a step-by-step path of lessons, daily practice with spaced repetition, and a daily streak.
import { Chess } from 'chess.js';
import { h, clear, toast } from '../util.js';
import { Board } from '../board.js';
import { get, save } from '../store.js';
import { play } from '../sound.js';
import { aggregate } from '../stats.js';
import { CURRICULUM } from '../lessons-data.js';
import {
  dayKey, currentStreak, addPoints, weekView, reviewExercise, dueIds, completeLesson, statuses, recommend, flatLessons,
  exerciseIndex, dailyPlan, THEME_REASON, DAILY_GOAL, starsFor,
} from '../lessons-logic.js';

const today = () => dayKey();
const learn = () => get().learn;
const themes = () => aggregate(get().games).themes ?? {};
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function mount(root, params) {
  const cleanups = [];
  const [first, second] = params;
  if (first === 'daily') return runner(root, { title: 'Daily practice', ids: dailyPlan(CURRICULUM, learn(), today(), themes()), mode: 'daily' }, cleanups);
  if (first) {
    const l = flatLessons(CURRICULUM).find((x) => x.id === first);
    if (!l) { location.hash = '#/learn'; return () => {}; }
    return lessonView(root, l, second === 'test', cleanups);
  }
  return hub(root, cleanups);
}

// ------------------------------------------------------------------ hub
function hub(root, cleanups) {
  const L = learn(); const t = today();
  const st = statuses(CURRICULUM, L);
  const streak = currentStreak(L.streak, t);
  const rec = recommend(CURRICULUM, L, themes());
  const due = dueIds(L, t).length;
  const todayPts = L.streak.days[t] ?? 0;

  const week = weekView(L.streak, t).map((d) => h('div', { class: `day ${d.goal ? 'hit' : ''} ${d.today ? 'today' : ''}`, title: `${d.day}: ${d.points} points` },
    h('span', {}, new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: 'narrow' })), h('i', { 'aria-hidden': 'true' }, d.goal ? '✓' : '')));

  const streakCard = h('section', { class: 'card streak-card' },
    h('div', { class: 'streak-big' }, h('span', { class: 'flame', 'aria-hidden': 'true' }, '🔥'), h('b', {}, String(streak.count)), h('span', {}, streak.count === 1 ? 'day streak' : 'day streak')),
    h('p', { class: 'muted' }, streak.today
      ? (todayPts >= DAILY_GOAL ? 'You practised today. See you tomorrow!' : 'Keep going to finish today\'s goal.')
      : streak.count
        ? (streak.usesFreeze ? 'You missed a day, but a streak freeze will save it. Practise today!' : 'Practise today to keep your streak alive.')
        : 'Practise a little every day. Solve 5 exercises or finish a lesson to start a streak.'),
    h('div', { class: 'week', role: 'img', 'aria-label': 'Your last 7 days' }, week),
    h('p', { class: 'small muted' }, `Daily goal: solve ${DAILY_GOAL} exercises or finish a lesson. ❄ ${L.streak.freezes} streak freeze${L.streak.freezes === 1 ? '' : 's'} (you earn one every 7 days).`));

  const todayCard = h('section', { class: 'card' },
    h('h2', {}, 'Daily practice'),
    h('p', { class: 'muted' }, due ? `${due} exercise${due === 1 ? ' is' : 's are'} ready to review. Exercises you missed come back after 1, 3, 7, 14 and 30 days, so they stick.` : Object.keys(L.done).length ? 'Nothing is due, but you can practise more from the lessons you finished.' : 'Finish your first lesson, then your daily practice appears here.'),
    h('a', { class: `btn ${Object.keys(L.done).length ? 'primary' : ''}`, href: Object.keys(L.done).length ? '#/learn/daily' : '#/learn/' + (rec.lesson?.id ?? '') }, Object.keys(L.done).length ? '▶ Start daily practice' : '▶ Start your first lesson'));

  const recCard = rec.lesson && h('section', { class: 'card rec' },
    h('div', { class: 'pill' }, rec.personal ? 'Picked for you' : 'Next up'),
    h('h2', {}, rec.lesson.title),
    h('p', { class: 'muted' }, rec.reason),
    h('a', { class: 'btn primary big', href: `#/learn/${rec.lesson.id}` }, 'Start this lesson'));

  const units = CURRICULUM.map((u) => h('section', { class: 'card unit' },
    h('h2', {}, `${u.id}. ${u.title}`), h('p', { class: 'muted small' }, u.blurb),
    h('div', { class: 'lessons' }, u.lessons.map((l) => {
      const state = st[l.id]; const d = L.done[l.id];
      return h('div', { class: `lesson-row ${state}` },
        h('div', { class: 'lr-icon', 'aria-hidden': 'true' }, state === 'done' ? '✓' : state === 'next' ? '▶' : '🔒'),
        h('div', { class: 'lr-text' }, h('b', {}, l.title), h('div', { class: 'small muted' }, `${l.minutes} min · ${l.exercises.length} exercises`, d ? ` · ${stars(d.stars)}` : '')),
        h('div', { class: 'lr-actions' },
          state !== 'locked' && h('a', { class: `btn ${state === 'next' ? 'primary' : ''}`, href: `#/learn/${l.id}` }, state === 'done' ? 'Review' : 'Start'),
          state !== 'done' && h('a', { class: 'btn ghost', href: `#/learn/${l.id}/test`, title: 'Answer 3 exercises correctly to skip this lesson' }, 'I know this')));
    }))));

  const method = h('details', { class: 'card method' },
    h('summary', {}, 'Why these lessons? (what strong players do)'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Patterns first. '), 'Studies of chess experts (de Groot, Chase & Simon) found they recognise patterns rather than calculate everything. Each lesson teaches one pattern, then makes you spot it.'),
      h('li', {}, h('b', {}, 'Repeat at growing gaps. '), 'Missed exercises return after 1, 3, 7, 14 and 30 days. Repeating tactics is the idea behind the "Woodpecker method".'),
      h('li', {}, h('b', {}, 'A thinking routine. '), 'Checks, captures, threats, then a blunder check — the habit Kotov described in "Think Like a Grandmaster".'),
      h('li', {}, h('b', {}, 'Endings early. '), 'Capablanca and Dvoretsky both told students to study endings first.'),
      h('li', {}, h('b', {}, 'Learn from your own games. '), 'Review a game and the lessons that fit your mistakes are recommended first.')),
    h('p', { class: 'small muted' }, 'This is our summary of well-known training ideas, not a promise of results. The exercises with one best answer were checked with Stockfish.'));

  root.append(h('div', { class: 'stack learn' },
    h('h1', {}, 'Learn chess step by step'),
    h('div', { class: 'grid two' }, streakCard, h('div', { class: 'stack' }, recCard, todayCard)),
    units,
    h('div', { class: 'card' }, h('h2', {}, 'Practise your own mistakes'), h('p', { class: 'muted' }, 'Positions where you went wrong in your own games.'), h('a', { class: 'btn', href: '#/train' }, 'Open Practice')),
    method));
  return () => cleanups.forEach((f) => f());
}

// ------------------------------------------------------------------ one lesson: cards, then exercises
function lessonView(root, lesson, testOut, cleanups) {
  const L0 = learn();
  if (testOut) {
    const pool = [...lesson.exercises].sort(() => Math.random() - 0.5).slice(0, 3);
    return runner(root, { title: `Skip test: ${lesson.title}`, ids: pool.map((e) => e.id), mode: 'test', lesson }, cleanups);
  }
  let i = 0;
  const wrap = h('div', { class: 'stack lesson' });
  root.append(wrap);
  let board;

  function showCard() {
    board?.destroy(); board = null; clear(wrap);
    const c = lesson.cards[i];
    const boardEl = h('div', { class: 'boardwrap' });
    const last = i === lesson.cards.length - 1;
    wrap.append(
      h('div', { class: 'row between' }, h('a', { class: 'btn ghost', href: '#/learn' }, '‹ All lessons'), h('span', { class: 'muted' }, `${lesson.title} · step ${i + 1} of ${lesson.cards.length}`)),
      h('div', { class: `lesson-card ${c.fen ? 'with-board' : ''}` },
        c.fen && h('div', { class: 'lc-board' }, boardEl),
        h('div', { class: 'card stack' },
          i === 0 && h('p', { class: 'why small muted' }, `Why this matters: ${lesson.why}`),
          h('h2', {}, c.title), h('p', { class: 'lc-text' }, c.text),
          h('div', { class: 'controls' },
            i > 0 && h('button', { onclick: () => { i--; showCard(); } }, '‹ Back'),
            h('button', { class: 'primary big', onclick: () => { if (last) startExercises(); else { i++; showCard(); } } }, last ? `Start the ${lesson.exercises.length} exercises ›` : 'Next ›')))));
    if (c.fen) {
      board = new Board(boardEl, { orientation: new Chess(c.fen).turn() });
      board.setPosition(c.fen); board.setInteractive(null);
      if (c.arrows) board.setArrows(c.arrows);
      cleanups.push(() => board?.destroy());
    }
  }
  function startExercises() {
    board?.destroy(); board = null; clear(wrap);
    cleanups.push(runner(wrap, { title: lesson.title, ids: lesson.exercises.map((e) => e.id), mode: 'lesson', lesson }, []));
  }
  if (L0.done[lesson.id] && false) startExercises(); else showCard();
  return () => { board?.destroy(); cleanups.forEach((f) => f()); };
}

// ------------------------------------------------------------------ the exercise runner (lessons, daily practice, skip tests)
function runner(root, { title, ids, mode, lesson }, cleanups) {
  const idx = exerciseIndex(CURRICULUM);
  const items = ids.map((id) => idx.get(id)).filter(Boolean).map((x) => x.ex);
  const box = h('div', { class: 'stack runner' });
  root.append(box);
  let n = 0; let firstTry = 0; let board; let attempts = 0; let solved = false; let hintShown = false; let streakNote = null;
  const results = []; // {id, firstTry}

  if (!items.length) {
    box.append(h('div', { class: 'card stack' }, h('h2', {}, title), h('p', { class: 'muted' }, 'There is nothing to practise yet. Finish a lesson first.'), h('a', { class: 'btn primary', href: '#/learn' }, 'Back to lessons')));
    return () => {};
  }

  function frame(...kids) {
    board?.destroy(); board = null; clear(box);
    box.append(
      h('div', { class: 'row between' }, h('a', { class: 'btn ghost', href: '#/learn' }, '‹ Quit'), h('span', { class: 'muted' }, `${title} · ${Math.min(n + 1, items.length)} of ${items.length}`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(n), 'aria-valuemax': String(items.length) }, h('i', { style: { width: `${(n / items.length) * 100}%` } })),
      ...kids);
  }

  function show() {
    if (n >= items.length) return finish();
    const ex = items[n]; attempts = 0; solved = false; hintShown = false;
    const boardEl = h('div', { class: 'boardwrap' });
    const msg = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' });
    const actions = h('div', { class: 'controls' });
    const turn = new Chess(ex.fen).turn();
    msg.textContent = ex.prompt;
    const hintBtn = h('button', { onclick: () => { hintShown = true; msg.textContent = `Hint: ${ex.hint}`; hintBtn.disabled = true; } }, '💡 Hint');
    frame(h('div', { class: 'game' },
      h('div', { class: 'boardcol' }, boardEl),
      h('div', { class: 'side stack' }, h('div', { class: 'card stack' }, msg, ex.type === 'find' ? actions : h('div', { class: 'options' }), ex.type === 'find' ? null : null))));
    const side = box.querySelector('.side .card');

    if (ex.type === 'find') {
      board = new Board(boardEl, { orientation: turn, onMove: (mv) => answerFind(ex, mv, msg, actions, side) });
      board.setPosition(ex.fen); board.setInteractive(turn);
      actions.append(hintBtn, h('button', { onclick: () => showAnswer(ex, msg, actions) }, 'Show the answer'));
    } else {
      board = new Board(boardEl, { orientation: turn });
      board.setPosition(ex.fen); board.setInteractive(null);
      const optsEl = side.querySelector('.options');
      ex.options.forEach((o) => optsEl.append(h('button', { class: 'big option', onclick: (e) => answerQuiz(ex, o, e.currentTarget, msg, optsEl) }, o.san)));
      side.append(h('div', { class: 'controls' }, hintBtn));
    }
    cleanups.push(() => board?.destroy());
  }

  function record(ex, ok) {
    if (attempts === 1 && ok) firstTry++;
    if (!results.find((r) => r.id === ex.id)) results.push({ id: ex.id, firstTry: attempts === 1 && ok });
  }

  function answerFind(ex, mv, msg, actions) {
    if (solved) return;
    attempts++;
    const chess = new Chess(ex.fen);
    let m;
    try { m = chess.move(mv); } catch { board.setPosition(ex.fen); return; }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const ok = ex.mate ? chess.isCheckmate() : ex.answers.includes(uci);
    if (ok) {
      solved = true; play('right');
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] }); board.setInteractive(null);
      record(ex, true);
      msg.textContent = `✅ ${attempts === 1 && !hintShown ? 'Correct!' : 'Solved.'} ${ex.explain}`;
      next(actions);
    } else {
      play('wrong');
      msg.textContent = attempts >= 3 ? '❌ Not that one. Press "Show the answer" if you are stuck.' : '❌ Not quite. Try another move.';
      setTimeout(() => { board.setPosition(ex.fen); board.setInteractive(new Chess(ex.fen).turn()); }, 350);
      if (attempts === 2 && !hintShown) msg.textContent += ' A hint can help.';
    }
  }

  function showAnswer(ex, msg, actions) {
    if (solved) return;
    solved = true; attempts = Math.max(attempts, 2); // not a first-try success
    const chess = new Chess(ex.fen);
    let best = ex.answers[0];
    if (ex.mate) { const mm = chess.moves({ verbose: true }).find((x) => { const c2 = new Chess(ex.fen); c2.move(x.san); return c2.isCheckmate(); }); best = mm && mm.from + mm.to + (mm.promotion ?? ''); }
    board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), brush: 'green' }]); board.setInteractive(null);
    record(ex, false);
    msg.textContent = `The answer: ${ex.explain}`;
    next(actions);
  }

  function answerQuiz(ex, o, btn, msg, optsEl) {
    if (solved) return;
    attempts++;
    if (o.ok) {
      solved = true; play('right'); btn.classList.add('right'); record(ex, true);
      msg.textContent = `✅ ${o.why} ${ex.explain}`;
      optsEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      next(optsEl);
    } else {
      play('wrong'); btn.classList.add('wrong'); btn.disabled = true;
      msg.textContent = `❌ ${o.why || 'Not the best.'} Try another.`;
      if (attempts >= ex.options.length - 1) { /* only one left: it will be obvious */ }
    }
  }

  function next(container) {
    const L = learn(); const t = today();
    const r = results.find((x) => x.id === items[n].id);
    reviewExercise(L, items[n].id, !!r?.firstTry, t);
    const res = addPoints(L, 1, t);
    if (res.extended && !streakNote) streakNote = res;
    save();
    container.append(h('button', { class: 'primary big', onclick: () => { n++; show(); } }, n === items.length - 1 ? 'Finish' : 'Next ›'));
  }

  function finish() {
    const L = learn(); const t = today();
    const total = items.length;
    const stats = { firstTry, total };
    let headline = 'Practice complete'; let detail = `${firstTry} of ${total} right on the first try.`; let cta = h('a', { class: 'btn primary big', href: '#/learn' }, 'Back to lessons');
    if (mode === 'lesson') {
      const d = completeLesson(L, lesson.id, firstTry, total);
      const res = addPoints(L, DAILY_GOAL, t); if (res.extended && !streakNote) streakNote = res;
      save();
      headline = `Lesson complete: ${lesson.title}`; detail = `${stars(d.stars)} · ${firstTry} of ${total} right on the first try.`;
      const nxt = recommend(CURRICULUM, L, themes());
      if (nxt.lesson) cta = h('a', { class: 'btn primary big', href: `#/learn/${nxt.lesson.id}` }, `Next: ${nxt.lesson.title} ›`);
    } else if (mode === 'test') {
      if (firstTry === total) {
        const d = completeLesson(L, lesson.id, total, total); d.stars = 2; save();
        headline = 'You can skip this lesson'; detail = `You answered all ${total} correctly. "${lesson.title}" is marked as done.`;
        const nxt = recommend(CURRICULUM, L, themes());
        if (nxt.lesson) cta = h('a', { class: 'btn primary big', href: `#/learn/${nxt.lesson.id}` }, `Next: ${nxt.lesson.title} ›`);
      } else {
        headline = 'Let us learn it first'; detail = `You got ${firstTry} of ${total} right on the first try. The lesson takes about ${lesson.minutes} minutes.`;
        cta = h('a', { class: 'btn primary big', href: `#/learn/${lesson.id}` }, 'Start the lesson');
      }
    }
    play('end');
    frame(h('div', { class: 'card stack result' },
      h('div', { class: 'result-title' }, headline), h('p', {}, detail),
      streakNote && h('p', { class: 'streak-note' }, `🔥 ${streakNote.count}-day streak!${streakNote.earnedFreeze ? ' You earned a streak freeze ❄' : ''}${streakNote.usedFreeze ? ' (a freeze saved your streak)' : ''}`),
      h('div', { class: 'controls' }, cta, h('a', { class: 'btn', href: '#/learn' }, 'All lessons'))));
    void stats;
  }

  show();
  return () => { board?.destroy(); cleanups.forEach((f) => f()); };
}
