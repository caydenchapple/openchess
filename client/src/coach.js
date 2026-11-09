// The coach. Plain code, no AI model and no network: it reads Stockfish's evaluations plus the
// rules of chess and turns them into explanations, lessons, opening notes and training plans.
import { Chess } from 'chess.js';
import { uciToMove, THEME_LABELS, THEME_ADVICE } from './analysis-core.js';
import { OPENING_NOTES, FALLBACK_NOTES } from './opening-notes.js';
import { round } from './util.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE = 9000;
const sideName = (c) => (c === 'w' ? 'White' : 'Black');
const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const an = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const moveLabel = (i, san) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'} ${san}`;

/** Centipawns (from the point of view of the side being described) → words. */
export function standing(cp) {
  const a = Math.abs(cp);
  if (a >= MATE) return cp > 0 ? 'winning by force' : 'getting checkmated';
  const w = a < 40 ? null : a < 100 ? 'slightly' : a < 250 ? 'clearly' : a < 600 ? 'much' : 'completely';
  if (!w) return 'about equal';
  if (w === 'completely') return cp > 0 ? 'winning' : 'lost';
  return `${w} ${cp > 0 ? 'better' : 'worse'}`;
}

export function fmtEval(cp) {
  if (Math.abs(cp) >= MATE) return cp > 0 ? '+M' : '-M';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** What a move does, as short phrases: "captures a knight", "gives check", … */
export function describeMove(m, fenBefore) {
  if (!m) return '';
  const out = [];
  if (m.san.startsWith('O-O')) out.push('castles, tucking the king away and activating a rook');
  if (m.promotion) out.push(`promotes to a ${NAME[m.promotion]}`);
  if (m.captured) out.push(`captures a ${NAME[m.captured]}`);
  if (/#$/.test(m.san)) out.push('is checkmate');
  else if (/\+$/.test(m.san)) out.push('gives check');
  if (!out.length) {
    const backRank = m.color === 'w' ? '1' : '8';
    if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === backRank) out.push(`develops the ${NAME[m.piece]}`);
    else if (m.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(m.to)) out.push('fights for the centre');
    else if (m.piece === 'k') out.push('moves the king');
    else if (m.piece === 'r' && /[a-h][78]|[a-h][12]/.test(m.to)) out.push('activates the rook');
  }
  return out.join(' and ');
}

/** Why was this player move bad? Builds a short explanation from engine data and the rules. */
export function explainPly(ply, fenBefore, fenAfter) {
  const played = uciToMove(fenBefore, ply.uci);
  const best = ply.bestUci ? uciToMove(fenBefore, ply.bestUci) : null;
  const reply = ply.refute ? uciToMove(fenAfter, ply.refute) : null;
  const tags = ply.tags ?? [];
  const parts = [];

  if (tags.includes('missed-mate') && best) {
    parts.push(`You had a forced checkmate here, starting with ${best.san}.`);
    parts.push('When the enemy king is exposed, always check every check first.');
  } else if (tags.includes('allowed-mate')) {
    parts.push(`${ply.san} allows a forced checkmate${reply ? `, starting with ${reply.san}` : ''}.`);
    if (best) parts.push(`${best.san} kept you safe.`);
    parts.push('Before moving, look at your opponent\'s checks and which pieces guard your king.');
  } else if (tags.includes('hung-piece') && reply) {
    const lost = NAME[reply.captured];
    parts.push(reply.to === played?.to
      ? `The ${NAME[played.piece]} you moved to ${played.to} can simply be captured: ${reply.san} wins a ${lost}.`
      : `${ply.san} leaves a ${lost} undefended — your opponent can reply ${reply.san} and win it.`);
    if (best) parts.push(`${best.san} was better${describeMove(best) ? ` (it ${describeMove(best)})` : ''}.`);
  } else if (tags.includes('missed-tactic') && best) {
    parts.push(`There was a tactic: ${best.san} ${describeMove(best)}.`);
    parts.push('Scan checks, captures and threats — for both sides — before choosing a quiet move.');
  } else if (tags.includes('blown-advantage')) {
    parts.push(`You were ${standing(ply.cpBefore)}, but ${ply.san} let it slip (now ${standing(ply.cpAfter)}).`);
    if (best) parts.push(`${best.san} kept the advantage${describeMove(best) ? ` — it ${describeMove(best)}` : ''}.`);
  } else {
    const before = standing(ply.cpBefore); const after = standing(ply.cpAfter);
    parts.push(`${ply.san} was ${an(ply.cls)} ${ply.cls}: ${before === after ? `it let your position slip a little (still ${after})` : `the position went from ${before} to ${after} for you`}.`);
    if (best) parts.push(`The engine preferred ${best.san}${describeMove(best) ? `, which ${describeMove(best)}` : ''}.`);
    if (reply) parts.push(`After that, your opponent can play ${reply.san}${describeMove(reply) ? `, which ${describeMove(reply)}` : ', which is strong'}.`);
  }
  if (ply.phase === 'opening' && !tags.includes('missed-mate')) parts.push('In the opening: develop pieces, fight for the centre, castle early.');
  if (ply.phase === 'endgame') parts.push('In endgames, activate your king and think about pawn races and the opposition.');
  return parts.join(' ');
}

const THEME_LESSONS = {
  'hung-piece': {
    title: 'Blunder-check before every move',
    body: (n, ex) => `You left a piece to be captured ${plural(n, 'time')}${ex ? ` (for example ${ex})` : ''}. Hanging pieces decide most games below master level. Make a habit: after choosing a move, look at the square it lands on and at every piece it stops protecting.`,
    drill: 'Play your next 3 games with a rule: before each move, name your opponent\'s last move\'s threat out loud. Then solve 10 "hanging piece" or "capture the defender" puzzles.',
  },
  'missed-tactic': {
    title: 'Look at checks, captures and threats first',
    body: (n, ex) => `You missed a winning tactic ${plural(n, 'time')}${ex ? ` (for example ${ex})` : ''}. Tactics (forks, pins, skewers, discovered attacks) come from forcing moves, so list every check, capture and threat for both sides before playing something quiet.`,
    drill: 'Solve 10 tactics puzzles a day for a week, speaking your candidate checks and captures before each answer.',
  },
  'missed-mate': {
    title: 'Hunt for checkmate',
    body: (n, ex) => `You had a forced mate ${plural(n, 'time')} and played something else${ex ? ` (${ex})` : ''}. When the enemy king has few safe squares, go through every check, even ones that look like sacrifices.`,
    drill: 'Practise mate-in-1 and mate-in-2 puzzles until you can solve them in under 10 seconds.',
  },
  'allowed-mate': {
    title: 'Keep your king safe',
    body: (n, ex) => `You walked into a forced checkmate ${plural(n, 'time')}${ex ? ` (${ex})` : ''}. Before moving a pawn or piece near your king, check which of your opponent's checks or sacrifices become possible.`,
    drill: 'Review your king\'s surroundings every move for a week: which squares around it are attacked, and which defenders just left?',
  },
  'blown-advantage': {
    title: 'Convert winning positions',
    body: (n) => `You let a clearly better position slip ${plural(n, 'time')}. When you are ahead, trade pieces (not pawns), keep your king safe, and avoid unclear complications.`,
    drill: 'Practise converting: play out positions a queen or rook ahead against the computer until you win them cleanly.',
  },
  'opening-mistake': {
    title: 'Build a simple opening repertoire',
    body: (n) => `You made ${plural(n, 'opening inaccuracy')}. You do not need to memorise lines — learn the plan behind one opening for White and one defence against each of 1.e4 and 1.d4.`,
    drill: 'Pick one setup per colour and play it for 10 games. After each game, check the review page to see how your opening went.',
  },
  'endgame-error': {
    title: 'Learn the basic endgames',
    body: (n) => `You slipped in the endgame ${plural(n, 'time')}. Endgames reward knowing a few key positions: king and pawn vs king, the opposition, rook endgames (Lucena and Philidor).`,
    drill: 'Spend 10 minutes a day on king-and-pawn endings against the computer, starting from simple positions.',
  },
};

const GENERAL_LESSONS = [
  {
    title: 'Slow down on critical moves',
    body: 'Most big swings happen in a few moments. When a position gets tactical (captures available, king exposed), spend your time there and play quickly when it is calm.',
    drill: 'In your next game, pause whenever a capture or check is possible, and find your opponent\'s best reply before moving.',
  },
  {
    title: 'Review every game',
    body: 'Improvement comes from understanding your mistakes. Step through your biggest errors on the review page and ask what you missed, not just what the engine played.',
    drill: 'After each game, jump to your biggest mistake and try to find the better move before pressing "Better move".',
  },
  {
    title: 'Use all your pieces',
    body: 'Strong play keeps every piece active. Before each move ask: which is my worst-placed piece, and how can I improve it?',
    drill: 'For five games, always ask "which piece is doing least?" when no tactic is available.',
  },
];

/** Full post-game report for the player. */
export function reviewReport({ review, game, fens }) {
  const me = game.color;
  const opp = me === 'w' ? 'b' : 'w';
  const mine = review.mine;
  const theirs = review.summary[opp];
  const plies = review.plies;
  const myPlies = plies.filter((p) => p.color === me);

  // ----- summary
  const lines = [];
  const outcome = game.outcome;
  const oppName = game.opponent?.name ?? 'your opponent';
  const result = outcome === 'win' ? `You beat ${oppName}` : outcome === 'loss' ? `You lost to ${oppName}` : outcome === 'draw' ? `You drew with ${oppName}` : `You played ${oppName}`;
  const nMoves = Math.ceil(plies.length / 2);
  if (game.reason === 'resignation' && outcome === 'loss') lines.push(`You resigned against ${oppName} as ${sideName(me)} after ${plural(nMoves, 'move')}.`);
  else lines.push(`${result} as ${sideName(me)}${game.reason ? ` (${game.reason})` : ''}.`);
  if (plies.length < 12) lines.push('This was a short game, so the lessons below are general tips rather than patterns.');
  if (mine.accuracy != null) {
    const rel = mine.accuracy > (theirs.accuracy ?? 0) + 3 ? 'higher than' : mine.accuracy < (theirs.accuracy ?? 0) - 3 ? 'lower than' : 'similar to';
    lines.push(`Your accuracy was ${mine.accuracy}%, ${rel} your opponent's ${theirs.accuracy}%.`);
  }
  const worst = [...myPlies].sort((a, b) => b.loss - a.loss)[0];
  if (worst && worst.loss >= 10) {
    lines.push(`The turning point was ${moveLabel(worst.i, worst.san)} (${worst.cls}): the position went from ${standing(worst.cpBefore)} to ${standing(worst.cpAfter)} for you.`);
  } else {
    lines.push('You played without any serious mistakes.');
  }
  const theirWorst = plies.filter((p) => p.color === opp).sort((a, b) => b.loss - a.loss)[0];
  if (theirWorst && theirWorst.loss >= 20 && outcome !== 'win') {
    lines.push(`Your opponent also slipped with ${moveLabel(theirWorst.i, theirWorst.san)} — check the review to see if you could have punished it.`);
  }
  const c = mine.counts;
  lines.push(`You made ${plural(c.blunder, 'blunder')}, ${plural(c.mistake, 'mistake')} and ${plural(c.inaccuracy, 'inaccuracy').replace('inaccuracys', 'inaccuracies')}.`);

  // ----- strengths
  const strengths = [];
  if (mine.accuracy >= 85) strengths.push('Very accurate play overall — most of your moves matched the engine\'s ideas.');
  if (c.blunder === 0 && myPlies.length >= 10) strengths.push('No blunders: you kept your pieces safe.');
  if (mine.phases.opening >= 85) strengths.push('A solid opening with good development.');
  if (mine.phases.middlegame >= 85) strengths.push('Strong middlegame: you handled the tactics well.');
  if (mine.phases.endgame >= 85) strengths.push('Good endgame technique.');
  if (c.best + c.book >= myPlies.length * 0.5 && myPlies.length >= 10) strengths.push(`You found the engine's top choice (or book move) ${c.best + c.book} times out of ${myPlies.length}.`);
  if (outcome === 'win' && mine.accuracy < 70) strengths.push('You stayed in the game and took your chances.');
  if (!strengths.length) strengths.push('You played the game to the end — every review makes the patterns easier to spot.');

  // ----- lessons: most frequent themes first, then phase weakness, then general advice
  const lessons = [];
  const themes = Object.entries(review.themes).filter(([k]) => THEME_LESSONS[k]).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of themes) {
    if (lessons.length >= 3) break;
    if (k === 'opening-mistake' && lessons.some((l) => l.theme === 'opening-mistake')) continue;
    const first = [...myPlies].filter((p) => p.tags.includes(k)).sort((a, b) => b.loss - a.loss)[0];
    const L = THEME_LESSONS[k];
    lessons.push({ theme: k, title: L.title, body: L.body(n, first ? moveLabel(first.i, first.san) : ''), drill: L.drill });
  }
  const phases = Object.entries(mine.phases).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
  if (lessons.length < 3 && phases.length && phases[0][1] < 75) {
    const [ph, acc] = phases[0];
    const covered = lessons.some((l) => l.theme === (ph === 'opening' ? 'opening-mistake' : ph === 'endgame' ? 'endgame-error' : ph));
    if (!covered) {
      const drill = ph === 'opening' ? THEME_LESSONS['opening-mistake'].drill : ph === 'endgame' ? THEME_LESSONS['endgame-error'].drill : THEME_LESSONS['missed-tactic'].drill;
      const advice = ph === 'opening' ? 'Focus on development, the centre and castling.' : ph === 'middlegame' ? 'Slow down and look for tactics and threats before each move.' : 'Learn the basic king-and-pawn and rook endgames.';
      lessons.push({ theme: ph, title: `Your ${ph} needs work`, body: `Your ${ph} accuracy was ${acc}%, your weakest phase this game. ${advice}`, drill });
    }
  }
  for (const g of GENERAL_LESSONS) { if (lessons.length >= 3) break; lessons.push({ theme: 'general', ...g }); }

  // ----- opening
  const op = review.opening;
  const notes = openingNotes(op.name, op.eco, me);
  const opening = { comment: openingComment(review, game), tip: notes.nextStep, notes };

  // ----- key moments
  const keyMoments = review.keyMoments.map((i) => ({ id: i, explanation: explainPly(plies[i], fens[i], fens[i + 1]) }));

  return { summary: lines.join(' '), strengths, lessons, opening, keyMoments };
}

