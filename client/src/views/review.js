// Post-game review: engine analysis, accuracy, estimated rating and lessons from the built-in coach.
import { Chess } from 'chess.js';
import { h, clear, toast, uid } from '../util.js';
import { Board } from '../board.js';
import { reviewPgn, analyzePosition, parsePgn } from '../analysis.js';
import {
  compactReview, hydrateReview, winPct, THEME_LABELS, THEME_ADVICE, pvToSan,
} from '../analysis-core.js';
import { reviewReport, explainPly, openingNotes, positionInsight } from '../coach.js';
import { findGame, updateGame, addGame, addMistakes, get } from '../store.js';
import { play } from '../sound.js';
import { detectOpening } from '../openings.js';
import { teaching } from '../teaching.js';

const CLS_LABEL = {
  book: 'Book', best: 'Best', excellent: 'Excellent', good: 'Good',
  inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder',
};
const CLS_ORDER = ['best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];
const SVG = 'http://www.w3.org/2000/svg';
const mistakeCls = ['inaccuracy', 'mistake', 'blunder'];

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
        const prior = { w: (game.color === 'w' ? game.priorRating : game.opponent.rating) || 1000, b: (game.color === 'b' ? game.priorRating : game.opponent.rating) || 1000 };
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
    const dom = {};

    // --- board column ---
    dom.boardEl = h('div', { class: 'boardwrap' });
    dom.evalW = h('div', { class: 'w' });
    dom.evalTxt = h('b', {});
    const bar = h('div', { class: 'evalbar', 'aria-hidden': 'true' }, dom.evalW);
    const board = new Board(dom.boardEl, { orientation: myColor });
    cleanups.push(() => board.destroy());
    board.setInteractive(null);

    dom.graph = h('div', {});
    dom.info = h('div', { class: 'banner' });
    const nav = h('div', { class: 'controls' },
      h('button', { 'aria-label': 'Start', onclick: () => stepTo(0) }, '⏮'),
      h('button', { 'aria-label': 'Previous move', onclick: () => stepTo(idx - 1) }, '◀'),
      h('button', { id: 'btn-forward', 'aria-label': 'Next move', onclick: () => stepTo(idx + 1) }, '▶'),
      h('button', { 'aria-label': 'End', onclick: () => stepTo(fens.length - 1) }, '⏭'),
      h('button', { onclick: () => board.flip() }, '⇅ Flip'),
      h('button', { id: 'btn-next-mistake', onclick: nextKey }, 'Next mistake ›'));

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
          dom.graph),
        h('div', { class: 'stack' }, dom.info, summaryCard(review), h('div', { class: 'card' }, h('h2', {}, 'Moves'), dom.moves), dom.coach, insightCard(), themesCard(review))));

    renderGraph(); renderMoves(); go(fens.length - 1);
    showReport(review);
    teaching.enterReview({
      hasMistakes: review.plies.some((p) => p.color === myColor && mistakeCls.includes(p.cls)),
      reviewedBefore: get().games.filter((g) => g.review).length > 1,
    });
    cleanups.push(() => teaching.leaveReview());
    const key = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowLeft') stepTo(idx - 1); else if (e.key === 'ArrowRight') stepTo(idx + 1);
      else if (e.key === 'ArrowUp') stepTo(0); else if (e.key === 'ArrowDown') stepTo(fens.length - 1);
    };
    window.addEventListener('keydown', key);
    cleanups.push(() => window.removeEventListener('keydown', key));

    /** The player moved through the game themselves (buttons, arrow keys or the move list). */
    function stepTo(n) { teaching.reviewState({ stepped: true }); go(n); }

    function go(n, before = false) {
      idx = Math.max(0, Math.min(fens.length - 1, n));
      viewBefore = before;
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
        board.setArrows([]);
        if (m) play(m.captured ? 'capture' : 'move');
      }
      const cp = review.series[before && ply ? idx - 1 : idx];
      const pct = winPct(cp);
      dom.evalW.style.height = `${pct}%`;
      renderInfo(ply);
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
      if (!ply) { dom.info.append(h('b', {}, 'Starting position'), h('p', { class: 'small muted' }, 'Use ← → keys or the buttons to step through the game.')); return; }
      const mine = ply.color === myColor;
      const moveNo = `${Math.floor(ply.i / 2) + 1}${ply.color === 'w' ? '.' : '...'}`;
      dom.info.append(
        h('div', { class: 'row between' },
          h('b', { class: `cls-${ply.cls}` }, h('span', { class: `dot ${ply.cls}` }), `${moveNo} ${ply.san} — ${CLS_LABEL[ply.cls]}`),
          h('span', { class: 'muted' }, fmtEval(review.series[ply.i + 1]))),
        h('div', { class: 'small muted' }, mine ? 'Your move' : "Opponent's move", ` · accuracy ${ply.acc}%`));
      if (['inaccuracy', 'mistake', 'blunder'].includes(ply.cls)) {
        dom.info.append(h('p', { style: { margin: '.5rem 0 0' } }, 'Better was ', h('b', {}, ply.bestSan ?? '?'), '.',
          ply.pvSan.length > 1 ? h('span', { class: 'muted small' }, ` Engine line: ${ply.pvSan.join(' ')}`) : null));
        const tags = ply.tags.filter((t) => THEME_LABELS[t]);
        if (tags.length) dom.info.append(h('div', { class: 'small', style: { marginTop: '.3rem' } }, tags.map((t) => h('span', { class: 'pill', style: { marginRight: '.3rem' } }, THEME_LABELS[t]))));
        if (mine) dom.info.append(h('p', { class: 'small', style: { marginTop: '.5rem' } }, '🎓 ', explainPly(ply, fens[ply.i], fens[ply.i + 1])));
        dom.info.append(h('div', { class: 'controls' },
          h('button', { id: 'btn-better', onclick: () => go(ply.i + 1, !viewBefore) }, viewBefore ? 'Back to the game' : 'Show the better move')));
      }
    }

    function renderMoves() {
      clear(dom.moves);
      review.plies.forEach((p, i) => {
        if (i % 2 === 0) dom.moves.append(h('span', { class: 'n' }, `${i / 2 + 1}.`));
        dom.moves.append(h('span', {
          class: `m click ${p.cls} ${['inaccuracy', 'mistake', 'blunder'].includes(p.cls) ? '' : ''}`,
          dataset: { i: String(i + 1) }, onclick: () => stepTo(i + 1), title: CLS_LABEL[p.cls],
        }, h('span', { class: `dot ${p.cls}`, style: { width: '.5rem', height: '.5rem', marginRight: '.3rem' } }), p.san));
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
        if (p.color === myColor && ['mistake', 'blunder'].includes(p.cls)) {
          svg.append(mk('circle', { cx: x(i + 1), cy: y(review.series[i + 1]), r: 4, fill: p.cls === 'blunder' ? '#e5604d' : '#e68a3c', stroke: '#111', 'stroke-width': 1 }));
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
          h('div', {}, h('h2', { style: { margin: 0 } }, `${game.playerName} vs ${game.opponent.name}`), h('div', { class: 'muted small' }, `${res} · ${game.reason ?? ''} · ${r.plies.length} plies`)),
          r.opening.name && h('span', { class: 'pill' }, `${r.opening.eco} ${r.opening.name}`)),
        h('div', { class: 'acc' },
          box('Your accuracy', `${mine.accuracy ?? '–'}%`, `Opponent ${them.accuracy ?? '–'}%`),
          box('Performance (est.)', mine.performance ?? '–', `Your rating ${game.priorRating}${game.opponent.rating ? ` · opp ${game.opponent.rating}` : ''}`),
          box('Avg. centipawn loss', mine.acpl ?? '–', `Opponent ${them.acpl ?? '–'}`)),
        h('div', { class: 'counts' }, CLS_ORDER.map((k) => h('div', { class: `cls-${k}` }, h('span', { class: 'dot' }), `${CLS_LABEL[k]}: `, h('b', {}, String(mine.counts[k] ?? 0))))),
        h('div', {}, h('h3', {}, 'Accuracy by phase'), h('div', { class: 'bars' }, phases)),
        h('p', { class: 'ai-note' }, 'Performance is a rough estimate from average centipawn loss (Stockfish lite, depth 12) and can be off by a few hundred points, especially in short games.'),
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
      const btn = h('button', { onclick: () => { const open = body.style.display === 'none'; body.style.display = open ? '' : 'none'; btn.textContent = open ? 'Hide opening notes' : '📖 Opening notes'; } }, '📖 Opening notes');
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
      const card = h('div', { class: 'card' }, h('h2', {}, '🎓 Coach report'));
      dom.coach.append(card);
      const c = reviewReport({ review: r, game, fens });
      card.append(h('p', {}, c.summary));
      if (c.opening?.comment) card.append(h('p', {}, h('b', {}, 'Opening: '), c.opening.comment, c.opening.tip ? ` Tip: ${c.opening.tip}` : ''));
      if (c.strengths?.length) card.append(h('div', {}, h('b', {}, 'What you did well'), h('ul', {}, c.strengths.map((s) => h('li', {}, s)))));
      card.append(h('h3', { style: { marginTop: '1rem' } }, 'Lessons for next game'));
      c.lessons.forEach((l, i) => card.append(h('div', { class: 'lesson' }, h('b', {}, `${i + 1}. ${l.title}`), h('p', { class: 'small', style: { margin: '.2rem 0' } }, l.body), l.drill && h('div', { class: 'drill' }, '🏋️ Drill: ', l.drill))));
      if (c.keyMoments?.length) {
        card.append(h('h3', { style: { marginTop: '1rem' } }, 'Key moments'));
        for (const k of c.keyMoments) {
          const p = review.plies[k.id]; if (!p) continue;
          card.append(h('div', { class: 'moment', onclick: () => go(k.id + 1) }, h('b', {}, `${Math.floor(k.id / 2) + 1}${p.color === 'w' ? '.' : '...'} ${p.san} `, h('span', { class: `dot ${p.cls}` })), h('div', { class: 'small' }, k.explanation)));
        }
      }
      card.append(h('p', { class: 'ai-note' }, 'Written by OpenChess\'s built-in coach from Stockfish\'s analysis — no AI service involved. Engine numbers are exact; the explanations are rule-based and cover the common cases.'));
    }

    // --- position insight: engine lines + rule-based observations for the position on the board ---
    function insightCard() {
      const btn = h('button', { class: 'primary' }, 'Analyse this position');
      const card = h('div', { class: 'card stack' }, h('h2', {}, '🔍 Position insight'),
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
      } catch (e) { toast(`Could not read that PGN: ${e.message}`); }
    } }, 'Analyse')));
  return () => {};
}
