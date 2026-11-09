// Generates lesson exercises and keeps only the ones Stockfish agrees have ONE clearly best answer.
//   node scripts/lessons/generate.mjs            -> writes client/src/lessons-generated.js
// Deterministic (seeded), so re-running gives the same file. Takes a few minutes.
import { Chess } from 'chess.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { search, quit } from './engine.mjs';
import { checkFind } from './check.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/src/lessons-generated.js');
const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';

let seed = 20261109;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sq = (f, r) => FILES[f] + (r + 1);
const fileOf = (s) => FILES.indexOf(s[0]);
const rankOf = (s) => Number(s[1]) - 1;
const uciOf = (m) => m.from + m.to + (m.promotion ?? '');

/** Build a legal FEN from a {square: 'wK'} map, or null when the position is not legal / playable. */
function fenFrom(map, turn = 'w') {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = ''; let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = map[sq(f, r)];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p[0] === 'w' ? p[1].toUpperCase() : p[1].toLowerCase();
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const fen = `${rows.join('/')} ${turn} - - 0 1`;
  try {
    const c = new Chess(fen);
    // the side NOT to move must not be in check
    const other = new Chess(fen.replace(` ${turn} `, ` ${turn === 'w' ? 'b' : 'w'} `));
    if (other.inCheck()) return null;
    if (c.isGameOver()) return null;
    return fen;
  } catch { return null; }
}

function freeSquares(used, n) {
  const out = [];
  while (out.length < n) {
    const s = sq(ri(0, 7), ri(0, 7));
    if (!used.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}
const adjacent = (a, b) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b))) <= 1;

const results = { free: [], forks: [], skewers: [], pins: [], mate2: [], kp: [] };
const want = { free: 12, forks: 12, skewers: 10, pins: 12, mate2: 10, kp: 12 };
/** Final gate: the same strict test the verifier uses (depth 18). */
async function confirmed(fen, ans) { const r = await checkFind(fen, ans); if (!r.ok) console.log('  dropped:', r.reason); return r.ok; }
const stats = {};
const bump = (k) => { stats[k] = (stats[k] ?? 0) + 1; };

// ---------------- free pieces: random playouts, then "which capture wins a piece for nothing?" ----------------
async function genFree() {
  for (let tries = 0; results.free.length < want.free && tries < 4000; tries++) {
    const g = new Chess();
    const plies = ri(8, 26);
    for (let i = 0; i < plies && !g.isGameOver(); i++) g.move(pick(g.moves()));
    if (g.isGameOver() || g.inCheck()) continue;
    const me = g.turn(); const them = me === 'w' ? 'b' : 'w';
    const caps = g.moves({ verbose: true }).filter((m) => m.captured && V[m.captured] >= 3 && g.attackers(m.to, them).length === 0 && !m.promotion);
    if (caps.length !== 1) continue;
    // keep positions with enough material to look like a game
    const board = g.board().flat().filter(Boolean);
    if (board.length < 14) continue;
    bump('free:cand');
    const fen = g.fen();
    const { lines } = await search(fen, { depth: 14, multipv: 2 });
    if (lines.length < 2) continue;
    const [a, b] = lines;
    if (a.pv[0] !== uciOf(caps[0])) continue;
    const sign = me === 'w' ? 1 : -1;
    if (sign * a.cp < 250 || sign * (a.cp - b.cp) < 150) continue;
    if (!(await confirmed(fen, [uciOf(caps[0])]))) continue;
    results.free.push({ fen, answers: [uciOf(caps[0])], san: caps[0].san, piece: NAME[caps[0].captured] });
    console.log('free', results.free.length, caps[0].san);
  }
}

