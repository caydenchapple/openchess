// Measures bot strengths on ONE scale: games between settings are appended to calibration/games.jsonl, and a Bradley–Terry fit
// (anchored so that Stockfish UCI_Elo 2000 at 60,000 nodes = 2000, the same anchor as calibrate-grid.mjs) turns them into Elo.
//
//   node scripts/calibrate-ladder.mjs play --chain "rnd;h:blunder=0.5;p90" --span 2 --games 20 --conc 9   # every pair within 2 steps of each other in the chain
//   node scripts/calibrate-ladder.mjs play --pairs "rnd|p90;p90|ref" --games 20
//   node scripts/calibrate-ladder.mjs fit [--boot 200]                               # table with 95% intervals
//   node scripts/calibrate-ladder.mjs fit --levels                                                      # also print the LEVELS of levels.js
//
// A candidate is an id string that encodes its settings:
//   ref                                  Stockfish at UCI_Elo 2000, 60,000 nodes (the anchor)
//   u<elo>                               Stockfish's own UCI_Elo limiter, e.g. u1320 (same 60,000 nodes as the anchor)
//   rnd | p<percent> | n<nodes>          random mover | engine at 1 node that plays a random move that % of the time | full-strength engine, node budget (n1, n300, n10k)
//   h:blunder=.5,grab=0,careful=0,miss=.5   beginner bot (levels.js beginnerMove), no engine
//   s:n=300,T=8,slip=0.02,hang=1,k=5     human-like bot (levels.js softmaxMove): nodes, temperature (win% points), slip chance (hang=1: the slip hangs material instead of a random move), multipv lines
//   L<id>                                a level of levels.js, by id
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendFileSync, readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { LEVELS, chooseMove } from '../client/src/levels.js';
import { search, quit } from './lessons/engine.mjs';

const me = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = new URL('../calibration/', import.meta.url).pathname;
const FILE = `${OUT}games.jsonl`;
const ANCHOR = { id: 'ref', elo: 2000 };

export function parseCand(id) {
  if (id === 'ref') return { nodes: 60_000, uciElo: 2000 };
  if ((id.match(/^u(\d+)$/))) return { nodes: 60_000, uciElo: Number(id.slice(1)) }; // Stockfish's own limiter at a lower Elo (same node budget as the anchor)
  if (id === 'rnd') return { nodes: 1, randomness: 1 };
  let m;
  if ((m = id.match(/^p(\d+)$/))) return { nodes: 1, randomness: Number(m[1]) / 100 };
  if ((m = id.match(/^n(\d+)(k?)$/))) return { nodes: Number(m[1]) * (m[2] ? 1000 : 1) };
  if ((m = id.match(/^L(\d+)$/))) return LEVELS.find((l) => l.id === Number(m[1]));
  if (id.startsWith('h:')) {
    const o = Object.fromEntries(id.slice(2).split(',').map((kv) => kv.split('=')));
    return { nodes: 1, style: 'beginner', blunder: Number(o.blunder ?? 0), grab: Number(o.grab ?? 0), careful: Number(o.careful ?? 0), missMate: Number(o.miss ?? 0.5) };
  }
  if (id.startsWith('s:')) {
    const o = Object.fromEntries(id.slice(2).split(',').map((kv) => kv.split('=')));
    return { nodes: Number(o.n ?? 300), temp: Number(o.T), slip: Number(o.slip ?? 0), hang: o.hang === '1', multipv: Number(o.k ?? 5) };
  }
  throw new Error(`unknown candidate ${id}`);
}

