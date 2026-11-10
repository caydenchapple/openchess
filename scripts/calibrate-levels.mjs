// Measures the computer levels by self-play, so the Elo labels are measured, not guessed.
//   node scripts/calibrate-levels.mjs                      # adjacent levels, 16 games each, writes polish/calibration.json
//   node scripts/calibrate-levels.mjs --games 30 --upto 11  # more games, only levels 1..11
// Each game is a separate process (Stockfish WASM is single-threaded) so several run at once.
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { LEVELS, chooseMove } from '../client/src/levels.js';
import { search, quit } from './lessons/engine.mjs';

const me = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };

// ---- child mode: play one game and print the result for the first player (1, .5 or 0)
if (process.argv.includes('--game')) {
  const [a, b, seed, aWhite] = [Number(arg('a')), Number(arg('b')), Number(arg('seed')), arg('white') === '1'];
  let x = seed * 2654435761 % 4294967296 || 1;
  const rand = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const OPEN = [[], ['e4'], ['d4'], ['e4', 'e5'], ['e4', 'c5'], ['d4', 'd5'], ['d4', 'Nf6'], ['Nf3'], ['c4'], ['e4', 'e6'], ['e4', 'e5', 'Nf3', 'Nc6'], ['d4', 'd5', 'c4']];
  const g = new Chess();
  for (const m of OPEN[seed % OPEN.length]) g.move(m);
  const la = LEVELS.find((l) => l.id === a); const lb = LEVELS.find((l) => l.id === b);
  const sfn = (fen, o) => search(fen, { depth: 40, multipv: o.multipv ?? 1, ...o });
  let plies = 0;
  while (!g.isGameOver() && !g.isDraw() && plies < 220) {
    const whiteToMove = g.turn() === 'w';
    const level = whiteToMove === aWhite ? la : lb;
    const uci = await chooseMove(sfn, g.fen(), level, rand, { sans: g.history() });
    g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    plies++;
  }
  let score = 0.5;
  if (g.isCheckmate()) { const loserIsWhite = g.turn() === 'w'; score = loserIsWhite === aWhite ? 0 : 1; }
  console.log(`RESULT ${score}`);
  quit();
}

// ---- parent mode
const games = Number(arg('games', 16)); const upto = Number(arg('upto', 11)); const conc = Number(arg('conc', 4));
const ids = LEVELS.filter((l) => l.id <= upto).map((l) => l.id);
const jobs = [];
for (let i = 0; i + 1 < ids.length; i++) for (let k = 0; k < games; k++) jobs.push({ a: ids[i], b: ids[i + 1], seed: k + 1, white: k % 2 === 0 ? 1 : 0 });

const results = new Map(); // "a-b" -> scores of the LOWER level a
let done = 0;
function run(job) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [me, '--game', '--a', job.a, '--b', job.b, '--seed', job.seed, '--white', job.white], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', () => {
      const m = out.match(/RESULT ([\d.]+)/);
      const k = `${job.a}-${job.b}`;
      if (m) { results.set(k, [...(results.get(k) ?? []), Number(m[1])]); }
      done++; if (done % 10 === 0) console.log(`${done}/${jobs.length} games`);
      resolve();
    });
  });
}
const queue = [...jobs];
await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await run(queue.shift()); }));

const elo = (s) => 400 * Math.log10(Math.min(0.97, Math.max(0.03, s)) / (1 - Math.min(0.97, Math.max(0.03, s))));
const rows = [];
for (let i = 0; i + 1 < ids.length; i++) {
  const sc = results.get(`${ids[i]}-${ids[i + 1]}`) ?? [];
  const s = sc.reduce((x, y) => x + y, 0) / (sc.length || 1);
  rows.push({ lower: ids[i], upper: ids[i + 1], games: sc.length, scoreOfLower: Number(s.toFixed(3)), gap: Math.round(-elo(s)) });
}
console.log('\nlevel gaps (Elo points the upper level is stronger than the lower):');
for (const r of rows) {
  const lo = LEVELS.find((l) => l.id === r.lower); const up = LEVELS.find((l) => l.id === r.upper);
  console.log(`${lo.name} (${lo.elo}) → ${up.name} (${up.elo}): measured +${r.gap}, nominal +${up.elo - lo.elo}  [${r.games} games, lower scored ${r.scoreOfLower}]`);
}
mkdirSync('polish', { recursive: true });
writeFileSync('polish/calibration.json', JSON.stringify({ games, rows, at: new Date().toISOString() }, null, 2));
