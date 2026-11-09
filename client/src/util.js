// Tiny DOM helpers. Everything user-supplied goes through textContent, never innerHTML.

// Make Element.append() ignore null/undefined/false (so `cond && h(...)` is safe everywhere)
// instead of rendering the literal text "null" / "false".
if (typeof Element !== 'undefined') {
  const nativeAppend = Element.prototype.append;
  Element.prototype.append = function append(...nodes) {
    return nativeAppend.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false));
  };
}

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

export const uid = (n = 12) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, n);
};

export function fmtClock(ms) {
  if (ms == null) return '–';
  ms = Math.max(0, ms);
  if (ms < 10_000) return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : null);
export const round = (x, d = 0) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

export function toast(msg, ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast' }, msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function resultFor(result, color) {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return 'none';
}

/**
 * Confirmation without a browser dialog: the first click changes the button's label, a second click within 5 s runs `fn`.
 * Use as onclick: `twoStep('Click again to delete', fn)`.
 */
export function twoStep(label, fn) {
  let armed = null; let original = '';
  return (e) => {
    const btn = e.currentTarget;
    if (armed) { clearTimeout(armed); armed = null; fn(e); return; }
    original = btn.textContent;
    btn.textContent = label;
    armed = setTimeout(() => { armed = null; btn.textContent = original; }, 5000);
  };
}
