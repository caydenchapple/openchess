// Friends: a small always-on connection to your mailbox on the server (see server/friends.js).
// It carries friend requests, "accepted" notes, game challenges and who is online. Nothing here needs an account:
// your friend code and its secret are made in this browser the first time you open Friends.
import { get, subscribe, friendIdentity, friendList, setFriend, dropFriend } from './store.js';
import { serverBase } from './net.js';
import { toast, h } from './util.js';
import { play } from './sound.js';
import { avatarEl, DEFAULT_AVATAR } from './avatars.js';

export const FRIEND_RE = /^[A-HJKMNP-Z2-9]{8}$/;
export const cleanFriendCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0').slice(0, 8);
export const showCode = (c) => (c ? `${c.slice(0, 4)} ${c.slice(4)}` : '');
/** The picture a friend sends is just a preset id; without one they get a letter. */
export const friendAvatar = (f) => (f?.av ? { kind: 'preset', id: f.av } : { kind: 'initial' });

const subs = new Set();
const emit = () => subs.forEach((f) => f());
let ws = null; let timers = []; let failed = 0; let wasReady = false; let stopped = true; let retry = 0; let sentProfile = '';
const pending = []; // promises waiting for the server's answer to a request we sent

export const social = {
  status: 'off', // off | connecting | on | unavailable
  requests: [], // friend requests waiting for you
  challenges: [], // games friends invited you to
  presence: new Map(), // friend code -> { online, known, friend }
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  get badge() { return social.requests.length + social.challenges.filter((c) => c.exp > Date.now()).length; },
  isFriend: (code) => friendList().some((f) => f.code === code && f.state === 'friend'),
  accepted: () => friendList().filter((f) => f.state === 'friend').map((f) => f.code),

  /** Connect (once the player has opened Friends at some point). Safe to call again. */
  start() {
    if (!get().friends.on || ws || social.status === 'unavailable') return;
    stopped = false; connect();
  },
  stop() { stopped = true; clearTimers(); try { ws?.close(); } catch { /* already closed */ } ws = null; social.status = 'off'; emit(); },

  async sendRequest(raw) {
    const code = cleanFriendCode(raw);
    if (!FRIEND_RE.test(code)) throw new Error('Friend codes have 8 letters and numbers, for example K7M2 QX9P.');
    if (code === get().friends.code) throw new Error('That is your own code. Send it to a friend instead.');
    const f = friendList().find((x) => x.code === code);
    if (f?.state === 'friend') throw new Error(`${f.name} is already your friend.`);
    friendIdentity(); social.start();
    const res = await ask({ t: 'request', to: code }, 'request', code);
    setFriend({ code, state: 'sent' });
    emit();
    return res;
  },
  accept(code) {
    const r = social.requests.find((x) => x.from === code);
    setFriend({ code, name: r?.name ?? undefined, av: r?.av ?? null, state: 'friend' });
    social.requests = social.requests.filter((x) => x.from !== code);
    send({ t: 'accept', to: code }); syncFriends();
    if (r) send({ t: 'ack', ids: [r.id] });
    emit();
  },
  decline(code) {
    const r = social.requests.find((x) => x.from === code);
    social.requests = social.requests.filter((x) => x.from !== code);
    if (r) send({ t: 'ack', ids: [r.id] });
    emit();
  },
  remove(code) {
    const f = friendList().find((x) => x.code === code);
    dropFriend(code); social.presence.delete(code);
    if (f?.state === 'friend') send({ t: 'unfriend', to: code });
    syncFriends(); emit();
  },
  challenge(code, room, time, color) { return ask({ t: 'challenge', to: code, room, time, color }, 'challenge', code); },
  retract(code, room) { send({ t: 'retract', to: code, room }); },
  dismissChallenge(id) {
    social.challenges = social.challenges.filter((c) => c.id !== id);
    send({ t: 'ack', ids: [id] }); emit();
  },
  refreshPresence() {
    const list = social.accepted();
    if (list.length) send({ t: 'presence', list });
  },
};

function clearTimers() { timers.forEach(clearInterval); timers = []; }
const open = () => ws && ws.readyState === 1;
function send(msg) { if (open()) ws.send(JSON.stringify(msg)); }
function syncFriends() { send({ t: 'friends', list: social.accepted() }); }

/** Send a message and wait for the server's matching answer (or its next error). */
function ask(msg, type, to) {
  return new Promise((resolve, reject) => {
    if (!open()) {
      if (social.status === 'unavailable') return reject(new Error('Friends need the online server, which is not available on this site right now.'));
      return reject(new Error('Still connecting. Try again in a moment.'));
    }
    const p = { type, to, resolve, reject, timer: setTimeout(() => { pending.splice(pending.indexOf(p), 1); reject(new Error('No answer from the server. Try again.')); }, 8000) };
    pending.push(p);
    ws.send(JSON.stringify(msg));
  });
}

function profile() {
  const { player } = get();
  const a = player.avatar ?? DEFAULT_AVATAR; const av = a.kind === 'preset' ? a.id : null;
  return { name: player.name, av };
}

