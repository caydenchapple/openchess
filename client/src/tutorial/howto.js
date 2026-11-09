// The two places a player looks things up: a "How to play" panel (the controls for the input they use now, the steps of the tutorial, a
// button to replay it) and a small controls card that shows at the start and fades after about 25 s. Both read the same script as the coach.
//
//   const howto = createHowTo({ tutorial, input, bindings, controls: [{ icon: '🏃', label: '{key:move}', text: 'Move' }, { icon: '⏸', label: '{key:pause}', text: 'Pause' }] });
//   menuButton.onclick = (e) => howto.toggle(e.currentTarget);   // pass the button: Safari does not focus a clicked button, so focus could not be handed back
//   const card = createControlsCard({ entries: controls, input, bindings });   card.show();   card.used('move');
//
// The panel closes three ways (the X, Esc, a tap on the backdrop), keeps focus inside while open, hands it back on close, and pauses the
// tutorial's clock meanwhile. It is one pop-up: open() while another of your pop-ups is up is the game's call to refuse.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function line(input, bindings, template) {
  return input ? input.format(esc(template), bindings, { html: true }) : esc(template);
}

export function createHowTo({ tutorial, input = null, bindings = {}, controls = [], title = 'How to play', replayLabel = 'Replay the tutorial', closeLabel = 'Close',
  controlsTitle = 'Controls', stepsTitle = 'Steps', root = document.body, panelClass = '', onOpen, onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'thow-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `<section class="thow ${panelClass}" role="dialog" aria-modal="true" aria-labelledby="thow-title" tabindex="-1">` +
    `<h2 id="thow-title"></h2><button type="button" class="thow-close" aria-label=""></button>` +
    `<h3 class="thow-h3 thow-controls-title"></h3><ul class="thow-controls"></ul><h3 class="thow-h3 thow-steps-title"></h3><ol class="thow-steps"></ol>` +
    `<button type="button" class="thow-replay"></button></section>`;
  root.append(backdrop);
  const panel = backdrop.querySelector('.thow'), closeBtn = backdrop.querySelector('.thow-close'), replayBtn = backdrop.querySelector('.thow-replay');
  backdrop.querySelector('#thow-title').textContent = title;
  closeBtn.setAttribute('aria-label', closeLabel); closeBtn.textContent = '×';
  replayBtn.textContent = replayLabel;
  backdrop.querySelector('.thow-controls-title').textContent = controlsTitle;
  backdrop.querySelector('.thow-steps-title').textContent = stepsTitle;
  let opener = null, isOpen = false;

  function fill() {
    const ul = backdrop.querySelector('.thow-controls'), ol = backdrop.querySelector('.thow-steps');
    ul.innerHTML = controls.map((c) => `<li><span class="thow-icon" aria-hidden="true">${esc(c.icon || '')}</span><span>${line(input, bindings, c.label)} ${esc(c.text || '')}</span></li>`).join('');
    backdrop.querySelector('.thow-controls-title').hidden = controls.length === 0;
    const steps = tutorial ? tutorial.howToPlay() : [];
    ol.innerHTML = steps.map((s) => `<li><span class="thow-icon" aria-hidden="true">${esc(s.icon || '')}</span><span>${line(input, bindings, s.text)}</span></li>`).join('');
    backdrop.querySelector('.thow-steps-title').hidden = steps.length === 0;
    replayBtn.hidden = !tutorial;
  }
  // Safari does not focus a button when it is clicked, so document.activeElement is the page, not the button: pass the button (event.currentTarget).
  function open(from) {
    if (isOpen) return;
    isOpen = true; opener = from || document.activeElement;
    fill();
    backdrop.hidden = false;
    tutorial?.suspend('howto');
    document.addEventListener('keydown', onKey, true);
    closeBtn.focus({ preventScroll: true });
    try { onOpen?.(); } catch { /* the game's callback must not break the panel */ }
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    tutorial?.resume('howto');
    if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    try { onClose?.(); } catch { /* same */ }
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  replayBtn.addEventListener('click', () => { close(); tutorial?.replay(); });
  if (input) input.subscribe(() => { if (isOpen) fill(); });

  return {
    el: backdrop, open, close, toggle: (from) => (isOpen ? close() : open(from)),
    get isOpen() { return isOpen; },
    destroy() { close(); backdrop.remove(); },
  };
}

export function createControlsCard({ entries = [], input = null, bindings = {}, root = document.body, ms = 25000, autoHideWhenUsed = true, position = 'top', schedule = setTimeout, cancel = clearTimeout } = {}) {
  const el = document.createElement('div');
  el.className = 'tcontrols';
  el.dataset.pos = position;   // 'top' (default) or 'bottom': keep it off the controls the player presses
  el.setAttribute('role', 'note');
  el.hidden = true;
  root.append(el);
  const used = new Set();
  let timer = 0;
  function draw() {
    el.innerHTML = entries.map((c) => `<span data-name="${esc(c.name || c.label)}" class="${used.has(c.name || c.label) ? 'used' : ''}">${esc(c.icon || '')} ${line(input, bindings, c.label)} ${esc(c.text || '')}</span>`).join('');
  }
  function hide() { cancel(timer); timer = 0; el.hidden = true; }
  function show() { draw(); el.hidden = false; cancel(timer); timer = schedule(hide, ms); }
  if (input) input.subscribe(() => { if (!el.hidden) draw(); });
  return {
    el, show, hide,
    /** The player used a control: dim it, and when all are used the card leaves early. */
    used(name) {
      used.add(name); if (!el.hidden) draw();
      if (autoHideWhenUsed && entries.length && entries.every((c) => used.has(c.name || c.label))) { cancel(timer); timer = schedule(hide, 1500); }
    },
    get visible() { return !el.hidden; },
    destroy() { hide(); el.remove(); },
  };
}