function openingComment(review, game) {
  const op = review.opening;
  const me = game.color;
  const b = op.bookPlies;
  const plies = review.plies;
  const bits = [];
  if (op.name) bits.push(`You reached the ${op.name} (${op.eco}).`);
  else bits.push('This opening is not in the built-in book.');
  if (b > 0 && b < plies.length) {
    const p = plies[b];
    bits.push(`Both sides followed well-known moves until ${moveLabel(b, p.san)}, where ${p.color === me ? 'you' : 'your opponent'} left the book.`);
  } else if (b >= plies.length) bits.push('The whole game stayed within known opening theory.');
  const mine = review.mine.phases.opening;
  if (mine != null) bits.push(`Your opening accuracy was ${mine}%${mine >= 85 ? ' — a good start.' : mine < 65 ? ' — the opening is a good place to improve.' : '.'}`);
  return bits.join(' ');
}

/** Static opening knowledge (ideas, plans, pitfalls). Falls back to the first-move family. */
export function openingNotes(name = '', eco = '', color = 'w') {
  for (const [re, notes] of OPENING_NOTES) if (re.test(name)) return notes;
  const fam = /^[AE]/.test(eco) ? 'flank' : /^[BC]/.test(eco) ? 'open' : /^D/.test(eco) ? 'closed' : 'generic';
  return FALLBACK_NOTES[fam] ?? FALLBACK_NOTES.generic;
}

