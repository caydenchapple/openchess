// Train: retry the positions where you went wrong in your own games.
import { Chess } from 'chess.js';
import { h, clear, toast } from '../util.js';
import { Board } from '../board.js';
import { get, updateMistake } from '../store.js';
import { play } from '../sound.js';
import { THEME_LABELS, THEME_ADVICE } from '../analysis-core.js';
import { aggregate } from '../stats.js';
import { teaching } from '../teaching.js';

export function mount(root) {
  const st = get();
  const queue = [...st.mistakes].sort((a, b) => (a.solved - b.solved) || (a.attempts - b.attempts) || (b.t - a.t));
  let cur = 0; let board; let tries = 0;
  const cleanups = [];

  if (!queue.length) {
    const agg = aggregate(st.games);
    root.append(h('div', { class: 'stack' }, h('h1', {}, 'Train'),
      h('div', { class: 'card' }, h('h2', {}, 'Your personal puzzles'),
        h('p', { class: 'muted' }, 'When you review a game, every serious mistake becomes a puzzle here: the position is set up just before your mistake and you have to find the better move. Nothing to practise yet.'),
        h('div', { class: 'controls' }, h('a', { class: 'btn primary', href: '#/history' }, 'Review a game'), h('a', { class: 'btn', href: '#/review/import' }, 'Review a PGN'))),
      tipsCard(agg)));
    return () => {};
  }

  const prompt = h('div', { class: 'banner' });
  const boardEl = h('div', { class: 'boardwrap' });
  const actions = h('div', { class: 'controls' });
  root.append(h('div', { class: 'stack' }, h('h1', {}, 'Train: fix your own mistakes'),
    h('div', { class: 'game' }, h('div', { class: 'boardcol' }, boardEl), h('div', { class: 'side stack' }, h('div', { class: 'card stack' }, prompt, actions), tipsCard(aggregate(st.games))))));

  function load() {
    const m = queue[cur % queue.length];
    tries = 0;
    clear(actions);
    const chess = new Chess(m.fen);
    board?.destroy(); board = new Board(boardEl, { orientation: chess.turn(), onMove: (mv) => attempt(m, mv) });
    cleanups.push(() => board?.destroy());
    board.setPosition(m.fen);
    board.setInteractive(chess.turn());
    setPrompt(m, `Puzzle ${(cur % queue.length) + 1} of ${queue.length}`, `${chess.turn() === 'w' ? 'White' : 'Black'} to move. In your game you played ${m.played}, which was a ${m.cls}. Find a better move.`);
    actions.append(h('button', { onclick: () => reveal(m) }, 'Show solution'), h('button', { onclick: next }, 'Skip'), h('a', { class: 'btn', href: `#/review/${m.gameId}` }, 'See the game'));
  }

  function setPrompt(m, a, b) { clear(prompt); prompt.append(h('b', {}, a), h('p', { style: { margin: '.3rem 0 0' } }, b), m.opening && h('div', { class: 'small muted' }, `From a game in the ${m.opening}`)); }

  function attempt(m, mv) {
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const chess = new Chess(m.fen);
    let played;
    try { played = chess.move(mv); } catch { board.setPosition(m.fen); return; }
    if (uci === m.best) {
      play('right');
      teaching.tips.succeed('train-stuck');
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] });
      board.setInteractive(null);
      updateMistake(m.fen, { solved: (m.solved || 0) + 1, attempts: (m.attempts || 0) + 1 });
      m.solved = (m.solved || 0) + 1;
      setPrompt(m, '✅ Correct!', `${played.san} was the engine's choice.`);
      clear(actions); actions.append(h('button', { class: 'primary', onclick: next }, 'Next puzzle ›'));
    } else {
      play('wrong'); tries++;
      m.attempts = (m.attempts || 0) + 1; updateMistake(m.fen, { attempts: m.attempts });
      setTimeout(() => { board.setPosition(m.fen); board.setInteractive(new Chess(m.fen).turn()); }, 350);
      toast(played.san === m.played ? `That's the move you played in the game (${m.played}).` : `${played.san} isn't the best. Try again.`);
      teaching.tips.fail('train-stuck', { after: 3, text: 'Stuck? Tap "Show solution", then try the next puzzle.' });
    }
  }

  function reveal(m) {
    const from = m.best.slice(0, 2); const to = m.best.slice(2, 4);
    board.setArrows([{ from, to, brush: 'green' }]);
    setPrompt(m, 'Solution', `The better move was ${m.bestSan}.`);
    updateMistake(m.fen, { attempts: (m.attempts || 0) + 1 });
  }
  function next() { cur++; load(); }
  load();
  return () => cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

function tipsCard(agg) {
  const entries = Object.entries(agg.themes ?? {}).filter(([k]) => THEME_LABELS[k]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const card = h('div', { class: 'card' }, h('h2', {}, 'Habits to build'));
  if (!entries.length) {
    card.append(h('ul', {}, ['Before each move, ask what your opponent is threatening.', 'Check all checks, captures and threats — for both sides.', 'Take your time on critical moves; play quickly when it is obvious.'].map((t) => h('li', {}, t))));
    return card;
  }
  entries.forEach(([k, n]) => card.append(h('div', { class: 'lesson' }, h('b', {}, `${THEME_LABELS[k]} `, h('span', { class: 'muted' }, `×${n}`)), h('p', { class: 'small' }, THEME_ADVICE[k]))));
  return card;
}
