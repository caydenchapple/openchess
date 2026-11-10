// Learn: training that fits you. You do not choose lessons: each session is built from how you play (your reviewed games, your
// ratings) and how you do on the exercises, at a difficulty you should solve about 3 times in 4. Plus a daily streak.
import { Chess } from 'chess.js';
import { h, clear } from '../util.js';
import { Board } from '../board.js';
import { get, save } from '../store.js';
import { play } from '../sound.js';
import { aggregate } from '../stats.js';
import { icon } from '../icons.js';
import { CURRICULUM } from '../lessons-data.js';
import {
  dayKey, currentStreak, addPoints, weekView, reviewExercise, dueIds, planSession, playerLevel, recordResult, getSkill,
  topicChance, exerciseRating, exerciseIndex, flatLessons, THEME_REASON, DAILY_GOAL, TOPIC_BASE,
} from '../lessons-logic.js';

const today = () => dayKey();
const learn = () => get().learn;
const lessonById = (id) => flatLessons(CURRICULUM).find((l) => l.id === id);

/** Everything we know about how you play, in one place. */
function profile() {
  const st = get();
  const agg = aggregate(st.games);
  const level = playerLevel({
    computer: st.ratings.computer.r, online: st.ratings.online.r, performance: agg.performance,
    games: st.ratings.computer.games + st.ratings.online.games,
  });
  return { level, themes: agg.themes ?? {}, reviewed: agg.reviewed ?? 0, accuracy: agg.accuracy ?? null, phases: agg.phases ?? {} };
}

let prepared = null; // the plan the hub showed, so "Start" runs exactly that
export function mount(root, params) {
  const cleanups = [];
  if (params[0] === 'train' || params[0] === 'daily') return session(root, cleanups);
  if (params[0]) { location.hash = '#/learn'; return () => {}; }
  return hub(root, cleanups);
}

