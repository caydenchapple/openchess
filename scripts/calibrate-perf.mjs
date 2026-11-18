// Data for client/src/perf-model.js: bots of known strength play each other, every position is analysed with Stockfish the way the app's
// game review does it (depth 12, lite single-thread build), and per-side average centipawn loss (ACPL) and Lichess-style accuracy are recorded.
//
//   node scripts/calibrate-perf.mjs play --levels 21,23,25,1,3,6,8,10,13 --games 6 --conc 9 [--depth 12] [--plies 160]
//   node scripts/calibrate-perf.mjs fit                       # per-level table + the fitted curve
//
// Every level plays itself and its neighbours in the list (colours alternate). One line per game goes to calibration/perf-games.jsonl.
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { LEVELS, chooseMove } from '../client/src/levels.js';
import { search, quit } from './lessons/engine.mjs';

const me = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = new URL('../calibration/', import.meta.url).pathname;
const FILE = `${OUT}perf-games.jsonl`;
const OPEN = [[], ['e4'], ['d4'], ['e4', 'e5'], ['e4', 'c5'], ['d4', 'd5'], ['d4', 'Nf6'], ['Nf3'], ['c4'], ['e4', 'e6'], ['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4'], ['e4', 'e5', 'Nf3'], ['d4', 'Nf6', 'c4']];

/** A bot: a level id ("5"), the old random-mix scheme ("p50": full-strength 1-node engine that plays a random move 50% of the time) or "rnd". */
function bot(spec) {
  const m = String(spec).match(/^p(\d+)$/);
  if (m) return { id: spec, name: `old random-mix ${m[1]}%`, elo: null, nodes: 1, randomness: Number(m[1]) / 100 };
  if (spec === 'rnd') return { id: spec, name: 'random mover', elo: null, nodes: 1, randomness: 1 };
  return LEVELS.find((l) => l.id === Number(spec));
}

// same maths as client/src/analysis-core.js (copied so this script does not depend on the review code while that is being edited)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp, -1000, 1000))) - 1);
const moveAccuracy = (loss) => clamp(103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669, 0, 100);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const aggregateAccuracy = (accs) => (mean(accs) + accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0)) / 2;
const MATE_CP = 10_000;

/** Per-side stats from White-view evals (evals[i] is the position before move i; evals[n] after the last move). */
export function sideStats(plies, evals) {
  const res = { w: { cp: [], acc: [], loss: [], best: 0 }, b: { cp: [], acc: [], loss: [], best: 0 } };
  plies.forEach((p, i) => {
    const sign = p.color === 'w' ? 1 : -1;
    const before = sign * evals[i].cp; const after = sign * evals[i + 1].cp;
    const isBest = evals[i].best === p.uci;
    let loss = Math.max(0, winPct(before) - winPct(after));
    if (isBest) loss = Math.min(loss, 1);
    res[p.color].cp.push(Math.min(500, Math.max(0, clamp(before, -1000, 1000) - clamp(after, -1000, 1000))));
    res[p.color].acc.push(moveAccuracy(loss));
    res[p.color].loss.push(loss); if (isBest) res[p.color].best++;
  });
  const out = {};
  for (const c of ['w', 'b']) {
    const n = res[c].cp.length || 1; const L = res[c].loss;
    // shares of moves, with the same win%-loss thresholds as the review: inaccuracy 5-10, mistake 10-20, blunder 20+
    out[c] = { moves: res[c].cp.length, acpl: mean(res[c].cp), acc: res[c].acc.length ? aggregateAccuracy(res[c].acc) : null,
      blunders: L.filter((x) => x >= 20).length / n, mistakes: L.filter((x) => x >= 10 && x < 20).length / n, inacc: L.filter((x) => x >= 5 && x < 10).length / n, best: res[c].best / n };
  }
  return out;
}

