// Friends without accounts. Every browser has a friend code (8 characters) and a secret that only it knows.
// A friend's mailbox holds what other players sent them: friend requests, "request accepted" notes, and game challenges.
// Presence (online or not) and challenges only pass between two people who have BOTH added each other.
// Runs unchanged in the Node server (mailboxes in memory) and in a Cloudflare Durable Object (one per friend code, saved to storage).
import { cleanName, tcAllowed } from './game.js';
import { CODE_RE } from './room.js';

export const FRIEND_RE = /^[A-HJKMNP-Z2-9]{8}$/;
export const MAX_FRIENDS = 40;
const MAX_EVENTS = 50;
const TTL = { request: 30 * 864e5, accepted: 30 * 864e5, removed: 30 * 864e5, challenge: 10 * 60e3 };
const AV_RE = /^[a-z]{2}-\d{1,2}$/;

export const cleanAv = (av) => (typeof av === 'string' && AV_RE.test(av) ? av : null);
const cleanList = (list) => [...new Set((Array.isArray(list) ? list : []).map(String).filter((c) => FRIEND_RE.test(c)))].slice(0, MAX_FRIENDS);

export async function hashKey(key) {
  const bytes = new TextEncoder().encode(`openchess-friends:${key}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const emptyData = () => ({ keyHash: null, friends: [], events: [], name: null, av: null });

/**
 * One player's mailbox.
 *  data   — { keyHash, friends: [codes], events: [], name, av }  (saved through `save(data)` after every change)
 *  conns  — () => iterable of live connections: { send(msg), name, av, set({name, av}) }
 *  hub    — { deliver(code, event) -> 'ok' | 'unknown' | 'blocked', probe(code, askerCode) -> { friend, online, name, av } | null }
 */
export class Mailbox {
  constructor(code, data, { conns, hub, save = () => {}, now = () => Date.now() }) {
    this.code = code; this.data = { ...emptyData(), ...data }; this.conns = conns; this.hub = hub; this.persist = save; this.now = now;
    this.seq = 0;
  }

  get claimed() { return !!this.data.keyHash; }
  get online() { for (const c of this.conns()) { if (c.authed) return true; } return false; }
  save() { return this.persist(this.data); }

  /** First message of every connection. Returns an error string or null. */
  async hello(conn, m) {
    const key = String(m.key ?? '');
    if (key.length < 16 || key.length > 80) return 'Bad friend key';
    const hash = await hashKey(key);
    if (this.data.keyHash && this.data.keyHash !== hash) return 'taken';
    this.data.keyHash = hash;
    this.#profile(conn, m);
    if (Array.isArray(m.friends)) this.data.friends = cleanList(m.friends);
    conn.authed = true;
    await this.save();
    conn.send({ t: 'ready', code: this.code });
    this.#flush(conn);
    return null;
  }

  /** Every later message. Returns an error string or null. */
  async message(conn, m) {
    if (!conn.authed) return 'Say hello first';
    switch (m.t) {
      case 'profile': this.#profile(conn, m); await this.save(); return null;
      case 'friends': this.data.friends = cleanList(m.list); await this.save(); return null;
      case 'presence': return this.#presence(conn, m);
      case 'request': return this.#send(conn, m, 'request');
      case 'accept': return this.#send(conn, m, 'accepted');
      case 'unfriend': return this.#send(conn, m, 'removed');
      case 'challenge': return this.#challenge(conn, m);
      case 'retract': return this.#retract(m);
      case 'ack': {
        const ids = new Set((Array.isArray(m.ids) ? m.ids : []).map(String));
        this.data.events = this.data.events.filter((e) => !ids.has(e.id));
        await this.save(); return null;
      }
      default: return null;
    }
  }

  /** Called by another mailbox: store an event for this player and show it to them right away if they are here. */
  async receive(ev) {
    if (!this.claimed) return 'unknown';
    if (ev.type === 'retract') return this.#withdraw(ev);
    const mutual = this.data.friends.includes(ev.from);
    if (ev.type === 'challenge' && !mutual) return 'blocked';
    this.#expire();
    // one open request / challenge per sender; a newer one replaces it
    const same = (e) => e.from === ev.from && (e.type === ev.type || (ev.type === 'accepted' && e.type === 'request') || (ev.type === 'removed' && (e.type === 'request' || e.type === 'challenge')));
    const gone = this.data.events.filter(same).map((e) => e.id);
    this.data.events = this.data.events.filter((e) => !same(e));
    const stored = { ...ev, id: `${this.now().toString(36)}${(this.seq++).toString(36)}`, at: this.now(), exp: this.now() + (TTL[ev.type] ?? 864e5) };
    this.data.events.push(stored);
    if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    await this.save();
    for (const c of this.conns()) { if (c.authed) { if (gone.length) c.send({ t: 'gone', ids: gone }); c.send({ t: 'event', ev: this.#view(stored) }); } }
    return 'ok';
  }

  /** What someone asking about this player may learn. Only people this player has added get an answer. */
  peek(asker) {
    if (!this.claimed) return null;
    const friend = this.data.friends.includes(asker);
    return { friend, online: friend && this.online, name: friend ? this.#liveProfile().name : null, av: friend ? this.#liveProfile().av : null };
  }

  // ---- internals
  async #withdraw(ev) { // the sender cancelled a challenge: take it back
    const hit = this.data.events.filter((e) => e.type === 'challenge' && e.from === ev.from && (!ev.room || e.room === ev.room)).map((e) => e.id);
    if (!hit.length) return 'ok';
    this.data.events = this.data.events.filter((e) => !hit.includes(e.id));
    await this.save();
    for (const c of this.conns()) if (c.authed) c.send({ t: 'gone', ids: hit });
    return 'ok';
  }
  #liveProfile() {
    for (const c of this.conns()) if (c.authed) return { name: c.name ?? this.data.name, av: c.av ?? this.data.av };
    return { name: this.data.name, av: this.data.av };
  }
  #profile(conn, m) {
    const name = cleanName(m.name); const av = cleanAv(m.av);
    conn.set?.({ name, av }); conn.name = name; conn.av = av;
    this.data.name = name; this.data.av = av;
  }
  #expire() { const t = this.now(); this.data.events = this.data.events.filter((e) => e.exp > t); }
  #view(e) { const { type, id, from, name, av, room, time, color, exp, at } = e; return { type, id, from, name, av, room, time, color, exp, at }; }
  #flush(conn) {
    this.#expire();
    conn.send({ t: 'events', list: this.data.events.map((e) => this.#view(e)) });
  }

  async #presence(conn, m) {
    const codes = cleanList(m.list);
    const out = await Promise.all(codes.map(async (code) => {
      let p = null; try { p = await this.hub.probe(code, this.code); } catch { /* unreachable: shown as offline */ }
      return { code, known: !!p, friend: !!p?.friend, online: !!p?.online, name: p?.name ?? null, av: p?.av ?? null };
    }));
    conn.send({ t: 'presence', list: out });
    return null;
  }

  async #send(conn, m, type) {
    const to = String(m.to ?? '').toUpperCase();
    if (!FRIEND_RE.test(to) || to === this.code) return 'That friend code does not look right. Codes have 8 letters and numbers.';
    if (type === 'request' && this.data.friends.length >= MAX_FRIENDS) return `You can have up to ${MAX_FRIENDS} friends.`;
    const { name, av } = this.#liveProfile();
    if (type === 'accepted' && !this.data.friends.includes(to)) this.data.friends = [...this.data.friends, to].slice(0, MAX_FRIENDS);
    if (type === 'removed') this.data.friends = this.data.friends.filter((c) => c !== to);
    if (type !== 'request') await this.save();
    const res = await this.hub.deliver(to, { type, from: this.code, name, av });
    if (res === 'unknown') return 'No one has that friend code. Check it with your friend.';
    conn.send({ t: 'sent', type, to, result: res });
    return null;
  }

  async #challenge(conn, m) {
    const to = String(m.to ?? '').toUpperCase();
    const room = String(m.room ?? '').toUpperCase();
    const time = Number(m.time);
    if (!FRIEND_RE.test(to) || !CODE_RE.test(room) || !tcAllowed(time, 0)) return 'That challenge could not be sent.';
    const color = ['w', 'b', 'random'].includes(m.color) ? m.color : 'random';
    const { name, av } = this.#liveProfile();
    const res = await this.hub.deliver(to, { type: 'challenge', from: this.code, name, av, room, time, color });
    if (res === 'unknown') return 'No one has that friend code.';
    if (res === 'blocked') return 'They have not added you back yet, so they cannot get your challenge. Send them the game link instead.';
    const peek = await this.hub.probe(to, this.code).catch(() => null);
    conn.send({ t: 'sent', type: 'challenge', to, room, result: res, online: !!peek?.online });
    return null;
  }

  async #retract(m) {
    const to = String(m.to ?? '').toUpperCase();
    if (!FRIEND_RE.test(to)) return null;
    await this.hub.deliver(to, { type: 'retract', from: this.code, room: String(m.room ?? '').toUpperCase() });
    return null;
  }
}

/** The Node server's set of mailboxes, in memory. */
export class Hub {
  constructor({ now } = {}) { this.boxes = new Map(); this.now = now; }
  box(code) {
    let b = this.boxes.get(code);
    if (!b) {
      b = new Mailbox(code, emptyData(), { conns: () => b.live, hub: this, now: this.now });
      b.live = new Set();
      this.boxes.set(code, b);
    }
    return b;
  }
  async deliver(code, ev) {
    const b = this.boxes.get(code);
    return b ? b.receive(ev) : 'unknown';
  }
  async probe(code, asker) { return this.boxes.get(code)?.peek(asker) ?? null; }
  get size() { return this.boxes.size; }
}
