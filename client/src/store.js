// All player data lives in this browser's localStorage. No accounts, no server-side profiles.
import { uid } from './util.js';
import { emptyLearn } from './lessons-logic.js';

const KEY = 'openchess.v1';
export const START_RATING = 100; // everyone starts at the bottom and works up
const MAX_GAMES = 150;

const defaults = () => ({
  player: { id: uid(16), name: `Guest${Math.floor(1000 + Math.random() * 9000)}`, avatar: null }, // avatar: null = the default picture; see avatars.js
  ratings: {
    computer: { r: START_RATING, games: 0, history: [] },
    online: { r: START_RATING, games: 0, history: [] },
  },
  ladder: { beaten: {} }, // computer opponents you have beaten (by level id); opens the next one up
  settings: { sound: true, theme: 'dark', autoReview: false, board: 'green', unlockAll: false, floatingPieces: true },
  games: [], // newest first
  mistakes: [], // puzzles from your own blunders
  learn: emptyLearn(), // lesson progress, spaced-repetition boxes and the daily streak
  teach: { progress: null, tips: {} }, // tutorial kit state: which steps and tips were already shown
  arcade: { best: { w: 0, b: 0 }, plays: 0, color: 'w' }, // Piece Rain: best score per colour
  friends: { on: false, code: null, key: null, list: [] }, // friend code + secret (made when you first open Friends); list: { code, name, av, state: 'friend' | 'sent', added }
});

let state;
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.player) {
      const d = defaults();
      // older saves started at 1000: if you had not played a rated game yet, start from the bottom like everyone else
      for (const k of ['computer', 'online']) if (raw.ratings?.[k] && raw.ratings[k].games === 0 && raw.ratings[k].r === 1000) raw.ratings[k] = { ...raw.ratings[k], r: START_RATING };
      // beaten opponents, remembered from the games you already played
      const beaten = { ...(raw.ladder?.beaten ?? {}) };
      for (const g of raw.games ?? []) if (g.mode === 'computer' && g.outcome === 'win' && g.rated && g.opponent?.level) beaten[g.opponent.level] = true;
      return {
        ...d, ...raw,
        ladder: { beaten },
        ratings: { ...d.ratings, ...raw.ratings },
        learn: { ...d.learn, ...(raw.learn ?? {}), streak: { ...d.learn.streak, ...(raw.learn?.streak ?? {}) } }, // older saves had a different shape
        settings: { ...d.settings, ...raw.settings },
        arcade: { ...d.arcade, ...(raw.arcade ?? {}), best: { ...d.arcade.best, ...(raw.arcade?.best ?? {}) } },
        friends: { ...d.friends, ...(raw.friends ?? {}), list: Array.isArray(raw.friends?.list) ? raw.friends.list : [] },
      };
    }
  } catch { /* corrupt or unavailable storage */ }
  return defaults();
}
state = load();

const listeners = new Set();
export const get = () => state;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode / quota */ }
  listeners.forEach((f) => f(state));
}
export const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

export function setName(name) {
  state.player.name = String(name).replace(/[<>&"'`]/g, '').trim().slice(0, 20) || state.player.name;
  save();
}
export function setSetting(k, v) { state.settings[k] = v; save(); }
export function setAvatar(avatar) { state.player.avatar = avatar; save(); }

/** Piece Rain: remember the colour you chose and your best score with it. Returns true when it is a new best. */
export function recordArcade(color, score) {
  const a = state.arcade; a.plays += 1; a.color = color;
  const isBest = score > (a.best[color] ?? 0);
  if (isBest) a.best[color] = score;
  save(); return isBest;
}

// ---- friends (see social.js). The code is public, the key is the secret that proves it is yours.
const FRIEND_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newFriendCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => FRIEND_ALPHABET[b % FRIEND_ALPHABET.length]).join('');
export function friendIdentity({ fresh = false } = {}) {
  const f = state.friends;
  if (fresh || !f.code || !f.key) { f.code = newFriendCode(); f.key = uid(32); }
  if (!f.on) f.on = true;
  save();
  return { code: f.code, key: f.key };
}
export const friendList = () => state.friends.list;
export function setFriend(entry) {
  const list = state.friends.list; const i = list.findIndex((x) => x.code === entry.code);
  if (i >= 0) list[i] = { ...list[i], ...entry }; else list.push({ added: Date.now(), name: `Friend ${entry.code.slice(0, 4)}`, av: null, state: 'friend', ...entry });
  save();
}
export function dropFriend(code) { state.friends.list = state.friends.list.filter((x) => x.code !== code); save(); }

export function addGame(g) {
  state.games.unshift(g);
  if (state.games.length > MAX_GAMES) state.games.length = MAX_GAMES;
  save();
}
export function updateGame(id, patch) {
  const g = state.games.find((x) => x.id === id);
  if (g) { Object.assign(g, patch); save(); }
  return g;
}
export const findGame = (id) => state.games.find((x) => x.id === id);

export function addMistakes(list) {
  const seen = new Set(state.mistakes.map((m) => m.fen));
  for (const m of list) if (!seen.has(m.fen)) state.mistakes.unshift(m);
  if (state.mistakes.length > 200) state.mistakes.length = 200;
  save();
}
export function updateMistake(fen, patch) {
  const m = state.mistakes.find((x) => x.fen === fen);
  if (m) { Object.assign(m, patch); save(); }
}

export function exportData() { return JSON.stringify(state); }
export function importData(text) {
  const raw = JSON.parse(text);
  if (!raw?.player?.id || !Array.isArray(raw.games)) throw new Error('Not an OpenChess export');
  state = { ...defaults(), ...raw };
  save();
}
export function wipe() { state = defaults(); save(); }