// ---- child: play one game, analyse it, print one JSON line
if (process.argv.includes('--game')) {
  const [a, b, seed, aWhite] = [arg('a'), arg('b'), Number(arg('seed')), arg('white') === '1'];
  const depth = Number(arg('depth', 12)); const cap = Number(arg('plies', 160));
  let x = (seed * 2654435761) % 4294967296 || 1;
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const g = new Chess();
  for (const m of OPEN[seed % OPEN.length]) g.move(m);
  const la = bot(a); const lb = bot(b);
  const sfn = (fen, o) => search(fen, { depth: 40, multipv: o.multipv ?? 1, ...o });
  const fens = [g.fen()]; const plies = [];
  while (!g.isGameOver() && !g.isDraw() && plies.length + 0 < cap) {
    const level = (g.turn() === 'w') === aWhite ? la : lb;
    const color = g.turn();
    const uci = await chooseMove(sfn, g.fen(), level, rand, { sans: g.history() });
    g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    plies.push({ color, uci, san: g.history().at(-1) });
    fens.push(g.fen());
  }
  const cache = new Map(); const evals = [];
  for (const fen of fens) {
    const c = new Chess(fen);
    let e;
    if (c.isCheckmate()) e = { cp: c.turn() === 'w' ? -MATE_CP : MATE_CP, best: null };
    else if (c.isGameOver()) e = { cp: 0, best: null };
    else {
      const key = fen.split(' ').slice(0, 4).join(' ');
      e = cache.get(key);
      if (!e) {
        const { lines } = await search(fen, { depth, multipv: 1 });
        const top = lines[0];
        // mates become +-(10000 - 10*|mate|), as scoreToCp does in analysis-core.js
        const cp = !top ? 0 : top.mate != null ? (top.mate > 0 ? 1 : -1) * (MATE_CP - Math.min(Math.abs(top.mate), 100) * 10) : top.cp;
        e = { cp, best: top?.pv?.[0] ?? null }; cache.set(key, e);
      }
    }
    evals.push(e);
  }
  const st = sideStats(plies, evals);
  const mine = aWhite ? st.w : st.b; const theirs = aWhite ? st.b : st.w;
  console.log(`GAME ${JSON.stringify({ a, b, seed, aWhite, depth, plies: plies.length, result: g.isCheckmate() ? (g.turn() === 'w' ? '0-1' : '1-0') : g.isDraw() ? '1/2' : '*', A: mine, B: theirs, sans: plies.map((p) => p.san), cp: evals.map((e) => e.cp) })}`);
  quit();
}

async function play() {
  const ids = arg('levels').split(','); const games = Number(arg('games', 6)); const conc = Number(arg('conc', 9));
  const depth = arg('depth', '12'); const cap = arg('plies', '160');
  const seed0 = Number(arg('seed0', (Date.now() % 1_000_000) * 3));
  const pairs = [];
  ids.forEach((id, i) => { pairs.push([id, id]); if (i + 1 < ids.length) pairs.push([id, ids[i + 1]]); });
  const jobs = [];
  pairs.forEach(([a, b], pi) => { for (let k = 0; k < games; k++) jobs.push({ a, b, seed: seed0 + pi * 100 + k, white: k % 2 }); });
  // shuffle so that slow games are spread out
  jobs.sort(() => Math.random() - 0.5);
  mkdirSync(OUT, { recursive: true });
  let done = 0;
  const run = (j) => new Promise((resolve) => {
    const c = spawn(process.execPath, [me, '--game', '--a', j.a, '--b', j.b, '--seed', j.seed, '--white', j.white, '--depth', depth, '--plies', cap], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => {
      const m = out.match(/GAME (.*)/); if (m) appendFileSync(FILE, `${m[1]}\n`);
      if (++done % 10 === 0 || done === jobs.length) console.log(`${done}/${jobs.length}`);
      resolve();
    });
  });
  const q = [...jobs];
  await Promise.all(Array.from({ length: conc }, async () => { while (q.length) await run(q.shift()); }));
}

function rows() {
  if (!existsSync(FILE)) return [];
  const out = [];
  for (const l of readFileSync(FILE, 'utf8').split('\n').filter(Boolean)) {
    const g = JSON.parse(l);
    for (const [id, s] of [[String(g.a), g.A], [String(g.b), g.B]]) {
      const lv = bot(id);
      if (s.moves >= 10) out.push({ id, elo: lv.elo, name: lv.name, moves: s.moves, acpl: s.acpl, acc: s.acc, depth: g.depth, blunders: s.blunders, mistakes: s.mistakes, inacc: s.inacc, best: s.best });
    }
  }
  return out;
}

if (process.argv[2] === 'play') await play();
else if (process.argv[2] === 'fit') {
  const r = rows(); const by = new Map();
  for (const x of r) by.set(x.id, [...(by.get(x.id) ?? []), x]);
  console.log(`${r.length} sides (>= 10 moves) from ${new Set(r.map((x) => x.depth)).size} depth setting(s)`);
  console.log('level elo   sides  moves  ACPL mean (sd)   accuracy   best%  inacc%  mistake%  blunder%');
  for (const [id, xs] of [...by.entries()].sort((p, q) => (p[1][0].elo ?? 0) - (q[1][0].elo ?? 0))) {
    const m = mean(xs.map((x) => x.acpl)); const sd = Math.sqrt(mean(xs.map((x) => (x.acpl - m) ** 2)));
    console.log(`${String(id).padStart(3)} ${String(xs[0].elo ?? '-').padStart(5)} ${String(xs.length).padStart(6)} ${String(Math.round(mean(xs.map((x) => x.moves)))).padStart(6)}  ${m.toFixed(1).padStart(6)} (${sd.toFixed(1)})   ${mean(xs.map((x) => x.acc)).toFixed(1).padStart(8)} ${(100 * mean(xs.map((x) => x.best))).toFixed(0).padStart(6)} ${(100 * mean(xs.map((x) => x.inacc))).toFixed(0).padStart(7)} ${(100 * mean(xs.map((x) => x.mistakes))).toFixed(0).padStart(8)} ${(100 * mean(xs.map((x) => x.blunders))).toFixed(0).padStart(9)}   ${xs[0].name}`);
  }
}
