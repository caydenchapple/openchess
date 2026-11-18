// Profile pictures: 24 ready-made ones (a chess piece on a coloured tile) and your own photo, which is shrunk and kept in this browser.
import { h } from './util.js';

const PIECES = ['wk', 'bk', 'wq', 'bq', 'wr', 'br', 'wb', 'bb', 'wn', 'bn', 'wp', 'bp'];
const TILES = [
  ['#b4e26f', '#3f7d17'], ['#ffd27a', '#c9731a'], ['#8ec5ff', '#2b62c4'], ['#ffa3b8', '#c23a63'],
  ['#c9b3ff', '#6a43c9'], ['#a9b4c2', '#3a4656'], ['#7fe0cf', '#16807a'], ['#ffb38a', '#c4472a'],
];
export const PRESETS = PIECES.flatMap((piece, i) => [0, 1].map((k) => ({ id: `${piece}-${(i * 2 + k * 3 + k) % TILES.length}`, piece, tile: TILES[(i * 2 + k * 3 + k) % TILES.length] })));
export const DEFAULT_AVATAR = { kind: 'preset', id: PRESETS[16].id };

const byId = new Map(PRESETS.map((p) => [p.id, p]));

/** Paint `el` as the given avatar. `av`: { kind: 'preset', id } | { kind: 'custom', src } | { kind: 'initial' } */
export function paintAvatar(el, av, name = '') {
  el.replaceChildren(); el.className = 'avatar'; el.style.background = '';
  const a = av ?? DEFAULT_AVATAR;
  if (a.kind === 'custom' && typeof a.src === 'string' && a.src.startsWith('data:image/')) {
    el.classList.add('custom'); el.append(h('img', { src: a.src, alt: '' })); return el;
  }
  if (a.kind === 'initial') {
    el.classList.add('initial'); el.textContent = (String(name).trim()[0] ?? '?').toUpperCase(); return el;
  }
  const p = byId.get(a.id) ?? byId.get(DEFAULT_AVATAR.id);
  el.style.background = `linear-gradient(150deg, ${p.tile[0]}, ${p.tile[1]})`;
  el.append(h('img', { src: `/avatars/${p.piece}.svg`, alt: '' }));
  return el;
}

export function avatarEl(av, size = 40, name = '') {
  const el = h('span', { class: 'avatar', 'aria-hidden': 'true' });
  el.style.setProperty('--s', `${size}px`);
  return paintAvatar(el, av, name);
}

/** Read an image file, crop it to a square and shrink it to 192px, so it is small enough to keep. Resolves to a data URL. */
export function shrinkImage(file, size = 192) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Pick an image file (PNG, JPG, WebP or GIF).'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('That image is too large. Pick one under 12 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas'); c.width = c.height = size;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
        g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        resolve(c.toDataURL('image/jpeg', 0.86));
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

/** The picture a computer opponent wears: a bigger piece for a stronger level. */
export function botAvatar(level) {
  const elo = level?.elo ?? 1000;
  const piece = elo < 500 ? 'bp' : elo < 1000 ? 'bn' : elo < 1500 ? 'bb' : elo < 2000 ? 'br' : elo < 2500 ? 'bq' : 'bk';
  const p = PRESETS.find((x) => x.piece === piece && x.tile === TILES[5]) ?? PRESETS.find((x) => x.piece === piece);
  return { kind: 'preset', id: p.id };
}
