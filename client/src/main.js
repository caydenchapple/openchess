import { get } from './store.js';
import { net } from './net.js';
import { $, clear, h } from './util.js';
import * as home from './views/home.js';
import * as play from './views/play.js';
import * as game from './views/game.js';
import * as review from './views/review.js';
import * as history from './views/history.js';
import * as profile from './views/profile.js';
import * as train from './views/train.js';
import { session } from './session.js';
import { teaching } from './teaching.js';

document.documentElement.dataset.theme = get().settings.theme === 'light' ? 'light' : 'dark';

const routes = {
  '': { mod: home, nav: '' },
  play: { mod: play, nav: 'play' },
  game: { mod: game, nav: 'play' },
  join: { mod: null, nav: 'play' },
  review: { mod: review, nav: 'history' },
  history: { mod: history, nav: 'history' },
  train: { mod: train, nav: 'train' },
  profile: { mod: profile, nav: 'profile' },
  about: { mod: { mount: home.mountAbout }, nav: '' },
};

let cleanup = null;
const app = $('#app');

function route() {
  try { cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  clear(app);
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const key = parts[0] ?? '';
  const params = parts.slice(1);
  const r = routes[key] ?? routes[''];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));

  if (key === 'join') { joinInvite(params[0]); return; }
  try {
    cleanup = r.mod.mount(app, params);
  } catch (e) {
    console.error(e);
    app.append(h('div', { class: 'card' }, h('h2', {}, 'Something went wrong'), h('p', { class: 'muted' }, String(e.message)), h('a', { class: 'btn', href: '#/' }, 'Home')));
  }
  window.scrollTo(0, 0);
}

function joinInvite(code) {
  app.append(h('div', { class: 'card' }, h('span', { class: 'spinner' }), ' Joining game…'));
  const offs = [
    net.on('game', (m) => { session.cfg = { mode: 'online', first: m }; location.hash = '#/game'; }),
    net.on('error', (m) => { clear(app); app.append(h('div', { class: 'card stack' }, h('h2', {}, 'Could not join'), h('p', { class: 'muted' }, m.message), h('a', { class: 'btn primary', href: '#/play' }, 'Play something else'))); }),
  ];
  net.connect();
  net.send({ t: 'join', code });
  cleanup = () => offs.forEach((f) => f());
}

$('#howto-btn').addEventListener('click', (e) => teaching.toggleHowTo(e.currentTarget));
teaching.enterScreen();
window.addEventListener('hashchange', route);
route();

net.on('hello', updateOnline);
net.on('stats', updateOnline);
function updateOnline() {
  const el = $('#online-count');
  if (el) el.textContent = net.stats.online ? `${net.stats.online} online` : '';
}
