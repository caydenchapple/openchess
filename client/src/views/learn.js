// Learn: a course you can open at any lesson, plus a daily session that is built from how you play (your reviewed games, your
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
  topicChance, exerciseRating, exerciseIndex, flatLessons, DAILY_GOAL, TOPIC_BASE,
} from '../lessons-logic.js';

const today = () => dayKey();
const learn = () => get().learn;
const lessons = () => flatLessons(CURRICULUM);
const lessonById = (id) => lessons().find((l) => l.id === id);
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms) => { try { if (get().settings.sound) navigator.vibrate?.(ms); } catch { /* not supported */ } };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

/** How far through a lesson you are: one pip per exercise (solved first time, seen but missed, or not seen). */
function lessonState(L, lesson) {
  const pips = lesson.exercises.map((e) => { const r = L.ex[e.id]; return !r || !r.seen ? 'new' : r.box >= 1 ? 'solved' : 'missed'; });
  const seen = pips.filter((p) => p !== 'new').length;
  const intro = !!L.skills[lesson.id]?.intro;
  const status = seen === pips.length && pips.length ? 'done' : seen || intro ? 'started' : 'new';
  return { pips, seen, status };
}

let prepared = null; // the plan the hub showed, so "Start" runs exactly that
export function mount(root, params) {
  const cleanups = [];
  if (params[0] === 'train' || params[0] === 'daily') return session(root, cleanups, { plan: prepared?.day === today() ? prepared.plan : null });
  if (params[0] === 'lesson' && lessonById(params[1])) return session(root, cleanups, { lesson: lessonById(params[1]) });
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
  const idx = exerciseIndex(CURRICULUM);

  // ---- today's session: a real position from it sits beside the button, so you see what you are about to do
  const first = plan.items.find((i) => i.type === 'ex');
  const firstEx = first && idx.get(first.id)?.ex;
  const miniEl = h('div', { class: 'boardwrap today-board', 'aria-hidden': 'true' });
  const why = (f) => h('li', {}, h('b', {}, lessonById(f.topic)?.title ?? f.topic), h('span', {}, f.reason));
  const today_ = h('section', { class: 'panel tcard' },
    h('div', { class: 'today-copy' },
      h('h2', {}, 'Today\'s training'),
      h('p', { class: 'meta' }, `${plural(exCount, 'exercise')} · about ${Math.max(3, Math.round(exCount * 0.8))} min${due ? ` · ${due} to review` : ''}`),
      h('ul', { class: 'focus2' }, plan.focus.map(why)),
      h('p', { class: 'small muted' }, p.reviewed ? `Chosen from your ${plural(p.reviewed, 'reviewed game')} and how you solve them.` : 'Chosen from how you solve them. Review a game to make it fit you better.'),
      h('a', { class: 'btn primary big', href: '#/learn/train' }, icon('play', 16), 'Start training')),
    firstEx && miniEl);
  let mini = null;
  if (firstEx) {
    mini = new Board(miniEl, { orientation: new Chess(firstEx.fen).turn() });
    mini.setPosition(firstEx.fen); mini.setInteractive(null);
  }

  // ---- the course
  const next = lessons().find((l) => lessonState(L, l).status !== 'done');
  let number = 0;
  const units = CURRICULUM.map((u, ui) => {
    const done = u.lessons.filter((l) => lessonState(L, l).status === 'done').length;
    const rows = u.lessons.map((l) => {
      number++;
      const st = lessonState(L, l);
      const sk = getSkill(L, l.id, p.level);
      const label = st.status === 'done' ? 'Practise' : st.status === 'started' ? 'Continue' : 'Start';
      return h('li', {},
        h('a', { class: `lrow ${st.status} ${next?.id === l.id ? 'next' : ''}`, href: `#/learn/lesson/${l.id}` },
          h('span', { class: 'node' }, st.status === 'done' ? icon('check', 16) : String(number)),
          h('span', { class: 'l-body' },
            h('b', {}, l.title),
            h('span', { class: 'l-meta' }, `${l.minutes} min · ${plural(l.exercises.length, 'exercise')}${sk.n ? ` · ${topicChance(L, l.id, p.level)}% chance to solve one` : ''}`)),
          h('span', { class: 'l-right' },
            h('span', { class: 'pips', role: 'img', 'aria-label': `${st.pips.filter((x) => x === 'solved').length} of ${st.pips.length} exercises solved first try` }, st.pips.map((x) => h('i', { class: x }))),
            h('span', { class: 'go' }, label, icon('next', 14)))));
    });
    return h('section', { class: 'unit' },
      h('header', { class: 'unit-head' }, h('span', { class: 'u-num' }, String(ui + 1).padStart(2, '0')), h('h2', {}, u.title), h('span', { class: 'u-count' }, `${done} / ${u.lessons.length}`)),
      h('p', { class: 'unit-blurb' }, u.blurb),
      h('ol', { class: 'path' }, rows));
  });

  // ---- streak and daily goal
  const week = weekView(L.streak, t).map((d) => h('div', { class: `wd ${d.goal ? 'hit' : ''} ${d.today ? 'now' : ''}`, title: `${d.day}: ${plural(d.points, 'point')}` },
    h('i', {}, d.goal ? icon('check', 14) : ''), h('span', {}, new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: 'narrow' }))));
  const goalNow = Math.min(DAILY_GOAL, todayPts);
  const note = streak.today
    ? (todayPts >= DAILY_GOAL ? 'Goal reached for today.' : `${DAILY_GOAL - todayPts} more to reach today's goal.`)
    : streak.count
      ? (streak.usesFreeze ? 'You missed a day. A streak freeze covers it if you train today.' : 'Train today to keep your streak.')
      : `Solve ${DAILY_GOAL} exercises today to start a streak.`;
  const side = h('aside', { class: 'panel streak-panel', 'aria-label': 'Streak' },
    h('div', { class: 'sp-top' },
      h('span', { class: `flame ${streak.today ? 'lit' : ''}` }, icon('flame', 28)),
      h('b', { class: 'sp-num' }, String(streak.count)),
      h('span', { class: 'sp-label' }, 'day streak')),
    h('p', { class: 'sp-note' }, note),
    h('div', { class: 'weekrow', role: 'img', 'aria-label': 'Your last 7 days' }, week),
    h('div', { class: 'goal' },
      h('span', {}, 'Today'),
      h('span', { class: 'goal-pips', role: 'img', 'aria-label': `${goalNow} of ${DAILY_GOAL} points` }, Array.from({ length: DAILY_GOAL }, (_, i) => h('i', { class: i < goalNow ? 'on' : '' }))),
      h('span', { class: 'mono' }, `${goalNow}/${DAILY_GOAL}`)),
    h('p', { class: 'small muted sp-freeze' }, icon('snow', 14), `${plural(L.streak.freezes, 'streak freeze')}. You earn one every 7 days.`));

  const mistakes = get().mistakes.length;
  const method = h('details', { class: 'method2' },
    h('summary', {}, 'How training fits you'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Your games steer it. '), 'Mistakes found in your reviews (undefended pieces, missed tactics, endgame slips) make those topics come up more.'),
      h('li', {}, h('b', {}, 'The right difficulty. '), 'Each exercise has a difficulty. We pick ones you should solve about 3 times in 4: hard enough to teach, easy enough to keep going.'),
      h('li', {}, h('b', {}, 'Repeat at growing gaps. '), 'Missed exercises return after 1, 3, 7, 14 and 30 days, the idea behind the Woodpecker method.'),
      h('li', {}, h('b', {}, 'Short lessons, only when new. '), 'The first time a topic comes up you get a quick lesson. It follows the thinking routine Kotov described and the early-endgame study Capablanca and Dvoretsky advised.')),
    h('p', { class: 'small muted' }, 'This summarises well-known training ideas. It is not a promise of results. Exercises with one best answer were checked with Stockfish.'));

  root.append(h('div', { class: 'learn2' },
    h('header', { class: 'l-head' }, h('h1', {}, 'Learn'), h('p', {}, 'Short lessons and exercises, picked to fit how you play.')),
    h('div', { class: 'l-grid' },
      h('div', { class: 'l-main' },
        today_,
        h('div', { class: 'course' }, h('h2', { class: 'course-title' }, 'Course'), units),
        h('a', { class: 'lrow plain', href: '#/train' },
          h('span', { class: 'node' }, icon('target', 16)),
          h('span', { class: 'l-body' }, h('b', {}, 'Your mistakes'), h('span', { class: 'l-meta' }, mistakes ? `${plural(mistakes, 'position')} from your own games` : 'Positions where you went wrong in your own games')),
          h('span', { class: 'l-right' }, h('span', { class: 'go' }, 'Open', icon('next', 14)))),
        method),
      side)));
  return () => { mini?.destroy(); cleanups.forEach((f) => f()); };
}

