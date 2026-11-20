// Gambits: learn the lines, then play them from memory. Lines you miss come back soon; lines you know come back at growing gaps.
// Routes: #/gambits (all gambits) · #/gambits/<id> (one gambit) · #/gambits/<id>/<line>/learn|drill
import { Chess } from 'chess.js';
import { h, clear } from '../util.js';
import { Board } from '../board.js';
import { get, save } from '../store.js';
import { play } from '../sound.js';
import { icon } from '../icons.js';
import { dayKey, daysBetween } from '../lessons-logic.js';
import { GAMBITS, LEVELS, gambitById } from '../gambits-data.js';
import { buildSteps, isBookMove, recordRun, lineStatus, dueLines, gambitSummary, lineKey, MASTERED_BOX } from '../gambits-logic.js';

const today = () => dayKey();
const G = () => get().gambits;
const SIDE = { w: 'White', b: 'Black' };
const KIND = { main: 'Main line', alt: 'If they decline', trap: 'Trap' };
const STATUS = { new: 'New', learning: 'Learning', due: 'Due', mastered: 'Learned' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mount(root, params = []) {
  const g = gambitById(params[0]);
  if (!params[0]) return hub(root);
  if (!g) { location.hash = '#/gambits'; return () => {}; }
  const line = g.lines.find((l) => l.id === params[1]);
  if (!params[1]) return gambitPage(root, g);
  if (!line) { location.hash = `#/gambits/${g.id}`; return () => {}; }
  return player(root, g, line, params[2] === 'drill' ? 'drill' : 'learn');
}

// ------------------------------------------------------------------ all gambits
function hub(root) {
  const t = today();
  const due = dueLines(G(), t);
  const card = (g) => {
    const s = gambitSummary(G(), g, t);
    return h('a', { class: 'gcard', href: `#/gambits/${g.id}` },
      h('div', { class: 'gcard-top' }, h('h3', {}, g.name), s.due ? h('span', { class: 'gtag due' }, `${s.due} due`) : null),
      h('p', { class: 'muted' }, g.tagline),
      h('div', { class: 'gcard-meta' },
        h('span', { class: `glevel l${g.level}` }, LEVELS[g.level - 1]),
        h('span', { class: 'muted small' }, `${plural(g.lines.length, 'line')} · ${s.mastered}/${s.total} learned`)),
      h('div', { class: 'rate-bar', role: 'img', 'aria-label': `${s.mastered} of ${s.total} lines learned` }, h('i', { style: { width: `${Math.round((100 * s.mastered) / s.total)}%` } })));
  };
  const section = (side) => h('section', { class: 'stack' },
    h('h2', {}, `Play as ${SIDE[side]}`),
    h('div', { class: 'gambit-grid' }, GAMBITS.filter((g) => g.side === side).map(card)));

  const first = due[0];
  root.append(h('div', { class: 'stack gambits' },
    h('header', { class: 'l-head' }, h('h1', {}, 'Gambits'), h('p', {}, 'Give a pawn for speed, then learn the lines until they come without thinking.')),
    h('section', { class: 'panel gdue' },
      h('div', {},
        h('h2', {}, first ? `${plural(due.length, 'line')} to practise today` : 'Pick a gambit to start'),
        h('p', { class: 'muted' }, first
          ? 'Lines you missed come back first. Lines you know come back after 1, 3, 7, 14 and 30 days.'
          : 'Each gambit has a main line, a line for when your opponent declines, and sometimes a trap. Learn a line step by step, then play it from memory. We bring it back at growing gaps.')),
      first
        ? h('a', { class: 'btn primary big', href: `#/gambits/${first.gambit.id}/${first.id}/drill` }, icon('play', 16), 'Practise now')
        : h('a', { class: 'btn primary big', href: '#/gambits/queens' }, icon('play', 16), "Start with the Queen's Gambit")),
    section('w'), section('b')));
  return () => {};
}

// ------------------------------------------------------------------ one gambit
function gambitPage(root, g) {
  const t = today();
  const list = (title, items) => h('div', { class: 'stack-s' }, h('h3', {}, title), h('ul', {}, items.map((x) => h('li', {}, x))));
  const lineRow = (l) => {
    const key = lineKey(g.id, l.id); const st = lineStatus(G(), key, t); const e = G().lines[key];
    return h('li', { class: 'gline' },
      h('div', { class: 'gline-main' },
        h('div', { class: 'row', style: { gap: '.5rem', flexWrap: 'wrap' } }, h('b', {}, l.name), h('span', { class: `gtag ${l.kind}` }, KIND[l.kind]), h('span', { class: `gtag st-${st}` }, STATUS[st])),
        h('p', { class: 'muted small' }, l.summary),
        e && h('p', { class: 'muted small' }, `Played ${plural(e.runs, 'time')}, ${e.clean} clean${st === 'due' ? '' : ` · back in ${plural(Math.max(0, daysBetween(t, e.due)), 'day')}`}`)),
      h('div', { class: 'gline-actions' },
        h('a', { class: 'btn', href: `#/gambits/${g.id}/${l.id}/learn` }, icon('book', 16), 'Learn'),
        h('a', { class: 'btn primary', href: `#/gambits/${g.id}/${l.id}/drill` }, icon('target', 16), 'Play it')));
  };
  root.append(h('div', { class: 'stack gambits' },
    h('a', { class: 'back', href: '#/gambits' }, icon('prev', 14), 'All gambits'),
    h('header', { class: 'l-head' },
      h('h1', {}, g.name),
      h('p', {}, `${g.tagline} You play ${SIDE[g.side]}. `, h('span', { class: `glevel l${g.level}` }, LEVELS[g.level - 1]))),
    h('div', { class: 'gpage' },
      h('section', { class: 'panel stack' }, h('h2', {}, 'Lines'), h('ol', { class: 'glines' }, g.lines.map(lineRow))),
      h('section', { class: 'panel stack' }, h('h2', {}, 'The idea'),
        list('Why it works', g.ideas), list('Plans', g.plans), list('Avoid', g.avoid)))));
  return () => {};
}

const PIECE = { N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
/** A clue that points at the move without giving it away: which kind of piece, and whether it takes or checks. */
const clue = (s) => `It is a ${/^O-O/.test(s.san) ? 'castling move' : `${PIECE[s.san[0]] ?? 'pawn'} move`}${s.captured ? ' that takes something' : ''}${/[+#]/.test(s.san) ? ' and gives check' : ''}.`;

const howTo = (mode) => h('div', { class: 'card ghow' },
  h('h2', {}, mode === 'drill' ? 'How to play it' : 'How to learn it'),
  h('ol', {}, (mode === 'drill'
    ? ['Tap a piece, then tap the square it goes to. Play the moves of this line from memory.', 'Your opponent answers for you. Keep going until the line ends.', 'Stuck? Press Hint: first a clue, then the piece, then the move. Each hint counts against a clean run.', 'A clean run brings the line back later. Any mistake brings it back tomorrow, with a list of what to work on.']
    : ['Press Next (or the right arrow key) to play the next move.', 'A green arrow shows your next move. A blue arrow shows their reply.', 'Read why each move is played. Click any move in the list to jump to it.', 'When you can follow the line, press Play it from memory.']).map((x) => h('li', {}, x))));

// ------------------------------------------------------------------ learn and drill one line
function player(root, g, line, mode) {
  const steps = buildSteps(g, line);
  const key = lineKey(g.id, line.id);
  const boardEl = h('div', { class: 'boardwrap' });
  const board = new Board(boardEl, { orientation: g.side, onMove: (mv) => onMove(mv) });
  board.premoves = false;
  const timers = new Set(); let gone = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!gone) fn(); }, ms); timers.add(id); };
  let i = 0; // plies played so far
  let mistakes = 0; let hints = 0; let wrongHere = 0; let hinted = false; let finished = false;

  const panel = h('div', { class: 'gnote', 'aria-live': 'polite' });
  const moves = h('ol', { class: 'gmoves', 'aria-label': 'Moves of the line' });
  const controls = h('div', { class: 'controls' });
  const tab = (m, label, ic) => h('a', { class: `gtab ${mode === m ? 'on' : ''}`, href: `#/gambits/${g.id}/${line.id}/${m}`, 'aria-current': mode === m ? 'page' : null }, icon(ic, 16), label);

  root.append(h('div', { class: 'stack gambits' },
    h('a', { class: 'back', href: `#/gambits/${g.id}` }, icon('prev', 14), g.name),
    h('div', { class: 'row between' }, h('h1', { style: { margin: 0 } }, line.name), h('div', { class: 'gtabs', role: 'navigation', 'aria-label': 'Mode' }, tab('learn', 'Learn', 'book'), tab('drill', 'Play it', 'target'))),
    h('div', { class: 'game' },
      h('div', { class: 'boardcol' }, boardEl),
      h('div', { class: 'side stack' }, h('div', { class: 'card stack' }, panel, controls), howTo(mode), h('div', { class: 'card' }, h('h2', {}, 'The line'), moves)))));

  const sound = (s) => play(/#/.test(s.san) ? 'end' : /\+/.test(s.san) ? 'check' : s.captured ? 'capture' : /^O-O/.test(s.san) ? 'castle' : 'move');
  const lastOf = (n) => (n > 0 ? [steps[n - 1].from, steps[n - 1].to] : null);
  const fenAt = (n) => (n > 0 ? steps[n - 1].fenAfter : steps[0].fenBefore);
  const who = (s) => `${s.number}${s.color === 'w' ? '.' : '...'} ${s.san}`;
  const sideName = SIDE[g.side];

  function renderMoves() {
    clear(moves);
    for (let k = 0; k < steps.length; k += 2) {
      const pair = [steps[k], steps[k + 1]].filter(Boolean);
      moves.append(h('li', {}, h('span', { class: 'mn' }, `${pair[0].number}.`), ...pair.map((s) => {
        const shown = mode === 'learn' || s.ply <= i;
        const cls = `${s.ply === i ? 'cur' : ''} ${s.mine ? 'mine' : ''} ${shown ? '' : 'hid'}`;
        return mode === 'learn'
          ? h('button', { type: 'button', class: `gm ${cls}`, onclick: () => showLearn(s.ply) }, s.san)
          : h('span', { class: `gm ${cls}` }, shown ? s.san : '·');
      })));
    }
  }

  // ---------------------------------------------------------------- learn: step through the line, every move explained
  function showLearn(n, { silent = false } = {}) {
    i = Math.max(0, Math.min(steps.length, n));
    board.setPosition(fenAt(i), { lastMove: lastOf(i) });
    board.setInteractive(null);
    const nxt = steps[i];
    board.setArrows(nxt ? [{ from: nxt.from, to: nxt.to, brush: nxt.mine ? 'green' : 'paleBlue' }] : []);
    if (!silent && i > 0) sound(steps[i - 1]);
    const cur = steps[i - 1];
    clear(panel);
    if (!cur) {
      panel.append(h('b', {}, `You play ${sideName}`), h('p', {}, line.summary), h('p', { class: 'gtodo' }, 'Press Next to see the first move and why it is played.'), h('p', { class: 'muted small' }, `The green arrow is your next move as ${sideName}; a blue arrow is their reply.`));
    } else {
      panel.append(
        h('div', { class: 'gnote-head' }, h('b', { class: 'gsan' }, who(cur)), h('span', { class: `gtag ${cur.mine ? 'mine' : 'theirs'}` }, cur.mine ? 'Your move' : 'Their move')),
        h('p', {}, h('b', {}, 'Why: '), cur.note || (cur.mine ? 'A move of the line. Look at what it develops or attacks.' : 'The usual reply. See how it changes the position.')));
      if (i === steps.length) panel.append(h('p', { class: 'muted' }, 'That is the end of the line. Now play it from memory.'));
    }
    clear(controls);
    controls.append(
      h('button', { disabled: i === 0, onclick: () => showLearn(i - 1) }, icon('prev', 14), 'Back'),
      i < steps.length ? h('button', { class: 'primary', onclick: () => showLearn(i + 1) }, 'Next', icon('next', 14))
        : h('a', { class: 'btn primary', href: `#/gambits/${g.id}/${line.id}/drill` }, icon('target', 16), 'Play it from memory'),
      h('button', { class: 'ghost', onclick: () => showLearn(0, { silent: true }) }, 'Restart'));
    renderMoves();
  }

  // ---------------------------------------------------------------- drill: play your side from memory
  const mineTotal = steps.filter((x) => x.mine).length;
  const missed = new Map(); // ply -> how many times you needed help on it
  let level = 0; // hint level for the current move: 1 clue, 2 the piece, 3 the move
  const miss = (s) => missed.set(s.ply, (missed.get(s.ply) ?? 0) + 1);

  function startDrill() {
    i = 0; mistakes = 0; hints = 0; wrongHere = 0; hinted = false; finished = false; level = 0; missed.clear();
    board.setPosition(fenAt(0)); board.setArrows([]);
    renderMoves(); next();
  }
  /** The prompt: where you are, what to do now, and (when asked for) the clue. */
  function prompt(extra) {
    const done = steps.filter((x) => x.mine && x.ply <= i).length;
    clear(panel);
    panel.append(
      h('div', { class: 'gnote-head' }, h('b', {}, `Your move as ${sideName}`), h('span', { class: 'gtag' }, `Move ${Math.min(done + 1, mineTotal)} of ${mineTotal}`)),
      h('p', { class: 'gtodo' }, i === 0 ? `Play the first move for ${sideName} in this line: ${line.name}.` : 'Play the next move of the line.'),
      extra ?? h('p', { class: 'muted small' }, 'Tap the piece, then tap where it goes. Stuck? Press Hint.'));
  }
  function hintButton() {
    const label = level === 0 ? 'Hint' : level === 1 ? 'Show the piece' : 'Show the move';
    return h('button', { disabled: level >= 3, onclick: hint }, icon('bulb', 16), label);
  }
  function setLevel(n) {
    const s = steps[i]; if (!s || !s.mine) return;
    level = Math.max(level, Math.min(3, n));
    if (!hinted) { hints++; hinted = true; }
    miss(s);
    board.setArrows(level === 2 ? [{ from: s.from, brush: 'green' }] : level >= 3 ? [{ from: s.from, to: s.to, brush: 'green' }] : []);
    const lines = [h('p', { class: 'ghint' }, h('b', {}, 'Clue: '), clue(s))];
    if (s.note) lines.push(h('p', { class: 'ghint' }, h('b', {}, 'The idea: '), s.note));
    if (level === 2) lines.push(h('p', { class: 'ghint' }, 'The circle shows which piece to move.'));
    if (level >= 3) lines.push(h('p', { class: 'ghint' }, 'The arrow shows the move. Play it, and remember it for next time.'));
    prompt(h('div', { class: 'stack-s' }, lines));
    controls.replaceChildren(hintButton(), h('button', { class: 'ghost', onclick: startDrill }, 'Restart'));
  }
  function next() {
    if (i >= steps.length) return finish();
    const s = steps[i];
    if (!s.mine) {
      board.setInteractive(null);
      clear(panel); panel.append(h('b', {}, `${SIDE[s.color]} is moving…`), h('p', { class: 'muted' }, 'Watch the reply, then it is your turn.'));
      later(() => { board.setPosition(s.fenAfter, { lastMove: [s.from, s.to] }); sound(s); i++; renderMoves(); next(); }, i === 0 ? 350 : 650);
      return;
    }
    wrongHere = 0; hinted = false; level = 0; board.setArrows([]);
    board.setInteractive(g.side);
    prompt();
    controls.replaceChildren(hintButton(), h('button', { class: 'ghost', onclick: startDrill }, 'Restart'));
  }
  function hint() { setLevel(level + 1); }
  function onMove(mv) {
    if (mode !== 'drill' || finished) return;
    const s = steps[i];
    if (!s || !s.mine) return;
    if (isBookMove(s, mv)) {
      board.setPosition(s.fenAfter, { lastMove: [s.from, s.to] }); board.setArrows([]); board.setInteractive(null);
      sound(s); i++; renderMoves();
      clear(panel);
      panel.append(h('div', { class: 'gnote-head' }, h('b', { class: 'gsan' }, `${who(s)}  ✓`), h('span', { class: 'gtag mine' }, 'Right')), h('p', {}, h('b', {}, 'Why: '), s.note || 'That is the book move.'));
      controls.replaceChildren();
      later(next, s.note ? 1700 : 600);
      return;
    }
    mistakes++; wrongHere++; miss(s); play('wrong');
    let tried = ''; try { tried = new Chess(s.fenBefore).move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? 'q' }).san; } catch { /* not a legal move */ }
    later(() => { board.setPosition(s.fenBefore, { lastMove: lastOf(i) }); board.setInteractive(g.side); }, 280);
    // each wrong try gives a little more help: the clue, then the piece, then the move
    if (wrongHere >= 3) { hinted = false; setLevel(3); } else if (wrongHere === 2) { hinted = false; setLevel(2); } else {
      const wrong = h('p', { class: 'gwrong' }, h('b', {}, tried ? `${tried} is not the move of this line.` : 'That is not the move of this line.'), ' The board is set back for you.');
      prompt(h('div', { class: 'stack-s' }, wrong, h('p', { class: 'ghint' }, h('b', {}, 'Clue: '), clue(s)), s.note ? h('p', { class: 'muted small' }, 'Think about what the gambit is trying to do, or press Hint for the idea.') : null));
      controls.replaceChildren(hintButton(), h('button', { class: 'ghost', onclick: startDrill }, 'Restart'));
    }
  }
  function finish() {
    finished = true; board.setInteractive(null); board.setArrows([]);
    const clean = mistakes === 0 && hints === 0;
    const e = recordRun(G(), key, { clean, mistakes, hints }, today()); save();
    play(clean ? 'fanfare' : 'end', clean ? 1 : 0.4);
    const t = today();
    const more = dueLines(G(), t).filter((l) => l.key !== key)[0];
    const work = [...missed.keys()].sort((x, y) => x - y).map((ply) => steps[ply - 1]);
    clear(panel);
    panel.append(
      h('b', {}, clean ? 'Clean run' : 'You got through the line'),
      h('p', {}, clean ? 'No mistakes and no hints. This line will come back later, so keep it fresh.' : `${plural(mistakes, 'wrong move')}${hints ? ` and ${plural(hints, 'hint')}` : ''}. It comes back tomorrow, so it sticks.`),
      work.length && h('div', { class: 'gwork' },
        h('h3', {}, 'What to work on'),
        h('ul', {}, work.map((x) => h('li', {}, h('b', { class: 'gsan' }, who(x)), ' ', x.note || 'Learn where this move comes from in the line.'))),
        h('p', { class: 'muted small' }, 'Study these moves in Learn, then play the line again.')),
      h('p', { class: 'muted small' }, e.box >= MASTERED_BOX ? 'You know this line. We will check it again later.' : `Next practice in ${plural(Math.max(1, daysBetween(t, e.due)), 'day')}.`));
    clear(controls);
    controls.append(
      h('button', { class: 'primary', onclick: startDrill }, 'Play it again'),
      work.length ? h('a', { class: 'btn', href: `#/gambits/${g.id}/${line.id}/learn` }, icon('book', 16), 'Study these moves') : null,
      more ? h('a', { class: 'btn', href: `#/gambits/${more.gambit.id}/${more.id}/drill` }, 'Next due line') : h('a', { class: 'btn ghost', href: `#/gambits/${g.id}` }, 'Back to the gambit'));
  }

  const onKey = (e) => {
    if (mode !== 'learn' || e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); showLearn(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); showLearn(i - 1); }
  };
  document.addEventListener('keydown', onKey);

  if (mode === 'learn') showLearn(0, { silent: true }); else startDrill();
  return () => { gone = true; timers.forEach(clearTimeout); document.removeEventListener('keydown', onKey); board.destroy(); };
}