// ------------------------------------------------------------------ hub
function hub(root, cleanups) {
  const L = learn(); const t = today(); const p = profile();
  const streak = currentStreak(L.streak, t);
  const plan = planSession(CURRICULUM, L, p, t);
  prepared = { day: t, plan };
  const exCount = plan.items.filter((i) => i.type === 'ex').length;
  const due = dueIds(L, t).length;
  const todayPts = L.streak.days[t] ?? 0;

  const week = weekView(L.streak, t).map((d) => h('div', { class: `day ${d.goal ? 'hit' : ''} ${d.today ? 'today' : ''}`, title: `${d.day}: ${d.points} points` },
    h('span', {}, new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: 'narrow' })), h('i', { 'aria-hidden': 'true' }, d.goal ? icon('check') : '')));

  const streakCard = h('section', { class: 'card streak-card' },
    h('div', { class: 'streak-big' }, h('span', { class: 'flame', 'aria-hidden': 'true' }, icon('flame', 44)), h('b', {}, String(streak.count)), h('span', {}, 'day streak')),
    h('p', { class: 'muted' }, streak.today
      ? (todayPts >= DAILY_GOAL ? 'You trained today. See you tomorrow!' : 'Keep going to finish today\'s goal.')
      : streak.count
        ? (streak.usesFreeze ? 'You missed a day, but a streak freeze will save it. Train today!' : 'Train today to keep your streak alive.')
        : 'Train a little every day. Solve 5 exercises to start a streak.'),
    h('div', { class: 'week', role: 'img', 'aria-label': 'Your last 7 days' }, week),
    h('p', { class: 'small muted' }, `Daily goal: ${DAILY_GOAL} exercises. `, icon('snow', 14), ` ${L.streak.freezes} streak freeze${L.streak.freezes === 1 ? '' : 's'} (you earn one every 7 days).`));

  const why = (topic, reason) => h('li', {}, h('b', {}, lessonById(topic)?.title ?? topic), h('span', { class: 'muted' }, ` — ${reason}`));
  const startCard = h('section', { class: 'card rec' },
    h('div', { class: 'pill' }, 'Built for you'),
    h('h2', {}, 'Today\'s training'),
    h('p', { class: 'muted' }, `${exCount} exercises, about ${Math.max(3, Math.round(exCount * 0.8))} minutes.${due ? ` ${due} to review.` : ''} Picked from ${p.reviewed ? `your ${p.reviewed} reviewed game${p.reviewed === 1 ? '' : 's'} and ` : ''}how you solve them.`),
    h('ul', { class: 'focus' }, plan.focus.map((f) => why(f.topic, f.reason))),
    h('a', { class: 'btn primary big', href: '#/learn/train' }, icon('play'), ' Start training'));

  const skills = flatLessons(CURRICULUM).map((l) => {
    const sk = getSkill(L, l.id, p.level); const seen = sk.n > 0;
    const pct = topicChance(L, l.id, p.level);
    return h('div', { class: 'skill' },
      h('span', { class: 'sk-name' }, l.title),
      h('div', { class: 'sk-bar', role: 'img', 'aria-label': seen ? `${pct}% chance of solving a typical exercise` : 'not started' }, h('i', { style: { width: `${seen ? pct : 0}%` } })),
      h('span', { class: 'sk-pct muted' }, seen ? `${pct}%` : 'new'));
  });
  const skillsCard = h('section', { class: 'card' },
    h('h2', {}, 'Your skills'),
    h('p', { class: 'muted small' }, `Your chance of solving a typical exercise. Starting level: about ${p.level}${p.reviewed ? ' (from your games)' : ' (play and review a game to sharpen this)'}.`),
    h('div', { class: 'skills' }, skills));

  const method = h('details', { class: 'card method' },
    h('summary', {}, 'How training fits you'),
    h('ul', {},
      h('li', {}, h('b', {}, 'You do not pick lessons. '), 'We estimate your level from your ratings and reviewed games, then choose what helps you most.'),
      h('li', {}, h('b', {}, 'Your games steer it. '), 'Mistakes found in your reviews (undefended pieces, missed tactics, endgame slips…) make those topics come up more.'),
      h('li', {}, h('b', {}, 'The right difficulty. '), 'Each exercise has a difficulty. We pick ones you should solve about 3 times in 4: hard enough to teach, easy enough to keep going. Your results move your skill up or down.'),
      h('li', {}, h('b', {}, 'Repeat at growing gaps. '), 'Missed exercises return after 1, 3, 7, 14 and 30 days — the idea behind repeating tactics in the "Woodpecker method".'),
      h('li', {}, h('b', {}, 'Short lessons, only when new. '), 'The first time a topic comes up you get a quick lesson (skipped when it is far below your level). It follows the thinking routine Kotov described and the early-endgame study Capablanca and Dvoretsky advised.')),
    h('p', { class: 'small muted' }, 'This summarises well-known training ideas. It is not a promise of results. Exercises with one best answer were checked with Stockfish.'));

  root.append(h('div', { class: 'stack learn' },
    h('h1', {}, 'Train'),
    h('div', { class: 'grid two' }, streakCard, startCard),
    skillsCard,
    h('div', { class: 'card' }, h('h2', {}, 'Practise your own mistakes'), h('p', { class: 'muted' }, 'Positions where you went wrong in your own games.'), h('a', { class: 'btn', href: '#/train' }, 'Open mistakes')),
    method));
  return () => cleanups.forEach((f) => f());
}