function connect() {
  const id = friendIdentity();
  social.status = 'connecting'; emit();
  let sock;
  try { sock = new WebSocket(`${serverBase()}/friends/${id.code}`); } catch { social.status = 'unavailable'; emit(); return; }
  ws = sock; wasReady = false;
  sock.onopen = () => {
    const p = profile(); sentProfile = JSON.stringify(p);
    sock.send(JSON.stringify({ t: 'hello', key: id.key, ...p, friends: social.accepted() }));
    clearTimers();
    timers.push(setInterval(() => send({ t: 'ping' }), 25_000));
    timers.push(setInterval(() => { if (!document.hidden) social.refreshPresence(); }, 20_000));
  };
  sock.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
  sock.onclose = () => {
    clearTimers(); if (ws === sock) ws = null;
    if (stopped) return;
    if (!wasReady && ++failed >= 3) { social.status = 'unavailable'; emit(); return; }
    social.status = 'connecting'; emit();
    setTimeout(() => { if (!stopped && !ws) connect(); }, Math.min(30_000, 1000 * 2 ** retry++));
  };
  sock.onerror = () => { try { sock.close(); } catch { /* already closed */ } };
}

function onMessage(m) {
  switch (m.t) {
    case 'ready':
      wasReady = true; failed = 0; retry = 0; social.status = 'on'; emit(); social.refreshPresence(); break;
    case 'events': {
      social.requests = []; social.challenges = [];
      (m.list ?? []).forEach((e) => handle(e, true)); emit(); break;
    }
    case 'event': handle(m.ev, false); emit(); break;
    case 'gone': {
      const ids = new Set(m.ids ?? []);
      social.requests = social.requests.filter((x) => !ids.has(x.id)); social.challenges = social.challenges.filter((x) => !ids.has(x.id)); emit(); break;
    }
    case 'presence': {
      for (const r of m.list ?? []) {
        social.presence.set(r.code, r);
        const f = friendList().find((x) => x.code === r.code);
        if (f && r.friend && ((r.name && r.name !== f.name) || (r.av ?? null) !== (f.av ?? null))) setFriend({ code: r.code, name: r.name ?? f.name, av: r.av ?? null });
      }
      emit(); break;
    }
    case 'sent': {
      const i = pending.findIndex((p) => p.type === m.type && p.to === m.to);
      if (i >= 0) { const [p] = pending.splice(i, 1); clearTimeout(p.timer); p.resolve(m); }
      break;
    }
    case 'error': {
      if (m.taken) { // someone else already uses this friend code: make a new one
        friendIdentity({ fresh: true }); try { ws?.close(); } catch { /* ignore */ } break;
      }
      const p = pending.shift();
      if (p) { clearTimeout(p.timer); p.reject(new Error(m.message)); } else toast(m.message);
      break;
    }
    default: break;
  }
}

/** Something arrived in your mailbox. Requests and challenges stay until you answer; the rest is handled and cleared. */
function handle(e, fromBacklog) {
  const ack = () => send({ t: 'ack', ids: [e.id] });
  const known = friendList().find((f) => f.code === e.from);
  if (e.type === 'request') {
    if (known) { // you already asked them (or are already friends): that settles it
      setFriend({ code: e.from, name: e.name, av: e.av ?? null, state: 'friend' });
      send({ t: 'accept', to: e.from }); syncFriends(); ack(); return;
    }
    if (!social.requests.some((r) => r.id === e.id)) {
      social.requests = [...social.requests.filter((r) => r.from !== e.from), e];
      if (!fromBacklog) { play('card'); toast(`${e.name} sent you a friend request`); }
    }
  } else if (e.type === 'accepted') {
    setFriend({ code: e.from, name: e.name, av: e.av ?? null, state: 'friend' });
    syncFriends(); ack(); social.refreshPresence();
    if (!fromBacklog || known?.state !== 'friend') toast(`${e.name} is now your friend`);
  } else if (e.type === 'removed') {
    if (known) { dropFriend(e.from); social.presence.delete(e.from); syncFriends(); }
    ack();
  } else if (e.type === 'challenge') {
    if (e.exp <= Date.now() || !social.isFriend(e.from)) { ack(); return; }
    if (!social.challenges.some((c) => c.id === e.id)) {
      social.challenges = [...social.challenges.filter((c) => c.from !== e.from), e];
      if (!fromBacklog) play('card');
    }
  } else ack();
}

// keep the server's copy of your name and picture current
subscribe(() => {
  if (!open()) return;
  const p = JSON.stringify(profile());
  if (p === sentProfile) return;
  sentProfile = p; send({ t: 'profile', ...profile() });
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) social.refreshPresence(); });

// ---- the invitation card that appears anywhere in the app when a friend challenges you
const COLOR_TEXT = { w: 'You play Black', b: 'You play White', random: 'Random colours' };
export function mountInvites() {
  const box = h('div', { class: 'invites', 'aria-live': 'polite' });
  document.body.append(box);
  const render = () => {
    const now = Date.now();
    social.challenges = social.challenges.filter((c) => c.exp > now);
    const show = !location.hash.startsWith('#/game') && !location.hash.startsWith('#/join');
    box.replaceChildren(...(show ? social.challenges : []).map((c) => h('div', { class: 'invite', role: 'alertdialog', 'aria-label': `${c.name} challenges you` },
      avatarEl(c.av ? { kind: 'preset', id: c.av } : { kind: 'initial' }, 40, c.name),
      h('div', { class: 'invite-text' },
        h('b', {}, `${c.name} challenges you`),
        h('span', { class: 'muted small' }, `${c.time} ${c.time === 1 ? 'minute' : 'minutes'} each · ${COLOR_TEXT[c.color] ?? COLOR_TEXT.random}`)),
      h('div', { class: 'invite-actions' },
        h('button', { class: 'primary', onclick: () => { social.dismissChallenge(c.id); location.hash = `#/join/${c.room}`; } }, 'Accept'),
        h('button', { class: 'ghost', onclick: () => social.dismissChallenge(c.id) }, 'Decline')))));
  };
  social.onChange(render);
  window.addEventListener('hashchange', render);
  setInterval(render, 15_000);
  render();
}
