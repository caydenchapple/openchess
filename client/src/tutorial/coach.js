// Draws the current tutorial step: a bubble with one short line, a ring on the target, a spot to drop on, and a hand that shows the gesture.
// It lets every click through (only its Skip button takes one), follows its target every frame, keeps the bubble off what it points at,
// goes quiet while a pop-up, an ad or a hidden tab is up, and never takes keyboard focus.
//
//   import './coach.css';
//   const coach = createCoach(tutorial, { input, bindings, onSkip: () => ui.toast('Tips are in the menu') });
//
// Options: input (prompts.js, so "{Tap}" follows the player's device), bindings (for {key:name}), skipLabel, bubbleClass (e.g. 'ui-panel' to use
// the game's own panel material), hand (HTML for your own pointer art), prefer ('near' | 'edges'), keepClear (() => boxes the bubble must not cover,
// e.g. the score and the minimap), reduceMotion (() => boolean, default the OS setting or a .reduce-motion class), bodyClass (default 'coaching'
// while a step shows, so game CSS can silence competing badges: one voice), autoSuspend (default true: a hidden tab pauses the tutorial),
// nextLabel (the button on info steps and in a replay, where nothing else can finish a step the world already shows).

import { rectOf, placeBubble, atLeast, onScreen, edgeIndicator } from './geometry.js';

const TARGET_MIN = 44, SPOT_SIZE = 60, RING_PAD = 6;

