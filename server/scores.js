// Leaderboard for the Piece Rain mini game. No accounts: a score is a name, a picture, a colour and a number.
// A run starts by asking for a signed start token; the score is only accepted if it is possible in the time that has passed.
// Runs unchanged in the Node server (kept in memory, optionally in a file) and in a Cloudflare Durable Object.
import { cleanName } from './game.js';
import { cleanAv } from './friends.js';

export const MAX_RATE = 3.1; // pieces per second at the very fastest the game ever spawns them
export const TOKEN_TTL_MS = 30 * 60_000;
const KEEP = 100; // entries kept per board
const SHOW = 50; // entries returned
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (text) => hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
export const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

async function hmac(secret, text) {
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

export const emptyBoards = () => ({ secret: null, all: [], day: { date: '', list: [] } });

/**
 * data  — { secret, all: [entry], day: { date, list: [entry] } }, entry = { k, name, av, score, color, at }
 * save  — (data) => saves it
 */
export class Scores {
  constructor(data, { save = () => {}, now = () => Date.now() } = {}) {
    this.data = { ...emptyBoards(), ...data }; this.persist = save; this.now = now; this.used = new Set();
  }

  async #secret() {
    if (!this.data.secret) { this.data.secret = hex(globalThis.crypto.getRandomValues(new Uint8Array(24))); await this.persist(this.data); }
    return this.data.secret;
  }

  async start() {
    const t = String(this.now());
    return { token: `${t}.${await hmac(await this.#secret(), t)}` };
  }

  /** body: { token, score, color, name, av, pid }. Returns { ok, rank, best, dayRank } or { error }. */
  async submit(body) {
    const [t, sig] = String(body?.token ?? '').split('.');
    if (!t || !sig || sig !== await hmac(await this.#secret(), t)) return { error: 'This run could not be checked. Play again to post a score.' };
    if (this.used.has(body.token)) return { error: 'That run was already posted.' };
    const started = Number(t); const elapsed = (this.now() - started) / 1000;
    if (!(elapsed >= 0) || elapsed * 1000 > TOKEN_TTL_MS) return { error: 'That run took too long to post. Play again.' };
    const score = Math.floor(Number(body.score));
    if (!Number.isFinite(score) || score < 0 || score > 100_000) return { error: 'That score does not look right.' };
    if (score > elapsed * MAX_RATE + 3) return { error: 'That score is not possible in that time.' };
    this.used.add(body.token); if (this.used.size > 500) this.used.delete(this.used.values().next().value);
    if (score < 1) return { ok: true, rank: null, best: false };

    const entry = {
      k: (await sha(`openchess-scores:${String(body.pid ?? '').slice(0, 64)}`)).slice(0, 12),
      name: cleanName(body.name), av: cleanAv(body.av), score, color: body.color === 'b' ? 'b' : 'w', at: this.now(),
    };
    const today = dayOf(this.now());
    if (this.data.day.date !== today) this.data.day = { date: today, list: [] };
    const a = place(this.data.all, entry); const d = place(this.data.day.list, entry);
    await this.persist(this.data);
    return { ok: true, rank: a.rank, dayRank: d.rank, best: a.improved, dayBest: d.improved };
  }

  top(range) {
    const today = dayOf(this.now());
    const list = range === 'day' ? (this.data.day.date === today ? this.data.day.list : []) : this.data.all;
    return { range: range === 'day' ? 'day' : 'all', entries: list.slice(0, SHOW).map(({ k, name, av, score, color, at }) => ({ k, name, av, score, color, at })) };
  }
}

/** Keep one best entry per player, sorted high to low (earlier wins a tie). Returns { rank, improved } (rank is 1-based, or null). */
function place(list, entry) {
  const i = list.findIndex((e) => e.k === entry.k);
  let improved = false;
  if (i >= 0) {
    if (entry.score > list[i].score) { list.splice(i, 1); list.push(entry); improved = true; }
    else { list[i].name = entry.name; list[i].av = entry.av; } // a rename shows up even without a new best
  } else { list.push(entry); improved = true; }
  list.sort((x, y) => y.score - x.score || x.at - y.at);
  if (list.length > KEEP) list.length = KEEP;
  const rank = list.findIndex((e) => e.k === entry.k) + 1;
  return { rank: rank || null, improved };
}

/** The same three routes for Node and Cloudflare. `path` is the part after /scores. Returns { status, json }. */
export async function routeScores(scores, method, path, query, body) {
  if (method === 'GET' && path === '/top') return { status: 200, json: scores.top(query.get('range')) };
  if (method === 'POST' && path === '/start') return { status: 200, json: await scores.start() };
  if (method === 'POST' && path === '/submit') {
    const r = await scores.submit(body);
    return { status: r.error ? 400 : 200, json: r };
  }
  return { status: 404, json: { error: 'Not found' } };
}
