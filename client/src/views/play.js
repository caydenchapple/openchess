// Play setup: computer opponents, and private online games that you host or join with a code.
import { h, clear, toast, twoStep } from '../util.js';
import { LEVELS, GROUPS } from '../engine.js';
import { icon } from '../icons.js';
import { get, setName } from '../store.js';
import { net, newCode, cleanCode, validCode } from '../net.js';
import { session, loadActive, TC_LABEL, TC_NAME } from '../session.js';
import { isProvisional } from '../rating.js';

const ONLINE_TCS = [[1, 0], [3, 0], [3, 2], [5, 0], [5, 3], [10, 0], [10, 5], [15, 10]];
const COMPUTER_TCS = [[0, 0], [3, 2], [5, 0], [10, 0], [15, 10], [30, 0]];

export function mount(root) {
  const st = get();
  const mine = st.ratings.computer.r;
  const near = [...LEVELS].filter((l) => l.group === 'learn' || l.group === 'club').sort((a, b) => Math.abs(a.elo - mine) - Math.abs(b.elo - mine))[0];
  const prefs = { level: near.id, color: 'random', tc: [0, 0] };
  const offs = [];
  let waiting = null; let pendingJoin = null; let hostTries = 0;
  const hostPrefs = { tc: [5, 0], color: 'random' };

  const resume = loadActive();
  const view = h('div', { class: 'stack' });
  root.append(view);

  const nameInput = h('input', {
    value: st.player.name, maxlength: 20, 'aria-label': 'Your display name', style: { width: '12rem' },
    onchange: (e) => { setName(e.target.value); e.target.value = get().player.name; },
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
    const groups = GROUPS.map((g) => {
      const list = LEVELS.filter((l) => l.group === g.id); if (!list.length) return null;
      return h('div', { class: 'level-group' },
        h('h3', {}, g.title), h('p', { class: 'muted small' }, g.blurb),
        h('div', { class: 'levels' }, list.map((l) => h('button', {
          type: 'button', class: `chip level ${l.group}`, 'aria-pressed': String(l.id === prefs.level), title: l.person?.note ?? '',
          onclick: () => { prefs.level = l.id; render(); },
        }, h('span', {}, l.name), h('small', {}, l.group === 'max' ? 'strongest' : `${l.elo}`)))));
    });
    return h('section', { class: 'card setup' },
      h('h2', {}, 'Play the computer'),
      h('p', { class: 'muted small' }, 'Runs privately in your browser. Strength was measured by self-play on Stockfish\'s Elo scale (about ±100): good for comparing levels, not the same as a Chess.com or FIDE rating.'),
      groups,
      lv.person && h('div', { class: 'banner persona' }, h('b', {}, `${lv.name}${lv.person.born ? ` (b. ${lv.person.born})` : ''}`), h('p', { class: 'small' }, lv.person.note)),
      h('label', { style: { marginTop: '1rem' } }, 'You play'),
      chips([{ key: 'w', t: 'White' }, { key: 'random', t: 'Random' }, { key: 'b', t: 'Black' }], () => prefs.color, (i) => { prefs.color = i.key; }, (i) => i.t),
      h('label', {}, 'Clock'),
      chips(COMPUTER_TCS.map(([t, i]) => ({ key: `${t}+${i}`, t, i })), () => `${prefs.tc[0]}+${prefs.tc[1]}`, (i) => { prefs.tc = [i.t, i.i]; }, (i) => TC_LABEL(i.t, i.i)),
      h('button', { class: 'primary big', onclick: resume ? twoStep('Click again to replace your unfinished game', startComputer) : startComputer }, icon('play'), ` Play ${lv.name}`));
  }

  function startComputer() {
    const color = prefs.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.color;
    session.cfg = { mode: 'computer', levelId: prefs.level, color, time: prefs.tc[0], inc: prefs.tc[1] };
    location.hash = '#/game';
  }

  function onlineCard() {
    if (net.unavailable) {
      return h('section', { class: 'card setup' }, h('h2', {}, 'Play a friend online'),
        h('p', { class: 'muted' }, 'Online games are not available on this site right now. You can still play the computer and review your games.'));
    }
    if (waiting) return waitingCard();
    const r = get().ratings.online;
    const codeInput = h('input', {
      class: 'code-input', placeholder: 'ABC123', maxlength: 8, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Game code',
      oninput: (e) => { e.target.value = cleanCode(e.target.value); joinError.textContent = ''; },
      onkeydown: (e) => { if (e.key === 'Enter') doJoin(); },
    });
    const joinError = h('p', { class: 'small error', role: 'alert' });
    function doJoin() {
      const code = cleanCode(codeInput.value);
      if (!validCode(code)) { joinError.textContent = 'Codes have 4 to 8 letters and numbers, for example K7M2QX.'; return; }
      joinError.textContent = '';
      pendingJoin = code;
      net.enter(code, { role: 'join' });
    }
    return h('section', { class: 'card setup' },
      h('h2', {}, 'Play a friend online'),
      h('p', { class: 'muted small' }, `Free, no sign-up. One of you hosts a game and shares the code; the other types it in. Your online rating: ${r.r}${isProvisional(r) ? ' (still settling)' : ''}.`),
      h('div', { class: 'two-up' },
        h('div', { class: 'stack' },
          h('h3', {}, 'Host a game'),
          h('label', {}, 'Clock'),
          chips(ONLINE_TCS.map(([t, i]) => ({ key: `${t}+${i}`, t, i })), () => `${hostPrefs.tc[0]}+${hostPrefs.tc[1]}`, (i) => { hostPrefs.tc = [i.t, i.i]; }, (i) => TC_LABEL(i.t, i.i)),
          h('label', {}, 'You play'),
          chips([{ key: 'w', t: 'White' }, { key: 'random', t: 'Random' }, { key: 'b', t: 'Black' }], () => hostPrefs.color, (i) => { hostPrefs.color = i.key; }, (i) => i.t),
          h('button', { class: 'primary big', onclick: () => host(0) }, 'Create game code')),
        h('div', { class: 'stack' },
          h('h3', {}, 'Join a game'),
          h('label', { for: 'code-in' }, 'Enter the code your friend sent you'),
          (codeInput.id = 'code-in', codeInput),
          joinError,
          h('button', { class: 'primary big', onclick: doJoin }, 'Join game'))));
  }

  function host(attempt) {
    pendingJoin = null;
    const code = newCode();
    hostTries = attempt;
    net.enter(code, { role: 'host', time: hostPrefs.tc[0], inc: hostPrefs.tc[1], color: hostPrefs.color });
  }

  function waitingCard() {
    const link = `${location.origin}${location.pathname}#/join/${waiting.code}`;
    const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Select it and copy it'); } };
    return h('section', { class: 'card setup' },
      h('h2', {}, 'Waiting for your friend…'),
      h('p', { class: 'muted' }, 'Send them this code, or the link. The game starts the moment they join.'),
      h('div', { class: 'big-code', 'aria-label': `Game code ${waiting.code.split('').join(' ')}` }, waiting.code),
      h('div', { class: 'controls' },
        h('button', { class: 'primary', onclick: () => copy(waiting.code, 'Code') }, 'Copy code'),
        h('button', { onclick: () => copy(link, 'Link') }, 'Copy link')),
      h('p', { class: 'row small muted' }, h('span', { class: 'spinner' }), ` ${TC_LABEL(waiting.time, waiting.inc)} · keep this tab open.`),
      h('div', { class: 'controls' }, h('button', { onclick: () => { net.leave(); waiting = null; render(); } }, 'Cancel')));
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
    net.on('game', (m) => { waiting = null; /* keep the connection: the game screen takes it over */ session.cfg = { mode: 'online', first: m, code: net.code }; location.hash = '#/game'; }),
    net.on('error', (m) => {
      net.leave(); waiting = null;
      if (/already in use/.test(m.message) && !pendingJoin && hostTries < 3) { host(hostTries + 1); return; } // an unlucky duplicate code: try another
      render();
      const el = view.querySelector('.error');
      if (pendingJoin && el) el.textContent = m.message; else toast(m.message);
    }),
    net.on('unavailable', () => { waiting = null; render(); }),
  );
  render();
  return () => { offs.forEach((f) => f()); if (waiting) net.leave(); };
}
