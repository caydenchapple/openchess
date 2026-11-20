// Gambit trainer logic with no screen in it: turn a line into steps, check a move against the book, and keep spaced-repetition progress.
import { Chess } from 'chess.js';
import { INTERVALS, addDays } from './lessons-logic.js';
import { allLines, gambitById } from './gambits-data.js';

export const MASTERED_BOX = 4; // a line you have played cleanly this many times in a row (with the waits growing) counts as learned
export const parseMoves = (text) => text.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
export const plain = (san) => san.replace(/[+#?!]/g, '');

/**
 * The line as board steps. `mine` marks the moves the gambit side plays (the ones you must find when drilling).
 * Each step: { ply, number, color, san, from, to, fenBefore, fenAfter, mine, note, key }.
 */
export function buildSteps(gambit, line) {
  const chess = new Chess();
  return parseMoves(line.moves).map((san, i) => {
    const fenBefore = chess.fen();
    const m = chess.move(san);
    const number = Math.floor(i / 2) + 1; const color = m.color;
    const key = `${number}${color}`;
    return { ply: i + 1, number, color, san: m.san, from: m.from, to: m.to, promotion: m.promotion, fenBefore, fenAfter: chess.fen(), mine: color === gambit.side, note: line.notes[key] ?? '', key, captured: !!m.captured };
  });
}

/** Is the move the player made the book move for this step? Compared by the move itself, so ...Nbd7 and ...Nbd7+ are the same. */
export function isBookMove(step, attempt) {
  try {
    const m = new Chess(step.fenBefore).move({ from: attempt.from, to: attempt.to, promotion: attempt.promotion ?? step.promotion });
    return m.from === step.from && m.to === step.to && (m.promotion ?? null) === (step.promotion ?? null);
  } catch { return false; }
}

/** Size of a line: how many moves in all, and how many of them are yours to find. */
export function lineSize(gambit, line) {
  const moves = parseMoves(line.moves);
  return { plies: moves.length, mine: moves.filter((_, i) => (i % 2 === 0 ? 'w' : 'b') === gambit.side).length };
}

/** The position (and the move that led to it) after `n` plies of a line; used for the preview pictures. */
export function positionAfter(line, n = Infinity) {
  const chess = new Chess(); let last = null;
  for (const san of parseMoves(line.moves).slice(0, n)) { const m = chess.move(san); last = [m.from, m.to]; }
  return { fen: chess.fen(), last };
}
export const gambitPreview = (g) => positionAfter(g.lines[0], g.preview ?? 6);
export const linePreview = (line) => positionAfter(line);

// ---------------------------------------------------------------- progress
export const emptyGambits = () => ({ lines: {} }); // key `gambit/line` -> { box, due, runs, clean, last }

export const lineKey = (gambitId, lineId) => `${gambitId}/${lineId}`;

/** A drill ended. `clean` means no wrong move and no hint. Clean runs move the line up a box; anything else brings it back tomorrow. */
export function recordRun(G, key, { clean, mistakes = 0, hints = 0 }, today) {
  const e = G.lines[key] ?? { box: 0, due: today, runs: 0, clean: 0, last: null };
  e.runs += 1;
  if (clean) { e.box = Math.min(5, e.box + 1); e.clean += 1; } else e.box = Math.max(0, Math.min(e.box, 1) - (mistakes > 2 ? 1 : 0));
  e.due = addDays(today, INTERVALS[e.box]);
  e.last = today;
  G.lines[key] = e;
  return e;
}

/** 'new' (never drilled), 'due' (time to repeat), 'learning', or 'mastered'. */
export function lineStatus(G, key, today) {
  const e = G.lines[key];
  if (!e) return 'new';
  if (e.due <= today) return 'due';
  return e.box >= MASTERED_BOX ? 'mastered' : 'learning';
}

export function dueLines(G, today, gambits = null) {
  return allLines()
    .filter((l) => (!gambits || gambits.includes(l.gambit.id)) && G.lines[l.key] && G.lines[l.key].due <= today)
    .sort((a, b) => G.lines[a.key].box - G.lines[b.key].box || (G.lines[a.key].due < G.lines[b.key].due ? -1 : 1));
}

export function gambitSummary(G, gambit, today) {
  const keys = gambit.lines.map((l) => lineKey(gambit.id, l.id));
  const count = (s) => keys.filter((k) => lineStatus(G, k, today) === s).length;
  return { total: keys.length, mastered: count('mastered'), due: count('due'), started: keys.filter((k) => G.lines[k]).length };
}

export { gambitById };
