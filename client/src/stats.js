// Aggregates the locally stored, reviewed games into skill statistics.
import { mean, round } from './util.js';

export function aggregate(games) {
  const reviewed = games.filter((g) => g.review);
  const n = reviewed.length;
  if (!n) return { games: games.length, reviewed: 0 };
  const mine = reviewed.map((g) => g.review.mine);
  const phases = {};
  for (const ph of ['opening', 'middlegame', 'endgame']) {
    const xs = mine.map((m) => m.phases?.[ph]).filter((x) => x != null);
    phases[ph] = xs.length ? round(mean(xs), 0) : null;
  }
  const themes = {};
  reviewed.forEach((g) => Object.entries(g.review.themes || {}).forEach(([k, v]) => { themes[k] = (themes[k] || 0) + v; }));
  const openings = new Map();
  for (const g of reviewed) {
    const name = g.review.opening?.name || 'Unknown opening';
    const o = openings.get(name) ?? { name, eco: g.review.opening?.eco ?? '', w: 0, d: 0, l: 0, n: 0, acc: [] };
    o.n++;
    if (g.outcome === 'win') o.w++; else if (g.outcome === 'loss') o.l++; else if (g.outcome === 'draw') o.d++;
    o.acc.push(g.review.mine.accuracy);
    o.color = g.color;
    openings.set(name, o);
  }
  const recentPerf = mine.slice(0, 10).map((m) => m.performance).filter(Boolean);
  return {
    games: games.length, reviewed: n,
    accuracy: round(mean(mine.map((m) => m.accuracy).filter((x) => x != null)), 1),
    performance: recentPerf.length ? Math.round(mean(recentPerf)) : null,
    phases, themes,
    blundersPerGame: mean(mine.map((m) => m.counts.blunder)),
    mistakesPerGame: mean(mine.map((m) => m.counts.mistake)),
    inaccuraciesPerGame: mean(mine.map((m) => m.counts.inaccuracy)),
    openings: [...openings.values()].map((o) => ({ ...o, acc: round(mean(o.acc), 0), games: o.n })).sort((a, b) => b.games - a.games),
    perfSeries: [...reviewed].reverse().map((g) => g.review.mine.performance).filter(Boolean),
    accSeries: [...reviewed].reverse().map((g) => g.review.mine.accuracy).filter((x) => x != null),
  };
}

export function sparkline(values, { w = 300, h = 80, color = '#7fb64a' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('class', 'spark'); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  if (values.length < 2) return svg;
  const lo = Math.min(...values); const hi = Math.max(...values); const span = Math.max(1, hi - lo);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 8) + 4).toFixed(1)},${(h - 6 - ((v - lo) / span) * (h - 12)).toFixed(1)}`);
  const line = document.createElementNS(NS, 'polyline');
  line.setAttribute('points', pts.join(' ')); line.setAttribute('fill', 'none'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2.5');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(line);
  return svg;
}
