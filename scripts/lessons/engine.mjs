// Stockfish 19 (lite, single-threaded WASM) in Node, for checking lesson exercises. Scores are from WHITE's point of view.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let sf; let listener = null;
function boot() {
  if (sf) return sf;
  sf = require('stockfish')('lite-single', (line) => listener?.(String(line)));
  sf.processCommand('uci');
  return sf;
}

const queue = [];
let running = false;
async function pump() {
  if (running) return; running = true;
  while (queue.length) { const job = queue.shift(); await job(); }
  running = false;
}

/** @returns {Promise<{best:string|null, lines:{multipv:number,depth:number,cp:number,mate:number|null,pv:string[]}[]}>} */
export function search(fen, { depth = 16, multipv = 3, searchmoves = null } = {}) {
  return new Promise((resolve) => {
    queue.push(() => new Promise((done) => {
      const e = boot();
      const black = fen.split(' ')[1] === 'b';
      const lines = new Map();
      listener = (line) => {
        if (line.startsWith('info ') && line.includes(' pv ') && line.includes(' score ') && !/(lower|upper)bound/.test(line)) {
          const t = line.split(' ');
          const g = (k) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : null; };
          const si = t.indexOf('score'); const kind = t[si + 1]; const raw = Number(t[si + 2]);
          const stm = black ? -1 : 1;
          const mate = kind === 'mate' ? stm * raw : null;
          const cp = kind === 'mate' ? (mate > 0 ? 1 : -1) * (10000 - Math.abs(mate) * 10) : stm * raw;
          lines.set(Number(g('multipv') ?? 1), { multipv: Number(g('multipv') ?? 1), depth: Number(g('depth')), cp, mate, pv: t.slice(t.indexOf('pv') + 1) });
        } else if (line.startsWith('bestmove')) {
          listener = null;
          const m = line.split(' ')[1];
          resolve({ best: !m || m === '(none)' ? null : m, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) });
          done();
        }
      };
      e.processCommand('ucinewgame');
      e.processCommand(`setoption name MultiPV value ${multipv}`);
      e.processCommand(`position fen ${fen}`);
      e.processCommand(`go depth ${depth}${searchmoves ? ` searchmoves ${searchmoves.join(' ')}` : ''}`);
    }));
    pump();
  });
}

export function quit(code = 0) { try { sf?.terminate?.(); } catch { /* ignore */ } process.exit(code); }
