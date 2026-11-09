// The playing screen: shared UI for games against the computer and against people online.
import { Chess } from 'chess.js';
import { h, clear, fmtClock, toast, uid } from '../util.js';
import { Board, moveKind } from '../board.js';
import { engine, LEVELS } from '../engine.js';
import { net } from '../net.js';
import { get, addGame, save, findGame } from '../store.js';
import { applyResult, isProvisional } from '../rating.js';
import { play } from '../sound.js';
import { teaching } from '../teaching.js';
import { session, saveActive, loadActive, clearActive, TC_LABEL } from '../session.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ONLINE_KEY = 'openchess.online';
const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };

function materialDiff(fen) {
  const d = { w: 0, b: 0 }; const caps = { w: [], b: [] };
  const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const k = ch.toLowerCase();
    if (!VALUE[k]) continue;
    const c = ch === k ? 'b' : 'w';
    have[c][k]++; d[c] += VALUE[k];
  }
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  for (const c of ['w', 'b']) {
    const o = c === 'w' ? 'b' : 'w';
    for (const k of ['q', 'r', 'b', 'n', 'p']) for (let i = have[o][k]; i < start[k]; i++) caps[c].push(GLYPH[k]);
  }
  return { adv: d.w - d.b, caps };
}

export function mount(root) {
  const cfg = session.cfg; session.cfg = null;
  const cleanups = [];
  const dom = {};
  let board; let chess = new Chess();
  let G = null; // game metadata
  let over = false; let busy = false; let thinking = false; let confirming = null;
  let clocks = { w: 0, b: 0 }; let lastTick = performance.now(); let timed = false;
  let hintUsed = false;
  let oppConnected = true; let drawOfferFromOpp = false;
  let moveSans = []; let startedAt = Date.now();

  root.append(h('div', { class: 'card' }, h('span', { class: 'spinner' }), ' Setting up the board…'));

  // ---------- entry ----------
  (async function init() {
    if (cfg?.mode === 'computer') return startComputer(cfg);
    if (cfg?.mode === 'online') return startOnline(cfg.first);
    const active = loadActive();
    if (cfg?.resume || active) {
      if (active?.mode === 'computer') return startComputer(active.cfg, active);
    }
    const stored = readOnline();
    if (stored) {
      net.connect();
      const off = net.on('game', (m) => { off(); startOnline(m); });
      cleanups.push(off);
      const open = () => net.send({ t: 'rejoin', ...stored });
      cleanups.push(net.on('open', open));
      if (net.open) open();
      cleanups.push(net.on('error', () => { clearOnline(); location.hash = '#/play'; }));
      return;
    }
    location.hash = '#/play';
  }());

  const readOnline = () => { try { return JSON.parse(localStorage.getItem(ONLINE_KEY)); } catch { return null; } };
  const clearOnline = () => { try { localStorage.removeItem(ONLINE_KEY); } catch { /* ignore */ } };

  // ---------- layout ----------
  function buildLayout() {
    clear(root);
    dom.oppName = h('span', { class: 'name' }); dom.oppRating = h('span', { class: 'rating' }); dom.oppStatus = h('span', { class: 'status' });
    dom.meName = h('span', { class: 'name' }); dom.meRating = h('span', { class: 'rating' });
    dom.oppClock = h('div', { class: 'clock' }); dom.meClock = h('div', { class: 'clock' });
    dom.oppCap = h('div', { class: 'captured' }); dom.meCap = h('div', { class: 'captured' });
    dom.boardEl = h('div', { class: 'boardwrap' });
    dom.status = h('div', { class: 'banner', role: 'status', 'aria-live': 'polite' });
    dom.moves = h('div', { class: 'moves', 'aria-label': 'Moves' });
    dom.controls = h('div', { class: 'controls' });
    dom.result = h('div', { class: 'stack' });
    root.append(h('div', { class: 'game' },
      h('div', { class: 'boardcol' },
        h('div', { class: 'pbar' }, h('div', {}, h('div', { class: 'who' }, dom.oppName, dom.oppRating, dom.oppStatus), dom.oppCap), dom.oppClock),
        dom.boardEl,
        h('div', { class: 'pbar' }, h('div', {}, h('div', { class: 'who' }, dom.meName, dom.meRating), dom.meCap), dom.meClock)),
      h('div', { class: 'side stack' },
        h('div', { class: 'card' }, dom.status, h('div', { style: { marginTop: '.8rem' } }, dom.moves), dom.controls),
        dom.result)));
    dom.side = root.querySelector('.side');
    dom.side.prepend(teaching.card.el); // inside the side panel, not floating over the board
    teaching.card.show();
    cleanups.push(() => { teaching.card.hide(); document.body.append(teaching.card.el); });
  }

  function setupBoard(orientation, fen) {
    board = new Board(dom.boardEl, { orientation, onMove: onUserMove });
    if (fen) board.setPosition(fen);
    cleanups.push(() => board.destroy());
  }

  // ---------- clocks ----------
  const tickTimer = setInterval(() => {
    const now = performance.now(); const dt = now - lastTick; lastTick = now;
    if (!timed || over || chess.history().length < 2) { renderClocks(); return; }
    clocks[chess.turn()] = Math.max(0, clocks[chess.turn()] - dt);
    if (G.mode === 'computer' && clocks[chess.turn()] <= 0) {
      finish(chess.turn() === 'w' ? '0-1' : '1-0', 'timeout');
    }
    renderClocks();
  }, 100);
  cleanups.push(() => clearInterval(tickTimer));

  function renderClocks() {
    if (!G) return;
    const me = G.color; const opp = me === 'w' ? 'b' : 'w';
    for (const [el, c] of [[dom.meClock, me], [dom.oppClock, opp]]) {
      el.style.display = timed ? '' : 'none';
      el.textContent = timed ? fmtClock(clocks[c]) : '';
      const running = timed && !over && chess.history().length >= 2 && chess.turn() === c;
      el.classList.toggle('active', running);
      el.classList.toggle('low', timed && !over && clocks[c] < 20_000 && clocks[c] > 0 && running);
    }
  }

  // ---------- computer games ----------
  async function startComputer(c, resumeData) {
    const level = LEVELS.find((l) => l.id === c.levelId) ?? LEVELS[3];
    G = {
      mode: 'computer', color: c.color, level, time: c.time, inc: c.inc,
      me: { name: get().player.name, rating: get().ratings.computer.r },
      opp: { name: `Stockfish · ${level.name}`, rating: level.elo },
      id: uid(10),
    };
    timed = c.time > 0;
    clocks = timed ? { w: c.time * 60_000, b: c.time * 60_000 } : { w: 0, b: 0 };
    buildLayout();
    setupBoard(G.color);
    if (resumeData) {
      hintUsed = !!resumeData.hintUsed;
      try { chess.loadPgn(resumeData.pgn); } catch { chess = new Chess(); }
      moveSans = chess.history();
      if (resumeData.clocks) clocks = resumeData.clocks;
      board.setPosition(chess.fen());
      const h1 = chess.history({ verbose: true }).at(-1);
      if (h1) board.setPosition(chess.fen(), { lastMove: [h1.from, h1.to] });
      G.id = resumeData.id ?? G.id;
    }
    setHeaders();
    dom.status.textContent = 'Loading engine…';
    try { await engine.boot(); await engine.newGame(); } catch (e) {
      dom.status.textContent = 'The chess engine failed to load. Check your connection and reload.'; console.error(e); return;
    }
    renderAll();
    if (!resumeData) play('start');
    afterMove();
  }

  async function engineTurn() {
    if (over || G.mode !== 'computer' || chess.turn() === G.color) return;
    thinking = true; renderStatus();
    const fen = chess.fen();
    const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
    const started = performance.now();
    let uci;
    try { uci = await engine.playMove(fen, legal, G.level); } catch (e) { console.error(e); }
    // feel natural: don't answer instantly at low levels
    const minDelay = G.level.id <= 5 ? 450 : 250;
    const wait = minDelay - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    thinking = false;
    if (over || chess.fen() !== fen) return; // game ended or was taken back meanwhile
    if (!uci || !legal.includes(uci)) uci = legal[Math.floor(Math.random() * legal.length)];
    commit({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }, 'engine');
  }

  // ---------- online games ----------
  function startOnline(m) {
    const color = m.color;
    G = {
      mode: 'online', color, id: m.gameId, token: m.token, time: m.time, inc: m.inc,
      me: { name: color === 'w' ? m.white.name : m.black.name, rating: color === 'w' ? m.white.rating : m.black.rating },
      opp: color === 'w' ? m.black : m.white,
      pgnHeaders: { White: m.white.name, Black: m.black.name },
    };
    try { localStorage.setItem(ONLINE_KEY, JSON.stringify({ gameId: m.gameId, token: m.token })); } catch { /* ignore */ }
    timed = true;
    clocks = { w: m.clocks.w, b: m.clocks.b };
    chess = new Chess();
    for (const san of m.moves) chess.move(san);
    moveSans = chess.history();
    buildLayout();
    setupBoard(color);
    const last = chess.history({ verbose: true }).at(-1);
    board.setPosition(chess.fen(), { lastMove: last ? [last.from, last.to] : null });
    setHeaders();
    lastTick = performance.now();
    renderAll();

    cleanups.push(
      net.on('move', (msg) => {
        if (msg.ply <= chess.history().length) { clocks = { ...msg.clocks }; return; }
        clocks = { ...msg.clocks };
        commit({ from: msg.from, to: msg.to, promotion: msg.san.includes('=') ? msg.san.split('=')[1][0].toLowerCase() : undefined }, 'remote');
      }),
      net.on('over', (msg) => { clocks = { ...msg.clocks }; finish(msg.result, msg.reason, msg.pgn); }),
      net.on('draw_offer', () => { drawOfferFromOpp = true; renderControls(); toast('Your opponent offers a draw'); }),
      net.on('draw_declined', () => toast('Draw declined')),
      net.on('opp_status', (s) => { oppConnected = s.connected; renderOppStatus(); }),
      net.on('game', (s) => { // reconnect resync
        clocks = { ...s.clocks }; chess = new Chess(); for (const san of s.moves) chess.move(san);
        moveSans = chess.history();
        const l = chess.history({ verbose: true }).at(-1);
        board.setPosition(chess.fen(), { lastMove: l ? [l.from, l.to] : null });
        if (s.status === 'over') finish(s.result, s.reason, s.pgn);
        else renderAll();
      }),
      net.on('open', () => net.send({ t: 'rejoin', gameId: G.id, token: G.token })),
      net.on('error', (e) => { toast(e.message); net.send({ t: 'rejoin', gameId: G.id, token: G.token }); }),
    );
    net.connect();
    afterMove(true);
  }

  // ---------- moves ----------
  function onUserMove(m) {
    if (over || chess.turn() !== G.color) { board.setPosition(chess.fen()); return; }
    teaching.card.used('move');
    if (G.mode === 'online') {
      net.send({ t: 'move', ...m });
    }
    commit(m, 'me');
  }

  /** Apply a move to local state/board. `who`: me | engine | remote */
  function commit(m, who) {
    let mv;
    try { mv = chess.move(m); } catch { board.setPosition(chess.fen()); return; }
    if (who === 'me') {
      // the board already shows the piece moved by the user; just sync last-move/dests
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] });
    } else {
      board.setPosition(chess.fen(), { lastMove: [mv.from, mv.to] });
    }
    moveSans.push(mv.san);
    play(moveKind(mv, chess));
    if (G.mode === 'computer' && timed && chess.history().length > 2) {
      clocks[mv.color] += G.inc * 1000;
    }
    drawOfferFromOpp = false; confirming = null;
    renderAll();
    if (G.mode === 'computer') persist();
    if (G.mode === 'computer') afterMove();
    else afterMove(true);
  }

  function afterMove(online = false) {
    if (over) return;
    if (!online) {
      if (chess.isCheckmate()) return finish(chess.turn() === 'w' ? '0-1' : '1-0', 'checkmate');
      if (chess.isStalemate()) return finish('1/2-1/2', 'stalemate');
      if (chess.isInsufficientMaterial()) return finish('1/2-1/2', 'insufficient material');
      if (chess.isThreefoldRepetition()) return finish('1/2-1/2', 'threefold repetition');
      if (chess.isDrawByFiftyMoves()) return finish('1/2-1/2', 'fifty-move rule');
    }
    board.setInteractive(chess.turn() === G.color ? G.color : null);
    renderStatus();
    if (G.mode === 'computer' && chess.turn() !== G.color) engineTurn();
  }

  function persist() {
    if (over || G.mode !== 'computer') return;
    saveActive({ mode: 'computer', cfg: { mode: 'computer', levelId: G.level.id, color: G.color, time: G.time, inc: G.inc }, pgn: chess.pgn(), clocks, hintUsed, id: G.id });
  }

  function setHeaders() { /* PGN headers are set at finish() */ }

  // ---------- finishing ----------
  function finish(result, reason, serverPgn) {
    if (over) return;
    over = true; thinking = false;
    teaching.card.hide();
    board.setInteractive(null);
    clearActive();
    if (G.mode === 'online') clearOnline();
    play('end');
    const aborted = reason === 'aborted';
    const outcome = result === '1/2-1/2' ? 'draw' : (result === '1-0') === (G.color === 'w') ? 'win' : 'loss';

    const pgn = serverPgn ?? buildPgn(result);
    let record = null;
    if (!aborted && chess.history().length >= 2) {
      const pool = get().ratings[G.mode === 'online' ? 'online' : 'computer'];
      const rated = !(G.mode === 'computer' && hintUsed);
      let change = null;
      if (rated) change = applyResult(pool, G.opp.rating, outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0);
      record = {
        id: G.id, t: Date.now(), mode: G.mode, color: G.color, playerName: G.me.name,
        opponent: { name: G.opp.name, rating: G.opp.rating, level: G.level?.id ?? null },
        result, reason, outcome, pgn, time: G.time, inc: G.inc, rated, plies: chess.history().length,
        rating: change ? { ...change, pool: G.mode === 'online' ? 'online' : 'computer' } : null,
        priorRating: G.me.rating, review: null,
      };
      if (!findGame(record.id)) addGame(record); else save();
    }
    renderAll();
    renderResult(record, outcome, aborted, reason);
  }

  function buildPgn(result) {
    const c = new Chess();
    const [w, b] = G.color === 'w' ? [G.me, G.opp] : [G.opp, G.me];
    c.setHeader('Event', 'OpenChess game');
    c.setHeader('Date', new Date(startedAt).toISOString().slice(0, 10).replaceAll('-', '.'));
    c.setHeader('White', w.name); c.setHeader('Black', b.name);
    c.setHeader('WhiteElo', String(w.rating)); c.setHeader('BlackElo', String(b.rating));
    c.setHeader('Result', result);
    if (G.time) c.setHeader('TimeControl', `${G.time * 60}+${G.inc}`);
    for (const san of chess.history()) c.move(san);
    return c.pgn();
  }

  // ---------- rendering ----------
  function renderAll() {
    dom.meName.textContent = G.me.name;
    dom.meRating.textContent = `(${G.me.rating}${G.mode === 'computer' && isProvisional(get().ratings.computer) ? '?' : ''})`;
    dom.oppName.textContent = G.opp.name;
    dom.oppRating.textContent = `(${G.opp.rating})`;
    const { adv, caps } = materialDiff(chess.fen());
    const meAdv = G.color === 'w' ? adv : -adv;
    dom.meCap.textContent = caps[G.color].join('') + (meAdv > 0 ? `  +${meAdv}` : '');
    const oc = G.color === 'w' ? 'b' : 'w';
    dom.oppCap.textContent = caps[oc].join('') + (meAdv < 0 ? `  +${-meAdv}` : '');
    renderMoves(); renderClocks(); renderStatus(); renderControls(); renderOppStatus();
  }

  function renderOppStatus() {
    if (dom.oppStatus) dom.oppStatus.textContent = G?.mode === 'online' && !oppConnected && !over ? 'disconnected — waiting up to 45s' : '';
  }

  function renderMoves() {
    clear(dom.moves);
    const hist = chess.history();
    for (let i = 0; i < hist.length; i += 2) {
      dom.moves.append(
        h('span', { class: 'n' }, `${i / 2 + 1}.`),
        h('span', { class: `m ${i === hist.length - 1 ? 'cur' : ''}` }, hist[i]),
        h('span', { class: `m ${i + 1 === hist.length - 1 ? 'cur' : ''}` }, hist[i + 1] ?? ''));
    }
    dom.moves.scrollTop = dom.moves.scrollHeight;
  }

  function renderStatus() {
    if (!G || over) return;
    const mine = chess.turn() === G.color;
    let t;
    if (G.mode === 'computer' && thinking) t = `${G.opp.name} is thinking…`;
    else if (chess.history().length === 0 && mine) t = G.time ? 'Your move — the clock starts after Black replies.' : 'Your move. Good luck!';
    else t = mine ? 'Your move' : G.mode === 'online' ? "Opponent's move" : `${G.opp.name} to move`;
    if (chess.inCheck()) t += ' — check!';
    dom.status.textContent = t;
    if (mine && chess.inCheck()) teaching.tips.once('check', 'You are in check: move the king, block the attack, or capture the attacker.');
    if (G.time && chess.history().length === 0 && mine && G.color === 'w') teaching.tips.once('clock', 'Your clock starts after Black replies to your first move.');
  }

  function armConfirm(key, fn) {
    return () => {
      if (confirming === key) { confirming = null; fn(); } else {
        confirming = key; renderControls();
        setTimeout(() => { if (confirming === key) { confirming = null; renderControls(); } }, 3000);
      }
    };
  }

  function renderControls() {
    if (!G) return;
    clear(dom.controls);
    if (over) return;
    const plies = chess.history().length;
    dom.controls.append(h('button', { onclick: () => board.flip() }, '⇅ Flip'));
    if (G.mode === 'computer') {
      dom.controls.append(
        h('button', { disabled: plies < (G.color === 'w' ? 2 : 3) || chess.turn() !== G.color, onclick: takeback, title: 'Undo your last move (makes the game unrated)' }, '↶ Take back'),
        h('button', { disabled: chess.turn() !== G.color || thinking, onclick: hint, title: 'Show a good move (makes the game unrated)' }, '💡 Hint'));
    }
    if (G.mode === 'online' && plies >= 2) {
      if (drawOfferFromOpp) {
        dom.controls.append(h('button', { class: 'primary', onclick: () => { net.send({ t: 'draw', action: 'accept' }); } }, 'Accept draw'),
          h('button', { onclick: () => { drawOfferFromOpp = false; net.send({ t: 'draw', action: 'decline' }); renderControls(); } }, 'Decline'));
      } else {
        dom.controls.append(h('button', { onclick: () => { net.send({ t: 'draw', action: 'offer' }); toast('Draw offered'); } }, '½ Offer draw'));
      }
    }
    const resignLabel = G.mode === 'online' && plies < 2 ? 'Abort' : 'Resign';
    dom.controls.append(h('button', { class: 'danger', onclick: armConfirm('resign', doResign) }, confirming === 'resign' ? `Confirm ${resignLabel.toLowerCase()}?` : `⚑ ${resignLabel}`));
  }

  function doResign() {
    if (G.mode === 'online') { net.send({ t: 'resign' }); return; }
    if (chess.history().length < 2) { over = true; clearActive(); location.hash = '#/play'; return; }
    finish(G.color === 'w' ? '0-1' : '1-0', 'resignation');
  }

  function takeback() {
    if (thinking) return;
    const n = chess.turn() === G.color ? 2 : 1;
    for (let i = 0; i < n; i++) chess.undo();
    moveSans = chess.history(); hintUsed = true; // unrated from now on
    const l = chess.history({ verbose: true }).at(-1);
    board.setArrows([]);
    board.setPosition(chess.fen(), { lastMove: l ? [l.from, l.to] : null });
    toast('Takeback used — this game will be unrated.');
    renderAll(); afterMove(); persist();
  }

  async function hint() {
    teaching.card.used('hint');
    hintUsed = true;
    toast('Hint used — this game will be unrated.');
    const { best } = await engine.search(chess.fen(), { depth: 12, movetime: 1500 });
    if (best && !over) board.setArrows([{ from: best.slice(0, 2), to: best.slice(2, 4), brush: 'green' }]);
    persist();
  }

  function renderResult(record, outcome, aborted, reason) {
    clear(dom.controls);
    const title = aborted ? 'Game aborted' : outcome === 'win' ? 'You won!' : outcome === 'loss' ? 'You lost' : 'Draw';
    const why = reason ? reason.charAt(0).toUpperCase() + reason.slice(1) : '';
    dom.status.textContent = `${title} — ${why}`;
    const box = h('div', { class: `card banner ${outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : ''}` },
      h('div', { class: 'result-title' }, title), h('p', { class: 'muted' }, why));
    if (record?.rating) {
      const d = record.rating.delta;
      box.append(h('p', {}, `Rating: ${record.rating.before} → `, h('b', {}, String(record.rating.after)), ' ',
        h('span', { class: `delta ${d >= 0 ? 'up' : 'down'}` }, `(${d >= 0 ? '+' : ''}${d})`),
        h('span', { class: 'muted small' }, ` ${record.rating.pool === 'online' ? 'online' : 'vs computer'} rating`)));
    } else if (record && !record.rated) box.append(h('p', { class: 'muted' }, 'Unrated (hint or takeback used).'));
    const actions = h('div', { class: 'controls' });
    if (record) {
      actions.append(h('a', { class: 'btn primary big', href: `#/review/${record.id}` }, '🎓 Review my game'));
    }
    actions.append(
      h('a', { class: 'btn', href: '#/play' }, 'New game'),
      G.mode === 'computer' && h('button', { onclick: () => { session.cfg = { mode: 'computer', levelId: G.level.id, color: G.color === 'w' ? 'b' : 'w', time: G.time, inc: G.inc }; window.dispatchEvent(new Event('hashchange')); } }, 'Rematch (swap colours)'));
    box.append(actions);
    if (record) box.append(h('p', { class: 'small muted' }, 'The review shows accuracy, mistakes, an estimated performance rating and lessons — all computed right in your browser.'));
    clear(dom.result); dom.result.append(box);
    if (record && get().settings.autoReview) location.hash = `#/review/${record.id}`;
  }

  return () => { cleanups.forEach((f) => { try { f(); } catch { /* ignore */ } }); engine.stop(); };
}
