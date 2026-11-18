// Post-game review: engine analysis, accuracy, estimated rating and lessons from the built-in coach.
import { Chess } from 'chess.js';
import { h, clear, toast, uid } from '../util.js';
import { Board } from '../board.js';
import { reviewPgn, analyzePosition, parsePgn } from '../analysis.js';
import {
  compactReview, hydrateReview, winPct, THEME_LABELS, THEME_ADVICE, ERROR_CLASSES,
} from '../analysis-core.js';
import { reviewReport, explainPly, openingNotes, positionInsight, standing } from '../coach.js';
import { moveNote } from '../notes.js';
import { CLS, CLS_ORDER, BADGED, badgeSvg } from '../cls.js';
import { findGame, updateGame, addGame, addMistakes, get } from '../store.js';
import { play } from '../sound.js';
import { detectOpening } from '../openings.js';
import { teaching } from '../teaching.js';
import { icon } from '../icons.js';

const SVG = 'http://www.w3.org/2000/svg';
const mistakeCls = ERROR_CLASSES;
const badge = (cls) => h('span', { class: `badge ${cls}`, title: CLS[cls].label }, CLS[cls].glyph);

function fmtEval(cp, mate) {
  if (Math.abs(cp) >= 9000) return cp > 0 ? 'M' : '-M';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

export function mount(root, params) {
  const id = params[0];
  const cleanups = [];
  let game = id === 'import' ? null : findGame(id);

  if (id === 'import') return mountImport(root);
  if (!game) {
    root.append(h('div', { class: 'card' }, h('h2', {}, 'Game not found'),
      h('p', { class: 'muted' }, 'This game is not stored in this browser. Games are kept locally for privacy.'),
      h('a', { class: 'btn', href: '#/history' }, 'Your games')));
    return () => {};
  }

  const cancel = { cancelled: false };
  cleanups.push(() => { cancel.cancelled = true; });
  root.append(h('div', { class: 'card stack' },
    h('h2', {}, 'Reviewing your game…'),
    h('p', { class: 'muted' }, 'Stockfish is checking every move, right here in your browser. Nothing is uploaded.'),
    h('div', { class: 'progress', role: 'progressbar' }, h('i', { id: 'prog' })),
    h('p', { class: 'small muted', id: 'progtxt' }, 'Loading engine…')));

  (async () => {
    let review = game.review ? hydrateReview(game.review) : null;
    if (!review) {
      try {
        const prior = { w: (game.color === 'w' ? game.priorRating : game.opponent.rating) || 100, b: (game.color === 'b' ? game.priorRating : game.opponent.rating) || 100 };
        const raw = await reviewPgn(game.pgn, {
          playerColor: game.color, priorRating: prior, depth: 12, signal: cancel,
          onProgress: (d, t) => {
            const bar = document.getElementById('prog'); const tx = document.getElementById('progtxt');
            if (bar) bar.style.width = `${(d / t) * 100}%`;
            if (tx) tx.textContent = `Analysed ${d} of ${t} positions`;
          },
        });
        review = raw;
        updateGame(game.id, { review: compactReview(raw) });
        const list = raw.plies.filter((p) => p.color === game.color && p.loss >= 15).map((p) => ({
          fen: parsePgn(game.pgn).fens[p.i], best: p.bestUci, bestSan: p.bestSan, played: p.san, cls: p.cls,
          gameId: game.id, opening: raw.opening.name, t: Date.now(), solved: 0, attempts: 0, ply: p.i,
        }));
        addMistakes(list);
      } catch (e) {
        if (cancel.cancelled) return;
        clear(root);
        root.append(h('div', { class: 'card' }, h('h2', {}, 'Review failed'), h('p', { class: 'muted' }, String(e.message)), h('a', { class: 'btn', href: '#/history' }, 'Back')));
        return;
      }
    }
    if (cancel.cancelled) return;
    game = findGame(id);
    render(review);
  })();

  function render(review) {
    clear(root);
    const { fens, moves } = parsePgn(game.pgn);
    const sans = moves.map((m) => m.san);
    const myColor = game.color;
    let idx = fens.length - 1; // current position index; 0 = start
    let viewBefore = false; // showing fens[i] with the better move
    let timer = null; // autoplay
    let retry = null; // 'try the move yourself' state
    const dom = {};

    // --- board column ---
    dom.boardEl = h('div', { class: 'boardwrap' });
    dom.evalW = h('div', { class: 'w' });
    dom.evalTxt = h('b', {});
    const bar = h('div', { class: 'evalbar', 'aria-hidden': 'true' }, dom.evalW);
    const board = new Board(dom.boardEl, { orientation: myColor, onMove: (m) => onRetryMove(m) });
    cleanups.push(() => board.destroy());
    board.setInteractive(null);

    dom.graph = h('div', {});
    dom.info = h('div', { class: 'banner' });
    const nav = h('div', { class: 'controls' },
      h('button', { 'aria-label': 'Start', onclick: () => stepTo(0) }, '⏮'),
      h('button', { id: 'btn-back', 'aria-label': 'Previous move', onclick: () => stepTo(idx - 1) }, '◀'),
      h('button', { id: 'btn-forward', 'aria-label': 'Next move', onclick: () => stepTo(idx + 1) }, '▶'),
      h('button', { 'aria-label': 'End', onclick: () => stepTo(fens.length - 1) }, '⏭'),
      (dom.play = h('button', { id: 'btn-play', onclick: toggleAuto, 'aria-label': 'Play the game through' }, icon('play'), ' Play')),
      h('button', { onclick: () => board.flip() }, icon('flip'), ' Flip'),
      h('button', { id: 'btn-next-mistake', onclick: nextKey }, 'Next mistake ›'),
      (dom.better = h('button', { id: 'btn-better', disabled: true, onclick: () => { stopAuto(); exitRetry(); const pl = idx > 0 ? review.plies[idx - 1] : null; if (pl) go(pl.i + 1, !viewBefore); } }, icon('bulb'), ' Better move')),
      (dom.retryBtn = h('button', { id: 'btn-retry', disabled: true, onclick: startRetry }, icon('target'), ' Try it yourself')));
    dom.keys = h('p', { class: 'keys' }, h('kbd', {}, '←'), ' ', h('kbd', {}, '→'), ' step · ', h('kbd', {}, 'Space'), ' play · ', h('kbd', {}, 'N'), ' next mistake · ', h('kbd', {}, 'B'), ' better move · ', h('kbd', {}, 'R'), ' try it yourself');
    dom.retry = h('div', {});

    // --- right column ---
    dom.moves = h('div', { class: 'moves', id: 'review-moves' });
    dom.coach = h('div', { class: 'stack' });
    dom.insight = h('div', { class: 'stack' });

    root.append(
      h('div', { class: 'row between', style: { marginBottom: '.8rem' } },
        h('h1', { style: { margin: 0 } }, 'Game review'),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/history' }, 'All games'), h('a', { class: 'btn', href: '#/play' }, 'New game'))),
      h('div', { class: 'review' },
        h('div', { class: 'stack' },
          nav,
          h('div', { class: 'evalbar-wrap' }, bar, dom.boardEl),
          dom.graph, dom.keys),
        h('div', { class: 'stack' }, dom.info, dom.retry, summaryCard(review), h('div', { class: 'card' }, h('h2', {}, 'Moves'), dom.moves), dom.coach, insightCard(), themesCard(review))));

    renderGraph(); renderMoves(); go(fens.length - 1);
    showReport(review);
    teaching.enterReview({
      hasMistakes: review.plies.some((p) => p.color === myColor && mistakeCls.includes(p.cls)),
      reviewedBefore: get().games.filter((g) => g.review).length > 1,
    });
    cleanups.push(() => teaching.leaveReview());
    const key = (e) => {
      if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepTo(idx - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); stepTo(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); stepTo(0); } else if (e.key === 'ArrowDown') { e.preventDefault(); stepTo(fens.length - 1); }
      else if (e.key === ' ' && !e.target.matches('button, a')) { e.preventDefault(); toggleAuto(); }
      else if (e.key === 'n' || e.key === 'N') nextKey();
      else if (e.key === 'b' || e.key === 'B') { if (!dom.better.disabled) dom.better.click(); }
      else if (e.key === 'r' || e.key === 'R') { if (!dom.retryBtn.disabled) startRetry(); }
    };
    window.addEventListener('keydown', key);
    cleanups.push(() => window.removeEventListener('keydown', key));

    /** The player moved through the game themselves (buttons, arrow keys or the move list). */
    function stepTo(n) { teaching.reviewState({ stepped: true }); stopAuto(); go(n); }

    function stopAuto() {
      if (timer) { clearInterval(timer); timer = null; }
      dom.play.replaceChildren(icon('play'), ' Play');
    }
    cleanups.push(() => { if (timer) clearInterval(timer); });
    function toggleAuto() {
      if (timer) { stopAuto(); return; }
      if (idx >= fens.length - 1) go(0);
      dom.play.replaceChildren('⏸ Pause');
      timer = setInterval(() => { if (idx >= fens.length - 1) { stopAuto(); return; } go(idx + 1); }, 1100);
    }

    function go(n, before = false) {
      idx = Math.max(0, Math.min(fens.length - 1, n));
      viewBefore = before;
      exitRetry(false);
      const ply = idx > 0 ? review.plies[idx - 1] : null;
      if (before && ply) {
        board.setPosition(fens[idx - 1]);
        board.setArrows([
          { from: ply.bestUci.slice(0, 2), to: ply.bestUci.slice(2, 4), brush: 'green' },
          { from: ply.uci.slice(0, 2), to: ply.uci.slice(2, 4), brush: 'red' },
        ]);
      } else {
        const m = idx > 0 ? moves[idx - 1] : null;
        board.setPosition(fens[idx], { lastMove: m ? [m.from, m.to] : null });
        board.setArrows([], ply && BADGED.includes(ply.cls) ? [{ square: ply.uci.slice(2, 4), svg: badgeSvg(ply.cls) }] : []);
        if (m) play(m.captured ? 'capture' : 'move');
      }
      const cp = review.series[before && ply ? idx - 1 : idx];
      const pct = winPct(cp);
      dom.evalW.style.height = `${pct}%`;
      renderInfo(ply);
      dom.better.disabled = !(ply && mistakeCls.includes(ply.cls));
      dom.retryBtn.disabled = !(ply && ply.color === myColor && mistakeCls.includes(ply.cls));
      dom.better.replaceChildren(...(before && ply ? ['Back to the game'] : [icon('bulb'), ' Better move']));
      teaching.reviewState({ onMistake: !!ply && ply.color === myColor && mistakeCls.includes(ply.cls), viewingBetter: before && !!ply });
      markMoves();
      renderGraph();
    }

    function nextKey() {
      const keys = review.keyMoments.map((i) => i + 1);
      const next = keys.find((k) => k > idx) ?? keys[0];
      if (next != null) go(next);
      else toast('No mistakes to show — nice game!');
    }

    function renderInfo(ply) {
      clear(dom.info);
      dom.pv = null;
      if (!ply) { dom.info.append(h('b', {}, 'Starting position'), h('p', { class: 'small muted' }, 'Use the arrow keys, the buttons or ▶ Play to go through the game. Every move gets a note here.')); return; }
      const mine = ply.color === myColor;
      const moveNo = `${Math.floor(ply.i / 2) + 1}${ply.color === 'w' ? '.' : '...'}`;
      const err = mistakeCls.includes(ply.cls);
      dom.info.append(
        h('div', { class: 'row between' },
          h('b', { class: `cls-${ply.cls}` }, badge(ply.cls), `${mine ? 'Your move' : "Opponent's move"}: ${moveNo} ${ply.san} — ${CLS[ply.cls].label}`),
          h('span', { class: 'muted', title: fmtEval(review.series[ply.i + 1]) }, `After this move: ${standing(myColor === 'w' ? review.series[ply.i + 1] : -review.series[ply.i + 1])} for you`)),
        h('div', { class: 'small muted' }, `Accuracy of this move: ${ply.acc}%`));
      const tags = err ? ply.tags.filter((t) => THEME_LABELS[t]) : [];
      if (tags.length) dom.info.append(h('div', { class: 'small', style: { marginTop: '.3rem' } }, tags.map((t) => h('span', { class: 'pill', style: { marginRight: '.3rem' } }, THEME_LABELS[t]))));
      const notes = moveNote(ply, { fenBefore: fens[ply.i], fenAfter: fens[ply.i + 1], mine, openingName: review.opening.name });
      dom.info.append(h('div', { class: `movenote ${err ? '' : 'good-note'}` }, notes.map((t) => h('p', { class: 'small' }, t))));
      // the computer's line, one click per move: step through it on the board
      if (ply.pvSan?.length > 1 && (err || ply.cls === 'brilliant' || ply.cls === 'great')) {
        dom.pv = h('div', { class: 'pvline' }, h('span', { class: 'lbl' }, err ? 'Better line:' : 'The idea:'),
          ply.pvSan.map((san, k) => h('button', { type: 'button', title: 'Show the position after this move', onclick: () => showLine(ply, k + 1) }, `${k % 2 === 0 ? `${Math.floor((ply.i + k) / 2) + 1}${(ply.i + k) % 2 === 0 ? '.' : '…'}` : ''}${san}`)));
        dom.info.append(dom.pv);
      }
      if (err) dom.info.append(h('p', { class: 'small muted', style: { margin: '.4rem 0 0' } }, viewBefore ? 'Green arrow: the better move. Red arrow: the move that was played.' : 'Use "Better move" to see it on the board, or "Try it yourself" to find it.'));
    }

    /** Show the position after the first `k` moves of the computer's line for a ply. */
    function showLine(ply, k) {
      stopAuto(); exitRetry(false);
      const c = new Chess(fens[ply.i]); let last = null;
      for (let j = 0; j < k; j++) { try { last = c.move(ply.pvSan[j]); } catch { break; } }
      board.setPosition(c.fen(), { lastMove: last ? [last.from, last.to] : null });
      board.setArrows([], []);
      if (last) play(last.captured ? 'capture' : 'move');
      dom.pv?.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === k - 1));
    }

    // --- "try it yourself": find the better move on the board and get an answer ---
    function startRetry() {
      const ply = idx > 0 ? review.plies[idx - 1] : null;
      if (!ply || ply.color !== myColor || !mistakeCls.includes(ply.cls)) return;
      stopAuto();
      retry = { ply, busy: false };
      board.setPosition(fens[ply.i]); board.setArrows([], []);
      board.setInteractive(myColor);
      clear(dom.retry);
      dom.retry.append(h('div', { class: 'retry-box' }, h('b', {}, 'Your turn again'), h('p', { class: 'small', style: { margin: '.2rem 0 0' } }, `Find a better move than ${ply.san}. Drag a piece, or click it and then a square.`),
        h('div', { class: 'rnav', style: { marginTop: '.4rem' } }, h('button', { onclick: () => { exitRetry(); go(ply.i + 1, true); } }, 'Show me the answer'), h('button', { onclick: () => { exitRetry(); go(ply.i + 1); } }, 'Cancel'))));
    }
    function exitRetry(clearBox = true) {
      if (!retry) { if (clearBox) clear(dom.retry); return; }
      retry = null; board.setInteractive(null); board.cancelPremove?.();
      clear(dom.retry);
    }
    async function onRetryMove(m) {
      if (!retry || retry.busy) return;
      const { ply } = retry;
      const before = new Chess(fens[ply.i]);
      let mv;
      try { mv = before.move({ from: m.from, to: m.to, promotion: m.promotion }); } catch { board.setPosition(fens[ply.i]); return; }
      retry.busy = true;
      board.setPosition(before.fen(), { lastMove: [mv.from, mv.to] }); board.setInteractive(null);
      play(mv.captured ? 'capture' : 'move');
      const uci = mv.from + mv.to + (mv.promotion ?? '');
      const again = () => { startRetry(); };
      const box = (cls, title, text, ...extra) => { clear(dom.retry); dom.retry.append(h('div', { class: `retry-box ${cls}` }, h('b', {}, title), h('p', { class: 'small', style: { margin: '.2rem 0 .4rem' } }, text), h('div', { class: 'rnav' }, ...extra))); };
      const btns = [h('button', { onclick: again }, 'Try another move'), h('button', { onclick: () => { exitRetry(); go(ply.i + 1, true); } }, 'Show the best move'), h('button', { class: 'primary', onclick: () => { exitRetry(); go(ply.i + 1); } }, 'Back to the game')];
      if (uci === ply.bestUci) { play('right'); box('ok', `Yes! ${mv.san} is the best move`, 'That is the computer\'s top choice.', btns[2]); retry.busy = false; return; }
      box('', 'Checking your move…', 'Stockfish is looking at it.');
      let loss = null;
      try {
        const lines = await analyzePosition(before.fen(), { multipv: 1, depth: 10, movetime: 900 });
        const cpWhite = lines[0]?.cp ?? (before.isCheckmate() ? (ply.color === 'w' ? 10000 : -10000) : 0);
        loss = ply.wpBefore - winPct(ply.color === 'w' ? cpWhite : -cpWhite);
      } catch { /* engine busy: fall back to the plain answer */ }
      if (!retry) return; // the player moved on
      if (loss != null && loss <= 3) { play('right'); box('ok', `Good — ${mv.san} works too`, `It is about as strong as the computer's ${ply.bestSan}.`, btns[2]); }
      else if (loss != null && loss < 10) { box('', `${mv.san} is playable`, `But ${ply.bestSan} was better (it costs you about ${Math.round(loss)} points of winning chances).`, btns[0], btns[1], btns[2]); }
      else { play('wrong'); box('no', `Not quite — ${mv.san}`, loss == null ? `The computer prefers ${ply.bestSan}.` : `That drops your winning chances by about ${Math.round(loss)} points. Look for checks, captures and threats.`, btns[0], btns[1], btns[2]); }
      retry.busy = false;
    }

    function renderMoves() {
      clear(dom.moves);
      review.plies.forEach((p, i) => {
        if (i % 2 === 0) dom.moves.append(h('span', { class: 'n' }, `${i / 2 + 1}.`));
        dom.moves.append(h('span', {
          class: `m click ${p.cls}`,
          dataset: { i: String(i + 1) }, onclick: () => stepTo(i + 1), title: CLS[p.cls].label,
        }, p.san, BADGED.includes(p.cls) ? h('span', { class: `badge ${p.cls}`, style: { marginLeft: '.3rem', marginRight: 0, minWidth: '1.1rem', height: '1.1rem', fontSize: '.62rem' } }, CLS[p.cls].glyph) : null));
      });
      if (review.plies.length % 2 === 1) dom.moves.append(h('span', {}));
    }
    function markMoves() {
      dom.moves.querySelectorAll('.m').forEach((el) => el.classList.toggle('cur', Number(el.dataset.i) === idx));
      const cur = dom.moves.querySelector('.cur');
      if (cur) dom.moves.scrollTop = cur.offsetTop - dom.moves.clientHeight / 2;
    }

    function renderGraph() {
      const W = 600; const H = 90; const n = review.series.length;
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'graph'); svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Evaluation graph. Click to jump to a move.');
      const x = (i) => (n <= 1 ? 0 : (i / (n - 1)) * W);
      const y = (cp) => H - (winPct(cp) / 100) * H;
      const mk = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
      svg.append(mk('rect', { x: 0, y: 0, width: W, height: H, fill: '#2b2a27' }));
      const pts = review.series.map((cp, i) => `${x(i).toFixed(1)},${y(cp).toFixed(1)}`);
      svg.append(mk('polygon', { points: `0,${H} ${pts.join(' ')} ${W},${H}`, fill: '#e9e9e9' }));
      svg.append(mk('line', { x1: 0, x2: W, y1: H / 2, y2: H / 2, stroke: '#888', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
      review.plies.forEach((p, i) => {
        if (p.color === myColor && ['mistake', 'blunder', 'miss', 'brilliant', 'great'].includes(p.cls)) {
          svg.append(mk('circle', { cx: x(i + 1), cy: y(review.series[i + 1]), r: 4, fill: CLS[p.cls].color, stroke: '#111', 'stroke-width': 1 }));
        }
      });
      svg.append(mk('line', { x1: x(idx), x2: x(idx), y1: 0, y2: H, stroke: '#7fb64a', 'stroke-width': 2 }));
      svg.addEventListener('click', (e) => {
        const r = svg.getBoundingClientRect();
        go(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
      });
      clear(dom.graph); dom.graph.append(svg);
    }

    // --- summary ---
    function summaryCard(r) {
      const mine = r.mine; const them = myColor === 'w' ? r.summary.b : r.summary.w;
      const box = (label, v, sub) => h('div', { class: 'box' }, h('div', { class: 'muted small' }, label), h('div', { class: 'big' }, v), h('div', { class: 'small muted' }, sub));
      const phases = ['opening', 'middlegame', 'endgame'].map((ph) => h('div', { class: 'bar' },
        h('span', {}, ph[0].toUpperCase() + ph.slice(1)),
        h('div', {}, h('i', { style: { width: `${mine.phases[ph] ?? 0}%`, background: mine.phases[ph] == null ? 'transparent' : undefined } })),
        h('span', { class: 'muted' }, mine.phases[ph] == null ? '–' : `${mine.phases[ph]}`)));
      const res = game.outcome === 'win' ? 'You won' : game.outcome === 'loss' ? 'You lost' : game.outcome === 'draw' ? 'Draw' : game.result;
      return h('div', { class: 'card stack' },
        h('div', { class: 'row between' },
          h('div', {}, h('h2', { style: { margin: 0 } }, `${game.playerName} vs ${game.opponent.name}`), h('div', { class: 'muted small' }, `${res}${game.reason ? ` · ${game.reason}` : ''} · ${Math.ceil(r.plies.length / 2)} moves`)),
          r.opening.name && h('span', { class: 'pill' }, `${r.opening.eco} ${r.opening.name}`)),
        h('div', { class: 'acc' },
          box('Your accuracy', `${mine.accuracy ?? '–'}%`, `Opponent ${them.accuracy ?? '–'}%`),
          box('Estimated level', mine.performance ?? '–', `Your rating ${game.priorRating}${game.opponent.rating ? ` · opponent ${game.opponent.rating}` : ''}`),
          box('Best moves', `${mine.counts.best + mine.counts.book + (mine.counts.great ?? 0) + (mine.counts.brilliant ?? 0)} of ${mine.moves}`, 'matched the computer or the opening book')),
        h('div', { class: 'counts' }, CLS_ORDER.filter((k) => (mine.counts[k] ?? 0) > 0 || !['brilliant', 'great', 'miss'].includes(k)).map((k) => h('div', { class: 'cnt' }, badge(k), `${CLS[k].label}: `, h('b', {}, String(mine.counts[k] ?? 0))))),
        h('div', {}, h('h3', {}, 'Accuracy by phase'), h('div', { class: 'bars' }, phases)),
        h('p', { class: 'ai-note' }, '"Estimated level" compares how much each move cost you with games between computer opponents of known strength, then leans toward your current rating when the game is short. It is a guess: one game is noisy and can be off by several hundred points.'),
        openingBlock(r));
    }

    function openingBlock(r) {
      const wrap = h('div', {});
      if (!r.opening.name) return wrap;
      const o = openingNotes(r.opening.name, r.opening.eco, myColor);
      const body = h('div', { class: 'stack', style: { display: 'none' } },
        h('p', {}, h('b', {}, 'Idea: '), o.idea),
        o.plans.length ? h('div', {}, h('b', {}, 'Typical plans'), h('ul', {}, o.plans.map((p) => h('li', {}, p)))) : null,
        o.pitfalls.length ? h('div', {}, h('b', {}, 'Common pitfalls'), h('ul', {}, o.pitfalls.map((p) => h('li', {}, p)))) : null,
        o.keySquares && h('p', {}, h('b', {}, 'Key squares: '), o.keySquares),
        o.nextStep && h('p', {}, h('b', {}, 'Next step: '), o.nextStep));
      const btn = h('button', { onclick: () => { const open = body.style.display === 'none'; body.style.display = open ? '' : 'none'; btn.textContent = open ? 'Hide opening notes' : 'Opening notes'; } }, 'Opening notes');
      wrap.append(btn, body);
      return wrap;
    }

    // --- recurring mistake patterns ---
    function themesCard(r) {
      const entries = Object.entries(r.themes).filter(([k]) => THEME_ADVICE[k]).sort((a, b) => b[1] - a[1]);
      const card = h('div', { class: 'card' }, h('h2', {}, 'Patterns in your mistakes'));
      if (!entries.length) {
        card.append(h('p', { class: 'muted' }, 'No repeated mistake patterns detected. Keep playing and reviewing to track trends in your Profile.'));
        return card;
      }
      for (const [k, n] of entries) {
        card.append(h('div', { class: 'lesson' }, h('b', {}, `${THEME_LABELS[k]} `, h('span', { class: 'muted' }, `×${n}`)), h('p', { class: 'small' }, THEME_ADVICE[k])));
      }
      return card;
    }

    // --- coach report (built-in rules, no AI service) ---
    function showReport(r) {
      clear(dom.coach);
      const card = h('div', { class: 'card' }, h('h2', {}, 'Coach report'));
      dom.coach.append(card);
      const c = reviewReport({ review: r, game, fens });
      card.append(h('p', {}, c.summary));
      if (c.opening?.comment) card.append(h('p', {}, h('b', {}, 'Opening: '), c.opening.comment, c.opening.tip ? ` Tip: ${c.opening.tip}` : ''));
      if (c.strengths?.length) card.append(h('div', {}, h('b', {}, 'What you did well'), h('ul', {}, c.strengths.map((s) => h('li', {}, s)))));
      if (c.highlights?.length) {
        card.append(h('h3', { style: { marginTop: '1rem' } }, 'Your best moments'));
        for (const k of c.highlights) {
          const p = review.plies[k.id]; if (!p) continue;
          card.append(h('div', { class: 'moment hl', onclick: () => stepTo(k.id + 1) }, h('b', {}, badge(p.cls), `${Math.floor(k.id / 2) + 1}${p.color === 'w' ? '.' : '...'} ${p.san} `), h('div', { class: 'small' }, k.explanation)));
        }
      }
      card.append(h('h3', { style: { marginTop: '1rem' } }, 'Lessons for next game'));
      c.lessons.forEach((l, i) => card.append(h('div', { class: 'lesson' }, h('b', {}, `${i + 1}. ${l.title}`), h('p', { class: 'small', style: { margin: '.2rem 0' } }, l.body), l.drill && h('div', { class: 'drill' }, 'Drill: ', l.drill))));
      if (c.keyMoments?.length) {
        card.append(h('h3', { style: { marginTop: '1rem' } }, 'Key moments'));
        for (const k of c.keyMoments) {
          const p = review.plies[k.id]; if (!p) continue;
          card.append(h('div', { class: 'moment', onclick: () => stepTo(k.id + 1) }, h('b', {}, badge(p.cls), `${Math.floor(k.id / 2) + 1}${p.color === 'w' ? '.' : '...'} ${p.san} `), h('div', { class: 'small' }, k.explanation)));
        }
      }
      card.append(h('p', { class: 'ai-note' }, 'Written by OpenChess\'s built-in coach from Stockfish\'s analysis — no AI service involved. Engine numbers are exact; the explanations are rule-based and cover the common cases.'));
    }

    // --- position insight: engine lines + rule-based observations for the position on the board ---
    function insightCard() {
      const btn = h('button', { class: 'primary' }, 'Analyse this position');
      const card = h('div', { class: 'card stack' }, h('h2', {}, 'Position insight'),
        h('p', { class: 'muted small', style: { margin: 0 } }, 'Step to any move, then ask Stockfish for the best continuations and a plain-language read of the position.'), btn, dom.insight);
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Analysing…';
        clear(dom.insight);
        const fen = viewBefore && idx > 0 ? fens[idx - 1] : fens[idx];
        try {
          const lines = await analyzePosition(fen, { multipv: 3, depth: 14, movetime: 2500 });
          const ins = positionInsight(fen, lines);
          dom.insight.append(h('b', {}, ins.headline));
          if (ins.candidates.length) {
            dom.insight.append(h('div', { class: 'lines' }, ins.candidates.map((c) => h('div', {}, h('b', {}, c.san), ` ${c.eval}  `, h('span', { class: 'muted' }, c.line), c.does ? h('div', { class: 'small muted' }, `${c.san} ${c.does}.`) : null))));
          }
          if (ins.notes.length) dom.insight.append(h('ul', { class: 'small' }, ins.notes.map((n) => h('li', {}, n))));
        } catch (e) { toast(e.message); }
        btn.disabled = false; btn.textContent = 'Analyse this position';
      });
      return card;
    }
  }

  return () => cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

function mountImport(root) {
  const ta = h('textarea', { placeholder: '[Event "…"]\n\n1. e4 e5 2. Nf3 …', 'aria-label': 'PGN' });
  const side = h('select', { 'aria-label': 'Which side were you?' }, h('option', { value: 'w' }, 'I played White'), h('option', { value: 'b' }, 'I played Black'));
  root.append(h('div', { class: 'card stack', style: { maxWidth: '640px' } },
    h('h1', {}, 'Review any game'),
    h('p', { class: 'muted' }, 'Paste a PGN from Lichess, Chess.com or your own notes. It is analysed locally in your browser.'),
    ta, side,
    h('button', { class: 'primary big', onclick: () => {
      try {
        const { headers, moves } = parsePgn(ta.value.trim());
        if (!moves.length) throw new Error('No moves found');
        const color = side.value;
        const sans = moves.map((m) => m.san);
        const opening = detectOpening(sans);
        const rec = {
          id: uid(10), t: Date.now(), mode: 'import', color,
          playerName: color === 'w' ? headers.White || 'You' : headers.Black || 'You',
          opponent: { name: color === 'w' ? headers.Black || 'Opponent' : headers.White || 'Opponent', rating: Number(color === 'w' ? headers.BlackElo : headers.WhiteElo) || null },
          result: headers.Result || '*', reason: '', outcome: 'none', pgn: ta.value.trim(), time: 0, inc: 0, rated: false,
          plies: moves.length, rating: null, priorRating: Number(color === 'w' ? headers.WhiteElo : headers.BlackElo) || get().ratings.online.r, review: null,
        };
        addGame(rec);
        location.hash = `#/review/${rec.id}`;
      } catch { toast('That does not look like a chess game. Paste the moves, for example: 1. e4 e5 2. Nf3 Nc6 …', 6000); }
    } }, 'Analyse')));
  return () => {};
}
