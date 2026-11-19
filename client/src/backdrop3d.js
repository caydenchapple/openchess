// The living background: a steady rain of 3D chess pieces that fall past the page, bounce off the side edges and tumble out of the bottom while new ones drop in from the top.
// You can pick one up with the mouse (or a finger), drag it and throw it. Pieces behind a card, a button or a link are not touched,
// so the page works exactly as before. Loaded on demand with three.js; it switches itself off for reduced motion.
import { WebGLRenderer, Scene, PerspectiveCamera, Group, HemisphereLight, DirectionalLight, MathUtils } from 'three';
import { makePiece, disposeGroup } from './pieces3d.js';

const TYPES = ['k', 'q', 'r', 'b', 'n', 'p', 'p', 'n', 'b', 'r', 'q', 'p', 'n', 'b', 'r', 'k', 'p', 'p'];
const HEIGHT = { p: 0.75, r: 0.9, n: 0.95, b: 1.2, q: 1.4, k: 1.55 };
const COLORS = ['w', 'w', 'w', 0x5c5a54, 0x5c5a54, 0x84c24f, 0x84c24f, 0xe0b350]; // the dark ones are charcoal so they show on a dark page
const GRAVITY = 6; const WALL_BOUNCE = 0.8; const AIR = 0.12; const FALL_MAX = 6.5; // no floor: pieces keep falling, at most this fast (world units per second)
const CAM_Z = 26; const FOV = 35;

/** True when nothing opaque (a card, button, link, image, the header...) sits between this element and the page background. */
function seeThrough(el) {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    if (n.matches('a, button, input, select, textarea, label, summary, canvas, cg-board, img, video, svg, [contenteditable]')) return false;
    const cs = getComputedStyle(n);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') return false;
    if (cs.backgroundImage !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none')) return false;
  }
  return true;
}