/** One canonical spelling per setting, so games that were played under different spellings (or as "L5") are pooled by the fit. */
export function canonId(id) {
  if (/^L\d+$/.test(id)) return specOf(parseCand(id));
  if (id.startsWith('h:') || id.startsWith('s:')) return specOf(parseCand(id));
  return id;
}
function specOf(l) {
  if (l.style === 'beginner') return `h:blunder=${l.blunder ?? 0},grab=${l.grab ?? 0},careful=${l.careful ?? 0},miss=${l.missMate ?? 0.5}`;
  if (l.temp) return `s:n=${l.nodes},T=${l.temp},slip=${l.slip ?? 0},hang=${l.hang ? 1 : 0},k=${l.multipv ?? 5}`;
  if (l.uciElo) return `u${l.uciElo}`;
  if (l.randomness === 1 && l.nodes === 1) return 'rnd';
  if (l.randomness && l.nodes === 1) return `p${Math.round(l.randomness * 100)}`;
  if (!l.randomness && !l.person) return `n${l.nodes}`;
  return `L:${l.name}`;
}
const OPEN = [[], ['e4'], ['d4'], ['e4', 'e5'], ['e4', 'c5'], ['d4', 'd5'], ['d4', 'Nf6'], ['Nf3'], ['c4'], ['e4', 'e6'], ['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4']];
const MATERIAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// ---- child mode: one game, prints "RESULT <score of a>"
if (process.argv.includes('--game')) {
  const [a, b, seed, aWhite] = [arg('a'), arg('b'), Number(arg('seed')), arg('white') === '1'];
  let x = (seed * 2654435761) % 4294967296 || 1;
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const g = new Chess();
  for (const m of OPEN[seed % OPEN.length]) g.move(m);
  const ca = parseCand(a); const cb = parseCand(b);
  const sfn = (fen, o) => search(fen, { depth: 40, multipv: o.multipv ?? 1, ...o });
  let plies = 0;
  while (!g.isGameOver() && !g.isDraw() && plies < 300) {
    const level = (g.turn() === 'w') === aWhite ? ca : cb;
    const uci = await chooseMove(sfn, g.fen(), level, rand, { sans: g.history() });
    g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    plies++;
  }
  let score = 0.5;
  if (g.isCheckmate()) score = (g.turn() === 'w') === aWhite ? 0 : 1;
  else if (!g.isDraw() && !g.isGameOver()) { // out of moves: adjudicate by material so that bots that cannot mate still separate
    let d = 0;
    for (const ch of g.fen().split(' ')[0]) { const v = MATERIAL[ch.toLowerCase()]; if (v) d += ch === ch.toUpperCase() ? v : -v; }
    if (Math.abs(d) >= 3) score = (d > 0) === aWhite ? 1 : 0;
  }
  console.log(`RESULT ${score} ${plies}`);
  quit();
}

// ---- play: spawn games, append to the jsonl
async function play() {
  const games = Number(arg('games', 20)); const conc = Number(arg('conc', 9));
  const pairs = [];
  if (arg('pairs')) for (const p of arg('pairs').split(';')) pairs.push(p.split('|'));
  if (arg('chain')) {
    const chain = arg('chain').split(';'); const span = Number(arg('span', 1));
    for (let i = 0; i < chain.length; i++) for (let j = i + 1; j <= Math.min(i + span, chain.length - 1); j++) pairs.push([chain[i], chain[j]]);
  }
  if (!pairs.length) throw new Error('nothing to play: pass --pairs or --chain');
  mkdirSync(OUT, { recursive: true });
  const seed0 = Number(arg('seed0', (Date.now() % 1_000_000) * 7));
  const jobs = [];
  pairs.forEach(([a, b], pi) => { for (let k = 0; k < games; k++) jobs.push({ a, b, seed: seed0 + pi * 1000 + k + 1, white: k % 2 }); });
  let done = 0;
  const run = (job) => new Promise((resolve) => {
    const c = spawn(process.execPath, [me, '--game', '--a', job.a, '--b', job.b, '--seed', job.seed, '--white', job.white], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => {
      const m = out.match(/RESULT ([\d.]+) (\d+)/);
      if (m) appendFileSync(FILE, `${JSON.stringify({ a: job.a, b: job.b, white: job.white, seed: job.seed, score: Number(m[1]), plies: Number(m[2]) })}\n`);
      if (++done % 25 === 0 || done === jobs.length) console.log(`${done}/${jobs.length} games`);
      resolve();
    });
  });
  const q = [...jobs];
  await Promise.all(Array.from({ length: conc }, async () => { while (q.length) await run(q.shift()); }));
}

