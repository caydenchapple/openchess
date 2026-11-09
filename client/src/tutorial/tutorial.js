// The script, the progress and the timing of a tutorial. No DOM and no game code: the game feeds it events and state,
// the coach (coach.js) draws what it says, and a test can run all of it with a fake clock.
//
//   const tutorial = createTutorial({
//     steps: [
//       { id: 'place', say: '{Tap} the glowing spot', gesture: 'tap', target: () => spotEl, done: { when: (g) => g.towers > 0 } },
//       { id: 'start', say: 'Start the wave', target: '#start', done: { event: 'wave-started' }, gift: 'rookie' },
//     ],
//     load: () => save.tutorial, save: (p) => { save.tutorial = p; saveNow(); },
//     context: () => game.state,                 // read by every `when`; keep it cheap and free of side effects
//     skipIfPlayed: (g) => g.stats.games > 0,    // a save from before the tutorial existed: don't teach what they know
//     onEvent: (e) => analytics.send('tutorial', e),
//   });
//   tutorial.start();                            // once the game state is ready
//   // every frame (or every 250 ms):  tutorial.tick();   when the game does something a step waits for:  tutorial.event('wave-started');
//
// Rules this file keeps (each has a test): a step is done when the world says so, in any order and after any reload (state beats events);
// the tutorial never blocks play; a broken save, a throwing callback or a bad script never stops the game; time only counts while the
// player can see the step; a finished or skipped tutorial never comes back, but steps added in a later `version` are taught.

import { rectOf } from './geometry.js';

const DEFAULT_IDLE = { nudge: 8000, demo: 16000, offer: 30000 };
const MAX_DT = 1000;          // a tab that slept for a minute must not make every hint appear at once
const GESTURES = new Set(['tap', 'drag', 'hold', 'swipe', 'key', 'look', 'play']);

/** @typedef {{ event?: string | string[], when?: (ctx: any) => boolean }} Done
 *  @typedef {{ id: string, say: string | ((ctx: any) => string), done: Done, gesture?: string | ((ctx: any) => string), target?: any, spot?: any, key?: string, swipe?: { dx: number, dy: number },
 *            skipIf?: (ctx: any) => boolean, ack?: boolean, gift?: string, after?: number, since?: number, giveUpAfter?: number, idle?: object, recap?: { icon?: string, text?: string } }} Step */

