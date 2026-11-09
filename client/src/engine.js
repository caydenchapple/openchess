// Stockfish 19 (lite, single-threaded WASM) in a Web Worker. Everything runs in your browser.
import { scoreToCp } from './analysis-core.js';

const ENGINE_URL = '/vendor/stockfish/stockfish-19-lite-single.js';

/** Computer opponents. Below ~1300 we mix weak engine play with deliberate random moves. */
export const LEVELS = [
  { id: 1, name: 'Rookie', elo: 400, skill: 0, depth: 1, randomness: 0.5 },
  { id: 2, name: 'Casual', elo: 600, skill: 0, depth: 1, randomness: 0.3 },
  { id: 3, name: 'Learner', elo: 800, skill: 1, depth: 2, randomness: 0.18 },
  { id: 4, name: 'Student', elo: 1000, skill: 3, depth: 3, randomness: 0.08 },
  { id: 5, name: 'Improver', elo: 1200, skill: 6, depth: 5, randomness: 0.03 },
  { id: 6, name: 'Club', elo: 1400, uciElo: 1400 },
  { id: 7, name: 'Strong club', elo: 1600, uciElo: 1600 },
  { id: 8, name: 'Expert', elo: 1800, uciElo: 1800 },
  { id: 9, name: 'Candidate', elo: 2000, uciElo: 2000 },
  { id: 10, name: 'Master', elo: 2300, uciElo: 2300 },
  { id: 11, name: 'Grandmaster', elo: 2700, uciElo: 2700 },
  { id: 12, name: 'Max strength', elo: 3000, full: true },
];

export class Engine {
  constructor() {
    this.worker = null;
    this.booting = null;
    this.chain = Promise.resolve();
    this.onLine = null;
    this.opts = {};
  }

  boot() {
    this.booting ??= new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(ENGINE_URL); } catch (e) { reject(e); return; }
      this.worker = w;
      const fail = (e) => { this.booting = null; reject(new Error('Could not load the chess engine')); w.terminate(); this.worker = null; console.error(e); };
      w.onerror = fail;
      w.onmessage = (ev) => {
        const line = String(ev.data);
        if (line === 'uciok') this.#send('isready');
        else if (line === 'readyok') {
          w.onmessage = (e) => this.onLine?.(String(e.data));
          resolve();
        }
      };
      this.#send('uci');
    });
    return this.booting;
  }

  #send(cmd) { this.worker.postMessage(cmd); }

  async #setOpt(name, value) {
    if (this.opts[name] === value) return;
    this.opts[name] = value;
    this.#send(`setoption name ${name} value ${value}`);
  }

  /** Serialise engine jobs: one search at a time. */
  #enqueue(job) {
    const run = this.chain.then(() => this.boot()).then(job);
    this.chain = run.catch(() => {});
    return run;
  }

  newGame() {
    return this.#enqueue(async () => { this.#send('ucinewgame'); this.#send('isready'); await this.#waitFor((l) => l === 'readyok'); });
  }

  stop() { if (this.worker) this.#send('stop'); }

  #waitFor(pred) {
    return new Promise((resolve) => {
      const prev = this.onLine;
      this.onLine = (line) => { if (pred(line)) { this.onLine = prev; resolve(line); } else prev?.(line); };
    });
  }

  /**
   * Search a position. Scores are returned from WHITE's point of view.
   * @returns {Promise<{best:string|null, lines:{multipv:number,cp:number,mate:number|null,depth:number,pv:string[]}[]}>}
   */
  search(fen, { depth, movetime, multipv = 1, strength = null, onInfo } = {}) {
    return this.#enqueue(async () => {
      const black = fen.split(' ')[1] === 'b';
      await this.#setOpt('MultiPV', multipv);
      if (strength?.uciElo) {
        await this.#setOpt('UCI_LimitStrength', 'true');
        await this.#setOpt('UCI_Elo', strength.uciElo);
        await this.#setOpt('Skill Level', 20);
      } else if (strength?.skill != null) {
        await this.#setOpt('UCI_LimitStrength', 'false');
        await this.#setOpt('Skill Level', strength.skill);
      } else {
        await this.#setOpt('UCI_LimitStrength', 'false');
        await this.#setOpt('Skill Level', 20);
      }
      const lines = new Map();
      const done = new Promise((resolve) => {
        const prev = this.onLine;
        this.onLine = (line) => {
          if (line.startsWith('info ') && line.includes(' pv ') && line.includes(' score ')) {
            const t = line.split(' ');
            const g = (k) => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : null; };
            const si = t.indexOf('score');
            const kind = t[si + 1];
            const raw = Number(t[si + 2]);
            const mpv = Number(g('multipv') ?? 1);
            const stm = black ? -1 : 1;
            const entry = {
              multipv: mpv,
              depth: Number(g('depth')),
              cp: kind === 'cp' ? stm * raw : null,
              mate: kind === 'mate' ? stm * raw : null,
              pv: t.slice(t.indexOf('pv') + 1),
            };
            entry.cp = scoreToCp(kind === 'mate' ? { mate: entry.mate } : { cp: entry.cp });
            // ignore bound-only updates
            if (!line.includes(' lowerbound') && !line.includes(' upperbound')) {
              lines.set(mpv, entry);
              onInfo?.([...lines.values()].sort((a, b) => a.multipv - b.multipv));
            }
          } else if (line.startsWith('bestmove')) {
            this.onLine = prev;
            const m = line.split(' ')[1];
            resolve(!m || m === '(none)' ? null : m);
          } else prev?.(line);
        };
      });
      this.#send(`position fen ${fen}`);
      const go = ['go'];
      if (movetime) go.push('movetime', movetime);
      if (depth) go.push('depth', depth);
      if (!movetime && !depth) go.push('depth', 12);
      this.#send(go.join(' '));
      const best = await done;
      return { best, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) };
    });
  }

  /** A move for the computer opponent at the given level. */
  async playMove(fen, legalUci, level) {
    if (level.randomness && Math.random() < level.randomness) {
      return legalUci[Math.floor(Math.random() * legalUci.length)];
    }
    const strength = level.uciElo ? { uciElo: level.uciElo } : level.skill != null ? { skill: level.skill } : null;
    const opts = level.full
      ? { movetime: 1200 }
      : level.uciElo
        ? { movetime: 500 }
        : { depth: level.depth, movetime: 250 };
    const { best } = await this.search(fen, { ...opts, strength });
    return best;
  }

  terminate() { this.worker?.terminate(); this.worker = null; this.booting = null; }
}

export const engine = new Engine();
