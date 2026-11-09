// Teaching layer, built on the tutorial kit in ./tutorial. What it teaches (and why so little) is in docs/GAME_BRIEF.md:
// a controls card on the game screen, first-encounter tips, a short coach walk-through of the review (the one thing
// players cannot guess), and a "How to play" panel with replay.
import { createInputMode } from './tutorial/prompts.js';
import { createTutorial } from './tutorial/tutorial.js';
import { createCoach } from './tutorial/coach.js';
import { createTips } from './tutorial/tips.js';
import { createHowTo, createControlsCard } from './tutorial/howto.js';
import { installHook } from './tutorial/hook.js';
import './tutorial/coach.css';
import { reviewSteps } from './review-steps.js';
import { get, save } from './store.js';
import { toast } from './util.js';

const input = createInputMode({ initial: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse' });
const bindings = {};

// What the review steps read. Set by the review screen; the steps finish when this says so, in any order.
const world = { hasMistakes: false, onMistake: false, viewingBetter: false, stepped: false, reviewedBefore: false };

const data = () => get().teach;
const tutorial = createTutorial({
  version: 1,
  context: () => world,
  format: (t) => input.format(t, bindings),
  skipIfPlayed: (w) => w.reviewedBefore,
  load: () => data().progress,
  save: (p) => { data().progress = p; save(); },
  steps: reviewSteps,
});

const coach = createCoach(tutorial, { input, bindings, skipLabel: 'Skip tips', keepClear: () => [document.querySelector('.top')].filter(Boolean) });

// A step that points at something below the fold brings it into view (once per step) instead of covering the board.
let scrolledFor = null;
tutorial.subscribe((v) => {
  if (!v.visible || typeof v.target !== 'string' || scrolledFor === v.id) return;
  const el = document.querySelector(v.target);
  if (!el) return;
  scrolledFor = v.id;
  const r = el.getBoundingClientRect();
  if (r.bottom > innerHeight - 8 || r.top < 56) {
    el.scrollIntoView({ block: 'center', behavior: 'auto' }); // an instant jump: the bubble can then sit beside the target at once
  }
});
installHook(tutorial);

// ----- tips: a quiet line in the corner, one at a time, each shown once
const tipEl = document.createElement('div');
tipEl.className = 'tip';
tipEl.setAttribute('role', 'status');
tipEl.hidden = true;
document.body.append(tipEl);
const tips = createTips({
  load: () => data().tips,
  save: (t) => { data().tips = t; save(); },
  show: (text) => { tipEl.textContent = text; tipEl.hidden = false; },
  hide: () => { tipEl.hidden = true; },
  quiet: () => tutorial.view().visible || howto.isOpen,
  format: (t) => input.format(t, bindings),
});

// ----- how to play
const CONTROLS = [
  { icon: '♟', label: '{Tap}', text: 'a piece, then a highlighted square — or drag the piece' },
  { icon: '♕', label: 'Promotion', text: 'pick a piece when a pawn reaches the last rank' },
  { icon: '⏱', label: 'Clocks', text: '(timed games) start after Black\'s first move' },
  { icon: '💡', label: 'Hint / Take back', text: 'help you, but the game becomes unrated' },
  { icon: '🎓', label: 'After a game', text: 'open "Review my game" for mistakes, accuracy and lessons' },
  { icon: '⌨', label: '← →', text: 'step through moves in a review (↑ ↓ jump to start / end)' },
];
const replayable = {
  howToPlay: () => tutorial.howToPlay(),
  suspend: (r) => tutorial.suspend(r),
  resume: (r) => tutorial.resume(r),
  replay: () => {
    const g = get().games.find((x) => x.review);
    if (!g) { toast('Finish and review a game first — the walk-through points at the review screen.'); return; }
    location.hash = `#/review/${g.id}`;
    setTimeout(() => tutorial.replay(), 900);
  },
};
const howto = createHowTo({ tutorial: replayable, input, bindings, controls: CONTROLS, title: 'How to play', replayLabel: 'Replay the review walk-through', stepsTitle: 'The review, step by step' });

const card = createControlsCard({
  input, bindings, position: 'bottom',
  entries: [
    { name: 'move', icon: '♟', label: '{Tap}', text: 'a piece, then a highlighted square (or drag)' },
    { name: 'hint', icon: '💡', label: 'Hint', text: 'shows a good move but makes the game unrated' },
  ],
});

let raf = 0;
function loop() { tutorial.tick(); tips.tick(); raf = requestAnimationFrame(loop); }
// requestAnimationFrame pauses in background tabs and some embedded panes; a slow timer keeps steps and tips moving.
setInterval(() => { tutorial.tick(); tips.tick(); }, 250);

export const teaching = {
  tips, howto, card,
  /** Header "?" button. */
  toggleHowTo: (btn) => howto.toggle(btn),
  /** The review screen is open. */
  enterReview({ hasMistakes, reviewedBefore }) {
    Object.assign(world, { hasMistakes, reviewedBefore, onMistake: false, viewingBetter: false, stepped: false });
    tutorial.start();
    tutorial.resume('route');
    if (!raf) raf = requestAnimationFrame(loop);
  },
  reviewState(patch) { Object.assign(world, patch); },
  leaveReview() { tutorial.suspend('route'); },
  /** Any other screen: keep the tip clock running. */
  enterScreen() { if (!raf) raf = requestAnimationFrame(loop); },
};
