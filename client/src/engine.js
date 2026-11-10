// Stockfish 19 (lite, single-threaded WASM) in a Web Worker. Everything runs in your browser.
import { scoreToCp } from './analysis-core.js';
import { chooseMove } from './levels.js';

const ENGINE_URL = '/vendor/stockfish/stockfish-19-lite-single.js';

export { LEVELS, GROUPS } from './levels.js';

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
  search(fen, { depth, movetime, nodes, multipv = 1, strength = null, onInfo } = {}) {
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
      if (nodes) go.push('nodes', nodes);
      if (!movetime && !depth && !nodes) go.push('depth', 12);
      this.#send(go.join(' '));
      const best = await done;
      return { best, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) };
    });
  }

  /** A move for the computer opponent at the given level (see levels.js: strength is set by a node budget, not by time). */
  playMove(fen, level, sans = []) { return chooseMove((f, o) => this.search(f, o), fen, level, Math.random, { sans }); }

  terminate() { this.worker?.terminate(); this.worker = null; this.booting = null; }
}

export const engine = new Engine();