export function createCoach(tutorial, { root = document.body, input = null, bindings = {}, skipLabel = 'Skip tips', onSkip, bubbleClass = '', hand = '',
  prefer, keepClear = () => [], reduceMotion, bodyClass = 'coaching', autoSuspend = true, nextLabel = 'Got it' } = {}) {
  const el = document.createElement('div');
  el.className = 'tcoach';
  el.hidden = true;
  el.innerHTML = `<div class="tcoach-ring" aria-hidden="true"></div><div class="tcoach-spot" aria-hidden="true"><i></i></div><div class="tcoach-path" aria-hidden="true"></div><div class="tcoach-arrow" aria-hidden="true"><i></i></div>` +
    `<div class="tcoach-hand" aria-hidden="true">${hand || '<i></i>'}</div>` +
    `<div class="tcoach-bubble ${bubbleClass}" role="status" aria-live="polite"><span class="tcoach-count"></span><p class="tcoach-text"></p><div class="tcoach-actions"><button type="button" class="tcoach-next"></button><button type="button" class="tcoach-skip"></button></div></div>`;
  root.append(el);
  const $ = (s) => el.querySelector(s);
  const ring = $('.tcoach-ring'), arrow = $('.tcoach-arrow'), spotEl = $('.tcoach-spot'), handEl = $('.tcoach-hand'), pathEl = $('.tcoach-path'), bubble = $('.tcoach-bubble');
  const textEl = $('.tcoach-text'), countEl = $('.tcoach-count'), skipBtn = $('.tcoach-skip'), nextBtn = $('.tcoach-next');
  skipBtn.textContent = skipLabel;
  nextBtn.textContent = nextLabel;
  nextBtn.addEventListener('click', () => tutorial.next());
  skipBtn.addEventListener('click', () => { tutorial.skip(); try { onSkip?.(); } catch { /* the game's callback must not break the coach */ } });

  let frame = 0, view = tutorial.view(), shownText = '', shownId = null, cache = '', motionKey = '';
  const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => (reduceMotion ? !!reduceMotion() : !!(motionQuery?.matches || document.documentElement.classList.contains('reduce-motion') || document.body.classList.contains('reduce-motion')));
  // Positions use the individual `translate` property, so the bubble's pop animation (which uses `scale`) never replaces its place.
  const setBox = (node, b) => { node.style.translate = `${b.x}px ${b.y}px`; node.style.width = `${b.w}px`; node.style.height = `${b.h}px`; };
  const setVar = (name, v) => el.style.setProperty(name, `${Math.round(v * 10) / 10}px`);

  function render(v) {
    view = v;
    const show = v.visible;
    el.hidden = !show;
    if (bodyClass) document.body.classList.toggle(bodyClass, show);
    if (!show) { cancelAnimationFrame(frame); frame = 0; shownId = null; return; }
    const text = v.text;
    if (text !== shownText || v.id !== shownId) {
      shownText = text;
      // Developer-written step text goes into innerHTML only after < and & are neutralised; {key:name} becomes <kbd>.
      textEl.innerHTML = input ? input.format(escapeAngle(v.raw), bindings, { html: true }) : escapeAngle(text);
      bubble.classList.remove('pop'); void bubble.offsetWidth; if (!reduced()) bubble.classList.add('pop');
    }
    countEl.textContent = v.total > 1 ? `${v.index + 1} / ${v.total}` : '';
    countEl.hidden = v.total <= 1;
    nextBtn.hidden = !v.canNext;
    shownId = v.id;
    // The motion plays in short bursts (never longer than 5 s, WCAG 2.2.2); a new step or a stronger hint plays it again.
    const key = `${v.id}|${v.hint}`;
    if (key !== motionKey) { motionKey = key; restartMotion(); }
    el.dataset.step = v.id; el.dataset.gesture = v.gesture || ''; el.dataset.hint = String(v.hint);
    if (v.dim) el.dataset.dim = ''; else delete el.dataset.dim;
    if (reduced()) el.dataset.reduced = ''; else delete el.dataset.reduced;
    if (!frame) loop();
  }

  function restartMotion() {
    if (reduced() || typeof el.getAnimations !== 'function') return;
    for (const a of el.getAnimations({ subtree: true })) { try { a.currentTime = 0; a.play(); } catch { /* not restartable: it plays on its own */ } }
  }

  function loop() {
    const v = tutorial.view();
    // The words or the gesture can come from functions of the game's state or the input, so they can change without the engine telling anyone.
    if (v.text !== shownText || (v.gesture || '') !== (el.dataset.gesture || '')) render(v);
    if (!view.visible) return;
    layout();
    frame = requestAnimationFrame(loop);
  }

  function layout() {
    const v = view;
    const viewport = { w: document.documentElement.clientWidth || innerWidth, h: innerHeight };
    let box = rectOf(v.target), spot = rectOf(v.spot);
    // A target that is off screen can't be circled: an arrow at the screen edge points to it instead.
    const away = box && !onScreen(box, viewport, 0.1) ? edgeIndicator(box, viewport) : null;
    arrow.hidden = !away;
    if (away) { arrow.style.translate = `${away.x}px ${away.y}px`; arrow.style.rotate = `${away.angle}rad`; el.dataset.arrow = ''; } else delete el.dataset.arrow;
    if (away || (box && !onScreen(box, viewport, 0.1))) box = null;
    const spotBox = spot ? atLeast({ x: spot.x, y: spot.y, w: 0, h: 0 }, SPOT_SIZE) : null;
    const targetBox = box ? atLeast(box, TARGET_MIN) : null;

    ring.hidden = !box;
    if (box) setBox(ring, { x: targetBox.x - RING_PAD, y: targetBox.y - RING_PAD, w: targetBox.w + 2 * RING_PAD, h: targetBox.h + 2 * RING_PAD });   // a point target (a 3D marker) still gets a ring of at least 44 px
    spotEl.hidden = !spot;
    if (spot) spotEl.style.translate = `${spot.x}px ${spot.y}px`;

    // The hand: tap and hold on the target; drag from the target to the spot; swipe along a vector. A plain tap shows it from the first nudge on.
    const from = box ? { x: box.x + box.w * 0.5, y: box.y + box.h * 0.55 } : { x: viewport.w / 2, y: viewport.h * 0.6 };
    let to = null;
    if (v.gesture === 'drag' && spot) to = { x: spot.x, y: spot.y };
    if (v.gesture === 'swipe') to = { x: from.x + (v.swipe?.dx ?? 120), y: from.y + (v.swipe?.dy ?? 0) };
    const wantsHand = v.gesture === 'drag' || v.gesture === 'swipe' || v.gesture === 'hold' || (v.gesture === 'tap' && v.hint >= 1);
    const handShown = wantsHand && (box || v.gesture === 'swipe') && (v.gesture !== 'drag' || (box && spot));
    handEl.hidden = !handShown;
    if (handShown) {
      setVar('--fx', from.x); setVar('--fy', from.y);
      setVar('--tx', (to ?? from).x); setVar('--ty', (to ?? from).y);
    }
    // Reduced motion: a still dashed line from the target to where it goes.
    const showPath = !!(handShown && to && reduced());
    pathEl.hidden = !showPath;
    if (showPath) {
      const dx = to.x - from.x, dy = to.y - from.y;
      pathEl.style.transform = `translate(${from.x}px, ${from.y}px) rotate(${Math.atan2(dy, dx)}rad)`;
      pathEl.style.width = `${Math.hypot(dx, dy)}px`;
    }

    // The bubble: off the target, off the spot, off whatever the game wants kept clear; upright phones put it at the far edge.
    const size = { w: bubble.offsetWidth, h: bubble.offsetHeight };
    const cardBox = rectOf(document.querySelector('.tcontrols:not([hidden])'));          // the controls card, when it is up, is kept clear too
    const avoid = [targetBox, spotBox, cardBox, ...safeBoxes(keepClear)].filter(Boolean);
    const anchor = spotBox ?? targetBox;
    const mode = prefer ?? (viewport.h > viewport.w * 1.4 ? 'edges' : 'near');
    const key = [size.w, size.h, viewport.w, viewport.h, mode, ...avoid.map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`)].join('|');
    if (key !== cache) {
      cache = key;
      const p = placeBubble({ viewport, size, avoid, anchor, prefer: mode });
      bubble.style.translate = `${Math.round(p.x)}px ${Math.round(p.y)}px`;
      el.dataset.side = p.side;
      if (p.covered) el.dataset.covered = ''; else delete el.dataset.covered;
    }
  }

  const unsub = tutorial.subscribe(render);
  const onVis = () => { if (document.hidden) tutorial.suspend('hidden'); else tutorial.resume('hidden'); };
  if (autoSuspend) { document.addEventListener('visibilitychange', onVis); if (document.hidden) tutorial.suspend('hidden'); }
  const unmode = input?.subscribe?.(() => { shownText = ''; render(tutorial.view()); });
  render(view);

  return {
    el,
    /** Redraw now (after a language change, say). */
    refresh() { shownText = ''; cache = ''; render(tutorial.view()); },
    destroy() {
      unsub(); unmode?.(); cancelAnimationFrame(frame); frame = 0;
      document.removeEventListener('visibilitychange', onVis);
      if (bodyClass) document.body.classList.remove(bodyClass);
      el.remove();
    },
  };
}

function safeBoxes(fn) { try { return (fn() || []).map(rectOf).filter(Boolean); } catch { return []; } }
function escapeAngle(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