export function createTutorial(options) {
  const o = { version: 0, now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), context: () => ({}), format: (t) => t,
    load: () => null, save: () => {}, onEvent: () => {}, skipIfPlayed: null, ...options };
  const idle = { ...DEFAULT_IDLE, ...(options.idle || {}) };
  const steps = checkScript(o.steps);
  const version = Math.max(o.version || 0, ...steps.map((s) => s.since));

  const reported = new Set();
  const report = (where, err) => {
    if (reported.has(where)) return;
    reported.add(where);
    try { o.onEvent({ type: 'error', where, message: String(err?.message ?? err) }); } catch { /* the funnel must never break the game */ }
  };
  const safely = (where, fn, fallback) => { try { return fn(); } catch (e) { report(where, e); return fallback; } };

  let fresh = true;                         // no tutorial progress was ever stored
  let progress = clean(safely('load', () => o.load(), null));
  const done = new Set(progress.done);      // done in this run; a replay starts empty and writes nothing
  const known = new Set();                  // steps the player already knew, so they are neither taught nor counted
  let started = false, replaying = false, dirty = false;
  let current = null, revealed = false, armed = true;   // armed: in a replay, the step's `when` was false when it appeared, so it can complete by turning true
  let waited = 0, delay = 0, misses = 0, hint = 0, last = null;
  const suspended = new Set();
  const subs = new Set();
  const log = [];                           // the last 200 funnel events, for a test or the playtest to read

  function clean(raw) {
    const ids = new Set(steps.map((s) => s.id));
    const p = { v: 0, done: [], skipped: null, finished: false, gifts: {} };
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      fresh = false;
      if (Number.isInteger(raw.v) && raw.v >= 0 && raw.v < 1e6) p.v = raw.v;
      if (Array.isArray(raw.done)) p.done = [...new Set(raw.done.filter((x) => typeof x === 'string' && ids.has(x)))];
      if (raw.skipped === 'player' || raw.skipped === 'experienced') p.skipped = raw.skipped;
      p.finished = raw.finished === true;
      if (raw.gifts && typeof raw.gifts === 'object' && !Array.isArray(raw.gifts)) for (const k of Object.keys(raw.gifts)) if (raw.gifts[k]) p.gifts[k] = 1;
    }
    return p;
  }

  const ctx = () => safely('context', () => o.context(), {});
  const total = () => steps.length - known.size;
  const index = () => steps.filter((s) => done.has(s.id) && !known.has(s.id)).length;
  const pending = () => steps.filter((s) => !done.has(s.id));
  const stopped = () => !started || !!progress.skipped || (progress.finished && !replaying);

  function emit(type, extra = {}) {
    const s = extra.step === undefined ? current : extra.step;
    const e = { type, id: s?.id ?? null, index: index(), total: total(), hint, misses, replay: replaying, ...extra };
    delete e.step;
    log.push({ t: Math.round(o.now()), ...e }); if (log.length > 200) log.shift();
    safely('onEvent', () => o.onEvent(e));
  }
  function notify() { const v = view(); for (const f of [...subs]) safely('subscriber', () => f(v)); }
  function flush() {
    if (!dirty || replaying) { dirty = false; return; }
    dirty = false;
    progress.done = steps.filter((s) => done.has(s.id)).map((s) => s.id);
    progress.v = version;
    safely('save', () => o.save(JSON.parse(JSON.stringify(progress))));
  }

  /** Start (or resume) once the game state is ready. Returns the view. */
  function start() {
    if (started) return view();
    started = true;
    // Steps added in a later version are taught to players who finished an older one; a player who skipped stays skipped.
    if (progress.finished && progress.v < version && steps.some((s) => s.since > progress.v && !done.has(s.id))) progress.finished = false;
    if (fresh && o.skipIfPlayed && safely('skipIfPlayed', () => o.skipIfPlayed(ctx()), false)) progress.skipped = 'experienced';
    dirty = true;
    if (!progress.skipped && !progress.finished) { evaluate(true); advance(); }
    flush(); notify();
    return view();
  }

  function advance() {
    current = pending()[0] ?? null;
    waited = 0; misses = 0; hint = 0; last = o.now(); revealed = false;   // time counts from the moment the step begins
    if (!current) { finish('done'); return; }
    delay = current.after || 0;
    if (delay === 0) reveal();
  }
  function reveal() {
    revealed = true;
    armed = !(replaying && current.done.when && safely('when', () => current.done.when(ctx()), false));
    emit('step_shown');
  }

  function complete(s, how) {
    if (done.has(s.id)) return;
    const ms = current && current.id === s.id ? Math.round(waited) : 0;
    if (how === 'known' || how === 'prior') known.add(s.id);
    done.add(s.id);
    dirty = true;
    emit(how === 'known' || how === 'prior' ? 'step_known' : 'step_done', { step: s, how, ms });
    if (current && current.id === s.id) advance();
  }

  /** Check every pending step against the world: skipIf (already knows it) and done.when (did it, in any order). */
  function evaluate(initial = false) {
    if (replaying) {
      // A replay teaches again what the world already shows, so a state that was true when the step appeared cannot finish it:
      // events, a state that turns true afterwards, or next() do.
      const s = current;
      if (!s || !revealed || !s.done.when) return;
      const now = safely('when', () => s.done.when(ctx()), false);
      if (!now) armed = true; else if (armed) complete(s, 'did');
      return;
    }
    for (let guard = 0; guard <= steps.length; guard++) {
      const g = ctx();
      let changed = false;
      for (const s of pending()) {
        if (!replaying && s.skipIf && safely('skipIf', () => s.skipIf(g), false)) { complete(s, 'known'); changed = true; break; }
        if (s.done.when && safely('when', () => s.done.when(g), false)) {
          // A step already true when the tutorial starts was learned before: don't teach it.
          complete(s, initial && !replaying ? 'prior' : current && current.id === s.id ? 'did' : 'learned');
          changed = true; break;
        }
      }
      if (!changed) return;
    }
  }

  function endReplay() {
    replaying = false; known.clear(); done.clear();
    for (const id of progress.done) done.add(id);
  }
  function finish(how) {
    revealed = false; current = null;
    if (replaying) { emit('finished', { how }); endReplay(); return; }
    progress.finished = true; dirty = true;
    emit('finished', { how });
  }

  /** The game did something a step may be waiting for. */
  function event(name) {
    if (stopped()) return;
    for (const s of pending()) {
      const ev = s.done.event;
      if (ev && (Array.isArray(ev) ? ev.includes(name) : ev === name)) complete(s, current && current.id === s.id ? 'did' : 'learned');
    }
    evaluate();
    flush(); notify();
  }

  function updateHint() {
    if (!current || !revealed) return false;
    const lim = { ...idle, ...(current.idle || {}) };
    const level = waited >= lim.offer ? 3 : waited >= lim.demo || misses >= 2 ? 2 : waited >= lim.nudge || misses >= 1 ? 1 : 0;
    if (level === hint) return false;
    hint = level; emit('hint', { level });
    return true;
  }

  /** Call every frame or every 250 ms. */
  function tick() {
    const t = o.now();
    const dt = last == null ? 0 : Math.min(MAX_DT, Math.max(0, t - last));
    last = t;
    if (stopped()) return;
    const before = current;
    evaluate();
    let changed = current !== before;
    if (current && !suspended.size) {
      if (!revealed) {
        delay -= dt;
        if (delay <= 0) { delay = 0; reveal(); changed = true; }
      } else {
        waited += dt;
        if (updateHint()) changed = true;
        if (current.giveUpAfter && waited >= current.giveUpAfter) { complete(current, 'gave_up'); changed = true; }
      }
    }
    flush();
    if (changed) notify();
  }

  /** Finish the current step by hand: for a step marked `ack: true` (an info card with nothing to do) and during a replay. Anything else is ignored. */
  function next() {
    if (!current || !revealed || suspended.size || !(replaying || current.ack)) return false;
    complete(current, 'next'); flush(); notify();
    return true;
  }

  /** The player tried the wrong thing for the current step: one miss nudges, two bring up the demo. */
  function miss() { if (current && revealed && !suspended.size) { misses++; updateHint(); notify(); } }
  function suspend(reason = 'other') { if (!suspended.has(reason)) { suspended.add(reason); notify(); } }
  function resume(reason = 'other') { if (suspended.delete(reason)) { last = o.now(); notify(); } }

  function skip(how = 'player') {
    if (replaying) { emit('replay_ended', { how: 'skipped' }); revealed = false; current = null; endReplay(); notify(); return; }
    if (!started || progress.skipped || progress.finished) return;
    emit('skipped', { how });
    progress.skipped = how === 'experienced' ? 'experienced' : 'player';
    revealed = false; current = null; dirty = true; flush(); notify();
  }
  /** Run the whole tutorial again, from the how-to-play screen. Writes nothing to the save and gives no gifts. */
  function replay() {
    replaying = true; started = true; done.clear(); known.clear();
    advance(); notify();
    return view();
  }
  /** Forget everything (a dev button, or "reset progress"). */
  function reset() {
    fresh = true; progress = clean(null); done.clear(); known.clear(); replaying = false; started = false; current = null; revealed = false;
    dirty = true; flush(); notify();
  }

  /** A one-time gift is due while the step that hands it out is showing, and only if it was not given before. */
  const giftDue = (id) => !replaying && !!current && current.gift === id && !progress.gifts[id];
  function takeGift(id) { if (!giftDue(id)) return false; progress.gifts[id] = 1; dirty = true; flush(); return true; }

  /** Dev only: jump to a step as if the earlier ones were done (nothing is saved). */
  function goto(id) {
    const target = steps.find((s) => s.id === id);
    if (!target) return false;
    replaying = true; started = true; done.clear(); known.clear();
    for (const s of steps) { if (s === target) break; done.add(s.id); }
    advance(); notify();
    return true;
  }

  const gestureOf = (s) => {
    const g = typeof s?.gesture === 'function' ? safely('gesture', () => s.gesture(ctx()), null) : (s?.gesture ?? null);
    return GESTURES.has(g) ? g : null;
  };
  const sayOf = (s) => (s ? (typeof s.say === 'function' ? safely('say', () => s.say(ctx()), '') : s.say) : '');

  function view() {
    const s = current;
    const active = started && !!s && !progress.skipped && (replaying || !progress.finished);
    return {
      active, visible: active && revealed && suspended.size === 0, suspended: suspended.size > 0,
      finished: progress.finished, skipped: progress.skipped, replaying,
      id: s?.id ?? null, index: s ? index() : null, total: total(),
      say: s?.say ?? '', raw: active ? sayOf(s) : '', text: active ? o.format(sayOf(s)) : '', dim: !!s?.dim, gesture: gestureOf(s), key: s?.key ?? null, swipe: s?.swipe ?? null,
      target: s?.target ?? null, spot: s?.spot ?? null, hint, offerSkip: hint >= 3, misses, canNext: !!s && (replaying || !!s.ack),
    };
  }

  /** A plain-data summary a test or the playtest can read: boxes instead of functions. Install with installHook(). */
  function debug() {
    const v = view();
    return {
      active: v.active, visible: v.visible, suspended: v.suspended, finished: v.finished, skipped: v.skipped, replaying: v.replaying,
      id: v.id, index: v.index, total: v.total, text: v.text, gesture: v.gesture, key: v.key, swipe: v.swipe, hint: v.hint, misses: v.misses,
      target: v.target == null ? null : rectOf(v.target), spot: v.spot == null ? null : rectOf(v.spot),
      done: steps.filter((s) => done.has(s.id)).map((s) => s.id), known: [...known], gifts: { ...progress.gifts },
    };
  }

  const howToPlay = () => steps.map((s) => ({ id: s.id, icon: s.recap?.icon ?? '', text: s.recap?.text ?? o.format(sayOf(s)) }));

  return {
    start, tick, event, next, miss, suspend, resume, skip, replay, reset, giftDue, takeGift, goto, view, debug, howToPlay,
    log: () => log.slice(),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    steps, version,
  };
}

function checkScript(list) {
  if (!Array.isArray(list) || list.length === 0) throw new TypeError('createTutorial needs a non-empty steps array');
  const seen = new Set();
  return list.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new TypeError(`tutorial step ${i} is not an object`);
    if (typeof raw.id !== 'string' || !raw.id) throw new TypeError(`tutorial step ${i} needs a string id`);
    if (seen.has(raw.id)) throw new TypeError(`tutorial step id "${raw.id}" is used twice`);
    seen.add(raw.id);
    if (typeof raw.say !== 'string' && typeof raw.say !== 'function') throw new TypeError(`tutorial step "${raw.id}" needs say: a string or a function`);
    const d = raw.done ?? (raw.ack ? { event: `ack:${raw.id}` } : null);
    if (!d || (!d.event && typeof d.when !== 'function')) throw new TypeError(`tutorial step "${raw.id}" needs done: { event } or { when(ctx) }`);
    if (raw.gesture != null && typeof raw.gesture !== 'function' && !GESTURES.has(raw.gesture)) throw new TypeError(`tutorial step "${raw.id}": gesture must be one of ${[...GESTURES].join(', ')}`);
    return { since: 1, ...raw, done: d };
  });
}
