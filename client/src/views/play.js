// Play setup: computer opponents, and private online games that you host or join with a code.
import { h, clear, toast, twoStep } from '../util.js';
import { LEVELS, GROUPS } from '../engine.js';
import { icon } from '../icons.js';
import { get, setName } from '../store.js';
import { net, newCode, cleanCode, validCode } from '../net.js';
import { session, loadActive, TC_LABEL } from '../session.js';
import { isProvisional } from '../rating.js';
import { isUnlocked, unlockHint, suggestedLevel } from '../ladder.js';

// Clocks are just minutes per side (no increments), picked from a list
const MINUTES = [1, 2, 3, 5, 10, 15, 30, 60];
const CLOCK_OPTIONS = (untimed) => [...(untimed ? [[0, 'No clock']] : []), ...MINUTES.map((m) => [m, `${m} ${m === 1 ? 'minute' : 'minutes'} each`])];
const COLOR_OPTIONS = [['random', 'Random'], ['w', 'White'], ['b', 'Black']];

export function mount(root) {
  const st = get();
  const mine = st.ratings.computer.r;
  const prefs = { level: suggestedLevel(st).id, color: 'random', tc: [0, 0] };
  const offs = [];
  let waiting = null; let pendingJoin = null; let hostTries = 0;
  const hostPrefs = { tc: [10, 0], color: 'random' };

  const resume = loadActive();
  const view = h('div', { class: 'stack' });
  root.append(view);

  const nameInput = h('input', {
    value: st.player.name, maxlength: 20, 'aria-label': 'Your display name', style: { width: '12rem' },
    onchange: (e) => { setName(e.target.value); e.target.value = get().player.name; },
  });

  /** A labelled drop-down. `options` = [[value, text]]; `get`/`set` read and write the value. */
  function dropdown(id, label, options, get, set) {
    return h('div', { class: 'field' }, h('label', { for: id }, label),
      h('select', { id, onchange: (e) => { set(e.target.value); } },
        options.map(([v, t]) => h('option', { value: String(v), selected: String(get()) === String(v) }, t))));
  }

  function computerCard() {
    const lv = LEVELS.find((l) => l.id === prefs.level);
    const groups = GROUPS.map((g) => {
      const list = LEVELS.filter((l) => l.group === g.id); if (!list.length) return null;
      return h('div', { class: 'level-group' },
        h('h3', {}, g.title), h('p', { class: 'muted small' }, g.blurb),
        h('div', { class: 'levels' }, list.map((l) => {
          const open = isUnlocked(l);
          return h('button', {
            type: 'button', class: `chip level ${l.group}${open ? '' : ' locked'}`, 'aria-pressed': String(l.id === prefs.level), title: open ? (l.person?.note ?? '') : unlockHint(l),
            'aria-disabled': open ? null : 'true',
            onclick: () => { if (open) prefs.level = l.id; else toast(unlockHint(l), 4000); render(); },
          }, h('span', {}, open ? '' : icon('lock', 14), open ? '' : ' ', l.name), h('small', {}, l.group === 'max' ? 'strongest' : `${l.elo}`));
        })));
    });
    return h('section', { class: 'card setup' },
      h('h2', {}, 'Play the computer'),
      h('p', { class: 'muted small' }, 'Runs privately in your browser. Strength was measured by self-play on Stockfish\'s Elo scale (about ±80): good for comparing levels, not the same as a Chess.com or FIDE rating.'),
      h('div', { class: 'banner ladder' }, h('b', {}, `Your rating: ${mine}`), h('span', { class: 'muted small' }, ' — everyone starts at 100. Beat an opponent to open the next one; a win over someone far above you earns the most.')),
      groups,
      lv.person && h('div', { class: 'banner persona' }, h('b', {}, `${lv.name}${lv.person.born ? ` (b. ${lv.person.born})` : ''}`), h('p', { class: 'small' }, lv.person.note)),
      h('div', { class: 'fields' },
        dropdown('cp-color', 'You play', COLOR_OPTIONS, () => prefs.color, (v) => { prefs.color = v; }),
        dropdown('cp-clock', 'Clock', CLOCK_OPTIONS(true), () => prefs.tc[0], (v) => { prefs.tc = [Number(v), 0]; })),
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
      h('p', { class: 'small' }, 'Playing someone regularly? ', h('a', { href: '#/friends' }, 'Add them as a friend'), ' and challenge them in one tap.'),
      h('div', { class: 'two-up' },
        h('div', { class: 'stack' },
          h('h3', {}, 'Host a game'),
          dropdown('host-clock', 'Clock', CLOCK_OPTIONS(false), () => hostPrefs.tc[0], (v) => { hostPrefs.tc = [Number(v), 0]; }),
          dropdown('host-color', 'You play', COLOR_OPTIONS, () => hostPrefs.color, (v) => { hostPrefs.color = v; }),
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