// ------------------------------------------------------------------ the player: one lesson, or today's training
function session(root, cleanups, { plan: given = null, lesson: only = null }) {
  const L = learn(); const t = today(); const p = profile();
  const idx = exerciseIndex(CURRICULUM);
  const plan = only
    ? { items: [{ type: 'intro', topic: only.id, forced: true }, ...only.exercises.map((e) => ({ type: 'ex', id: e.id, topic: only.id }))] }
    : (given ?? planSession(CURRICULUM, L, p, t));
  prepared = null;
  const items = plan.items;
  const total = items.filter((i) => i.type === 'ex').length;
  const startedAt = Date.now();
  const before = Object.fromEntries(lessons().map((l) => [l.id, topicChance(L, l.id, p.level)]));
  let n = 0; let done = 0; let firstTry = 0; let combo = 0; let attempts = 0; let solved = false; let hintShown = false; let streakNote = null;
  let board = null; let key = null; let raf = 0; let alive = true; let cur = null;

  const wrap = h('div', { class: 'run' });
  const stage = h('div', { class: 'stage' });
  root.append(wrap);
  if (!total && !only) {
    wrap.append(h('div', { class: 'panel finish' }, h('h2', {}, 'Nothing to train right now'), h('a', { class: 'btn primary', href: '#/learn' }, 'Back to Learn')));
    return () => {};
  }

  // ---- the top bar: quit, one segment per step, a live count
  const segs = items.map(() => h('i', { class: 'seg' }));
  const count = h('span', { class: 'run-count mono' });
  const comboEl = h('span', { class: 'combo', hidden: true });
  const bar = h('div', { class: 'run-segs', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': String(items.length), 'aria-valuenow': '0' }, segs);
  wrap.append(h('div', { class: 'run-top' }, h('a', { class: 'iconbtn', href: '#/learn', title: 'Quit', 'aria-label': 'Quit' }, icon('close', 20)), bar, comboEl, count), stage);

  function progress(upTo) {
    segs.forEach((s, i) => { s.classList.toggle('done', i < upTo); s.classList.toggle('now', i === upTo); });
    bar.setAttribute('aria-valuenow', String(upTo));
    count.textContent = items[upTo]?.type === 'ex' ? `${Math.min(done + 1, total)} / ${total}` : '';
  }
  function setCombo(v) {
    combo = v; comboEl.hidden = v < 2; comboEl.textContent = `${v} in a row`;
    if (v >= 2 && !calm()) { comboEl.classList.remove('bump'); void comboEl.offsetWidth; comboEl.classList.add('bump'); }
  }

  function show(...kids) {
    board?.destroy(); board = null; key = null; clear(stage);
    stage.classList.remove('enter'); void stage.offsetWidth; stage.classList.add('enter');
    stage.append(...kids);
    window.scrollTo?.({ top: 0 });
  }
  const keycap = (text) => h('kbd', { class: 'keycap', 'aria-hidden': 'true' }, text);
  const onKey = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !key) return;
    const k = e.key;
    const inControl = e.target instanceof Element && e.target.closest('button, a, input, select, textarea, summary');
    if (k === 'Enter' && !inControl && key.advance) { e.preventDefault(); key.advance(); }
    else if (k === 'ArrowRight' && key.advance && key.arrows) key.advance();
    else if (k === 'ArrowLeft' && key.back) key.back();
    else if (/^[1-9]$/.test(k) && key.pick) key.pick(Number(k) - 1);
    else if ((k === 'h' || k === 'H') && key.hint) key.hint();
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  function step() {
    if (n >= items.length) return finish();
    progress(n);
    const it = items[n];
    if (it.type === 'intro') return intro(lessonById(it.topic), 0, it);
    return exercise(idx.get(it.id).ex, it);
  }

  // ---- teaching cards
  function intro(lesson, i, it) {
    const c = lesson.cards[i]; const last = i === lesson.cards.length - 1;
    const boardEl = h('div', { class: 'boardwrap' });
    const finishIntro = () => { const sk = getSkill(L, lesson.id, p.level); sk.intro = true; L.skills[lesson.id] = sk; save(); n++; step(); };
    const advance = () => (last ? finishIntro() : intro(lesson, i + 1, it));
    const back = () => intro(lesson, i - 1, it);
    show(h('div', { class: `teach ${c.fen ? 'with-board' : 'plain'}` },
      c.fen && h('div', { class: 'teach-board' }, boardEl),
      h('div', { class: 'teach-copy' },
        h('div', { class: 'eyebrow' }, h('span', {}, lesson.title), h('span', { class: 'dots mono' }, `${i + 1} / ${lesson.cards.length}`)),
        h('h2', {}, c.title),
        h('p', { class: 'lc-text' }, c.text),
        i === 0 && h('p', { class: 'why' }, h('b', {}, 'Why it matters. '), lesson.why),
        h('div', { class: 't-foot' },
          i > 0 && h('button', { class: 'quiet', onclick: back }, icon('prev', 16), 'Back'),
          h('button', { class: 'primary big', onclick: advance }, last ? 'Try it' : 'Continue', keycap('↵')),
          i === 0 && it.forced && total > 0 && h('button', { class: 'quiet', onclick: finishIntro }, 'Skip to exercises')))));
    if (c.fen) {
      board = new Board(boardEl, { orientation: new Chess(c.fen).turn() });
      board.setPosition(c.fen); board.setInteractive(null);
      if (c.arrows) board.setArrows(c.arrows);
    }
    key = { advance, arrows: true, back: i > 0 ? back : null };
  }

  // ---- exercises
  function exercise(ex, it) {
    attempts = 0; solved = false; hintShown = false;
    const turn = new Chess(ex.fen).turn();
    const boardEl = h('div', { class: 'boardwrap' });
    const hintBox = h('p', { class: 'hint', hidden: true });
    const answers = h('div', { class: ex.type === 'find' ? 'tools' : 'options' });
    const tools = h('div', { class: 'tools' });
    const feedback = h('div', { class: 'fb-slot', role: 'status', 'aria-live': 'polite' });
    const hintBtn = h('button', { class: 'quiet', onclick: () => useHint() }, icon('bulb', 16), 'Hint', keycap('H'));
    function useHint() { if (solved || hintShown) return; hintShown = true; hintBox.hidden = false; hintBox.textContent = ex.hint; hintBtn.disabled = true; }

    show(h('div', { class: 'ex' },
      h('div', { class: 'ex-board' }, boardEl),
      h('div', { class: 'ex-panel' },
        h('div', { class: 'eyebrow' }, h('span', { class: `turn ${turn === 'w' ? 'white' : 'black'}`, 'aria-hidden': 'true' }), h('span', {}, lessonById(it.topic).title)),
        h('p', { class: 'ex-prompt' }, ex.prompt),
        ex.type === 'find' ? h('p', { class: 'ex-cue' }, 'Drag a piece, or tap it and then its square.') : answers,
        hintBox, tools, feedback)));

    if (ex.type === 'find') {
      board = new Board(boardEl, { orientation: turn, onMove: (mv) => answerFind(ex, it, mv) });
      board.setPosition(ex.fen); board.setInteractive(turn);
      tools.append(hintBtn, h('button', { class: 'quiet', onclick: () => showAnswer(ex, it) }, 'Show the answer'));
      key = { hint: useHint };
    } else {
      board = new Board(boardEl, { orientation: turn }); board.setPosition(ex.fen); board.setInteractive(null);
      ex.options.forEach((o, k) => answers.append(h('button', { class: 'option', onclick: (e) => answerQuiz(ex, it, o, e.currentTarget) }, keycap(String(k + 1)), h('span', { class: 'san' }, o.san), h('span', { class: 'mark' }))));
      tools.append(hintBtn);
      key = { hint: useHint, pick: (k) => answers.children[k]?.click() };
    }
    cur = { boardEl, feedback, tools, answers, hintBtn };
  }

  const ctx = () => cur;
  function feedbackCard(tone, title, text, withNext) {
    const { feedback } = ctx();
    clear(feedback);
    const nextBtn = withNext && h('button', { class: 'primary big', onclick: () => advance() }, n + 1 >= items.length ? 'Finish' : 'Continue', keycap('↵'));
    feedback.append(h('div', { class: 'feedback', 'data-tone': tone },
      h('div', { class: 'fb-title' }, icon(tone === 'good' ? 'check' : tone === 'bad' ? 'close' : 'bulb', 18), title),
      text && h('p', { class: 'fb-text' }, text),
      nextBtn));
    if (nextBtn) key = { advance };
    if (!withNext) feedback.firstChild.scrollIntoView?.({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
  }
  function advance() { n++; step(); }

  function settle(ex, it, success) {
    const ok = success && !hintShown;
    recordResult(L, it.topic, exerciseRating(it.topic, ex), ok, p.level);
    reviewExercise(L, ex.id, ok, t);
    const res = addPoints(L, 1, t); if (res.extended && !streakNote) streakNote = res;
    done++; if (ok) firstTry++;
    setCombo(ok ? combo + 1 : 0);
    segs[n]?.classList.add('done'); count.textContent = `${Math.min(done, total)} / ${total}`;
    save();
    ctx().tools.hidden = true; ctx().hintBtn.disabled = true;
  }

  function answerFind(ex, it, mv) {
    if (solved) return;
    attempts++;
    const chess = new Chess(ex.fen);
    try { chess.move(mv); } catch { board.setPosition(ex.fen); return; }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const ok = ex.mate ? chess.isCheckmate() : ex.answers.includes(uci);
    const { boardEl } = ctx();
    if (ok) {
      solved = true; play('right'); buzz(12);
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] }); board.setInteractive(null);
      boardEl.classList.remove('ok'); void boardEl.offsetWidth; boardEl.classList.add('ok');
      const clean = attempts === 1 && !hintShown;
      settle(ex, it, attempts === 1);
      feedbackCard('good', clean ? 'Correct' : 'Solved', ex.explain, true);
    } else {
      play('wrong'); buzz(30);
      boardEl.classList.remove('shake'); void boardEl.offsetWidth; boardEl.classList.add('shake');
      feedbackCard('bad', 'Not quite', attempts >= 3 ? 'That is not it. If you are stuck, use Show the answer.' : 'Try another move.', false);
      setTimeout(() => { if (alive && !solved) { board.setPosition(ex.fen); board.setInteractive(new Chess(ex.fen).turn()); } }, 350);
    }
  }

  function showAnswer(ex, it) {
    if (solved) return;
    solved = true; attempts = Math.max(attempts, 2);
    let best = ex.answers[0];
    if (ex.mate) { const c = new Chess(ex.fen); const mm = c.moves({ verbose: true }).find((x) => { const d = new Chess(ex.fen); d.move(x.san); return d.isCheckmate(); }); best = mm.from + mm.to + (mm.promotion ?? ''); }
    board.setPosition(ex.fen); board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), brush: 'green' }]); board.setInteractive(null);
    settle(ex, it, false);
    feedbackCard('info', 'The answer', ex.explain, true);
  }

  function answerQuiz(ex, it, o, btn) {
    if (solved) return;
    attempts++;
    const { boardEl, answers } = ctx();
    btn.disabled = true;
    if (o.ok) {
      solved = true; play('right'); buzz(12);
      btn.classList.add('right'); btn.querySelector('.mark').replaceChildren(icon('check', 18));
      answers.querySelectorAll('button:not(.right)').forEach((b) => { b.disabled = true; });
      boardEl.classList.remove('ok'); void boardEl.offsetWidth; boardEl.classList.add('ok');
      const clean = attempts === 1 && !hintShown;
      settle(ex, it, attempts === 1);
      feedbackCard('good', clean ? 'Correct' : 'Solved', [o.why, ex.explain].filter(Boolean).join(' '), true);
    } else {
      play('wrong'); buzz(30);
      btn.classList.add('wrong'); btn.querySelector('.mark').replaceChildren(icon('close', 18));
      feedbackCard('bad', 'Not the best', `${o.why || 'There is a stronger move.'} Try another.`, false);
    }
  }

  // ---- the end: a ring for how many you got first time, and what moved
  function countUp(el, to, ms = 700) {
    if (calm() || !to) { el.textContent = String(to); return; }
    const t0 = performance.now();
    const tick = (now) => {
      if (!alive) return;
      const k = Math.min(1, (now - t0) / ms);
      el.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    L.sessions = (L.sessions ?? 0) + 1;
    if (only) {
      const sk = getSkill(L, only.id, p.level);
      if (!sk.finished) { sk.finished = true; L.skills[only.id] = sk; const res = addPoints(L, 5, t); if (res.extended && !streakNote) streakNote = res; }
    }
    save(); play('end'); progress(items.length);
    count.textContent = '';
    const after = Object.fromEntries(lessons().map((l) => [l.id, topicChance(L, l.id, p.level)]));
    const moved = Object.keys(after).filter((k) => after[k] !== before[k]).sort((a, b) => Math.abs(after[b] - before[b]) - Math.abs(after[a] - before[a])).slice(0, 3);
    const ratio = total ? firstTry / total : 1;
    const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const R = 70; const C = 2 * Math.PI * R;
    const ring = h('div', { class: 'ring' });
    ring.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 160 160" width="160" height="160" aria-hidden="true"><circle class="bg" cx="80" cy="80" r="${R}"/><circle class="fg" cx="80" cy="80" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>`);
    const num = h('b', { class: 'ring-num' }, h('span', { class: 'rn' }, calm() ? String(firstTry) : '0'), h('small', {}, `/ ${total}`));
    ring.append(num);
    const nextLesson = only ? lessons().slice(lessons().findIndex((l) => l.id === only.id) + 1).find((l) => lessonState(L, l).status !== 'done') : null;
    const title = only ? `${only.title}` : ratio === 1 ? 'Perfect session' : 'Session complete';
    const sub = only ? 'Lesson complete.' : ratio < 0.6 ? 'The ones you missed come back tomorrow.' : `${firstTry} of ${total} right on the first try.`;
    const mm = String(Math.floor(secs / 60)); const ss = String(secs % 60).padStart(2, '0');
    const bars = moved.map((k) => {
      const fill = h('i', { style: { '--to': String(after[k] / 100) } });
      fill.style.transform = `scaleX(${before[k] / 100})`;
      return h('div', { class: 'mv' }, h('span', { class: 'mv-name' }, lessonById(k).title), h('span', { class: 'mvbar' }, fill), h('span', { class: 'mv-pct mono' }, `${before[k]}% → ${after[k]}%`));
    });
    show(h('div', { class: 'finish' },
      ring,
      h('div', { class: 'finish-copy' }, h('h2', {}, title), h('p', { class: 'muted' }, sub)),
      total > 0 && h('div', { class: 'fstats' },
        h('div', { class: 'fstat' }, h('b', { class: 'mono' }, `${firstTry}/${total}`), h('span', {}, 'First try')),
        h('div', { class: 'fstat' }, h('b', { class: 'mono' }, `${mm}:${ss}`), h('span', {}, 'Time')),
        h('div', { class: 'fstat' }, h('b', { class: 'mono' }, `${Math.min(DAILY_GOAL, L.streak.days[t] ?? 0)}/${DAILY_GOAL}`), h('span', {}, 'Daily goal'))),
      bars.length > 0 && h('div', { class: 'moved' }, h('h3', {}, 'What moved'), bars),
      streakNote && h('p', { class: 'streak-note' }, icon('flame', 18), `${streakNote.count}-day streak${streakNote.earnedFreeze ? '. You earned a streak freeze' : ''}${streakNote.usedFreeze ? '. A freeze saved it' : ''}`),
      h('div', { class: 't-foot center' },
        only
          ? [nextLesson ? h('a', { class: 'btn primary big', href: `#/learn/lesson/${nextLesson.id}` }, 'Next lesson', icon('next', 16)) : h('a', { class: 'btn primary big', href: '#/learn' }, 'Back to Learn'), nextLesson && h('a', { class: 'btn', href: '#/learn' }, 'Back to Learn')]
          : [h('a', { class: 'btn primary big', href: '#/learn/train', onclick: () => { setTimeout(() => window.dispatchEvent(new Event('hashchange')), 0); } }, 'Keep training'), h('a', { class: 'btn', href: '#/learn' }, 'Back to Learn')])));
    key = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.querySelector('.fg').style.strokeDashoffset = (C * (1 - ratio)).toFixed(1);
      stage.querySelectorAll('.mv .mvbar i').forEach((i) => { i.style.transform = `scaleX(${i.style.getPropertyValue('--to')})`; });
    }));
    countUp(num.querySelector('.rn'), firstTry);
  }

  step();
  return () => { alive = false; cancelAnimationFrame(raf); board?.destroy(); cleanups.forEach((f) => f()); };
}

export { TOPIC_BASE };
