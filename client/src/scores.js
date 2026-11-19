// Piece Rain leaderboard client. The server is the same one that runs online games (see server/scores.js).
import { serverBase } from './net.js';
import { get } from './store.js';
import { DEFAULT_AVATAR } from './avatars.js';

const base = () => serverBase().replace(/^ws/, 'http');
const call = async (path, body) => {
  const res = await fetch(`${base()}/scores${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(7000),
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'The leaderboard is not available right now.');
  return json;
};

/** Ask for a signed start token when a run begins (null when the server cannot be reached). */
export async function startRun() { try { return (await call('/start', {})).token; } catch { return null; } }

export async function submitRun({ token, score, color }) {
  const { player } = get();
  const a = player.avatar ?? DEFAULT_AVATAR; const av = a.kind === 'preset' ? a.id : null;
  return call('/submit', { token, score, color, name: player.name, av, pid: player.id });
}

export const topScores = (range) => call(`/top?range=${range === 'day' ? 'day' : 'all'}`);

/** How this browser shows up on the board (a hash of its player id), to highlight your own row. */
export async function myKey() {
  const bytes = new TextEncoder().encode(`openchess-scores:${get().player.id.slice(0, 64)}`);
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
