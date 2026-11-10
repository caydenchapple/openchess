// Train: retry the positions where you went wrong in your own games.
import { Chess } from 'chess.js';
import { h, clear, toast } from '../util.js';
import { Board } from '../board.js';
import { get, updateMistake } from '../store.js';
import { play } from '../sound.js';
import { THEME_LABELS, THEME_ADVICE } from '../analysis-core.js';
import { aggregate } from '../stats.js';
import { teaching } from '../teaching.js';
import { starterPuzzles } from '../starter-puzzles.js';

export function mount(root) {
  const st = get();
  const own = [...st.mistakes].sort((a, b) => (a.solved - b.solved) || (a.attempts - b.attempts) || (b.t - a.t));
  const starter = own.length === 0; // nothing of your own to practise yet: give checkmate-in-one starters instead
  const queue = starter ? starterPuzzles() : own;
  let cur = 0; let board; let tries = 0; let revealed = false;
  const cleanups = [];

  const prompt = h('div', { class: 'banner' });
  const boardEl = h('div', { class: 'boardwrap' });
  const actions = h('div', { class: 'controls' });
  root.append(h('div', { class: 'stack' }, h('h1', {}, starter ? 'Practice: checkmate in one' : 'Practice: fix your own mistakes'),
    h('div', { class: 'game' }, h('div', { class: 'boardcol' }, boardEl), h('div', { class: 'side stack' }, h('div', { class: 'card stack' }, prompt, actions), tipsCard(aggregate(st.games))))));

  function load() {
    const m = queue[cur % queue.length];
    tries = 0; revealed = false;
    clear(actions);
    const chess = new Chess(m.fen);
    board?.destroy(); board = new Board(boardEl, { orientation: chess.turn(), onMove: (mv) => attempt(m, mv) });
    cleanups.push(() => board?.destroy());
    board.setPosition(m.fen);
    board.setInteractive(chess.turn());
    setPrompt(m, `Puzzle ${(cur % queue.length) + 1} of ${queue.length}`, m.starter
      ? `${chess.turn() === 'w' ? 'White' : 'Black'} to move. Find the move that wins the game right now: checkmate in one. (Review your own games to get puzzles from your mistakes.)`
      : `${chess.turn() === 'w' ? 'White' : 'Black'} to move. In your game you played ${m.played}, which was ${/^[aeiou]/i.test(m.cls) ? 'an' : 'a'} ${m.cls}. Find a better move.`);
    actions.append(h('button', { onclick: () => reveal(m) }, 'Show solution'), h('button', { onclick: next }, 'Skip'), m.gameId && h('a', { class: 'btn', href: `#/review/${m.gameId}` }, 'See the game'));
  }

  function setPrompt(m, a, b) { clear(prompt); prompt.append(h('b', {}, a), h('p', { style: { margin: '.3rem 0 0' } }, b), m.opening && !m.starter && h('div', { class: 'small muted' }, `From a game in the ${m.opening}`)); }

  function attempt(m, mv) {
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    const chess = new Chess(m.fen);
    let played;
    try { played = chess.move(mv); } catch { board.setPosition(m.fen); return; }
    const right = m.starter ? chess.isCheckmate() : uci === m.best;
    if (right && revealed) {
      play('right');
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] });
      board.setInteractive(null);
      setPrompt(m, 'That is the solution', 'You played the move that was shown. Try the next puzzle to test yourself.');
      clear(actions); actions.append(h('button', { class: 'primary', onclick: next }, 'Next puzzle ›'));
    } else if (right) {
      play('right');
      teaching.tips.succeed('train-stuck');
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] });
      board.setInteractive(null);
      if (!m.starter) updateMistake(m.fen, { solved: (m.solved || 0) + 1, attempts: (m.attempts || 0) + 1 });
      m.solved = (m.solved || 0) + 1;
      setPrompt(m, 'Correct!', m.starter ? `${played.san} is checkmate.` : `${played.san} was the computer's choice.`);
      clear(actions); actions.append(h('button', { class: 'primary', onclick: next }, 'Next puzzle ›'));
    } else {
      play('wrong'); tries++;
      m.attempts = (m.attempts || 0) + 1; if (!m.starter) updateMistake(m.fen, { attempts: m.attempts });
      setTimeout(() => { board.setPosition(m.fen); board.setInteractive(new Chess(m.fen).turn()); }, 350);
      const same = !m.starter && played.san === m.played;
      setPrompt(m, 'Not quite — try another move',
        same ? `${m.played} is the move that was played in the game. Look for something better.` : `${played.san} is not the best move here. You can try again or press "Show solution".`);
      teaching.tips.fail('train-stuck', { after: 3, text: 'Stuck? Tap "Show solution", then try the next puzzle.' });
    }
  }

  function reveal(m) {
    revealed = true;
    const from = m.best.slice(0, 2); const to = m.best.slice(2, 4);
    board.setArrows([{ from, to, brush: 'green' }]);
    setPrompt(m, 'Solution', m.starter ? `${m.bestSan} is checkmate.` : `The better move was ${m.bestSan}.`);
    if (!m.starter) updateMistake(m.fen, { attempts: (m.attempts || 0) + 1 });
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
