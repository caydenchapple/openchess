// Decides when the floating 3D chess pieces run (see backdrop3d.js). Light enough to ship in the first download; the heavy part loads later.
import { get } from './store.js';

let inst = null; let loading = false; let want = false;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// the pieces are for the calm pages; while you play, review or work through a lesson they stay out of the way
const QUIET = ['game', 'review', 'train', 'join', 'rain'];

export function backdropWanted(key, params = []) {
  if (!get().settings.floatingPieces || calm()) return false;
  if (QUIET.includes(key)) return false;
  if (key === 'learn' && params.length) return false;
  return true;
}

export function syncBackdrop(key, params) {
  want = backdropWanted(key, params);
  if (!want) { inst?.stop(); return; }
  if (inst) { inst.start(); return; }
  if (loading) return;
  loading = true;
  // after the page has painted, so it never slows the first screen down
  setTimeout(() => {
    import('./backdrop3d.js').then((m) => {
      loading = false;
      try { const probe = document.createElement('canvas'); if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return; } catch { return; }
      inst = m.createBackdrop();
      if (!want) inst.stop();
    }).catch(() => { loading = false; });
  }, 500);
}