// ------------------------------------------------------------------ a training session
function session(root, cleanups) {
  const L = learn(); const t = today(); const p = profile();
  const plan = prepared && prepared.day === t ? prepared.plan : planSession(CURRICULUM, L, p, t);
  prepared = null;
  const idx = exerciseIndex(CURRICULUM);
  const items = plan.items;
  const box = h('div', { class: 'stack runner' });
  root.append(box);
  const before = Object.fromEntries(flatLessons(CURRICULUM).map((l) => [l.id, topicChance(L, l.id, p.level)]));
  const total = items.filter((i) => i.type === 'ex').length;
  let n = 0; let done = 0; let firstTry = 0; let board; let attempts = 0; let solved = false; let hintShown = false; let streakNote = null;

  if (!total) {
    box.append(h('div', { class: 'card stack' }, h('h2', {}, 'Training'), h('p', { class: 'muted' }, 'Nothing to train right now.'), h('a', { class: 'btn primary', href: '#/learn' }, 'Back')));
    return () => {};
  }

  function frame(...kids) {
    board?.destroy(); board = null; clear(box);
    box.append(
      h('div', { class: 'row between' }, h('a', { class: 'btn ghost', href: '#/learn' }, '‹ Quit'), h('span', { class: 'muted' }, n < items.length ? `Exercise ${Math.min(done + 1, total)} of ${total}` : 'Done')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(done), 'aria-valuemax': String(total) }, h('i', { style: { width: `${(done / total) * 100}%` } })),
      ...kids);
  }

  function step() {
    if (n >= items.length) return finish();
    const it = items[n];
    if (it.type === 'intro') return intro(lessonById(it.topic), 0);
    return exercise(idx.get(it.id).ex, it);
  }

  function intro(lesson, i) {
    const c = lesson.cards[i]; const last = i === lesson.cards.length - 1;
    const boardEl = h('div', { class: 'boardwrap' });
    frame(h('div', { class: `lesson-card ${c.fen ? 'with-board' : ''}` },
      c.fen && h('div', { class: 'lc-board' }, boardEl),
      h('div', { class: 'card stack' },
        i === 0 && h('div', { class: 'pill' }, `A quick lesson: ${lesson.title}`),
        i === 0 && h('p', { class: 'why small muted' }, `Why this matters: ${lesson.why}`),
        h('h2', {}, c.title), h('p', { class: 'lc-text' }, c.text),
        h('div', { class: 'controls' },
          i > 0 && h('button', { onclick: () => intro(lesson, i - 1) }, '‹ Back'),
          h('button', { class: 'primary big', onclick: () => { if (last) { const sk = getSkill(L, lesson.id, p.level); sk.intro = true; L.skills[lesson.id] = sk; save(); n++; step(); } else intro(lesson, i + 1); } }, last ? 'Try it ›' : 'Next ›')))));
    if (c.fen) { board = new Board(boardEl, { orientation: new Chess(c.fen).turn() }); board.setPosition(c.fen); board.setInteractive(null); if (c.arrows) board.setArrows(c.arrows); }
  }

  function exercise(ex, it) {
    attempts = 0; solved = false; hintShown = false;
    const boardEl = h('div', { class: 'boardwrap' });
    const msg = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' }, ex.prompt);
    const actions = h('div', { class: 'controls' });
    const turn = new Chess(ex.fen).turn();
    const hintBtn = h('button', { onclick: () => { hintShown = true; msg.textContent = `Hint: ${ex.hint}`; hintBtn.disabled = true; } }, icon('bulb'), ' Hint');
    const optsEl = h('div', { class: 'options' });
    frame(h('div', { class: 'game' },
      h('div', { class: 'boardcol' }, boardEl),
      h('div', { class: 'side stack' }, h('div', { class: 'card stack' }, h('div', { class: 'pill' }, lessonById(it.topic).title), msg, ex.type === 'find' ? actions : optsEl))));
    if (ex.type === 'find') {
      board = new Board(boardEl, { orientation: turn, onMove: (mv) => answerFind(ex, it, mv, msg, actions) });
      board.setPosition(ex.fen); board.setInteractive(turn);
      actions.append(hintBtn, h('button', { onclick: () => showAnswer(ex, it, msg, actions) }, 'Show the answer'));
    } else {
      board = new Board(boardEl, { orientation: turn }); board.setPosition(ex.fen); board.setInteractive(null);
      ex.options.forEach((o) => optsEl.append(h('button', { class: 'big option', onclick: (e) => answerQuiz(ex, it, o, e.currentTarget, msg, optsEl) }, o.san)));
      optsEl.append(hintBtn);
    }
  }

  function settle(ex, it, success, container) {
    const sk = recordResult(L, it.topic, exerciseRating(it.topic, ex), success && !hintShown, p.level);
    void sk;
    reviewExercise(L, ex.id, success && !hintShown, t);
    const res = addPoints(L, 1, t); if (res.extended && !streakNote) streakNote = res;
    done++; if (success && !hintShown) firstTry++;
    save();
    container.append(h('button', { class: 'primary big', onclick: () => { n++; step(); } }, done === total ? 'Finish' : 'Next ›'));
  }

  function answerFind(ex, it, mv, msg, actions) {
    if (solved) return;
    attempts++;
    const chess = new Chess(ex.fen);
    try { chess.move(mv); } catch { board.setPosition(ex.fen); return; }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const ok = ex.mate ? chess.isCheckmate() : ex.answers.includes(uci);
    if (ok) {
      solved = true; play('right');
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] }); board.setInteractive(null);
      msg.textContent = `Correct! ${ex.explain}`.replace('Correct!', attempts === 1 && !hintShown ? 'Correct!' : 'Solved.');
      settle(ex, it, attempts === 1, actions);
    } else {
      play('wrong');
      msg.textContent = attempts >= 3 ? 'Not that one. Press "Show the answer" if you are stuck.' : 'Not quite. Try another move.';
      setTimeout(() => { board.setPosition(ex.fen); board.setInteractive(new Chess(ex.fen).turn()); }, 350);
    }
  }

  function showAnswer(ex, it, msg, actions) {
    if (solved) return;
    solved = true; attempts = Math.max(attempts, 2);
    let best = ex.answers[0];
    if (ex.mate) { const c = new Chess(ex.fen); const mm = c.moves({ verbose: true }).find((x) => { const d = new Chess(ex.fen); d.move(x.san); return d.isCheckmate(); }); best = mm.from + mm.to + (mm.promotion ?? ''); }
    board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), brush: 'green' }]); board.setInteractive(null);
    msg.textContent = `The answer: ${ex.explain}`;
    settle(ex, it, false, actions);
  }

  function answerQuiz(ex, it, o, btn, msg, optsEl) {
    if (solved) return;
    attempts++;
    if (o.ok) {
      solved = true; play('right'); btn.classList.add('right');
      msg.textContent = `${attempts === 1 && !hintShown ? 'Correct!' : 'Solved.'} ${o.why} ${ex.explain}`;
      optsEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      settle(ex, it, attempts === 1, optsEl);
    } else {
      play('wrong'); btn.classList.add('wrong'); btn.disabled = true;
      msg.textContent = `${o.why || 'Not the best.'} Try another.`;
    }
  }

  function finish() {
    L.sessions = (L.sessions ?? 0) + 1; save();
    play('end');
    const after = Object.fromEntries(flatLessons(CURRICULUM).map((l) => [l.id, topicChance(L, l.id, p.level)]));
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]).sort((a, b) => Math.abs(after[b] - before[b]) - Math.abs(after[a] - before[a])).slice(0, 3);
    frame(h('div', { class: 'card stack result' },
      h('div', { class: 'result-title' }, 'Training done'),
      h('p', {}, `${firstTry} of ${total} right on the first try.`),
      moved.length > 0 && h('ul', { class: 'focus' }, moved.map((k) => h('li', {}, h('b', {}, lessonById(k).title), h('span', { class: 'muted' }, ` ${before[k]}% → ${after[k]}%`)))),
      streakNote && h('p', { class: 'streak-note' }, icon('flame', 18), ` ${streakNote.count}-day streak!${streakNote.earnedFreeze ? ' You earned a streak freeze.' : ''}${streakNote.usedFreeze ? ' (A freeze saved your streak.)' : ''}`),
      h('p', { class: 'muted small' }, 'Tomorrow\'s training will adapt to how this went and to your next games.'),
      h('div', { class: 'controls' }, h('a', { class: 'btn primary big', href: '#/learn/train', onclick: () => { setTimeout(() => window.dispatchEvent(new Event('hashchange')), 0); } }, 'Train some more'), h('a', { class: 'btn', href: '#/learn' }, 'Back'))));
  }

  step();
  return () => { board?.destroy(); cleanups.forEach((f) => f()); };
}

export { TOPIC_BASE };
