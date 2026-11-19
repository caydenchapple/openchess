// Piece Rain: chess pieces fall down the screen. Pick White or Black, tap only your own colour, and keep your three kings.
// Tapping the other colour, or letting one of yours fall off the bottom, costs a king. How high can you score?
import { h, clear } from '../util.js';
import { get, recordArcade } from '../store.js';
import { play } from '../sound.js';
import { avatarEl } from '../avatars.js';
import { startRun, submitRun, topScores, myKey } from '../scores.js';
import { icon } from '../icons.js';

const LIVES = 3;
const KINDS = ['p', 'p', 'p', 'n', 'b', 'r', 'q', 'k']; // more pawns than kings, like a real board
const COLOR_NAME = { w: 'White', b: 'Black' };
const lerp = (a, b, t) => a + (b - a) * t;
const piece = (c, k) => `/avatars/${c}${k}.svg`;

export function mount(root) {
  const view = h('div', { class: 'rain stack' });
  root.append(view);
  let color = get().arcade.color ?? 'w';
  let raf = 0; let game = null; let alive = true;
  const stage = h('section', { class: 'card rain-stage' });
  const boardCard = h('section', { class: 'card stack rain-board' });
  let range = 'day'; let lbSeq = 0;

  view.append(
    h('div', { class: 'stack' }, h('h1', {}, 'Piece Rain'), h('p', { class: 'muted' }, 'Pick a colour and tap only your own pieces as they fall. Three kings, how high can you score?')),
    h('div', { class: 'rain-grid' }, stage, boardCard));

  // ---------------------------------------------------------------- menu
  function menu() {
    stopLoop(); game = null; clear(stage); stage.classList.remove('playing');
    const best = get().arcade.best;
    const pick = (c) => h('button', { type: 'button', class: 'side-pick', 'aria-pressed': String(color === c), onclick: () => { color = c; menu(); } },
      h('img', { src: piece(c, 'k'), alt: '', width: 64, height: 64 }), h('b', {}, COLOR_NAME[c]), h('span', { class: 'muted small' }, `Best ${best[c] ?? 0}`));
    stage.append(
      h('h2', {}, 'Choose your colour'),
      h('div', { class: 'side-row', role: 'group', 'aria-label': 'Your colour' }, pick('w'), pick('b')),
      h('ul', { class: 'rain-rules' },
        h('li', {}, `Tap the ${COLOR_NAME[color]} pieces to score a point.`),
        h('li', {}, `Tapping ${COLOR_NAME[color === 'w' ? 'b' : 'w']} costs you a king.`),
        h('li', {}, `A ${COLOR_NAME[color]} piece that reaches the bottom costs you a king too.`),
        h('li', {}, 'The rain gets faster the longer you last.')),
      h('button', { class: 'primary big', onclick: begin }, icon('play'), ` Start as ${COLOR_NAME[color]}`));
  }

  // ---------------------------------------------------------------- the game
  function begin() {
    stopLoop(); clear(stage); stage.classList.add('playing');
    const other = color === 'w' ? 'b' : 'w';
    const kings = Array.from({ length: LIVES }, () => h('img', { src: piece(color, 'k'), alt: '', width: 32, height: 32 }));
    const scoreEl = h('b', { class: 'rain-score', 'aria-live': 'off' }, '0');
    const hud = h('div', { class: 'rain-hud' },
      h('div', { class: 'kings', role: 'img', 'aria-label': 'Kings left' }, kings),
      h('div', { class: 'rain-count' }, h('span', { class: 'muted small' }, 'Score'), scoreEl),
      h('div', { class: 'rain-quit' }, h('button', { class: 'ghost', onclick: () => { stopLoop(); menu(); } }, 'Quit')));
    const field = h('div', { class: 'rain-field', role: 'application', 'aria-label': `Tap the ${COLOR_NAME[color]} pieces as they fall` });
    stage.append(hud, field);

    const token = { v: null }; startRun().then((t) => { token.v = t; });
    const W = () => field.clientWidth; const H = () => field.clientHeight;
    const S = () => Math.max(46, Math.min(76, W() / 8));
    game = { lives: LIVES, score: 0, streak: 0, t: 0, spawnIn: 700, pieces: [], dry: 0, over: false, lastX: -1 };

    const lose = (p) => {
      game.lives -= 1; game.streak = 0;
      kings.forEach((k, i) => k.classList.toggle('lost', i >= game.lives));
      field.classList.remove('hurt'); void field.offsetWidth; field.classList.add('hurt');
      play('wrong');
      if (p) { p.dead = true; p.el.classList.add('wrong'); setTimeout(() => p.el.remove(), 380); }
      if (game.lives <= 0) finish(field, token.v);
    };
    const spawn = () => {
      const s = S();
      let mine = Math.random() < 0.5; if (game.dry >= 3) mine = true; // never a long wait for one of yours
      game.dry = mine ? 0 : game.dry + 1;
      let x = s / 2 + Math.random() * (W() - s); // keep clear of the one just before
      for (let i = 0; i < 6 && Math.abs(x - game.lastX) < s * 0.9; i++) x = s / 2 + Math.random() * (W() - s);
      game.lastX = x;
      const c = mine ? color : other; const kind = KINDS[(Math.random() * KINDS.length) | 0];
      const el = h('div', { class: `rp ${c}`, 'aria-hidden': 'true' }, h('img', { src: piece(c, kind), alt: '', draggable: 'false' }));
      el.style.width = el.style.height = `${s}px`;
      field.append(el);
      game.pieces.push({ el, x, y: -s, x0: x, mine, k: 0.88 + Math.random() * 0.24, sway: Math.random() * 6, dead: false, s });
    };

    field.addEventListener('pointerdown', (e) => {
      if (!game || game.over) return;
      e.preventDefault();
      const r = field.getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top;
      let best = null; let bd = Infinity;
      for (const p of game.pieces) {
        if (p.dead) continue;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < p.s * 0.62 && d < bd) { best = p; bd = d; }
      }
      if (!best) return;
      if (best.mine) {
        best.dead = true; game.score += 1; game.streak += 1; scoreEl.textContent = String(game.score);
        best.el.classList.add('pop'); setTimeout(() => best.el.remove(), 260);
        play('right', Math.min(game.streak, 8));
      } else lose(best);
    });

    let last = performance.now();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!game || game.over) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      game.t += dt;
      const d = Math.min(1, game.t / 110); // fully fast after about two minutes
      const speed = lerp(110, 360, d) * (H() / 560);
      game.spawnIn -= dt * 1000;
      if (game.spawnIn <= 0) { spawn(); game.spawnIn = lerp(950, 340, d) + Math.random() * 140; }
      for (let i = game.pieces.length - 1; i >= 0; i--) {
        const p = game.pieces[i];
        if (p.dead) { if (!p.el.isConnected) game.pieces.splice(i, 1); continue; }
        p.y += speed * p.k * dt;
        p.x = p.x0 + Math.sin(game.t * 1.3 + p.sway) * 8;
        p.el.style.transform = `translate3d(${p.x - p.s / 2}px, ${p.y - p.s / 2}px, 0)`;
        if (p.y - p.s / 2 > H()) {
          game.pieces.splice(i, 1); p.el.remove();
          if (p.mine) { lose(null); if (game.over) return; }
        }
      }
    };
    raf = requestAnimationFrame((t) => { last = t; frame(t); });
  }

  async function finish(field, token) {
    game.over = true; stopLoop();
    const score = game.score;
    const isBest = recordArcade(color, score);
    play(isBest && score > 0 ? 'fanfare' : 'end', 1);
    const rankLine = h('p', { class: 'muted', role: 'status' }, score ? 'Posting your score…' : '');
    const over = h('div', { class: 'rain-over', role: 'dialog', 'aria-label': 'Game over' },
      h('div', { class: 'rain-over-card' },
        h('div', { class: 'muted small' }, 'Game over'),
        h('div', { class: 'rain-final' }, String(score)),
        h('p', { class: isBest && score ? 'good-note' : 'muted' }, isBest && score ? `New best as ${COLOR_NAME[color]}` : `Your best as ${COLOR_NAME[color]} is ${get().arcade.best[color]}`),
        rankLine,
        h('div', { class: 'controls' },
          h('button', { class: 'primary', onclick: begin, autofocus: true }, icon('play', 16), 'Play again'),
          h('button', { onclick: menu }, 'Change colour'))));
    field.append(over);
    over.querySelector('button')?.focus({ preventScroll: true });
    if (!score) return;
    if (!token) { rankLine.textContent = 'The leaderboard could not be reached, so this score stays on this device.'; return; }
    try {
      const r = await submitRun({ token, score, color });
      if (!alive) return;
      rankLine.textContent = r.rank ? `You are #${r.rank} on the all-time board${r.dayRank ? ` and #${r.dayRank} today` : ''}.` : '';
      drawBoard();
    } catch (e) { if (alive) rankLine.textContent = `Score not posted: ${e.message}`; }
  }

  function stopLoop() { cancelAnimationFrame(raf); raf = 0; if (game) game.over = true; }

  // ---------------------------------------------------------------- leaderboard
  async function drawBoard() {
    const seq = ++lbSeq;
    const tab = (r, label) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(range === r), onclick: () => { range = r; drawBoard(); } }, label);
    const head = h('div', { class: 'row between' }, h('h2', {}, 'Leaderboard'), h('div', { class: 'row', style: { gap: '.4rem' } }, tab('day', 'Today'), tab('all', 'All time')));
    const body = h('div', { class: 'lb' }, h('p', { class: 'muted row' }, h('span', { class: 'spinner' }), ' Loading…'));
    clear(boardCard); boardCard.append(head, body);
    try {
      const [{ entries }, me] = await Promise.all([topScores(range), myKey()]);
      if (seq !== lbSeq || !alive) return;
      clear(body);
      if (!entries.length) { body.append(h('p', { class: 'muted' }, range === 'day' ? 'No scores yet today. Be the first.' : 'No scores yet. Be the first.')); return; }
      body.append(h('ol', { class: 'lb-list' }, entries.map((e, i) => h('li', { class: e.k === me ? 'me' : '' },
        h('span', { class: 'lb-rank' }, String(i + 1)),
        avatarEl(e.av ? { kind: 'preset', id: e.av } : { kind: 'initial' }, 32, e.name),
        h('span', { class: 'lb-name' }, e.name),
        h('img', { class: 'lb-king', src: piece(e.color, 'k'), alt: COLOR_NAME[e.color], title: `Played ${COLOR_NAME[e.color]}`, width: 22, height: 22 }),
        h('b', { class: 'lb-score' }, String(e.score))))));
    } catch (e) {
      if (seq !== lbSeq || !alive) return;
      clear(body); body.append(h('p', { class: 'muted' }, 'The leaderboard is not available right now. Your own best scores are still saved on this device.'));
    }
  }

  menu(); drawBoard();
  return () => { alive = false; stopLoop(); };
}
