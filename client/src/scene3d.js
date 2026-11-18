// Three.js scenes, loaded on demand: the 3D board on the home page and the shower of pieces when a lesson is finished.
// Both are decoration: they switch themselves off for people who prefer reduced motion and when WebGL is missing.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, MeshStandardMaterial, HemisphereLight, DirectionalLight,
  PCFSoftShadowMap, ACESFilmicToneMapping, Color, PlaneGeometry, ShadowMaterial, MathUtils,
} from 'three';
import { makePiece, disposeGroup } from './pieces3d.js';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

function parseFen(fen) {
  const out = [];
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      out.push({ sq: 'abcdefgh'[f] + (8 - i), type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
      f++;
    }
  });
  return out;
}
const at = (sq) => ({ x: 'abcdefgh'.indexOf(sq[0]) - 3.5, z: 3.5 - (Number(sq[1]) - 1) });

/**
 * A slowly turning 3D board that plays a few quiet moves. Returns { destroy }.
 * `moves` is a list of [from, to] squares (no captures or castling) played one by one, then the position starts over.
 */
export function boardScene(host, { fen, moves = [] }) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 80);
  scene.add(new HemisphereLight(0xffffff, 0x2a2a2a, 1.1));
  const sun = new DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(-5, 11, 7); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 4;
  scene.add(sun);

  const world = new Group(); scene.add(world);
  // the board: 64 slabs in the same two greens as the 2D board, in a dark wooden frame
  const light = new Color(css('--sq-light', '#ebecd0')); const dark = new Color(css('--sq-dark', '#739552'));
  const slab = new BoxGeometry(1, 0.2, 1);
  const mats = [new MeshStandardMaterial({ color: dark, roughness: 0.7 }), new MeshStandardMaterial({ color: light, roughness: 0.7 })];
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const m = new Mesh(slab, mats[(f + r) % 2 === 0 ? 0 : 1]);
    m.position.set(f - 3.5, -0.1, 3.5 - r); m.receiveShadow = true; world.add(m);
  }
  const frame = new Mesh(new BoxGeometry(8.7, 0.34, 8.7), new MeshStandardMaterial({ color: 0x2b2118, roughness: 0.6 }));
  frame.position.y = -0.2; frame.receiveShadow = true; world.add(frame);
  const floor = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; floor.receiveShadow = true; world.add(floor);

  // pieces drop in one after another
  const pieces = new Map(); // square -> { obj, start, delay }
  const group = new Group(); world.add(group);
  let epoch = 0; let anim = []; // anim: moves in flight
  const spawn = () => {
    for (const { obj } of pieces.values()) { group.remove(obj); disposeGroup(obj); }
    pieces.clear(); epoch = performance.now();
    parseFen(fen).forEach((p, i) => {
      const obj = makePiece(p.type, p.color); const { x, z } = at(p.sq);
      obj.position.set(x, 4, z); obj.scale.setScalar(0.001); group.add(obj);
      pieces.set(p.sq, { obj, x, z, delay: 80 + i * 38 });
    });
  };
  spawn();

  let queue = 0; let nextMove = 0; let t0 = performance.now(); let raf = 0; let visible = true; let width = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const onMove = (e) => { const r = host.getBoundingClientRect(); pointer.x = ((e.clientX - r.left) / r.width - 0.5) * 2; pointer.y = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; });

  const resize = () => {
    const w = host.clientWidth; const h = host.clientHeight;
    if (!w || !h || w === width) return; width = w;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !calm()) loop(); }, { threshold: 0.05 });
  io.observe(host);

  const still = calm();
  function frameAt(now) {
    const t = (now - t0) / 1000;
    // slow turn plus a little follow-the-pointer
    pointer.sx += (pointer.x - pointer.sx) * 0.06; pointer.sy += (pointer.y - pointer.sy) * 0.06;
    const turn = still ? -0.35 : Math.sin(t * 0.22) * 0.3 - 0.2 + pointer.sx * 0.3;
    world.rotation.y = turn;
    const lift = 12.4 - pointer.sy * 1.2; camera.position.set(0, lift, 15.2); camera.lookAt(0, 0, 0.2);
    // drop-in
    for (const p of pieces.values()) {
      if (p.moving) continue;
      const k = MathUtils.clamp((now - epoch - p.delay) / 700, 0, 1);
      const e = easeOutBack(k);
      p.obj.position.y = Math.max(0, 4 * (1 - e));
      p.obj.scale.setScalar(Math.max(0.001, easeOutCubic(Math.min(1, k * 1.6))));
    }
    // quiet moves, one every 1.3 s once everything has landed
    const ready = now - epoch > 80 + pieces.size * 38 + 900;
    if (!still && ready && moves.length && now > nextMove && !anim.length) {
      if (queue >= moves.length) { queue = 0; nextMove = now + 1800; spawn(); }
      else {
        const [from, to] = moves[queue++]; const p = pieces.get(from);
        if (p) { p.moving = true; const d = at(to); anim.push({ p, from, to, t: now, fx: p.x, fz: p.z, tx: d.x, tz: d.z }); }
        nextMove = now + 1300;
      }
    }
    anim = anim.filter((a) => {
      const k = MathUtils.clamp((now - a.t) / 650, 0, 1); const e = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2;
      a.p.obj.position.x = a.fx + (a.tx - a.fx) * e; a.p.obj.position.z = a.fz + (a.tz - a.fz) * e; a.p.obj.position.y = Math.sin(k * Math.PI) * 0.7;
      if (k < 1) return true;
      a.p.moving = false; a.p.x = a.tx; a.p.z = a.tz; a.p.obj.position.y = 0; pieces.delete(a.from); pieces.set(a.to, a.p); return false;
    });
    renderer.render(scene, camera);
  }
  function loop() { raf = 0; if (!visible || document.hidden) { raf = 0; return; } frameAt(performance.now()); raf = requestAnimationFrame(loop); }
  const onVis = () => { if (!document.hidden && visible && !raf && !still) loop(); };
  document.addEventListener('visibilitychange', onVis);
  if (still) { for (const p of pieces.values()) { p.obj.position.y = 0; p.obj.scale.setScalar(1); p.delay = -1000; } epoch = 0; frameAt(performance.now() + 5000); } else loop();

  return {
    destroy() {
      cancelAnimationFrame(raf); raf = 0; visible = false; ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis); host.removeEventListener('pointermove', onMove);
      disposeGroup(world); renderer.dispose(); renderer.domElement.remove();
    },
  };
}

