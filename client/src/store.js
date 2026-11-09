// All player data lives in this browser's localStorage. No accounts, no server-side profiles.
import { uid } from './util.js';

const KEY = 'openchess.v1';
const MAX_GAMES = 150;

const defaults = () => ({
  player: { id: uid(16), name: `Guest${Math.floor(1000 + Math.random() * 9000)}` },
  ratings: {
    computer: { r: 1000, games: 0, history: [] },
    online: { r: 1000, games: 0, history: [] },
  },
  settings: { sound: true, theme: 'dark', autoReview: false },
  games: [], // newest first
  mistakes: [], // puzzles from your own blunders
});

let state;
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.player) {
      const d = defaults();
      return {
        ...d, ...raw,
        ratings: { ...d.ratings, ...raw.ratings },
        settings: { ...d.settings, ...raw.settings },
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
