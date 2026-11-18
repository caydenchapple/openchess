import { h } from '../util.js';
import { Board } from '../board.js';
import { get } from '../store.js';
import { session, loadActive } from '../session.js';
import { currentStreak, dayKey } from '../lessons-logic.js';
import { icon } from '../icons.js';

const DEMO_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5';
const DEMO_MOVES = [['d7', 'd6'], ['c1', 'g5'], ['h7', 'h6'], ['g5', 'h4'], ['c8', 'g4'], ['h2', 'h3'], ['g4', 'h5'], ['d1', 'd2'], ['a7', 'a6'], ['a2', 'a3']];

export function mount(root) {
  const st = get();
  const unfinished = loadActive();
  const lastReviewable = st.games[0];
  const boardEl = h('div', { class: 'boardwrap' });
  const scene = h('div', { class: 'scene', 'aria-hidden': 'true' }, h('div', { class: 'fallback' }, boardEl));

  const point = (icon, title, text) => h('div', { class: 'point' },
    h('div', { class: 'point-icon', 'aria-hidden': 'true' }, icon), h('h3', {}, title), h('p', {}, text));

  root.append(h('div', { class: 'home' },
    h('section', { class: 'hero simple' },
      h('div', { class: 'stack' },
        h('span', { class: 'hero-badge' }, h('i'), 'Free, open source, no sign-up'),
        h('h1', {}, 'Play chess'),
        h('p', { class: 'lead' }, 'It\'s free. No sign-up. Press the button, then choose who you want to play.'),
        unfinished
          ? h('div', { class: 'stack' },
            h('button', { class: 'btn primary huge', onclick: () => { session.cfg = { resume: true }; location.hash = '#/game'; } }, icon('play'), ' Continue your game'),
            h('a', { class: 'btn big', href: '#/play' }, 'Start a new game'))
          : h('a', { class: 'btn primary huge', href: '#/play' }, icon('play'), ' Play now'),
        h('div', { class: 'learn-cta' },
          h('a', { class: 'btn big', href: '#/learn' }, icon('cap'), ' Train with a plan'),
          (() => { const s = currentStreak(st.learn.streak, dayKey()); return s.count ? h('span', { class: 'streak-pill' }, icon('flame', 16), ` ${s.count}-day streak`) : null; })()),
        lastReviewable && h('p', { class: 'small-links' }, h('a', { href: '#/history' }, 'See my games'))),
      scene),
    h('section', { class: 'points' },
      point(icon('play', 40), 'Easy to start', 'Play against the computer. Click a piece, then click where it should go.'),
      point(icon('bulb', 40), 'Learn as you play', 'When a game ends, you see your mistakes and simple tips to do better next time.'),
      point(icon('check', 40), 'Free for everyone', 'No account, no ads, no payments. Your games stay on your device.'))));

  const b = new Board(boardEl, { orientation: 'w' });
  b.setPosition(DEMO_FEN, { lastMove: ['d2', 'd3'] });
  b.setInteractive(null);

  // the same position as a 3D board that plays a few quiet moves (loaded on demand; the flat board stays if it cannot run)
  let three = null; let gone = false;
  import('../scene3d.js').then((m) => {
    if (gone || !m.webglAvailable()) return;
    three = m.boardScene(scene, { fen: DEMO_FEN, moves: DEMO_MOVES });
    requestAnimationFrame(() => scene.classList.add('live'));
  }).catch(() => { /* keep the flat board */ });

  return () => { gone = true; three?.destroy(); b.destroy(); };
}

export function mountAbout(root) {
  root.append(h('div', { class: 'card stack', style: { maxWidth: '760px' } },
    h('h1', {}, 'About OpenChess'),
    h('p', {}, 'OpenChess is a free, open-source chess site with no accounts, no ads and no paywall. It is licensed GPL-3.0-or-later.'),
    h('h3', {}, 'How reviews work'),
    h('p', {}, 'Stockfish 19 (lite NNUE, WebAssembly) analyses every position of your game in your browser at depth 12. Move quality comes from the change in win probability (the same curve Lichess uses). The "performance rating" is a rough estimate from average centipawn loss — treat it as a ballpark, not an official rating.'),
    h('h3', {}, 'The coach'),
    h('p', {}, 'The coach is ordinary code, not an AI model: it reads Stockfish\'s numbers and the rules of chess to explain why a move was weak (hung piece, missed tactic, missed mate, a slipped advantage), writes lessons from the patterns in your games, and keeps hand-written notes on the main openings. Nothing is sent anywhere, and it never makes up moves — but it only covers the common cases, so treat its explanations as a starting point.'),
    h('h3', {}, 'Playing a friend'),
    h('p', {}, 'Online games are private: one player hosts a game and shares a 6-letter code, the other joins with it. There is no public matchmaking and no chat. The server only relays moves, your chosen name and your local rating, and a takeback needs your opponent\'s agreement.'),
    h('h3', {}, 'Computer levels'),
    h('p', {}, 'Level strengths were measured by playing the settings against each other, on Stockfish\'s Elo scale, which is not the same as a Chess.com, Lichess or FIDE rating. Legends such as Carlsen or Kasparov are set to that player\'s peak rating, so the strength matches but the style does not. Bobby Fischer is the exception: his bot follows his known openings and his taste for bishops and the initiative, but it is an approximation, not a copy.'),
    h('h3', {}, 'Ratings'),
    h('p', {}, 'Your rating is a local Elo stored in your browser (separate pools for computer and online games), so it is not comparable with FIDE, Lichess or Chess.com ratings and cannot be verified by others.'),
    h('h3', {}, 'Privacy'),
    h('p', {}, 'No accounts, no cookies, no analytics. Games and settings are saved in localStorage. Reviews, coaching and training run entirely in your browser.'),
    h('p', {}, h('a', { href: '#/play' }, 'Play a game →'))));
  return () => {};
}
