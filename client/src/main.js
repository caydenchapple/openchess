import { get, subscribe } from './store.js';
import { net, cleanCode, validCode } from './net.js';
import { $, clear, h } from './util.js';
import * as home from './views/home.js';
import { currentStreak, dayKey } from './lessons-logic.js';
import { icon } from './icons.js';
import { session } from './session.js';
import { teaching } from './teaching.js';

document.documentElement.dataset.theme = get().settings.theme === 'light' ? 'light' : 'dark';

// Screens load on demand (esbuild splits them into chunks), so the first screen downloads only what it needs.
const routes = {
  '': { load: () => home, nav: '' },
  play: { load: () => import('./views/play.js'), nav: 'play' },
  game: { load: () => import('./views/game.js'), nav: 'play', wide: true },
  join: { load: null, nav: 'play' },
  review: { load: () => import('./views/review.js'), nav: 'history', wide: true },
  history: { load: () => import('./views/history.js'), nav: 'history' },
  learn: { load: () => import('./views/learn.js'), nav: 'learn', wide: true },
  train: { load: () => import('./views/train.js'), nav: 'learn', wide: true },
  profile: { load: () => import('./views/profile.js'), nav: 'profile' },
  about: { load: () => ({ mount: home.mountAbout }), nav: '' },
};

let cleanup = null; let navToken = 0;
const app = $('#app');

async function route() {
  const token = ++navToken;
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  clear(app);
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const key = parts[0] ?? '';
  const params = parts.slice(1);
  const r = routes[key] ?? routes[''];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
  app.classList.toggle('wide', !!r.wide); // game, review and training use the whole screen

  if (key === 'join') { joinInvite(params[0]); return; }
  try {
    const mod = await r.load();
    if (token !== navToken) return; // the player already went somewhere else
    cleanup = mod.mount(app, params);
  } catch (e) {
    console.error(e);
    app.append(h('div', { class: 'card' }, h('h2', {}, 'Something went wrong'), h('p', { class: 'muted' }, String(e.message)), h('a', { class: 'btn', href: '#/' }, 'Home')));
  }
  window.scrollTo(0, 0);
}

function joinInvite(raw) {
  const code = cleanCode(raw ?? '');
  app.append(h('div', { class: 'card' }, h('span', { class: 'spinner' }), ` Joining game ${code}…`));
  const fail = (message) => { clear(app); app.append(h('div', { class: 'card stack' }, h('h2', {}, 'Could not join'), h('p', { class: 'muted' }, message), h('a', { class: 'btn primary', href: '#/play' }, 'Back to Play'))); };
  if (!validCode(code)) { fail('That code does not look right. Codes have 4 to 8 letters and numbers.'); return; }
  const offs = [
    net.on('game', (m) => { session.cfg = { mode: 'online', first: m, code }; location.hash = '#/game'; }),
    net.on('error', (m) => { net.leave(); fail(m.message); }),
    net.on('unavailable', () => fail('Online games are not available on this site right now.')),
  ];
  // opening the link again (a reload) must give the same seat back, not look like a third player
  let token;
  try { const st = JSON.parse(sessionStorage.getItem('openchess.online')); if (st?.code === code) token = st.token; } catch { /* no saved seat */ }
  net.enter(code, { role: 'join', token });
  cleanup = () => offs.forEach((f) => f());
}

$('#howto-btn').addEventListener('click', (e) => teaching.toggleHowTo(e.currentTarget));
teaching.enterScreen();
// pressing the menu item for the page you are already on refreshes it, so the press visibly does something
document.querySelectorAll('.top a').forEach((a) => a.addEventListener('click', () => { if (a.getAttribute('href') === location.hash || (a.getAttribute('href') === '#/' && !location.hash)) setTimeout(route, 0); }));
window.addEventListener('hashchange', route);
route();

// the streak chip in the header
function updateStreak() {
  const el = $('#streak-chip'); if (!el) return;
  const s = currentStreak(get().learn.streak, dayKey());
  el.hidden = !s.count;
  el.replaceChildren(icon('flame', 18), ` ${s.count}`);
  el.classList.toggle('risk', s.atRisk);
  el.title = s.today ? `${s.count}-day streak — you practised today` : `${s.count}-day streak — practise today to keep it`;
}
updateStreak();
window.addEventListener('hashchange', updateStreak);
subscribe(updateStreak);
