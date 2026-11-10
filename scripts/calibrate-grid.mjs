// Measures how strong many engine settings are, on one scale, by self-play + a Bradley–Terry fit.
//   node scripts/calibrate-grid.mjs [--games 10] [--conc 8]
// Candidates play only a few full-strength-engine settings (a node budget, plus a chance of a random move for weak levels).
// The scale is anchored to Stockfish's own limiter: "Stockfish at UCI_Elo 2000" is defined as 2000.
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chooseMove } from '../client/src/levels.js';
import { search, quit } from './lessons/engine.mjs';

const me = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };

const REF = { id: 'ref2000', nodes: 60_000, uciElo: 2000 };
// weakest to strongest (by expectation); each is { nodes, randomness? } with no limiter
const GRID = [
  { id: 'p90', nodes: 1, randomness: 0.9 }, { id: 'p80', nodes: 1, randomness: 0.8 }, { id: 'p70', nodes: 1, randomness: 0.7 }, { id: 'p60', nodes: 1, randomness: 0.6 },
  { id: 'p50', nodes: 1, randomness: 0.5 }, { id: 'p40', nodes: 1, randomness: 0.4 }, { id: 'p30', nodes: 1, randomness: 0.3 }, { id: 'p20', nodes: 1, randomness: 0.2 },
  { id: 'p10', nodes: 1, randomness: 0.1 },
  { id: 'n1', nodes: 1 }, { id: 'n3', nodes: 3 }, { id: 'n10', nodes: 10 }, { id: 'n30', nodes: 30 }, { id: 'n100', nodes: 100 }, { id: 'n300', nodes: 300 },
  { id: 'n1k', nodes: 1000 }, { id: 'n3k', nodes: 3000 }, { id: 'n10k', nodes: 10_000 }, { id: 'n30k', nodes: 30_000 }, { id: 'n100k', nodes: 100_000 },
];
const LOW = [
  { id: 'p100', nodes: 1, randomness: 1.0 }, { id: 'p99', nodes: 1, randomness: 0.99 }, { id: 'p97', nodes: 1, randomness: 0.97 }, { id: 'p95', nodes: 1, randomness: 0.95 },
  { id: 'p92', nodes: 1, randomness: 0.92 }, { id: 'p90', nodes: 1, randomness: 0.9 }, { id: 'p80', nodes: 1, randomness: 0.8 },
];
const SET = arg('set', 'main'); // 'low' measures the weakest settings, anchored to p90 = 1025 from the main run
const ANCHOR = SET === 'low' ? { id: 'p90', elo: 1025 } : { id: REF.id, elo: 2000 };
const ALL = SET === 'low' ? LOW : [...GRID, REF];
const cfg = (id) => ALL.find((c) => c.id === id);

if (process.argv.includes('--game')) {
  const [a, b, seed, aWhite] = [arg('a'), arg('b'), Number(arg('seed')), arg('white') === '1'];
  let x = (seed * 2654435761) % 4294967296 || 1;
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const OPEN = [[], ['e4'], ['d4'], ['e4', 'e5'], ['e4', 'c5'], ['d4', 'd5'], ['d4', 'Nf6'], ['Nf3'], ['c4'], ['e4', 'e6'], ['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4']];
  const g = new Chess();
  for (const m of OPEN[seed % OPEN.length]) g.move(m);
  const ca = cfg(a); const cb = cfg(b);
  const sfn = (fen, o) => search(fen, { depth: 40, multipv: o.multipv ?? 1, ...o });
  let plies = 0;
  while (!g.isGameOver() && !g.isDraw() && plies < 300) {
    const level = (g.turn() === 'w') === aWhite ? ca : cb;
    const uci = await chooseMove(sfn, g.fen(), level, rand, { sans: g.history() });
    g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    plies++;
  }
  let score = 0.5;
  if (g.isCheckmate()) { const loserIsWhite = g.turn() === 'w'; score = loserIsWhite === aWhite ? 0 : 1; }
  else if (!g.isDraw() && !g.isGameOver()) { // out of moves: adjudicate by material, so weak players that cannot mate still separate
    const V = { p: 1, n: 3, b: 3, r: 5, q: 9 }; let d = 0;
    for (const ch of g.fen().split(' ')[0]) { const v = V[ch.toLowerCase()]; if (v) d += ch === ch.toUpperCase() ? v : -v; }
    if (Math.abs(d) >= 3) { const whiteWins = d > 0; score = whiteWins === aWhite ? 1 : 0; }
  }
  console.log(`RESULT ${score}`);
  quit();
}

const games = Number(arg('games', 10)); const conc = Number(arg('conc', 8));
const pairs = [];
const LIST = SET === 'low' ? LOW : GRID;
for (let i = 0; i < LIST.length; i++) for (let j = i + 1; j <= Math.min(i + 3, LIST.length - 1); j++) pairs.push([LIST[i].id, LIST[j].id]);
if (SET !== 'low') for (let i = 9; i < GRID.length; i++) pairs.push([GRID[i].id, REF.id]); // the anchor plays everything that can score against it
const jobs = [];
for (const [a, b] of pairs) for (let k = 0; k < games; k++) jobs.push({ a, b, seed: k + 1, white: k % 2 });
const res = new Map(); let done = 0;
const run = (job) => new Promise((resolve) => {
  const c = spawn(process.execPath, [me, '--game', '--set', SET, '--a', job.a, '--b', job.b, '--seed', job.seed, '--white', job.white], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; });
  c.on('close', () => { const m = out.match(/RESULT ([\d.]+)/); if (m) { const k = `${job.a}|${job.b}`; res.set(k, [...(res.get(k) ?? []), Number(m[1])]); } if (++done % 20 === 0) console.log(`${done}/${jobs.length}`); resolve(); });
});
const q = [...jobs]; await Promise.all(Array.from({ length: conc }, async () => { while (q.length) await run(q.shift()); }));

// Bradley–Terry (logistic) fit by gradient steps; add a half-point draw to every pair so a 10–0 result stays finite
const ids = ALL.map((c) => c.id); const R = Object.fromEntries(ids.map((i) => [i, 0]));
const obs = [...res.entries()].map(([k, v]) => { const [a, b] = k.split('|'); return { a, b, n: v.length + 1, s: (v.reduce((x, y) => x + y, 0) + 0.5) }; });
for (let it = 0; it < 4000; it++) {
  const g = Object.fromEntries(ids.map((i) => [i, 0]));
  for (const o of obs) { const e = 1 / (1 + 10 ** ((R[o.b] - R[o.a]) / 400)); g[o.a] += o.s - o.n * e; g[o.b] -= o.s - o.n * e; }
  for (const i of ids) R[i] += 2 * g[i];
}
const shift = ANCHOR.elo - R[ANCHOR.id];
const table = ids.map((i) => ({ id: i, elo: Math.round(R[i] + shift), ...cfg(i) })).sort((x, y) => x.elo - y.elo);
console.log(`\nmeasured strength (Stockfish scale, anchor: ${ANCHOR.id} = ${ANCHOR.elo}):`);
for (const t of table) console.log(`${t.id.padEnd(8)} nodes ${String(t.nodes).padEnd(7)} random ${t.randomness ?? 0}  ->  ${t.elo}`);
mkdirSync('polish', { recursive: true });
writeFileSync(`polish/calibration-grid-${SET}.json`, JSON.stringify({ games, table, at: new Date().toISOString() }, null, 2));
