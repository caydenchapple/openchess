// First-encounter tips and help after repeated failure: the small lines that teach a rule at the moment it matters,
// outside the guided tutorial. One tip at a time, never while the coach is talking or a pop-up is open, each shown once
// (the player's save remembers), and long enough to read.
//
//   const tips = createTips({ load: () => save.tips, save: (t) => { save.tips = t; saveNow(); },
//                             show: (text) => ui.hint(text), hide: () => ui.hint(null), quiet: () => coachVisible || modalOpen });
//   tips.once('dragon-looks', 'Freeze when the eye opens!');     // call it where the situation happens; it shows only the first time
//   tips.fail('caught', { after: 3, text: 'Stand still when the eye opens, or hide behind a rock.' });   // 3 failures in a row brings the rule back, even over the coach
//   (suspend the coach while it shows: show: (t) => { ui.hint(t); tutorial.suspend('tip'); }, hide: () => { ui.hint(null); tutorial.resume('tip'); })
//   tips.succeed('caught');                                      // a success ends the streak
//   // every frame or 250 ms: tips.tick();
//
// A tip that could not be shown (the coach was talking, another tip was up) is dropped and NOT marked seen, so the next time the
// situation happens it gets its chance.

const MIN_MS = 3000, MAX_MS = 9000, NOTICE_MS = 1200;

/** How long a line should stay up: a moment to notice it, then the reading time at a slow-reader pace (140 wpm; adults average 238, young readers read 80-185). The 3 s floor and the notice time are this kit's choice. */
export function readMs(text, wpm = 140) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, NOTICE_MS + (words / wpm) * 60000)));
}

export function createTips({ load = () => null, save = () => {}, now = () => Date.now(), show, hide, quiet = () => false, gap = 2500, wpm = 140, format = (t) => t, onEvent = () => {} } = {}) {
  let seen = {};
  try {
    const raw = load();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const k of Object.keys(raw)) if (raw[k]) seen[k] = 1;
  } catch { seen = {}; }
  const streaks = {};
  let up = null;           // { id, until }
  let freeAt = 0;          // earliest time the next tip may appear

  const persist = () => { try { save({ ...seen }); } catch { /* losing a "seen" flag only repeats a tip */ } };
  function display(id, text, ms) {
    const t = now();
    const line = format(text);
    up = { id, until: t + (ms ?? readMs(line, wpm)) };
    try { show(line, id); } catch { /* the tip must not break the game */ }
    try { onEvent({ type: 'tip', id }); } catch { /* same for the funnel */ }
    return true;
  }
  // `urgent` (help after repeated failure) outranks the coach and pop-ups: when the same mistake keeps happening, the coach is the thing that is not working.
  const blocked = (urgent) => up || now() < freeAt || (!urgent && quiet());

  return {
    /** Show `text` the first time only. Returns true when it was shown. */
    once(id, text, { ms, urgent } = {}) {
      if (seen[id] || blocked(urgent)) return false;
      seen[id] = 1; persist();
      return display(id, text, ms);
    },
    /** Count a failure; at `after` in a row, bring the rule back (and start counting again). Returns true when the tip was shown. */
    fail(id, { after = 3, text, ms, urgent = true } = {}) {
      streaks[id] = (streaks[id] || 0) + 1;
      if (streaks[id] < after || blocked(urgent)) return false;
      streaks[id] = 0;
      return display(`${id}:help`, text, ms);
    },
    succeed(id) { streaks[id] = 0; },
    /** Hide the tip when its time is up. */
    tick() {
      if (up && now() >= up.until) { try { hide(up.id); } catch { /* ignore */ } up = null; freeAt = now() + gap; }
    },
    /** Hide the tip now (a pop-up opened, the coach started). */
    dismiss() { if (up) { try { hide(up.id); } catch { /* ignore */ } up = null; freeAt = now() + gap; } },
    seen: (id) => !!seen[id],
    get current() { return up ? up.id : null; },
    reset() { seen = {}; for (const k of Object.keys(streaks)) delete streaks[k]; persist(); },
  };
}