// ---------------------------------------------------------------------------------------------
// Position insight: what the engine says plus rule-based observations about the position itself.
// ---------------------------------------------------------------------------------------------

/** Pieces that are attacked and either undefended or attacked by something cheaper. */
export function loosePieces(fen) {
  const c = new Chess(fen);
  const out = [];
  for (const row of c.board()) {
    for (const sq of row) {
      if (!sq || sq.type === 'k') continue;
      const enemy = sq.color === 'w' ? 'b' : 'w';
      const att = c.attackers(sq.square, enemy);
      if (!att.length) continue;
      const defended = c.attackers(sq.square, sq.color).length > 0;
      const cheapest = Math.min(...att.map((a) => VAL[c.get(a).type]));
      if (!defended || cheapest < VAL[sq.type]) {
        out.push({ color: sq.color, piece: sq.type, square: sq.square, undefended: !defended });
      }
    }
  }
  return out;
}

export function materialBalance(fen) {
  let d = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = VAL[ch.toLowerCase()];
    if (!v) continue;
    d += ch === ch.toUpperCase() ? v : -v;
  }
  return d;
}

/**
 * @param {string} fen
 * @param {{cp:number, pv:string[], mate:number|null}[]} lines  engine lines, scores from White's view
 */
export function positionInsight(fen, lines) {
  const c = new Chess(fen);
  const turn = c.turn();
  const sign = turn === 'w' ? 1 : -1;
  const out = { headline: '', candidates: [], notes: [] };
  if (c.isGameOver()) {
    out.headline = c.isCheckmate() ? `Checkmate — ${sideName(turn === 'w' ? 'b' : 'w')} wins.` : 'The game is drawn.';
    return out;
  }
  const top = lines[0];
  if (top) {
    const cpMover = sign * top.cp;
    out.headline = `${sideName(turn)} to move and ${standing(cpMover)} (${fmtEval(top.cp)}).`;
    out.candidates = lines.slice(0, 3).map((l, i) => {
      const m = uciToMove(fen, l.pv[0]);
      const g = new Chess(fen);
      const seq = [];
      for (const u of l.pv.slice(0, 5)) { try { seq.push(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; } }
      return { rank: i + 1, san: m?.san ?? '?', eval: fmtEval(l.cp), line: seq.join(' '), does: describeMove(m, fen) };
    });
    if (lines.length > 1) {
      const gap = Math.abs(sign * (lines[0].cp - lines[1].cp));
      if (gap >= 150 && Math.abs(lines[0].cp) < MATE) out.notes.push('There is only one good move here — the alternatives lose a lot of value, so look carefully.');
      else if (gap < 30) out.notes.push('Several moves are about equally good, so pick the one that fits your plan.');
    }
    if (Math.abs(top.cp) >= MATE) out.notes.push(`There is a forced checkmate (${top.mate != null ? `mate in ${Math.abs(top.mate)}` : 'found by the engine'}).`);
  }
  if (c.inCheck()) out.notes.push(`${sideName(turn)} is in check and must respond.`);
  const bal = materialBalance(fen);
  out.notes.push(bal === 0 ? 'Material is equal.' : `${sideName(bal > 0 ? 'w' : 'b')} is up ${Math.abs(bal)} point${Math.abs(bal) === 1 ? '' : 's'} of material.`);
  for (const lp of loosePieces(fen)) {
    out.notes.push(`${sideName(lp.color)}'s ${NAME[lp.piece]} on ${lp.square} is ${lp.undefended ? 'attacked and undefended' : 'attacked by a cheaper piece'}.`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Training plan from aggregated stats (see stats.js)
// ---------------------------------------------------------------------------------------------

export function trainingPlan(agg) {
  const focus = [];
  const themes = Object.entries(agg.themes ?? {}).filter(([k]) => THEME_LESSONS[k]).sort((a, b) => b[1] - a[1]);
  for (const [k, n] of themes.slice(0, 2)) {
    focus.push({
      title: THEME_LESSONS[k].title,
      why: `${THEME_LABELS[k]} came up ${plural(n, 'time')} across your reviewed games.`,
      drills: [THEME_LESSONS[k].drill, THEME_ADVICE[k]],
    });
  }
  const phases = Object.entries(agg.phases ?? {}).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
  if (phases.length && phases[0][1] < 80) {
    const [ph, acc] = phases[0];
    focus.push({
      title: `Strengthen your ${ph}`,
      why: `Your ${ph} is your lowest-scoring phase (${acc}% accuracy).`,
      drills: ph === 'opening'
        ? ['Choose one opening for White and one defence against 1.e4 and 1.d4; learn the ideas, not the lines.', 'After each game check where you left the book.']
        : ph === 'middlegame'
          ? ['Solve 10 tactics puzzles a day.', 'Before every move list checks, captures and threats for both sides.']
          : ['Practise king-and-pawn endings against the computer.', 'Learn the opposition and the Lucena and Philidor rook positions.'],
    });
  }
  if ((agg.blundersPerGame ?? 0) >= 1 && !focus.some((f) => f.title.startsWith('Blunder'))) {
    focus.push({
      title: 'Cut your blunders',
      why: `You average ${round(agg.blundersPerGame, 1)} blunders per game.`,
      drills: ['Use a pre-move checklist: What did my opponent just threaten? Is my move safe? What does it leave undefended?', 'Play slower time controls for a while (10+0 or longer).'],
    });
  }
  for (const g of GENERAL_LESSONS) { if (focus.length >= 3) break; focus.push({ title: g.title, why: 'A useful habit at every level.', drills: [g.drill] }); }

  const acc = agg.accuracy ?? 0;
  const level = acc >= 85 ? 'very accurate' : acc >= 75 ? 'fairly accurate' : acc >= 60 ? 'inconsistent' : 'still error-prone';
  const summary = `Across ${plural(agg.reviewed, 'reviewed game')} your average accuracy is ${acc}% (${level})${agg.performance ? ` and your estimated performance is about ${agg.performance}` : ''}. `
    + `The biggest lever right now: ${focus[0].title.toLowerCase()}.`;
  return {
    summary,
    focus: focus.slice(0, 3),
    habit: 'Before every move: (1) what is my opponent threatening? (2) what does my move leave undefended? (3) do I have a check, capture or threat that wins something?',
    weekly: [
      'Mon: review your last game and fix your three biggest mistakes in the Train page.',
      `Tue: ${focus[0].drills[0]}`,
      'Wed: play two longer games (10+0 or more) using the pre-move checklist.',
      'Thu: 15 minutes of tactics puzzles and one basic endgame.',
      'Fri: play, then review immediately while the moves are fresh.',
    ],
  };
}

/** Plain-language note on one opening for the profile (uses the player's own record). */
export function openingAdvice(o) {
  const notes = openingNotes(o.name, o.eco, o.color);
  const games = o.w + o.d + o.l;
  const score = games ? (o.w + o.d / 2) / games : null;
  const record = score == null ? '' : score >= 0.6 ? 'This is working well for you — keep playing it and deepen your knowledge.' : score <= 0.4 ? 'You are scoring poorly with this opening; review where you leave book and what plan the opening wants.' : 'Your results with it are balanced.';
  return { ...notes, record };
}