/** A short shower of falling pieces and confetti over the whole page. `power` 0..1 sets how much. */
export function celebrate(power = 1) {
  if (calm() || !webglAvailable()) return null;
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '80' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 18);
  scene.add(new HemisphereLight(0xffffff, 0x333333, 1.4));
  const key = new DirectionalLight(0xffffff, 2.2); key.position.set(3, 8, 10); scene.add(key);

  const half = Math.tan(MathUtils.degToRad(20)) * 18; const halfW = half * camera.aspect;
  const kinds = ['p', 'n', 'b', 'r', 'q', 'k']; const bits = []; const cols = [0x84c24f, 0xeab34a, 0x60a5fa, 0xf3efe4, 0xef5b4c];
  const total = Math.round(26 + 44 * power);
  const chipGeo = new BoxGeometry(0.28, 0.28, 0.05);
  const chip = (color) => { const m = new MeshStandardMaterial({ color, roughness: 0.5 }); m.userData.own = true; return new Mesh(chipGeo, m); };
  for (let i = 0; i < total; i++) {
    const isPiece = i % 3 === 0;
    const obj = isPiece ? makePiece(kinds[(Math.random() * kinds.length) | 0], Math.random() < 0.5 ? 'w' : 'b') : chip(cols[(Math.random() * cols.length) | 0]);
    if (isPiece) obj.scale.setScalar(0.7 + Math.random() * 0.5);
    obj.position.set((Math.random() - 0.5) * halfW * 1.7, half + 1 + Math.random() * 8, (Math.random() - 0.5) * 5);
    obj.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    scene.add(obj);
    bits.push({ obj, vx: (Math.random() - 0.5) * 3, vy: -(2 + Math.random() * 3), sx: (Math.random() - 0.5) * 6, sy: (Math.random() - 0.5) * 6, isPiece });
  }
  const start = performance.now(); let last = start; let raf = 0; let dead = false;
  const finish = () => {
    if (dead) return; dead = true; cancelAnimationFrame(raf);
    scene.traverse((o) => { if (o.geometry && o.geometry !== chipGeo) o.geometry.dispose(); if (o.material && o.material.userData?.own) o.material.dispose(); });
    chipGeo.dispose(); renderer.dispose(); canvas.remove();
  };
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const b of bits) {
      b.vy -= 7 * dt; b.obj.position.x += b.vx * dt; b.obj.position.y += b.vy * dt;
      b.obj.rotation.x += b.sx * dt; b.obj.rotation.y += b.sy * dt;
      if (b.obj.position.y < -half - 2) b.obj.visible = false;
    }
    renderer.render(scene, camera);
    if (now - start > 4200 || bits.every((b) => !b.obj.visible)) finish(); else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { stop: finish };
}
