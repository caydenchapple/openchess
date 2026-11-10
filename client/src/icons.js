// One small, consistent icon set (24×24, drawn with the current text colour) instead of platform emoji,
// so the interface looks the same everywhere and follows the light/dark theme.
const NS = 'http://www.w3.org/2000/svg';
const S = { stroke: true }; const F = { fill: true };
const ICONS = {
  flame: [F, 'M12.5 2c.6 3.4-1.9 5-3.4 7.2C7.8 11 7 12.6 7 14.4A5.6 5.6 0 0 0 12.6 20 5.6 5.6 0 0 0 18 14.2c0-2-.9-3.7-2.1-5-.1 1.5-.8 2.5-1.8 2.9.5-3.7-.2-7.3-1.6-10.1z'],
  snow: [S, 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5'],
  check: [S, 'M5 12.5l4.5 4.5L19 7'],
  play: [F, 'M8 5l12 7-12 7z'],
  bulb: [S, 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.8.7 1.1 1.4 1.1 2.2h5c0-.8.3-1.5 1.1-2.2A6 6 0 0 0 12 3z'],
  lock: [S, 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  flag: [S, 'M5 21V4M5 4h12l-2.5 4L17 12H5'],
  undo: [S, 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'],
  flip: [S, 'M7 3 3 7l4 4M3 7h14M17 21l4-4-4-4M21 17H7'],
  book: [S, 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5'],
  cap: [S, 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5'],
  equals: [S, 'M5 9h14M5 15h14'],
  copy: [S, 'M9 9h11v11H9zM5 15H4V4h11v1'],
  full: [S, 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
  exitfull: [S, 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'],
  target: [S, 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  trophy: [S, 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8.5 21h7M10 17h4'],
  star: [F, 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  link: [S, 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  users: [S, 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14a6 6 0 0 1 3.5 6'],
  help: [S, 'M9.5 9a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1 1-1.1 1.8M12 17h.01'],
};

/** @param {keyof typeof ICONS} name */
export function icon(name, size = 18) {
  const [kind, d] = ICONS[name] ?? ICONS.help;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d);
  if (kind.fill) { p.setAttribute('fill', 'currentColor'); } else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
  svg.append(p);
  return svg;
}
