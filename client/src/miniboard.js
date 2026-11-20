// A small picture of a position: the board in your board colours with the pieces on it. Not interactive, no chessground.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/**
 * @param {string} fen
 * @param {{ orientation?: 'w'|'b', last?: [string, string] | null, label?: string }} opts
 */
export function miniBoard(fen, { orientation = 'w', last = null, label = 'Chess position' } = {}) {
  const svg = el('svg', { viewBox: '0 0 8 8', class: 'miniboard', role: 'img', 'aria-label': label });
  const flip = orientation === 'b';
  const pos = (file, rank) => [flip ? 7 - file : file, flip ? rank : 7 - rank]; // rank 0 = first rank
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const [x, y] = pos(f, r);
    svg.append(el('rect', { x, y, width: 1, height: 1, style: `fill:var(${(f + r) % 2 ? '--sq-light' : '--sq-dark'})` }));
  }
  for (const sq of last ?? []) {
    const [x, y] = pos(sq.charCodeAt(0) - 97, Number(sq[1]) - 1);
    svg.append(el('rect', { x, y, width: 1, height: 1, fill: 'rgba(255, 221, 51, .45)' }));
  }
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      const [x, y] = pos(f, 7 - i);
      svg.append(el('image', { href: `/avatars/${color}${ch.toLowerCase()}.svg`, x: x + 0.04, y: y + 0.04, width: 0.92, height: 0.92 }));
      f++;
    }
  });
  return svg;
}
