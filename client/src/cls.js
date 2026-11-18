// How each kind of move is shown: name, the little symbol (like Chess.com's badges) and its colour.
export const CLS = {
  brilliant: { label: 'Brilliant', glyph: '!!', color: '#1baca6' },
  great: { label: 'Great', glyph: '!', color: '#5c8bb0' },
  best: { label: 'Best', glyph: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', glyph: '👍', color: '#96bc4b' },
  good: { label: 'Good', glyph: '✓', color: '#97af8b' },
  book: { label: 'Book', glyph: '📖', color: '#a88865' },
  inaccuracy: { label: 'Inaccuracy', glyph: '?!', color: '#f7c631' },
  mistake: { label: 'Mistake', glyph: '?', color: '#e58f2a' },
  miss: { label: 'Miss', glyph: '✗', color: '#e0584f' },
  blunder: { label: 'Blunder', glyph: '??', color: '#ca3431' },
};
/** Order used in lists and counts: best news first. */
export const CLS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
/** Classes shown as a badge on the board (the interesting ones). */
export const BADGED = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** SVG for chessground's customSvg: a round badge in the top-right corner of a square. */
export function badgeSvg(cls) {
  const c = CLS[cls];
  const size = c.glyph.length > 1 ? 21 : 26;
  return `<circle cx="80" cy="20" r="19" fill="${c.color}" stroke="#fff" stroke-width="2.5"/><text x="80" y="21" font-size="${size}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="system-ui,sans-serif">${c.glyph}</text>`;
}
