// The curriculum: units → lessons → teaching cards and exercises. Written for OpenChess.
//
// How it is built (see the "Why this works" card on the Learn screen):
//  - Pattern first, then practice. Research on chess skill since de Groot (1946) and Chase & Simon (1973) finds strong players
//    recognise patterns instead of calculating everything, so each lesson names a pattern and then makes you spot it.
//  - Repetition at growing gaps. Exercises you miss come back after 1, 3, 7, 14 and 30 days (see lessons-logic.js). The same idea
//    sits behind the "Woodpecker method" of repeating tactics, which strong club players and masters use.
//  - A thinking routine. Checks, captures, threats and a blunder check before every move is the habit Kotov described in
//    "Think Like a Grandmaster" (1971).
//  - Endings early. Capablanca's "Chess Fundamentals" and Dvoretsky's endgame books both stress studying endings before
//    studying elaborate openings.
//  - Your own games. Dvoretsky argued that your own mistakes are the best material, so reviewed games steer what is recommended.
// The exercises that have a single best answer were generated and then CHECKED with Stockfish 19
// (scripts/lessons/generate.mjs and scripts/lessons/verify.mjs); the explanations are ours.
import { GENERATED as G } from './lessons-generated.js';

const side = (fen) => (fen.split(' ')[1] === 'w' ? 'White' : 'Black');
const arrow = (uci, brush = 'green') => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), brush });

function findEx(id, kind, item, text) {
  return {
    id, type: 'find', fen: item.fen, answers: item.answers, mate: kind === 'mate',
    prompt: text.prompt(item), hint: text.hint, explain: text.explain(item),
  };
}

const TEXT = {
  free: {
    prompt: (i) => `${side(i.fen)} to move. One enemy piece is not protected by anything. Take it!`,
    hint: 'Look for a piece with no defender. Take it with the piece that can do so safely.',
    explain: (i) => `${i.san} wins a free ${i.piece}: nothing can take back.`,
  },
  forks: {
    prompt: (i) => `${side(i.fen)} to move. Find the knight move that attacks two things at once.`,
    hint: 'A knight move that gives check is the strongest fork. Look for it first.',
    explain: (i) => `${i.san} is a fork. It gives check and attacks the ${i.target} at the same time. The king must move, and then the ${i.target} is lost.`,
  },
  skewers: {
    prompt: (i) => `${side(i.fen)} to move. Find the check that wins the piece hiding behind the king.`,
    hint: 'Check from far away, along a line. When the king steps aside, look at what stands behind it.',
    explain: (i) => `${i.san} checks along a line. The king has to move, and the ${i.target} behind it falls to the ${i.slider}.`,
  },
  pins: {
    prompt: (i) => `${side(i.fen)} to move. The knight is pinned to its king. Win it!`,
    hint: 'A pinned piece cannot move. Attack it with something small, like a pawn.',
    explain: (i) => `${i.san} attacks the pinned knight with a pawn. The knight cannot run away: moving would expose its king to the ${i.slider}.`,
  },
  mate2: {
    prompt: (i) => `${side(i.fen)} to move. Find the move that forces checkmate on your NEXT move.`,
    hint: 'Look at checks first. Which move takes away the king\'s last squares?',
    explain: (i) => `${i.san}! Whatever Black replies, White has checkmate on the next move.`,
  },
  kp: {
    prompt: (i) => `${side(i.fen)} to move. Only one move keeps the win. Find it.`,
    hint: 'Your king belongs in front of your pawn. Think about which square it should step to.',
    explain: (i) => `${i.san} is the only winning move. Every other move lets Black hold a draw.`,
  },
};

const take = (key, from, to, prefix, kind = 'win') => G[key].slice(from, to).map((item, n) => findEx(`${prefix}-${from + n + 1}`, kind, item, TEXT[key]));

