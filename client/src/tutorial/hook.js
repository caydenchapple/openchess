// Lets a test (and the playtest) see inside the tutorial: window.__tutorial.
//
//   installHook(tutorial);                 // switches on with ?tutorial or ?playtest in the URL (the playtest adds the latter); never for players
//   __tutorial.view()                      // plain data: the step, its text, its target and spot as boxes in viewport pixels, hint level, steps done
//   __tutorial.events()                    // the funnel events so far (step_shown, step_done with ms, hint, skipped...)
//   __tutorial.goto('merge')               // jump to a step as if the earlier ones were done (nothing is saved)
//   __tutorial.skip() / .reset() / .replay()
//
// scripts/tutorial-check.mts reads this to walk the tutorial like a player and measure every step.

export function installHook(tutorial, { enabled } = {}) {
  let on = enabled;
  if (on === undefined) {
    try { on = /[?&](tutorial|playtest)(=|&|$)/.test(location.search); } catch { on = false; }
    try { on = on || (import.meta.env?.VITE_PLAYTEST === '1'); } catch { /* not a Vite build */ }
  }
  if (!on || typeof window === 'undefined') return false;
  window.__tutorial = {
    view: () => tutorial.debug(),
    events: () => tutorial.log(),
    goto: (id) => tutorial.goto(id),
    skip: () => tutorial.skip(),
    reset: () => { tutorial.reset(); return tutorial.start(); },
    replay: () => tutorial.replay(),
    steps: () => tutorial.steps.map((s) => s.id),
  };
  return true;
}
