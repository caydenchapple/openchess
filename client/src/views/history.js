import { h, fmtDate } from '../util.js';
import { get } from '../store.js';
import { TC_LABEL } from '../session.js';

export function mount(root) {
  const games = get().games;
  const tbl = games.length
    ? h('table', {},
      h('thead', {}, h('tr', {}, ['Date', 'Opponent', 'Result', 'Clock', 'Rating', 'Accuracy', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, games.map((g) => h('tr', { class: 'click', tabindex: 0, onclick: () => { location.hash = `#/review/${g.id}`; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/review/${g.id}`; } },
        h('td', {}, fmtDate(g.t)),
        h('td', {}, `${g.opponent.name}${g.opponent.rating ? ` (${g.opponent.rating})` : ''}`),
        h('td', { class: `res-${g.outcome}` }, g.outcome === 'win' ? 'Won' : g.outcome === 'loss' ? 'Lost' : g.outcome === 'draw' ? 'Draw' : g.result),
        h('td', {}, g.mode === 'import' ? 'Imported' : TC_LABEL(g.time, g.inc)),
        h('td', {}, g.rating ? `${g.rating.delta >= 0 ? '+' : ''}${g.rating.delta}` : g.rated === false ? 'unrated' : ''),
        h('td', {}, g.review ? `${g.review.mine.accuracy}%` : '—'),
        h('td', {}, h('span', { class: 'pill' }, g.review ? 'Reviewed' : 'Review →'))))))
    : h('p', { class: 'muted' }, 'No games yet. Play one and it will show up here.');
  root.append(h('div', { class: 'stack' },
    h('div', { class: 'row between' }, h('h1', { style: { margin: 0 } }, 'Your games'), h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/review/import' }, 'Review a PGN'), h('a', { class: 'btn primary', href: '#/play' }, 'Play'))),
    h('div', { class: 'card', style: { overflowX: 'auto' } }, tbl),
    h('p', { class: 'small muted' }, 'Games are stored only in this browser (the 150 most recent). Export a backup from Profile → Data.')));
  return () => {};
}
