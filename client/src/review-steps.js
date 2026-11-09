// The coach script for a player's first review. Each step finishes when the world says so (see teaching.js for the world).
export const reviewSteps = [
    { id: 'next-mistake', say: '{Tap} "Next mistake" to jump to your first error', gesture: 'tap', target: '#btn-next-mistake', after: 700,
      skipIf: (w) => !w.hasMistakes, done: { when: (w) => w.onMistake }, recap: { icon: '🎯', text: '"Next mistake" jumps to your errors' } },
    { id: 'better-move', say: '{Tap} "Show the better move"', gesture: 'tap', target: '#btn-better',
      skipIf: (w) => !w.hasMistakes, done: { when: (w) => w.viewingBetter }, recap: { icon: '💡', text: '"Show the better move" draws the engine\'s choice' } },
    { id: 'step-through', say: '{Tap} ▶ (or press →) to step through the game', gesture: 'tap', target: '#btn-forward',
      done: { when: (w) => w.stepped }, recap: { icon: '⏯', text: 'Step through the game with ▶ ◀ or ← →' } },
];
