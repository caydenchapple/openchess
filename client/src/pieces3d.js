// Chess pieces built from code (lathe profiles and one extruded knight), so there are no 3D model files to download.
// One square is 1 unit wide. Loaded on demand with three.js, never on the first paint.
import {
  Group, Mesh, MeshStandardMaterial, LatheGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, BoxGeometry, ExtrudeGeometry,
  Shape, Vector2,
} from 'three';

const lathe = (pts) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), 32);
const BASE = [[0, 0], [0.34, 0], [0.35, 0.05], [0.3, 0.09], [0.26, 0.13]];

export const PIECE_COLORS = { w: 0xf3efe4, b: 0x2c2b29 };
const materials = {};
export function material(color) {
  materials[color] ??= new MeshStandardMaterial({ color: PIECE_COLORS[color] ?? color, roughness: 0.38, metalness: 0.05 });
  return materials[color];
}

const horse = new Shape();
[[-0.22, 0], [0.22, 0], [0.18, 0.24], [0.1, 0.46], [0.3, 0.5], [0.35, 0.62], [0.2, 0.7], [0.15, 0.84], [0.03, 0.78], [-0.1, 0.88], [-0.2, 0.6], [-0.27, 0.3]]
  .forEach(([x, y], i) => (i ? horse.lineTo(x, y) : horse.moveTo(x, y)));

/** type: p n b r q k, color: 'w' | 'b' (or a hex number). Faces the opponent (white looks toward -z). */
export function makePiece(type, color) {
  const mat = material(color);
  const g = new Group();
  const add = (geo, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  };
  switch (type) {
    case 'p':
      add(lathe([...BASE, [0.15, 0.22], [0.11, 0.36], [0.19, 0.4], [0.11, 0.44]]));
      add(new SphereGeometry(0.17, 24, 16), 0, 0.58);
      break;
    case 'r':
      add(lathe([...BASE, [0.21, 0.22], [0.2, 0.62], [0.3, 0.67], [0.3, 0.78], [0.22, 0.78], [0.22, 0.74], [0, 0.74]]));
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; add(new BoxGeometry(0.15, 0.13, 0.15), Math.cos(a) * 0.22, 0.84, Math.sin(a) * 0.22); }
      break;
    case 'n': {
      add(lathe([...BASE, [0.28, 0.17], [0.0, 0.17]]));
      const geo = new ExtrudeGeometry(horse, { depth: 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
      geo.translate(0, 0, -0.15);
      const head = add(geo, 0, 0.14, 0);
      head.rotation.y = color === 'b' ? -Math.PI / 2 : Math.PI / 2;
      break;
    }
    case 'b':
      add(lathe([...BASE, [0.19, 0.26], [0.12, 0.52], [0.21, 0.58], [0.12, 0.64]]));
      add(new SphereGeometry(0.2, 24, 16), 0, 0.84, 0, 1, 1.4, 1);
      add(new SphereGeometry(0.06, 12, 10), 0, 1.16);
      break;
    case 'q':
      add(lathe([...BASE, [0.23, 0.24], [0.12, 0.64], [0.24, 0.74], [0.15, 0.78]]));
      add(new ConeGeometry(0.25, 0.4, 24), 0, 0.97);
      add(new SphereGeometry(0.075, 14, 10), 0, 1.22);
      break;
    case 'k':
    default:
      add(lathe([...BASE, [0.25, 0.26], [0.14, 0.68], [0.25, 0.78], [0.17, 0.84]]));
      add(new CylinderGeometry(0.2, 0.25, 0.14, 24), 0, 0.9);
      add(new BoxGeometry(0.09, 0.34, 0.09), 0, 1.14);
      add(new BoxGeometry(0.26, 0.09, 0.09), 0, 1.18);
      break;
  }
  if (color === 'b' && type !== 'n') g.rotation.y = Math.PI;
  return g;
}

/** Free everything a group made (geometries only: the two piece materials are shared). */
export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