// ---------------- knight forks (check + attack the queen or a rook) ----------------
async function genForks() {
  for (let tries = 0; results.forks.length < want.forks && tries < 400000; tries++) {
    const used = new Set();
    const [wk, wn, bk, bt] = freeSquares(used, 4);
    if (adjacent(wk, bk)) continue;
    const target = pick(['q', 'q', 'r']);
    const map = { [wk]: 'wk', [wn]: 'wn', [bk]: 'bk', [bt]: 'b' + target };
    // a couple of pawns to make it look like a position
    const extra = freeSquares(new Set(Object.keys(map)), 3);
    extra.forEach((s, i) => { if (rankOf(s) > 0 && rankOf(s) < 7) map[s] = (i < 2 ? 'b' : 'w') + 'p'; });
    const fen = fenFrom(map, 'w'); if (!fen) continue;
    const g = new Chess(fen);
    const forks = g.moves({ verbose: true }).filter((m) => {
      if (m.piece !== 'n' || !/\+$/.test(m.san) || m.captured) return false;
      const h = new Chess(fen); h.move(m.san);
      return h.attackers(bt, 'w').includes(m.to);
    });
    if (forks.length !== 1) continue;
    bump('forks:cand');
    const { lines } = await search(fen, { depth: 12, multipv: 2 });
    if (lines.length < 2) continue;
    const [a, b] = lines;
    if (a.pv[0] !== uciOf(forks[0]) || a.cp < 450 || a.cp - b.cp < 250) continue;
    if (!(await confirmed(fen, [uciOf(forks[0])]))) continue;
    results.forks.push({ fen, answers: [uciOf(forks[0])], san: forks[0].san, target: NAME[target] });
    console.log('fork', results.forks.length, forks[0].san, fen);
  }
}

// ---------------- skewers: a rook/bishop checks the king and wins the queen/rook behind it ----------------
function rayBeyond(from, over) {
  const df = Math.sign(fileOf(over) - fileOf(from)); const dr = Math.sign(rankOf(over) - rankOf(from));
  const out = []; let f = fileOf(over) + df; let r = rankOf(over) + dr;
  while (f >= 0 && f < 8 && r >= 0 && r < 8) { out.push(sq(f, r)); f += df; r += dr; }
  return out;
}
async function genSkewers() {
  for (let tries = 0; results.skewers.length < want.skewers && tries < 600000; tries++) {
    const [wk, ws, bk, bt] = freeSquares(new Set(), 4);
    if (adjacent(wk, bk)) continue;
    const slider = pick(['r', 'b']); const target = pick(['q', 'r']);
    const map = { [wk]: 'wk', [ws]: 'w' + slider, [bk]: 'bk', [bt]: 'b' + target };
    const extra = freeSquares(new Set(Object.keys(map)), 2);
    extra.forEach((s) => { if (rankOf(s) > 0 && rankOf(s) < 7) map[s] = 'bp'; });
    const fen = fenFrom(map, 'w'); if (!fen) continue;
    const g = new Chess(fen);
    const skews = g.moves({ verbose: true }).filter((m) => {
      if (m.piece !== slider || !/\+$/.test(m.san) || m.captured) return false;
      const behind = rayBeyond(m.to, bk);
      const first = behind.find((s) => g.get(s));
      return first === bt;
    });
    if (skews.length !== 1) continue;
    bump('skewers:cand');
    const { lines } = await search(fen, { depth: 12, multipv: 2 });
    if (lines.length < 2) continue;
    const [a, b] = lines;
    if (a.pv[0] !== uciOf(skews[0]) || a.cp < 450 || a.cp - b.cp < 250) continue;
    if (!(await confirmed(fen, [uciOf(skews[0])]))) continue;
    results.skewers.push({ fen, answers: [uciOf(skews[0])], san: skews[0].san, target: NAME[target], slider: NAME[slider] });
    console.log('skewer', results.skewers.length, skews[0].san, fen);
  }
}

// ---------------- pins: attack the pinned knight with a pawn ----------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
async function genPins() {
  for (let tries = 0; results.pins.length < want.pins && tries < 400000; tries++) {
    const bkF = ri(0, 7); const bkR = ri(1, 7);
    const [df, dr] = pick(DIRS);
    const a = ri(1, 3); const b = ri(1, 3);
    const nf = bkF + df * a; const nr = bkR + dr * a; const sf = bkF + df * (a + b); const sr = bkR + dr * (a + b);
    const inb = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
    if (!inb(nf, nr) || !inb(sf, sr)) continue;
    const slider = df === 0 || dr === 0 ? 'r' : 'b';
    const bk = sq(bkF, bkR); const bn = sq(nf, nr); const ws = sq(sf, sr);
    // the pawn: one step below the square from which it would attack the knight
    const pf = nf + pick([-1, 1]); const prr = nr - 2;
    if (!inb(pf, prr) || prr < 1 || prr > 5) continue;
    const wp = sq(pf, prr);
    const used = new Set([bk, bn, ws, wp]);
    if (used.size < 4) continue;
    const wk = freeSquares(used, 1)[0];
    if (adjacent(wk, bk)) continue;
    const map = { [bk]: 'bk', [bn]: 'bn', [ws]: 'w' + slider, [wp]: 'wp', [wk]: 'wk' };
    const fen = fenFrom(map, 'w'); if (!fen) continue;
    const g = new Chess(fen);
    const push = g.moves({ verbose: true }).filter((m) => m.piece === 'p' && !m.captured && !/\+$/.test(m.san) && (() => { const h = new Chess(fen); h.move(m.san); return h.attackers(bn, 'w').includes(m.to); })());
    if (push.length !== 1) continue;
    bump('pins:cand');
    const { lines } = await search(fen, { depth: 14, multipv: 2 });
    if (lines.length < 2) continue;
    const [x, y] = lines;
    if (x.pv[0] !== uciOf(push[0]) || x.cp < 250 || x.cp - y.cp < 200) continue;
    if (!(await confirmed(fen, [uciOf(push[0])]))) continue;
    results.pins.push({ fen, answers: [uciOf(push[0])], san: push[0].san, slider: NAME[slider] });
    console.log('pin', results.pins.length, push[0].san, fen);
  }
}

