// Play setup: computer opponents, online quick-pairing and private invite links.
import { h, clear, toast } from '../util.js';
import { LEVELS } from '../engine.js';
import { get, setName } from '../store.js';
import { net } from '../net.js';
import { session, loadActive, TC_LABEL, TC_NAME } from '../session.js';
import { isProvisional } from '../rating.js';

const ONLINE_TCS = [[1, 0], [3, 0], [3, 2], [5, 0], [5, 3], [10, 0], [10, 5], [15, 10]];
const COMPUTER_TCS = [[0, 0], [3, 2], [5, 0], [10, 0], [15, 10], [30, 0]];

export function mount(root) {
  const st = get();
  const prefs = { level: Math.min(12, Math.max(1, Math.round((st.ratings.computer.r - 200) / 250))), color: 'random', tc: [0, 0] };
  const offs = [];
  let waiting = null;

  const resume = loadActive();
  const view = h('div', { class: 'stack' });
  root.append(view);

  const nameInput = h('input', {
    value: st.player.name, maxlength: 20, 'aria-label': 'Your display name', style: { width: '12rem' },
    onchange: (e) => { setName(e.target.value); e.target.value = get().player.name; net.send({ t: 'profile', name: get().player.name, rating: get().ratings.online.r }); },
  });

  function chips(list, current, onPick, label) {
    return h('div', { class: 'opts' }, list.map((item) => {
      const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(current() === item.key) }, label(item));
      b.addEventListener('click', () => { onPick(item); render(); });
      return b;
    }));
  }

  function computerCard() {
    const lv = LEVELS.find((l) => l.id === prefs.level);
    return h('section', { class: 'card setup' },
      h('h2', {}, 'Play the computer'),
      h('p', { class: 'muted small' }, 'Stockfish runs privately in your browser. Strength is approximate.'),
      h('label', {}, 'Opponent'),
      h('div', { class: 'levels' }, LEVELS.map((l) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(l.id === prefs.level),
        onclick: () => { prefs.level = l.id; render(); },
      }, h('span', {}, l.name), h('small', {}, `~${l.elo}`)))),
      h('label', { style: { marginTop: '1rem' } }, 'You play'),
      chips([{ key: 'w', t: '♔ White' }, { key: 'random', t: '🎲 Random' }, { key: 'b', t: '♚ Black' }], () => prefs.color, (i) => { prefs.color = i.key; }, (i) => i.t),
      h('label', {}, 'Clock'),
      chips(COMPUTER_TCS.map(([t, i]) => ({ key: `${t}+${i}`, t, i })), () => `${prefs.tc[0]}+${prefs.tc[1]}`, (i) => { prefs.tc = [i.t, i.i]; }, (i) => TC_LABEL(i.t, i.i)),
      h('button', { class: 'primary big', onclick: startComputer }, `Play ${lv.name} (~${lv.elo})`));
  }

  function startComputer() {
    const color = prefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.color;
    session.cfg = { mode: 'computer', levelId: prefs.level, color, time: prefs.tc[0], inc: prefs.tc[1] };
    location.hash = '#/game';
  }

  function onlineCard() {
    if (net.unavailable) {
      return h('section', { class: 'card setup' }, h('h2', {}, 'Play people online'),
        h('p', { class: 'muted' }, 'Online games are not available on this site right now. You can still play the computer and review your games.'));
    }
    if (waiting) return waitingCard();
    const r = get().ratings.online;
    return h('section', { class: 'card setup' },
      h('h2', {}, 'Play people online'),
      h('p', { class: 'muted small' }, `Free, no sign-up. Your online rating: ${r.r}${isProvisional(r) ? '?' : ''}. ${net.stats.online ? `${net.stats.online} connected.` : ''}`),
      h('label', {}, 'Quick pairing'),
      h('div', { class: 'opts' }, ONLINE_TCS.map(([t, i]) => h('button', {
        type: 'button', onclick: () => { net.send({ t: 'seek', time: t, inc: i }); },
      }, h('span', {}, TC_LABEL(t, i)), h('small', { class: 'muted' }, ` ${TC_NAME(t)}`)))),
      h('label', {}, 'Or play a friend'),
      h('div', { class: 'row' },
        h('button', { onclick: () => net.send({ t: 'create', time: prefs.tc[0] || 5, inc: prefs.tc[0] ? prefs.tc[1] : 0, color: 'random' }) },
          `Create invite link (${prefs.tc[0] ? TC_LABEL(...prefs.tc) : '5+0'})`),
        h('span', { class: 'muted small' }, 'uses the clock selected under "Play the computer", or 5+0')));
  }

  function waitingCard() {
    const link = waiting.code ? `${location.origin}/#/join/${waiting.code}` : null;
    return h('section', { class: 'card setup' },
      h('h2', {}, waiting.kind === 'invite' ? 'Waiting for your friend…' : 'Finding an opponent…'),
      h('p', { class: 'row' }, h('span', { class: 'spinner' }), ` ${TC_LABEL(waiting.time, waiting.inc)} — keep this tab open.`),
      link && h('div', { class: 'invite-box' },
        h('input', { readonly: true, value: link, 'aria-label': 'Invite link', onfocus: (e) => e.target.select() }),
        h('button', { onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast('Select the link and copy it'); } } }, 'Copy')),
      h('div', { class: 'controls' }, h('button', { onclick: () => net.send({ t: 'cancel' }) }, 'Cancel')));
  }

  function render() {
    clear(view);
    view.append(
      h('div', { class: 'row between' },
        h('h1', {}, 'Play'),
        h('div', {}, h('label', { for: 'nm' }, 'Playing as'), (nameInput.id = 'nm', nameInput))),
      resume && h('div', { class: 'banner good row between' },
        h('span', {}, 'You have a game in progress.'),
        h('button', { class: 'primary', onclick: () => { session.cfg = { resume: true }; location.hash = '#/game'; } }, 'Resume')),
      h('div', { class: 'grid two' }, computerCard(), onlineCard()));
  }

  offs.push(
    net.on('waiting', (m) => { waiting = m; render(); }),
    net.on('cancelled', () => { waiting = null; render(); }),
    net.on('game', (m) => { session.cfg = { mode: 'online', first: m }; location.hash = '#/game'; }),
    net.on('error', (m) => { toast(m.message); waiting = null; render(); }),
    net.on('stats', () => { if (!waiting) render(); }),
    net.on('hello', () => { if (!waiting) render(); }),
    net.on('unavailable', () => render()),
  );
  net.connect();
  render();
  return () => { offs.forEach((f) => f()); if (waiting) net.send({ t: 'cancel' }); };
}
