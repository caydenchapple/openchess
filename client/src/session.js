// Hand-off between the setup screen and the game screen, plus resume support.
export const session = { cfg: null };

const ACTIVE = 'openchess.active';
export function saveActive(data) {
  try { localStorage.setItem(ACTIVE, JSON.stringify(data)); } catch { /* ignore */ }
}
export function loadActive() {
  try { return JSON.parse(localStorage.getItem(ACTIVE)); } catch { return null; }
}
export function clearActive() {
  try { localStorage.removeItem(ACTIVE); } catch { /* ignore */ }
}

export const TC_LABEL = (time, inc) => (time ? `${time}+${inc}` : 'Untimed');
export const TC_NAME = (time) => (time === 0 ? 'Untimed' : time < 3 ? 'Bullet' : time < 10 ? 'Blitz' : time < 30 ? 'Rapid' : 'Classical');
