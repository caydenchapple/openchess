// Friends: your friend code, adding people, and challenging the friends you have added. No accounts: see social.js.
import { h, clear, toast, twoStep } from '../util.js';
import { get, setName, friendIdentity, friendList } from '../store.js';
import { net, newCode } from '../net.js';
import { session } from '../session.js';
import { avatarEl } from '../avatars.js';
import { icon } from '../icons.js';
import { social, cleanFriendCode, showCode, friendAvatar, FRIEND_RE } from '../social.js';

const MINUTES = [1, 2, 3, 5, 10, 15, 30, 60];
const COLOR_OPTIONS = [['random', 'Random'], ['w', 'White'], ['b', 'Black']];

export function mount(root, params = []) {
  const id = friendIdentity(); // the first visit makes your code
  social.start();
  const view = h('div', { class: 'stack' });
  root.append(view);
  const offs = [];
  const prefs = { time: 10, color: 'random' };
  let openFor = null; // friend code whose challenge form is open
  let hosting = null; // { friend, code, time, color, sent, error, tries }
  let addMsg = '';
  const fromLink = cleanFriendCode(params[0] ?? '');

  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Select it and copy it'); } };
  const link = () => `${location.origin}${location.pathname}#/friends/${get().friends.code}`;

  const codeInput = h('input', {
    class: 'code-input', id: 'friend-code-in', placeholder: 'K7M2 QX9P', maxlength: 9, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Your friend\'s code',
    value: FRIEND_RE.test(fromLink) ? showCode(fromLink) : '',
    oninput: (e) => { const c = cleanFriendCode(e.target.value); e.target.value = showCode(c).trim(); addMsg = ''; const m = view.querySelector('.add-msg'); if (m) m.textContent = ''; },
    onkeydown: (e) => { if (e.key === 'Enter') add(); },
  });
  const nameInput = h('input', {
    value: get().player.name, maxlength: 20, id: 'friends-name', 'aria-label': 'Your name', style: { width: '12rem' },
    onchange: (e) => { setName(e.target.value); e.target.value = get().player.name; toast('Name saved'); },
  });

  async function add() {
    try {
      await social.sendRequest(codeInput.value);
      codeInput.value = ''; addMsg = ''; toast('Request sent');
    } catch (e) { addMsg = e.message; }
    render();
  }

  function startChallenge(f) {
    const code = newCode();
    hosting = { friend: f, code, time: prefs.time, color: prefs.color, sent: null, sending: false, error: '', tries: 0 };
    openFor = null;
    net.enter(code, { role: 'host', time: prefs.time, inc: 0, color: prefs.color });
    render();
  }
  async function sendChallenge() {
    if (!hosting || hosting.sent || hosting.sending) return;
    hosting.sending = true;
    try { hosting.sent = await social.challenge(hosting.friend.code, hosting.code, hosting.time, hosting.color); } catch (e) { hosting && (hosting.error = e.message); }
    if (hosting) hosting.sending = false;
    render();
  }
  function cancelChallenge() {
    if (!hosting) return;
    social.retract(hosting.friend.code, hosting.code);
    net.leave(); hosting = null; render();
  }

  const dot = (code) => h('span', { class: `presence ${social.presence.get(code)?.online ? 'on' : ''}`, 'aria-hidden': 'true' });
  const isOnline = (code) => !!social.presence.get(code)?.online;

  function codeCard() {
    return h('section', { class: 'card stack' },
      h('h2', {}, 'Your friend code'),
      h('p', { class: 'muted small' }, 'Give this code to someone you play with. When they add it and you accept, you are friends: you can see when each other is online and challenge each other in one tap.'),
      h('div', { class: 'big-code', 'aria-label': `Your friend code ${id.code.split('').join(' ')}` }, showCode(get().friends.code)),
      h('div', { class: 'controls' },
        h('button', { class: 'primary', onclick: () => copy(get().friends.code, 'Code') }, icon('copy', 16), 'Copy code'),
        h('button', { onclick: () => copy(link(), 'Link') }, icon('link', 16), 'Copy link')),
      h('div', { class: 'field' }, h('label', { for: 'friends-name' }, 'Your name (your friends see this)'), nameInput));
  }

  function addCard() {
    return h('section', { class: 'card stack' },
      h('h2', {}, 'Add a friend'),
      FRIEND_RE.test(fromLink) && h('div', { class: 'banner' }, `You opened a friend link. Send a request to ${showCode(fromLink)}?`),
      h('label', { for: 'friend-code-in' }, 'Their friend code'),
      h('div', { class: 'row', style: { gap: '.5rem', flexWrap: 'wrap' } }, codeInput, h('button', { class: 'primary', onclick: add }, 'Send request')),
      h('p', { class: 'small error add-msg', role: 'alert' }, addMsg));
  }

  function requestsCard() {
    if (!social.requests.length) return null;
    return h('section', { class: 'card stack' },
      h('h2', {}, `Friend requests · ${social.requests.length}`),
      h('div', { class: 'friend-list' }, social.requests.map((r) => h('div', { class: 'friend-row' },
        avatarEl(friendAvatar(r), 40, r.name),
        h('div', { class: 'friend-main' }, h('b', {}, r.name), h('span', { class: 'muted small' }, 'wants to be your friend')),
        h('div', { class: 'friend-actions' },
          h('button', { class: 'primary', onclick: () => { social.accept(r.from); toast(`You and ${r.name} are friends`); } }, 'Accept'),
          h('button', { class: 'ghost', onclick: () => social.decline(r.from) }, 'Decline'))))));
  }

  function challengeForm(f) {
    return h('div', { class: 'challenge-form' },
      h('div', { class: 'field' }, h('label', { for: `cf-clock-${f.code}` }, 'Clock'),
        h('select', { id: `cf-clock-${f.code}`, onchange: (e) => { prefs.time = Number(e.target.value); } },
          MINUTES.map((m) => h('option', { value: String(m), selected: prefs.time === m }, `${m} ${m === 1 ? 'minute' : 'minutes'} each`)))),
      h('div', { class: 'field' }, h('label', { for: `cf-color-${f.code}` }, 'You play'),
        h('select', { id: `cf-color-${f.code}`, onchange: (e) => { prefs.color = e.target.value; } },
          COLOR_OPTIONS.map(([v, t]) => h('option', { value: v, selected: prefs.color === v }, t)))),
      h('div', { class: 'controls', style: { marginTop: 0 } },
        h('button', { class: 'primary', onclick: () => startChallenge(f) }, icon('play', 16), `Challenge ${f.name}`),
        h('button', { class: 'ghost', onclick: () => { openFor = null; render(); } }, 'Cancel')));
  }

  function friendRow(f) {
    const sent = f.state === 'sent';
    const online = !sent && isOnline(f.code);
    const sub = sent ? 'Request sent. Waiting for them to accept' : online ? 'Online now' : 'Offline';
    return h('div', { class: 'friend-block' },
      h('div', { class: 'friend-row' },
        h('span', { class: 'friend-av' }, avatarEl(friendAvatar(f), 40, f.name), !sent && dot(f.code)),
        h('div', { class: 'friend-main' }, h('b', {}, f.name), h('span', { class: `small ${online ? 'good' : 'muted'}` }, sub)),
        h('div', { class: 'friend-actions' },
          !sent && h('button', { class: 'primary', 'aria-expanded': String(openFor === f.code), onclick: () => { openFor = openFor === f.code ? null : f.code; render(); } }, 'Challenge'),
          h('button', { class: 'ghost', 'aria-label': `${sent ? 'Cancel request to' : 'Remove'} ${f.name}`, onclick: twoStep('Click again', () => { social.remove(f.code); render(); }) }, sent ? 'Cancel' : 'Remove'))),
      openFor === f.code && challengeForm(f));
  }

  function friendsCard() {
    const list = [...friendList()].sort((a, b) => (b.state === 'friend') - (a.state === 'friend') || isOnline(b.code) - isOnline(a.code) || a.name.localeCompare(b.name));
    return h('section', { class: 'card stack' },
      h('h2', {}, 'Your friends'),
      list.length ? h('div', { class: 'friend-list' }, list.map(friendRow))
        : h('p', { class: 'muted' }, 'No friends yet. Share your code above, or type a friend\'s code to send a request.'));
  }

  function waitingCard() {
    const f = hosting.friend; const url = `${location.origin}${location.pathname}#/join/${hosting.code}`;
    return h('section', { class: 'card stack' },
      h('h2', {}, `Waiting for ${f.name}…`),
      hosting.error
        ? h('p', { class: 'error' }, hosting.error)
        : hosting.sent
          ? h('p', { class: 'muted' }, hosting.sent.online ? `${f.name} is online and has your challenge. The game starts the moment they accept.` : `${f.name} is offline. They will see your challenge for 10 minutes after they open OpenChess. You can also send them the link.`)
          : h('p', { class: 'muted' }, 'Sending your challenge…'),
      h('p', { class: 'row small muted' }, h('span', { class: 'spinner' }), ` ${hosting.time} ${hosting.time === 1 ? 'minute' : 'minutes'} each · keep this tab open.`),
      h('div', { class: 'controls' },
        h('button', { onclick: () => copy(url, 'Game link') }, icon('link', 16), 'Copy game link'),
        h('button', { class: 'ghost', onclick: cancelChallenge }, 'Cancel')));
  }

  function render() {
    clear(view);
    const unavailable = social.status === 'unavailable';
    view.append(
      h('div', { class: 'row between' }, h('h1', {}, 'Friends'), social.status === 'connecting' && h('span', { class: 'row small muted' }, h('span', { class: 'spinner' }), ' Connecting…')),
      unavailable && h('div', { class: 'banner' }, 'Friends need the online server, which is not available on this site right now. You can still play the computer and review your games.'),
      h('div', { class: 'friends-grid' },
        h('div', { class: 'stack' }, codeCard(), addCard()),
        h('div', { class: 'stack' }, requestsCard(), hosting ? waitingCard() : friendsCard())));
  }

  offs.push(
    social.onChange(render),
    net.on('waiting', () => sendChallenge()),
    net.on('game', (m) => { hosting = null; session.cfg = { mode: 'online', first: m, code: net.code }; location.hash = '#/game'; }),
    net.on('error', (m) => {
      if (!hosting) return;
      if (/already in use/.test(m.message) && hosting.tries < 3) { // an unlucky duplicate game code: try another
        const { friend, time, color, tries } = hosting; net.leave();
        hosting = { friend, code: newCode(), time, color, sent: null, sending: false, error: '', tries: tries + 1 };
        net.enter(hosting.code, { role: 'host', time, inc: 0, color }); return;
      }
      net.leave(); hosting = null; render(); toast(m.message);
    }),
    net.on('unavailable', () => { hosting = null; render(); toast('Online games are not available on this site right now.'); }),
  );
  render();
  return () => { offs.forEach((f) => f()); if (hosting) { social.retract(hosting.friend.code, hosting.code); net.leave(); } };
}