// ---- fit: Bradley–Terry with bootstrap intervals
function loadGames() {
  if (!existsSync(FILE)) return [];
  return readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => { const g = JSON.parse(l); return { ...g, a: canonId(g.a), b: canonId(g.b) }; });
}
function pairTable(games) {
  const t = new Map();
  for (const g of games) {
    const k = `${g.a}|${g.b}`; const e = t.get(k) ?? { a: g.a, b: g.b, w: 0, d: 0, l: 0 };
    if (g.score === 1) e.w++; else if (g.score === 0) e.l++; else e.d++;
    t.set(k, e);
  }
  return [...t.values()];
}
const K = 400 / Math.LN10; // Elo per logit
function fitBT(pairs, ids) {
  const th = Object.fromEntries(ids.map((i) => [i, 0]));
  const obs = pairs.map((p) => ({ a: p.a, b: p.b, n: p.w + p.d + p.l + 1, s: p.w + p.d / 2 + 0.5 })); // half a draw each way: keeps a 20–0 result finite
  for (let it = 0; it < 300; it++) {
    const gr = Object.fromEntries(ids.map((i) => [i, 0])); const he = Object.fromEntries(ids.map((i) => [i, 1e-9]));
    for (const o of obs) {
      const e = 1 / (1 + Math.exp(th[o.b] - th[o.a])); const v = o.n * e * (1 - e);
      gr[o.a] += o.s - o.n * e; gr[o.b] -= o.s - o.n * e; he[o.a] += v; he[o.b] += v;
    }
    for (const i of ids) th[i] += 0.8 * gr[i] / he[i];
  }
  const sh = th[ANCHOR.id] ?? 0;
  return Object.fromEntries(ids.map((i) => [i, (th[i] - sh) * K + ANCHOR.elo]));
}
function fit() {
  const games = loadGames();
  const pairs = pairTable(games);
  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
  if (!ids.includes(ANCHOR.id)) throw new Error('no games involve the anchor "ref"');
  const base = fitBT(pairs, ids);
  const nBoot = Number(arg('boot', 200)); const samples = Object.fromEntries(ids.map((i) => [i, []]));
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let b = 0; b < nBoot; b++) {
    const bp = pairs.map((p) => {
      const n = p.w + p.d + p.l; let w = 0; let d = 0; let l = 0;
      for (let i = 0; i < n; i++) { const r = rnd() * n; if (r < p.w) w++; else if (r < p.w + p.d) d++; else l++; }
      return { a: p.a, b: p.b, w, d, l };
    });
    const f = fitBT(bp, ids); for (const i of ids) samples[i].push(f[i]);
  }
  const rows = ids.map((id) => {
    const s = samples[id].sort((x, y) => x - y);
    const n = pairs.filter((p) => p.a === id || p.b === id).reduce((t, p) => t + p.w + p.d + p.l, 0);
    return { id, elo: Math.round(base[id]), lo: Math.round(s[Math.floor(0.025 * s.length)]), hi: Math.round(s[Math.ceil(0.975 * s.length) - 1]), games: n };
  }).sort((x, y) => x.elo - y.elo);
  console.log(`${games.length} games, ${pairs.length} pairings; Elo on the Stockfish scale (ref = ${ANCHOR.elo}); 95% bootstrap interval`);
  const nameOf = (id) => { const l = LEVELS.find((v) => !v.person && v.group !== 'max' && canonId(`L${v.id}`) === id); return l ? `  = L${l.id} ${l.name} (label ${l.elo})` : ''; };
  for (const r of rows) console.log(`${r.id.padEnd(46)} ${String(r.elo).padStart(5)}  [${r.lo}, ${r.hi}]  (${r.games} games)${nameOf(r.id)}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}fit.json`, JSON.stringify({ at: new Date().toISOString(), games: games.length, rows }, null, 2));
}

const cmd = process.argv[2];
if (cmd === 'play') await play();
else if (cmd === 'fit') fit();
else if (!process.argv.includes('--game')) console.log('usage: calibrate-ladder.mjs play|fit (see the header of this file)');
