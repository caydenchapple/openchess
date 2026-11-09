// Which input the player is using right now (touch, mouse, keyboard or gamepad), and words that match it:
// "Tap the spot" on a phone, "Click the spot" with a mouse, "Press Space" on a keyboard. Last input wins, so a laptop with a touch
// screen, or a phone with a keyboard, always shows the prompt for what the player just used.
//
//   const input = createInputMode();
//   input.format('{Tap} the glowing spot');                     // -> "Tap the glowing spot" (touch) or "Click the glowing spot" (mouse)
//   input.format('{Press} {key:jump} to jump', { jump: { keyboard: 'Space', gamepad: 'A', touch: 'the jump button' } });
//   input.subscribe((mode) => coach.refresh());                 // reword the step the moment the player switches
//
// Tokens: {tap} (pointer targets: tap / click), {press} (keys and buttons: tap / press), {hold} (any case: {Tap} capitalises) and {key:name} looked up in the bindings you pass, per mode, so a remapped key
// shows the new key. A missing binding for a mode falls back to the keyboard one, then to the name itself.

const VERBS = {
  tap: { touch: 'tap', mouse: 'click', keyboard: 'press', gamepad: 'press' },
  hold: { touch: 'press and hold', mouse: 'hold the button on', keyboard: 'hold', gamepad: 'hold' },
  press: { touch: 'tap', mouse: 'press', keyboard: 'press', gamepad: 'press' },   // for keys and buttons: a mouse user presses Space, a phone user taps its button
};
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn']);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createInputMode({ target = globalThis, getGamepads, initial, pollMs = 250 } = {}) {
  const pads = getGamepads ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));
  let mode = initial ?? (target.matchMedia?.('(pointer: coarse)')?.matches || globalThis.matchMedia?.('(pointer: coarse)')?.matches ? 'touch' : 'mouse');
  const subs = new Set();
  let timer = null;

  function set(next) {
    if (next === mode) return;
    mode = next;
    for (const f of [...subs]) { try { f(mode); } catch { /* a bad subscriber must not break input */ } }
  }
  // Only pointer events: the mouse events a browser fires after a touch are compatibility events and carry no pointerType, so they never flip the mode.
  const onPointer = (e) => set(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse');
  const onKey = (e) => { if (!MODIFIERS.has(e.key) && !e.isComposing) set('keyboard'); };
  const onPad = () => { set('gamepad'); startPolling(); };
  const opts = { capture: true, passive: true };
  target.addEventListener?.('pointerdown', onPointer, opts);
  target.addEventListener?.('keydown', onKey, opts);
  target.addEventListener?.('gamepadconnected', onPad, opts);

  /** Look for a gamepad button or stick; call it from the game loop, or let the built-in timer do it once a pad is connected. */
  function poll() {
    let list = [];
    try { list = Array.from(pads() || []); } catch { return; }
    for (const p of list) {
      if (!p) continue;
      if (Array.from(p.buttons || []).some((b) => b.pressed || b.value > 0.5) || Array.from(p.axes || []).some((a) => Math.abs(a) > 0.6)) { set('gamepad'); return; }
    }
  }
  function startPolling() { if (!timer && pollMs > 0 && typeof setInterval === 'function') { timer = setInterval(poll, pollMs); timer.unref?.(); } }

  /** Replace the tokens in `template` with words for the current input. `html: true` wraps keys in <kbd> and escapes binding text. */
  function format(template, bindings = {}, { html = false } = {}) {
    return String(template).replace(/\{(key:)?([A-Za-z][\w-]*)\}/g, (all, key, name) => {
      if (key) {
        const b = bindings[name];
        const label = b == null ? name : typeof b === 'string' ? b : (b[mode] ?? b.keyboard ?? name);
        return html && (mode === 'keyboard' || mode === 'mouse') ? `<kbd>${escapeHtml(label)}</kbd>` : html ? escapeHtml(label) : label;
      }
      const verbs = VERBS[name.toLowerCase()];
      if (!verbs) return all;
      const word = verbs[mode];
      return name[0] === name[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
    });
  }

  return {
    get mode() { return mode; },
    set,
    poll,
    format,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    destroy() {
      target.removeEventListener?.('pointerdown', onPointer, opts);
      target.removeEventListener?.('keydown', onKey, opts);
      target.removeEventListener?.('gamepadconnected', onPad, opts);
      if (timer) clearInterval(timer);
      subs.clear();
    },
  };
}