export function createBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.className = 'backdrop'; canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100); camera.position.set(0, 0, CAM_Z);
  scene.add(new HemisphereLight(0xffffff, 0x4a4a4a, 1.5));
  const key = new DirectionalLight(0xfff2dc, 2.4); key.position.set(-6, 9, 12); scene.add(key);
  const rim = new DirectionalLight(0x9ecbff, 1.1); rim.position.set(8, -3, -6); scene.add(rim);

  let halfW = 8; let halfH = 8; let S = 1.15; let width = 0;
  const bits = []; // { pv, x, y, vx, vy, r, rot, spin, yaw, yawSpin, grabbed }
  const maxBits = () => (innerWidth < 700 ? 9 : 16); // how many are in the air at once

  const resize = () => {
    const w = innerWidth; const h = innerHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    halfH = Math.tan(MathUtils.degToRad(FOV / 2)) * CAM_Z; halfW = halfH * camera.aspect; width = w;
    S = innerWidth < 700 ? 1.0 : 1.2;
  };
  resize(); addEventListener('resize', resize);

  function spawn(fromAbove = true) {
    const type = TYPES[(Math.random() * TYPES.length) | 0];
    const color = COLORS[(Math.random() * COLORS.length) | 0];
    const obj = makePiece(type, color);
    const h = HEIGHT[type] * S;
    obj.scale.setScalar(S); obj.position.y = -h / 2;
    const pv = new Group(); pv.add(obj); scene.add(pv);
    const b = {
      pv, type, x: (Math.random() * 2 - 1) * (halfW - 1.5), y: fromAbove ? halfH + 1.5 + Math.random() * 2 : (Math.random() * 2 - 1) * halfH * 0.6,
      vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 2, r: 0.62 * S, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 3,
      yaw: Math.random() * 6, yawSpin: (Math.random() - 0.5) * 1.2, grabbed: false,
    };
    bits.push(b); return b;
  }

  let nextSpawn = 0; let nextKick = 0; let primed = false;
  let last = performance.now(); let raf = 0; let running = false; let drag = null;

  function step(dt) {
    const now = performance.now();
    if (!primed) { // the first screen is already full: pieces mid-fall at every height
      primed = true;
      for (let i = 0; i < maxBits() * 0.6; i++) { const b = spawn(false); b.y = halfH - Math.random() * halfH * 2; b.vy = -Math.random() * FALL_MAX; }
    }
    // a new piece drops in from the top whenever there are fewer than the target, so the rain never thins out
    if (bits.length < maxBits() && now > nextSpawn) { spawn(); nextSpawn = now + 260 + Math.random() * 380; }
    if (now > nextKick && bits.length > 3) { // every few seconds one piece hops up and spins, so the screen never goes still
      const b = bits[(Math.random() * bits.length) | 0];
      if (!b.grabbed) { b.vy = 5 + Math.random() * 5; b.vx += (Math.random() - 0.5) * 6; b.spin += (Math.random() - 0.5) * 6; }
      nextKick = now + 1400 + Math.random() * 2600;
    }
    for (const b of bits) {
      if (b.grabbed) {
        const tx = drag.tx; const ty = drag.ty;
        b.vx = MathUtils.clamp((tx - b.x) * 22, -45, 45); b.vy = MathUtils.clamp((ty - b.y) * 22, -45, 45);
        b.x += b.vx * dt; b.y += b.vy * dt; b.spin *= 0.9; continue;
      }
      b.vy = Math.max(-FALL_MAX, b.vy - GRAVITY * dt); const damp = 1 - AIR * dt; b.vx *= damp; b.vy *= damp;      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -halfW + b.r) { b.x = -halfW + b.r; b.vx = Math.abs(b.vx) * WALL_BOUNCE; b.spin += b.vy * 0.05; }
      if (b.x > halfW - b.r) { b.x = halfW - b.r; b.vx = -Math.abs(b.vx) * WALL_BOUNCE; b.spin -= b.vy * 0.05; }
      if (b.y > halfH + 12) { b.y = halfH + 12; b.vy = -Math.abs(b.vy); }
    }
    // pieces that have fallen out of sight are removed (their slot is refilled from the top above)
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      if (!b.grabbed && b.y < -halfH - 2.5) { scene.remove(b.pv); disposeGroup(b.pv); bits.splice(i, 1); }
    }
    // pieces bump into each other
    for (let i = 0; i < bits.length; i++) for (let j = i + 1; j < bits.length; j++) {
      const a = bits[i]; const c = bits[j];
      const dx = c.x - a.x; const dy = c.y - a.y; const min = a.r + c.r; const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2); const nx = dx / d; const ny = dy / d; const push = min - d;
      const wa = a.grabbed ? 0 : c.grabbed ? 1 : 0.5; const wc = c.grabbed ? 0 : a.grabbed ? 1 : 0.5;
      a.x -= nx * push * wa; a.y -= ny * push * wa; c.x += nx * push * wc; c.y += ny * push * wc;
      const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rv < 0) {
        const imp = -(1 + 0.7) * rv; // elastic-ish
        if (!a.grabbed) { a.vx -= nx * imp * wa; a.vy -= ny * imp * wa; a.spin -= rv * 0.3; }
        if (!c.grabbed) { c.vx += nx * imp * wc; c.vy += ny * imp * wc; c.spin += rv * 0.3; }
      }
    }
    for (const b of bits) {
      b.spin = MathUtils.clamp(b.spin * (1 - 0.35 * dt), -9, 9);
      b.rot += b.spin * dt; b.yaw += b.yawSpin * dt;
      b.pv.position.set(b.x, b.y, b.grabbed ? 3 : 0);
      b.pv.rotation.set(Math.sin(b.yaw) * 0.35, b.yaw, b.rot);
      const target = b.grabbed ? 1.18 : 1; b.pv.scale.setScalar(b.pv.scale.x + (target - b.pv.scale.x) * Math.min(1, dt * 14));
    }
  }

  function frame(now) {
    raf = 0; if (!running) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    step(dt / 2); step(dt / 2);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; canvas.style.display = ''; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0; canvas.style.display = 'none'; endDrag(); setCursor(''); }

  // ---- picking pieces up
  const toWorld = (cx, cy) => ({ x: (cx / innerWidth * 2 - 1) * halfW, y: -(cy / innerHeight * 2 - 1) * halfH });
  const pick = (cx, cy) => {
    const p = toWorld(cx, cy); let best = null; let bestD = Infinity;
    for (const b of bits) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < b.r * 1.25 && d < bestD) { best = b; bestD = d; } }
    return best ? { b: best, p } : null;
  };
  let cursor = '';
  function setCursor(c) { if (c !== cursor) { cursor = c; document.documentElement.style.cursor = c; } }
  const hist = [];
  function endDrag() {
    if (!drag) return;
    const b = drag.b; b.grabbed = false;
    const t = performance.now(); const recent = hist.filter((s) => t - s.t < 110);
    if (recent.length > 1) {
      const a = recent[0]; const z = recent[recent.length - 1]; const dt = Math.max(0.016, (z.t - a.t) / 1000);
      b.vx = MathUtils.clamp((z.x - a.x) / dt, -32, 32); b.vy = MathUtils.clamp((z.y - a.y) / dt, -32, 32); b.spin = MathUtils.clamp(b.vx * 0.25, -9, 9);
    }
    drag = null; hist.length = 0; document.body.classList.remove('no-select'); setCursor('');
  }
  const onDown = (e) => {
    if (!running || e.button > 0 || e.isPrimary === false) return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit || !seeThrough(e.target)) return;
    e.preventDefault();
    drag = { b: hit.b, tx: hit.b.x, ty: hit.b.y, dx: hit.b.x - hit.p.x, dy: hit.b.y - hit.p.y, id: e.pointerId };
    hit.b.grabbed = true; hist.length = 0; document.body.classList.add('no-select'); setCursor('grabbing');
  };
  const onMove = (e) => {
    if (drag) {
      const p = toWorld(e.clientX, e.clientY);
      drag.tx = MathUtils.clamp(p.x + drag.dx, -halfW + 0.6, halfW - 0.6); drag.ty = MathUtils.clamp(p.y + drag.dy, -halfH - 4, halfH + 2); // the bottom of the screen is not a wall: you can carry a piece right off it
      hist.push({ t: performance.now(), x: drag.tx, y: drag.ty }); if (hist.length > 12) hist.shift();
      return;
    }
    if (!running || e.pointerType === 'touch') return;
    setCursor(pick(e.clientX, e.clientY) && seeThrough(e.target) ? 'grab' : '');
  };
  const onTouch = (e) => { if (drag) e.preventDefault(); }; // a finger on a piece drags it instead of scrolling the page
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (running && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
  addEventListener('touchstart', onTouch, { passive: false, capture: true });
  addEventListener('touchmove', onTouch, { passive: false });
  document.addEventListener('visibilitychange', onVis);
  start();

  return {
    start, stop,
    get running() { return running; },
    destroy() {
      stop(); removeEventListener('resize', resize); removeEventListener('pointerdown', onDown, true); removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', endDrag); removeEventListener('pointercancel', endDrag);
      removeEventListener('touchstart', onTouch, true); removeEventListener('touchmove', onTouch); document.removeEventListener('visibilitychange', onVis);
      for (const b of bits) disposeGroup(b.pv);
      renderer.dispose(); canvas.remove();
    },
  };
}
