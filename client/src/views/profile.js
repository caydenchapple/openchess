// Skill profile: ratings, trends, weak spots, training plan, and settings. Everything is local.
import { h, clear, toast, round, twoStep } from '../util.js';
import { get, save, setName, setSetting, exportData, importData, wipe } from '../store.js';
import { aggregate, sparkline } from '../stats.js';
import { isProvisional, title } from '../rating.js';
import { THEME_LABELS, THEME_ADVICE } from '../analysis-core.js';
import { trainingPlan, openingAdvice } from '../coach.js';

export function mount(root) {
  const st = get();
  const agg = aggregate(st.games);
  const view = h('div', { class: 'stack' });
  root.append(view);

  const ratingCard = (label, pool) => h('div', { class: 'card stat' },
    h('div', { class: 'l' }, label),
    h('div', { class: 'v' }, String(pool.r)),
    h('div', { class: 'l' }, `${title(pool.r)} · ${pool.games} rated game${pool.games === 1 ? '' : 's'}${isProvisional(pool) ? ' · still settling' : ''}`),
    pool.history.length >= 2 ? sparkline(pool.history.slice(-40).map((x) => x.r)) : null);

  const header = h('div', { class: 'row between' },
    h('div', {}, h('h1', { style: { margin: 0 } }, st.player.name), h('div', { class: 'muted small' }, 'Stored only in this browser — no account.')),
    h('a', { class: 'btn primary', href: '#/play' }, 'Play'));

  view.append(header,
    h('div', { class: 'grid three' },
      ratingCard('Rating vs computer', st.ratings.computer),
      ratingCard('Online rating', st.ratings.online),
      h('div', { class: 'card stat' }, h('div', { class: 'l' }, 'Estimated performance'),
        h('div', { class: 'v' }, agg.performance ?? '–'),
        h('div', { class: 'l' }, agg.reviewed ? `average of your last ${Math.min(10, agg.reviewed)} reviewed games` : 'Review a game to see this'),
        agg.perfSeries?.length > 1 ? sparkline(agg.perfSeries.slice(-20), { color: '#5aa7e0' }) : null)));

  if (!agg.reviewed) {
    view.append(h('div', { class: 'card' }, h('h2', {}, 'Your skill report starts after your first review'),
      h('p', { class: 'muted' }, 'Finish a game and tap "Review my game". We\'ll track accuracy, blunders, openings and weak spots across all your games here.'),
      h('a', { class: 'btn', href: '#/history' }, 'Your games')));
  } else {
    view.append(statsCard(agg), weakSpots(agg), openingsCard(agg), planCard(agg));
  }
  view.append(settingsCard());

  function statsCard(a) {
    const bar = (label, v) => h('div', { class: 'bar' }, h('span', {}, label), h('div', {}, h('i', { style: { width: `${v ?? 0}%` } })), h('span', { class: 'muted' }, v == null ? '–' : v));
    return h('div', { class: 'card stack' }, h('h2', {}, `Skill breakdown · ${a.reviewed} reviewed game${a.reviewed === 1 ? '' : 's'}`),
      h('div', { class: 'grid three' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${a.accuracy}%`), h('div', { class: 'l' }, 'average accuracy')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, round(a.blundersPerGame, 1)), h('div', { class: 'l' }, 'blunders per game')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, round(a.mistakesPerGame, 1)), h('div', { class: 'l' }, 'mistakes per game'))),
      h('div', { class: 'bars' }, bar('Opening', a.phases.opening), bar('Middlegame', a.phases.middlegame), bar('Endgame', a.phases.endgame)),
      a.accSeries.length > 1 && h('div', {}, h('h3', {}, 'Accuracy trend'), sparkline(a.accSeries.slice(-30))));
  }

  function weakSpots(a) {
    const entries = Object.entries(a.themes).filter(([k]) => THEME_LABELS[k]).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const weakestPhase = Object.entries(a.phases).filter(([, v]) => v != null).sort((x, y) => x[1] - y[1])[0];
    const card = h('div', { class: 'card' }, h('h2', {}, 'Where to improve'));
    if (weakestPhase) card.append(h('p', {}, 'Your lowest-scoring phase is the ', h('b', {}, weakestPhase[0]), ` (accuracy ${weakestPhase[1]}).`));
    entries.forEach(([k, n]) => card.append(h('div', { class: 'lesson' }, h('b', {}, `${THEME_LABELS[k]} `, h('span', { class: 'muted' }, `×${n}`)), h('p', { class: 'small' }, THEME_ADVICE[k]))));
    card.append(h('div', { class: 'controls' }, h('a', { class: 'btn primary', href: '#/train' }, `Practise your own mistakes (${st.mistakes.filter((m) => !m.solved).length})`)));
    return card;
  }

  function openingsCard(a) {
    const rows = a.openings.slice(0, 8);
    const out = h('div', { class: 'stack' });
    const card = h('div', { class: 'card' }, h('h2', {}, 'Your openings'),
      h('div', { style: { overflowX: 'auto' } }, h('table', {}, h('thead', {}, h('tr', {}, ['Opening', 'Games', 'W-D-L', 'Accuracy', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((o) => h('tr', {}, h('td', {}, o.eco ? `${o.eco} ${o.name}` : o.name), h('td', {}, String(o.games)), h('td', {}, `${o.w}-${o.d}-${o.l}`), h('td', {}, o.acc == null ? '–' : `${o.acc}%`),
          h('td', {}, o.eco ? h('button', { onclick: () => show(o) }, 'Notes') : null)))))), out);
    function show(o) {
      const r = openingAdvice(o);
      clear(out);
      out.append(h('div', { class: 'banner' }, h('b', {}, o.name), h('p', {}, r.idea),
        h('ul', {}, [...r.plans, ...r.pitfalls.map((p) => `Watch out: ${p}`)].map((x) => h('li', {}, x))),
        r.record && h('p', {}, h('b', {}, 'Your results: '), r.record),
        h('p', {}, h('b', {}, 'Next: '), r.nextStep)));
    }
    return card;
  }

  function planCard(a) {
    const p = trainingPlan(a);
    return h('div', { class: 'card stack' }, h('h2', {}, 'Your training plan'),
      h('p', {}, p.summary),
      p.focus.map((f) => h('div', { class: 'lesson' }, h('b', {}, f.title), h('p', { class: 'small', style: { margin: '.2rem 0' } }, f.why), h('ul', { class: 'small' }, f.drills.map((d) => h('li', {}, d))))),
      h('p', {}, h('b', {}, 'Habit for every move: '), p.habit),
      h('div', {}, h('b', {}, 'This week'), h('ol', {}, p.weekly.map((d) => h('li', {}, d)))),
      h('p', { class: 'ai-note' }, 'Built from your own stats by the rule-based coach, and it updates as you review more games.'));
  }

  function settingsCard() {
    const s = get().settings;
    const nameIn = h('input', { value: get().player.name, maxlength: 20, id: 'pn', onchange: (e) => { setName(e.target.value); toast('Name saved'); } });
    const check = (label, key, after) => h('label', { class: 'row', style: { color: 'var(--text)', fontSize: '1rem' } },
      h('input', { type: 'checkbox', checked: key === 'theme' ? s.theme === 'light' : !!s[key], onchange: (e) => { setSetting(key, e.target.checked); after?.(e.target.checked); } }), label);
    return h('div', { class: 'card stack' }, h('h2', {}, 'Settings'),
      h('div', {}, h('label', { for: 'pn' }, 'Display name'), nameIn),
      check('Sound effects', 'sound'),
      check('Light theme', 'theme', (on) => { setSetting('theme', on ? 'light' : 'dark'); document.documentElement.dataset.theme = on ? 'light' : 'dark'; }),
      check('Open the review as soon as a game ends', 'autoReview'),
      h('div', { class: 'controls' },
        h('button', { onclick: () => { const blob = new Blob([exportData()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: 'openchess-backup.json' }); a.click(); } }, 'Export data'),
        h('label', { class: 'btn', style: { margin: 0 } }, 'Import data', h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => { try { importData(await e.target.files[0].text()); toast('Imported'); location.reload(); } catch (err) { toast(err.message); } } })),
        h('button', { class: 'danger', onclick: twoStep('Click again to delete everything', () => { wipe(); location.reload(); }) }, 'Delete all my data')));
  }
  return () => {};
}
