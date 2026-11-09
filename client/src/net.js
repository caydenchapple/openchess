// WebSocket client for online play, with automatic reconnect and game rejoin.
import { get } from './store.js';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.queue = [];
    this.open = false;
    this.wantOpen = false;
    this.retry = 0;
    this.stats = { online: 0, playing: 0 };
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }
  #emit(type, msg) { this.handlers.get(type)?.forEach((f) => f(msg)); this.handlers.get('*')?.forEach((f) => f(msg)); }

  connect() {
    this.wantOpen = true;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.open = true; this.retry = 0;
      const { player, ratings } = get();
      ws.send(JSON.stringify({ t: 'hello', id: player.id, name: player.name, rating: ratings.online.r }));
      this.queue.splice(0).forEach((m) => ws.send(JSON.stringify(m)));
      this.#emit('open', {});
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'hello' || m.t === 'stats') this.stats = { online: m.online, playing: m.playing };
      this.#emit(m.t, m);
    };
    ws.onclose = () => {
      this.open = false;
      this.#emit('close', {});
      if (this.wantOpen) setTimeout(() => this.connect(), Math.min(10_000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }

  send(msg) {
    if (this.open) this.ws.send(JSON.stringify(msg));
    else { this.queue.push(msg); this.connect(); }
  }

  close() { this.wantOpen = false; this.ws?.close(); }
}

export const net = new Net();
