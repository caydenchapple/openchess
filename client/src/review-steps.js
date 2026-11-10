// The coach script for a player's first review. Each step finishes when the world says so (see teaching.js for the world).
export const reviewSteps = [
    { id: 'next-mistake', say: '{Tap} "Next mistake" to jump to your first error', gesture: 'tap', target: '#btn-next-mistake', after: 700,
      skipIf: (w) => !w.hasMistakes, done: { when: (w) => w.onMistake }, recap: { icon: '›', text: '"Next mistake" jumps to your errors' } },
    { id: 'better-move', say: '{Tap} "Better move" to see what to play instead', gesture: 'tap', target: '#btn-better',
      skipIf: (w) => !w.hasMistakes, done: { when: (w) => w.viewingBetter }, recap: { icon: '✦', text: '"Better move" shows what the computer would play' } },
    { id: 'step-through', say: '{Tap} ◀ (or press ←) to step back through the game', gesture: 'tap', target: '#btn-back',
      done: { when: (w) => w.stepped }, recap: { icon: '‹', text: 'Step through the game with ◀ ▶ or ← →' } },
];