// ---- hand-written mate-in-one positions (a test replays each one with chess.js; any mating move is accepted)
const MATE1 = [
  { fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', note: 'The king is trapped behind its own pawns: a back-rank mate.' },
  { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', note: 'The queen takes f7 with the bishop behind it, so the king cannot capture her.' },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', note: 'White opened the diagonal to the king with f3 and g4. The queen mates at once.' },
  { fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1', note: 'The white king covers the escape squares; the rook gives check on the 8th rank.' },
  { fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', note: 'A queen next to the enemy king, protected by your king, is checkmate.' },
  { fen: 'r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', note: 'Taking the rook on a8 is also check, and the king has no escape.' },
].map((m, n) => ({
  id: `mate1-${n + 1}`, type: 'find', fen: m.fen, answers: [], mate: true,
  prompt: `${side(m.fen)} to move. Find checkmate in one move.`,
  hint: 'Count the squares around the king. Look for a check that covers every one of them.', explain: m.note,
}));

// ---- hand-written quizzes (each correct answer is checked against Stockfish by scripts/lessons/verify.mjs)
const quiz = (id, fen, prompt, options, explain, hint) => ({ id, type: 'quiz', fen, prompt, options, explain, hint });
const opt = (san, ok = false, why = '') => ({ san, ok, why });

const OPEN_QUIZ = [
  quiz('open1-1', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'White to move. Which move follows the opening principles?',
    [opt('Nf3', true, 'Develops a knight toward the centre and attacks the e5 pawn.'), opt('Qh5', false, 'The queen comes out too early and can be chased.'), opt('a3', false, 'A slow edge-pawn move: nothing is developed.')],
    'Develop a piece with a threat. Knights before bishops, and keep the queen at home for now.', 'Which move brings a minor piece out AND does something useful?'),
  quiz('open1-2', 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1', 'Black to move. Which move develops a piece and fights for the centre?',
    [opt('Nf6', true, 'Develops a knight and controls e4 and d5.'), opt('h6', false, 'A pawn move on the edge that does not help the centre.'), opt('a6', false, 'Another edge-pawn move: nothing is developed.')],
    'Pieces first: a knight to f6 controls central squares and prepares to castle.', 'Look for a knight move toward the centre.'),
  quiz('open1-3', 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'White to move. Which plan is best here?',
    [opt('d3', true, 'Supports the centre and opens the bishop on c1.'), opt('Bxf7+', false, 'Gives up a bishop for a pawn: after ...Kxf7 White has nothing to show for it.'), opt('h3', false, 'A slow edge-pawn move.')],
    'Support the e4 pawn and free your pieces so you can castle.', 'Which pawn move helps your pieces and keeps the centre safe?'),
];

const CASTLE_QUIZ = [
  quiz('castle-1', 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 2 5', 'White to move. What should White do about the king?',
    [opt('O-O', true, 'Castling puts the king behind its pawns and brings the rook into play.'), opt('Nxe5', false, 'Grabs a pawn but leaves the king in the centre and loses material after ...Nxe5.'), opt('Bxf7+', false, 'Gives up a bishop for a pawn and ruins your position.')],
    'Castle early. The king is safest on the side, and the rook becomes active.', 'Which move solves the king\'s problem AND develops a rook?'),
  quiz('castle-2', 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 5', 'Black to move. How should Black finish getting ready?',
    [opt('O-O', true, 'Castling is safe and brings the rook toward the centre.'), opt('Nxe4', false, 'Tempting, but it loses a piece to dxe4.'), opt('Bxf2+', false, 'A bishop for a pawn: Kxf2 and Black has lost a piece for almost nothing.')],
    'When your minor pieces are out, castle.', 'The king and a rook both want to move. One move does both.'),
];

// ---- the lessons
const lesson = (o) => o;
export const CURRICULUM = [
  {
    id: 'A', title: 'Stay safe and finish the game', blurb: 'The two skills every game depends on: checkmate and not giving pieces away.',
    lessons: [
      lesson({
        id: 'mate1', title: 'Checkmate in one move', minutes: 4,
        why: 'Strong players recognise mating patterns in a glance. Learning the common ones first means you find them in real games.',
        cards: [
          { title: 'What is checkmate?', text: 'Checkmate means the king is attacked (in check) and has no way out. The game ends right away. In this picture the rook on d1 can move to d8.', fen: MATE1[0].fen, arrows: [arrow('d1d8')] },
          { title: 'Count the escape squares', text: 'Before you move, look at the squares around the enemy king. Here the black king on a8 is stuck on the edge, your king covers a7 and b7, and the rook gives the final check.', fen: MATE1[3].fen, arrows: [arrow('h1h8')] },
          { title: 'Queen and king work together', text: 'A queen next to the enemy king is checkmate when your own king protects her, because the enemy king cannot take her.', fen: MATE1[4].fen, arrows: [arrow('f7g7')] },
          { title: 'Always look at checks first', text: 'Checks are forcing: the opponent has to answer them. Strong players look at every check before any other move. It is the first step of the thinking routine you will learn in the last lesson.' },
        ],
        exercises: MATE1,
      }),
      lesson({
        id: 'free', title: 'Free pieces: look before you leap', minutes: 5,
        why: 'Most games below master level are decided by pieces left undefended. Strong players ask "what is attacked, and what is protected?" before every move.',
        cards: [
          { title: 'A piece with no defender is a gift', text: 'If a piece is attacked and nothing protects it, you can take it for free. Here the black queen on d5 is attacked by your queen and nothing protects it.', fen: '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1', arrows: [arrow('d1d5')] },
          { title: 'Ask two questions', text: 'Before every move, ask: what is attacked? And what protects it? Here the pawn on e5 is attacked by the knight on f3 (red arrow) and protected by the knight on c6 (blue arrow).', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', arrows: [arrow('f3e5', 'red'), arrow('c6e5', 'blue')] },
          { title: 'Do it for your pieces too', text: 'The same check protects you. Before you let go of a piece, ask what it stops protecting. Blunder-checking like this removes most of the mistakes beginners make.' },
        ],
        exercises: take('free', 0, 6, 'free'),
      }),
    ],
  },
  {
    id: 'B', title: 'Opening principles', blurb: 'You do not need to memorise lines. Follow a few principles that every strong player follows.',
    lessons: [
      lesson({
        id: 'open1', title: 'Develop and fight for the centre', minutes: 5,
        why: 'The classical principles taught since Steinitz and Capablanca still work: take space in the centre, bring pieces out, and do not waste time.',
        cards: [
          { title: 'Three ideas', text: 'In the opening, (1) control the centre with pawns, (2) bring your knights and bishops out, and (3) castle. Here White moved a centre pawn (e4), a knight (Nf3) and a bishop (Bc4) in the first three moves.', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', arrows: [arrow('c4f7', 'blue'), arrow('f3e5', 'blue')] },
          { title: 'Avoid wasting time', text: 'Do not move the same piece twice without a reason, do not bring the queen out early (she can be chased), and do not make edge-pawn moves like a3 or h3 before your pieces are out.' },
        ],
        exercises: OPEN_QUIZ,
      }),
      lesson({
        id: 'castle', title: 'Keep your king safe', minutes: 4,
        why: 'A king stuck in the centre is the most common reason an opening goes wrong. Castling solves the problem in one move.',
        cards: [
          { title: 'Castle early', text: 'Castling moves the king to safety behind a wall of pawns and brings a rook toward the centre. You can castle once, if neither the king nor that rook has moved and the squares between them are empty and not attacked.', fen: 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 2 5', arrows: [arrow('e1g1')] },
          { title: 'A quick rule', text: 'When you have developed two or three pieces, ask: can I castle now? If yes, it is usually the best move.' },
        ],
        exercises: CASTLE_QUIZ,
      }),
    ],
  },
  {
    id: 'C', title: 'Tactics every strong player sees', blurb: 'Short tricks that win material. Learn each pattern, then spot it.',
    lessons: [
      lesson({
        id: 'forks', title: 'Forks', minutes: 5,
        why: 'Forks are the most common winning tactic in games. A knight is the classic forker because it jumps over everything.',
        cards: [
          { title: 'One move, two attacks', text: 'A fork attacks two pieces at once. The opponent can only save one. Look at this one.', fen: G.forks[0].fen, arrows: [arrow(G.forks[0].answers[0])] },
          { title: 'Forks with check are strongest', text: 'When the fork gives check, the king has to move first, so you win the other piece for free. Look for knight moves that give check and also attack a queen or rook.' },
        ],
        exercises: take('forks', 1, 6, 'forks'),
      }),
      lesson({
        id: 'skewers', title: 'Skewers', minutes: 5,
        why: 'A skewer is a pin in reverse. Spotting long-range checks is a habit all strong players build.',
        cards: [
          { title: 'The valuable piece moves first', text: 'In a skewer you attack a valuable piece that has to move, and a piece behind it falls. Usually it is a check on the king, so the king must step aside.', fen: G.skewers[0].fen, arrows: [arrow(G.skewers[0].answers[0])] },
          { title: 'Look along lines', text: 'Rooks, bishops and queens work along lines. Imagine your piece checking from the far end and ask what stands behind the king.' },
        ],
        exercises: take('skewers', 1, 5, 'skewers'),
      }),
      lesson({
        id: 'pins', title: 'Pins', minutes: 5,
        why: 'A pinned piece is half a piece. Learning to attack pinned pieces wins material often and quickly.',
        cards: [
          { title: 'A piece that cannot move', text: 'A pin freezes a piece because moving it would expose something more valuable behind it. Here the black knight cannot move, so the pawn can attack it.', fen: G.pins[0].fen, arrows: [arrow(G.pins[0].answers[0])] },
          { title: 'Attack the pinned piece', text: 'A pinned piece cannot run away. Attack it with a pawn or another piece, and it is usually lost.' },
        ],
        exercises: take('pins', 1, 5, 'pins'),
      }),
      lesson({
        id: 'mate2', title: 'Think two moves ahead: mate in two', minutes: 6,
        why: 'Calculating forcing lines is the core of strong play. Start with short ones: a check, a reply, a mate.',
        cards: [
          { title: 'Look for forcing moves', text: 'A forcing move (a check or capture) limits what the opponent can do, which makes calculating easier. Here White gives check first, and mate follows next move.', fen: G.mate2[0].fen, arrows: [arrow(G.mate2[0].answers[0])] },
          { title: 'Check every reply', text: 'After your idea, look at each answer your opponent has. If every answer allows mate, you have found it. Take your time with the exercises: counting replies is the skill.' },
        ],
        exercises: take('mate2', 1, 6, 'mate2'),
      }),
    ],
  },
  {
    id: 'D', title: 'Endings', blurb: 'Win the positions you are supposed to win.',
    lessons: [
      lesson({
        id: 'kp', title: 'King and pawn endings', minutes: 6,
        why: 'Capablanca and Dvoretsky both stressed endings. Knowing the key ideas of king and pawn endings makes every other ending easier.',
        cards: [
          { title: 'The king is a fighter', text: 'In endings the king is strong. A king in front of its own pawn can escort it to the last rank. A king that stays behind usually lets the enemy king catch up.', fen: G.kp[0].fen, arrows: [arrow(G.kp[0].answers[0])] },
          { title: 'One right move', text: 'These positions often have a single winning move and many that only draw. Imagine where your king wants to be, and where the enemy king wants to be, before you move.' },
        ],
        exercises: take('kp', 1, 7, 'kp'),
      }),
    ],
  },
  {
    id: 'E', title: 'Think like a strong player', blurb: 'Put it all together with a routine you can use in every game.',
    lessons: [
      lesson({
        id: 'routine', title: 'Your thinking routine', minutes: 7,
        why: 'Kotov\'s "Think Like a Grandmaster" popularised a disciplined way of choosing a move. Here is a short version you can use every move.',
        cards: [
          { title: 'Step 1: what did my opponent just do?', text: 'Look at the move they played. What does it attack? What does it threaten next move? Never skip this step.' },
          { title: 'Step 2: candidate moves', text: 'List your checks, captures and threats first. They are forcing, so they are the easiest to calculate and often the best.' },
          { title: 'Step 3: blunder check', text: 'Before you move, ask: what does my move leave undefended? Could my opponent capture something or give check? Ten seconds here saves games.' },
          { title: 'Try it', text: 'The next exercises mix all the patterns you learned. Use the routine on each one. There is no hint this time unless you ask.' },
        ],
        exercises: [
          ...take('free', 6, 7, 'routine'), ...take('forks', 6, 8, 'routine'), ...take('skewers', 5, 6, 'routine'), ...take('pins', 5, 6, 'routine'), ...take('mate2', 6, 7, 'routine'),
        ].map((e, n) => ({ ...e, id: `routine-${n + 1}`, prompt: e.prompt.replace(/^(White|Black) to move\. .*/, '$1 to move. Use the routine: what is the best move?') })),
      }),
    ],
  },
];

export const LESSON_COUNT = CURRICULUM.reduce((n, u) => n + u.lessons.length, 0);