// ---------------- mate in two (the first move must be the only one that forces mate in two) ----------------
async function genMate2() {
  for (let tries = 0; results.mate2.length < want.mate2 && tries < 100000; tries++) {
    const [wk, wq, wr, bk] = freeSquares(new Set(), 4);
    if (adjacent(wk, bk)) continue;
    const map = { [wk]: 'wk', [wq]: 'wq', [wr]: 'wr', [bk]: 'bk' };
    const fen = fenFrom(map, 'w'); if (!fen) continue;
    const g = new Chess(fen);
    if (g.moves().some((m) => { const h = new Chess(fen); h.move(m); return h.isCheckmate(); })) continue; // no mate in one
    bump('mate2:cand');
    const { lines } = await search(fen, { depth: 14, multipv: 2 });
    if (lines.length < 2) continue;
    const [a, b] = lines;
    if (a.mate !== 2) continue;
    if (b.mate !== null && Math.abs(b.mate) <= 2) continue;
    // black must have more than one reply on the first move, so it is a real calculation
    const h = new Chess(fen); const mv = h.move({ from: a.pv[0].slice(0, 2), to: a.pv[0].slice(2, 4), promotion: a.pv[0][4] });
    if (h.moves().length < 2) continue;
    if (!(await confirmed(fen, [a.pv[0]]))) continue;
    results.mate2.push({ fen, answers: [a.pv[0]], san: mv.san, line: a.pv.slice(0, 3) });
    console.log('mate2', results.mate2.length, mv.san, fen);
  }
}

// ---------------- king and pawn endings: exactly ONE winning move ----------------
async function genKP() {
  for (let tries = 0; results.kp.length < want.kp && tries < 100000; tries++) {
    const wk = sq(ri(0, 7), ri(2, 6)); const wp = sq(ri(1, 6), ri(1, 5)); const bk = sq(ri(0, 7), ri(2, 7));
    if (new Set([wk, wp, bk]).size < 3 || adjacent(wk, bk)) continue;
    const fen = fenFrom({ [wk]: 'wk', [wp]: 'wp', [bk]: 'bk' }, 'w'); if (!fen) continue;
    bump('kp:cand');
    const { lines } = await search(fen, { depth: 18, multipv: 4 });
    if (lines.length < 3) continue;
    const [a, b] = lines;
    if (a.cp < 700 || b.cp > 100) continue; // winning move vs everything else drawing
    const h = new Chess(fen); const mv = h.move({ from: a.pv[0].slice(0, 2), to: a.pv[0].slice(2, 4), promotion: a.pv[0][4] });
    if (!(await confirmed(fen, [a.pv[0]]))) continue;
    results.kp.push({ fen, answers: [a.pv[0]], san: mv.san });
    console.log('kp', results.kp.length, mv.san, fen);
  }
}

await genFree(); await genForks(); await genSkewers(); await genPins(); await genMate2(); await genKP();
console.log('candidates', stats, 'found', Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])));

const body = `// GENERATED by scripts/lessons/generate.mjs — every exercise was checked with Stockfish 19 (one clearly best answer). Do not edit by hand.
export const GENERATED = ${JSON.stringify(results, null, 1)};
`;
writeFileSync(OUT, body);
console.log('wrote', OUT);
quit();
