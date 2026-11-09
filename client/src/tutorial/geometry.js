// Boxes and the one hard layout problem of a coach: a speech bubble that must never cover what it points at.
// Pure functions on plain { x, y, w, h } boxes in viewport pixels, so they test in Node with no browser.

const EPS = 1e-6;

/** Turn what a step points at into a plain box, or null when it is gone, hidden or empty.
 *  Accepts a function returning any of the rest, an Element, a CSS selector, { x, y, w, h }, { left, top, width, height },
 *  or a bare point { x, y } (a world marker or a drop spot: its box has size 0). */
export function rectOf(thing) {
  let t = thing;
  if (typeof t === 'function') { try { t = t(); } catch { return null; } }
  if (!t) return null;
  if (typeof t === 'string') {
    if (typeof document === 'undefined') return null;
    try { t = document.querySelector(t); } catch { return null; }
    if (!t) return null;
  }
  if (typeof t.getBoundingClientRect === 'function') {
    const r = t.getBoundingClientRect();
    if (!(r.width > 0 || r.height > 0)) return null;   // display:none, detached, or collapsed
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  if (Number.isFinite(t.left) && Number.isFinite(t.top)) return { x: t.left, y: t.top, w: t.width || 0, h: t.height || 0 };
  if (Number.isFinite(t.x) && Number.isFinite(t.y)) return { x: t.x, y: t.y, w: t.w || 0, h: t.h || 0 };
  return null;
}

/** Area where two boxes overlap; boxes that only touch overlap by 0. */
export function overlapArea(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > EPS && oy > EPS ? ox * oy : 0;
}

export const inflate = (b, pad) => ({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });
export const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** A box at least `min` wide and tall around the same center: a point target (a world marker, a drop spot) still has to be kept clear. */
export function atLeast(b, min) {
  if (b.w >= min && b.h >= min) return b;
  const c = centerOf(b);
  const w = Math.max(b.w, min), h = Math.max(b.h, min);
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/** True when the box lies inside the viewport (fully, or at least `share` of its area when share < 1). */
export function onScreen(b, viewport, share = 1) {
  if (!b) return false;
  if (b.w === 0 || b.h === 0) return b.x >= 0 && b.y >= 0 && b.x <= viewport.w && b.y <= viewport.h;
  return overlapArea(b, { x: 0, y: 0, w: viewport.w, h: viewport.h }) >= b.w * b.h * share - EPS;
}

/**
 * Where to put a bubble of `size` so it covers none of the `avoid` boxes (the target, the spot, anything else the player must see).
 * Candidates sit flush against the viewport margins and against every avoided box, which is where a free placement can always slide to,
 * so if any free placement exists this finds one. Among the free ones it prefers clearance of `gap` px, then the one nearest the ideal spot:
 * above the anchor (`prefer: 'near'`) or at the screen edge farthest from it (`prefer: 'edges'`, for upright phones where the middle is the field).
 * Returns { x, y, covered, side }: `covered` is true only when the bubble is too big to avoid them (shorten the text).
 */
export function placeBubble({ viewport, size, avoid = [], anchor = null, margin = 8, gap = 14, prefer = 'near' }) {
  const w = Math.min(size.w, viewport.w - 2 * margin), h = Math.min(size.h, viewport.h - 2 * margin);
  const minX = margin, minY = margin;
  const maxX = Math.max(margin, viewport.w - margin - w), maxY = Math.max(margin, viewport.h - margin - h);
  const clampX = (x) => Math.min(maxX, Math.max(minX, x)), clampY = (y) => Math.min(maxY, Math.max(minY, y));
  const a = anchor ?? { x: viewport.w / 2, y: viewport.h / 2, w: 0, h: 0 };
  const ac = centerOf(a);

  let ideal;   // the bubble's top-left corner we would like
  if (prefer === 'edges') {
    ideal = { x: clampX(viewport.w / 2 - w / 2), y: ac.y > viewport.h / 2 ? minY : maxY };
  } else {
    const above = a.y - gap - h >= minY;
    ideal = { x: clampX(ac.x - w / 2), y: above ? a.y - gap - h : clampY(a.y + a.h + gap) };
  }

  const xs = new Set([minX, maxX, ideal.x]), ys = new Set([minY, maxY, ideal.y]);
  for (const o of avoid) for (const g of [0, gap]) {
    xs.add(o.x + o.w + g); xs.add(o.x - g - w);
    ys.add(o.y + o.h + g); ys.add(o.y - g - h);
  }
  let best = null;
  for (const x of xs) for (const y of ys) {
    if (x < minX - EPS || x > maxX + EPS || y < minY - EPS || y > maxY + EPS) continue;
    const b = { x, y, w, h };
    let hard = 0, soft = 0;
    for (const o of avoid) { hard += overlapArea(b, o); soft += overlapArea(b, inflate(o, gap)); }
    const dist = Math.hypot(x - ideal.x, y - ideal.y);
    const better = !best || hard < best.hard - EPS ||
      (Math.abs(hard - best.hard) <= EPS && (soft < best.soft - EPS || (Math.abs(soft - best.soft) <= EPS && dist < best.dist - EPS)));
    if (better) best = { x, y, hard, soft, dist };
  }
  const side = best.y + h <= a.y + EPS ? 'above' : best.y >= a.y + a.h - EPS ? 'below' : best.x + w <= a.x + EPS ? 'left' : best.x >= a.x + a.w - EPS ? 'right' : 'over';
  return { x: best.x, y: best.y, w, h, covered: best.hard > EPS, side };
}

/**
 * Where an off-screen target is, as a point near the screen edge plus the angle to point at it (radians, 0 = right). null when the target is at
 * the exact center. The arrow of the coach sits there, `margin` px in from the edge, so it is always fully visible.
 */
export function edgeIndicator(box, viewport, margin = 28) {
  const c = centerOf(box), cx = viewport.w / 2, cy = viewport.h / 2;
  const dx = c.x - cx, dy = c.y - cy;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return null;
  const sx = Math.abs(dx) < EPS ? Infinity : ((dx > 0 ? viewport.w - margin : margin) - cx) / dx;
  const sy = Math.abs(dy) < EPS ? Infinity : ((dy > 0 ? viewport.h - margin : margin) - cy) / dy;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}

/**
 * Normalised device coordinates (what three.js's `vector.project(camera)` returns) to screen pixels. A point behind the camera comes back with
 * mirrored x and y (and, on a default camera, z > 1); it is mirrored back through the center so an edge arrow still points the right way, and
 * pushed past the screen edge so it can never look like it is in view. `behind` says it happened.
 * The z > 1 test is the default. With three.js `reversedDepth: true` (r180 and later) it no longer holds: pass `{ behind }` yourself, from the
 * sign of the point's eye-space z (`v.clone().applyMatrix4(camera.matrixWorldInverse).z > 0` means behind).
 */
export function ndcToScreen(ndc, viewport, opts = {}) {
  const behind = opts.behind ?? ndc.z > 1;
  let x = behind ? -ndc.x : ndc.x, y = behind ? -ndc.y : ndc.y;
  if (behind) {
    // Mirrored back, a point right behind the camera sits near the center: push it out past the screen edge so the arrow engages (straight behind: down).
    const len = Math.hypot(x, y);
    if (len < 1e-6) { x = 0; y = -1.5; } else if (len < 1.5) { x *= 1.5 / len; y *= 1.5 / len; }
  }
  return { x: (x * 0.5 + 0.5) * viewport.w, y: (-y * 0.5 + 0.5) * viewport.h, behind };
}
