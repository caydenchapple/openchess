// Gambits to train. Each one has the side that plays it, the plans, and one to three lines (main line, what happens if the
// opponent declines, a trap). Moves are PGN text; every line is replayed through chess.js in the test-suite, so a typo cannot sneak in.
// NOTES explain a move by its move number and colour: '4w' is White's 4th move, '4b' is Black's 4th. Plain ideas only, no deep theory.
const line = (id, name, kind, summary, moves) => ({ id, name, kind, summary, moves, notes: {} });

export const LEVELS = ['Beginner', 'Intermediate', 'Sharp'];

export const GAMBITS = [
  {
    id: 'queens', name: "Queen's Gambit", side: 'w', level: 1,
    tagline: 'Offer the c-pawn to pull Black\'s d-pawn out of the centre.',
    ideas: ['The pawn is not really lost: if Black takes on c4, you win it back with Bxc4 while you take the centre with e3 and Nf3.', 'It is the safest gambit in chess, a good first one to learn.'],
    plans: ['Develop with Nf3 and e3, and take back on c4 with the bishop.', 'Castle early and keep an eye on the c- and d-files.'],
    avoid: ['Do not push e4 at once; Black can hold the extra pawn with ...b5.', 'Do not trade queens early: the opening has no attack yet.'],
    lines: [
      line('accepted', 'Black takes the pawn', 'main', 'Black grabs c4. You win it back and get easy development.',
        '1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3 e6 5. Bxc4 c5 6. O-O a6 7. Qe2 b5 8. Bb3 Bb7 9. Rd1 Nbd7'),
      line('declined', 'Black declines with ...e6', 'alt', 'The solid reply. You keep the centre tension and play for a small, lasting edge.',
        '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8'),
    ],
  },
  {
    id: 'kings', name: "King's Gambit", side: 'w', level: 2,
    tagline: 'Give the f-pawn to open the f-file and take the centre.',
    ideas: ['After ...exf4 you play d4 and put pieces on active squares while Black has to find safe moves.', 'It is a gambit of the old school: sharp, fast and full of tricks for both sides.'],
    plans: ['Play Nf3 and Bc4 quickly, aiming at f7.', 'Castle and use the half-open f-file against the black king.'],
    avoid: ['Do not play Qh5+ early; it only wastes time.', 'Do not let Black keep the extra pawn with ...g5 and ...g4 without a plan.'],
    lines: [
      line('classical', 'Black takes and plays ...g5', 'main', 'The main clash: Black clings to the pawn, you hit the weakened kingside.',
        '1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4 g4 5. Ne5 Nf6 6. Bc4 d5 7. exd5 Bd6 8. d4'),
      line('falkbeer', 'Black counter-attacks with ...d5', 'alt', 'The Falkbeer: Black strikes in the centre at once. You must keep your head.',
        '1. e4 e5 2. f4 d5 3. exd5 e4 4. d3 Nf6 5. dxe4 Nxe4 6. Nf3 Bc5'),
    ],
  },
  {
    id: 'evans', name: 'Evans Gambit', side: 'w', level: 2,
    tagline: 'Sacrifice a wing pawn with b4 to build a big centre.',
    ideas: ['After b4 Bxb4, the move c3 hits the bishop and prepares d4, gaining time for a full centre.', 'A famous attacking gambit of the Italian Game.'],
    plans: ['Play c3 and d4 quickly, then castle and bring the queen and rook to the centre.', 'Aim your pieces at f7.'],
    avoid: ['Do not delay d4; the gambit depends on it.', 'Do not take on e5 or d4 without counting who has developed more pieces.'],
    lines: [
      line('main', 'Black takes on b4', 'main', 'The Evans main line: a centre for the pawn, with the bishop pair pointing at Black.',
        '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d6 8. cxd4 Bb6 9. Nc3'),
      line('declined', 'Black declines with ...Bb6', 'alt', 'Black keeps the bishop safe. You get a calm, healthy position.',
        '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bb6 5. a4 a6 6. Nc3 Nf6'),
    ],
  },
  {
    id: 'danish', name: 'Danish Gambit', side: 'w', level: 3,
    tagline: 'Give two pawns for two bishops that stare at the black king.',
    ideas: ['After d4 and c3 you let Black take two pawns, and your bishops on b2 and c4 point straight at g7 and f7.', 'It is very sharp: great fun, and it punishes passive play.'],
    plans: ['Develop quickly and open lines; the extra material is of little use to Black if it cannot be developed.', 'Look for Bxf7+ and a check on the e-file or the long diagonal.'],
    avoid: ['Do not give up the bishops for nothing: they are worth more than the pawns.', 'If the attack runs out, you are simply two pawns down.'],
    lines: [
      line('main', 'Black takes both pawns', 'main', 'Black takes everything, and you open the lines to the king.',
        '1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Bc4 cxb2 5. Bxb2 d5 6. Bxd5 Nf6'),
    ],
  },
  {
    id: 'morra', name: 'Smith-Morra Gambit', side: 'w', level: 2,
    tagline: 'Give a pawn against the Sicilian for a big lead in development.',
    ideas: ['After 2.d4 cxd4 3.c3 dxc3 4.Nxc3, you have two open files and lots of piece play for the pawn.', 'It is a simple plan: develop, castle, and put rooks on the open files.'],
    plans: ['Play Nf3, Bc4, O-O, Qe2 and Rd1.', 'Aim the pieces at d6 and f7.'],
    avoid: ['Do not hurry the attack before castling.', 'Black can decline with 3...Nf6; do not panic, just win back the pawn.'],
    lines: [
      line('accepted', 'Black takes the pawns', 'main', 'The standard plan: Nc3, Bc4, O-O, rooks to the open files.',
        '1. e4 c5 2. d4 cxd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3 d6 6. Bc4 e6 7. O-O Nf6 8. Qe2 Be7 9. Rd1 e5 10. Bg5'),
      line('declined', 'Black declines with ...Nf6', 'alt', 'Black refuses the pawn. Push e5 and build a big centre.',
        '1. e4 c5 2. d4 cxd4 3. c3 Nf6 4. e5 Nd5 5. Nf3 Nc6 6. cxd4 d6 7. Bc4 Nb6 8. Bb3 dxe5 9. Nxe5'),
    ],
  },
  {
    id: 'scotch', name: 'Scotch Gambit', side: 'w', level: 2,
    tagline: 'Open the centre fast with d4 and the bishop on c4.',
    ideas: ['Instead of taking back on d4 with the knight, you play Bc4 and c3 to build a big centre and gain time.', 'It is a classic gambit that leads to open play.'],
    plans: ['Play Bc4, c3 and castle; push e5 when it gains time.', 'Recapture on d4 with a pawn to get a strong centre.'],
    avoid: ['Do not let Black keep the pawn without getting something in return.', 'Watch the d5 break for Black.'],
    lines: [
      line('main', 'Black plays ...Bc5', 'main', 'Black keeps the pawn for now. You take the centre with c3 and e5.',
        '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Bc5 5. c3 Nf6 6. e5 d5 7. Bb5 Ne4 8. cxd4 Bb6 9. Nc3'),
    ],
  },
  {
    id: 'vienna', name: 'Vienna Gambit', side: 'w', level: 2,
    tagline: 'Play Nc3 first, then f4 to hit the centre.',
    ideas: ['The knight on c3 helps the f4 break, so Black cannot just ignore the gambit.', 'It is a modern, active way to reach an attacking game.'],
    plans: ['Take on e5, play Nf3 and d4, then castle.', 'Use the knight and bishop to attack the e4 square.'],
    avoid: ['Do not let Black get ...d5 and a free game without pressure.', 'Do not play Qh5 too early.'],
    lines: [
      line('main', 'Black answers with ...d5', 'main', 'The sharp main line. Black hits the centre and you keep it tidy.',
        '1. e4 e5 2. Nc3 Nf6 3. f4 d5 4. fxe5 Nxe4 5. Nf3 Be7 6. d4 O-O 7. Bd3 f5 8. exf6 Bxf6'),
    ],
  },
  {
    id: 'fried', name: 'Fried Liver Attack', side: 'w', level: 3,
    tagline: 'Sacrifice a knight on f7 to drag the black king out.',
    ideas: ['Against the Two Knights Defence, Ng5 hits f7. If Black takes on d5 with the knight, Nxf7 starts a fierce attack.', 'The attack only works if Black falls for it; against 5...Na5 you play calmly.'],
    plans: ['After Nxf7 Kxf7, Qf3+ and Nc3 bring the pieces into the attack.', 'Keep the bishop on c4 aimed at the king.'],
    avoid: ['Do not sacrifice if Black has answered with 5...Na5; you only lose a piece.', 'Count the attackers before every sacrifice.'],
    lines: [
      line('main', 'Black takes with the knight', 'main', 'Black falls for it: Nxf7 and the king is in the open.',
        '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. Qe4 c6 10. a3 Na6 11. d4'),
      line('na5', 'Black plays 5...Na5', 'alt', 'The right defence. You play the safe plan and keep a small edge.',
        '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Be2 h6 9. Nf3 e4 10. Ne5 Bd6'),
    ],
  },
  {
    id: 'budapest', name: 'Budapest Gambit', side: 'b', level: 2,
    tagline: 'Meet 1.d4 Nf6 2.c4 with ...e5, and hit back with ...Ng4.',
    ideas: ['You give a pawn for fast piece play: after ...Ng4 you win the pawn back on e5, and White can easily fall into a trap.', 'It is a nice surprise for players who do not know it.'],
    plans: ['Play ...Ng4, ...Nc6 and ...Bb4+ to put pressure on e5.', 'Win the pawn back on e5 with the knights.'],
    avoid: ['Do not play ...Nc6 before ...Ng4; the pawn on e5 would be lost.', 'Do not trade your dark-squared bishop for nothing.'],
    lines: [
      line('main', 'The main line', 'main', 'White keeps the pawn for a moment. You win it back with the knights.',
        '1. d4 Nf6 2. c4 e5 3. dxe5 Ng4 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7 7. e3 Ngxe5 8. Nxe5 Nxe5'),
      line('trap', 'The Nd3 mate trap', 'trap', 'If White plays a3, you finish with a checkmate.',
        '1. d4 Nf6 2. c4 e5 3. dxe5 Ng4 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7 7. a3 Ngxe5 8. axb4 Nd3#'),
    ],
  },
  {
    id: 'albin', name: 'Albin Countergambit', side: 'b', level: 2,
    tagline: 'Hit back against the Queen\'s Gambit with ...e5 and ...d4.',
    ideas: ['You give a pawn but get a space-gaining pawn on d4 and quick play on the long diagonal.', 'White has to be careful, and there are a few quick traps.'],
    plans: ['Play ...Nc6, ...Be6 and ...Qd7, then castle long.', 'Keep the pawn on d4 well protected.'],
    avoid: ['Do not let the pawn on d4 fall without compensation.', 'Do not let White trade queens with an extra pawn.'],
    lines: [
      line('main', 'The main line', 'main', 'You aim for fast development and the d4 pawn is a thorn.',
        '1. d4 d5 2. c4 e5 3. dxe5 d4 4. Nf3 Nc6 5. g3 Be6 6. Nbd2 Qd7 7. Bg2 O-O-O'),
      line('lasker', 'The Lasker Trap', 'trap', 'If White is greedy, a knight underpromotion wins.',
        '1. d4 d5 2. c4 e5 3. dxe5 d4 4. e3 Bb4+ 5. Bd2 dxe3 6. Bxb4 exf2+ 7. Ke2 fxg1=N+'),
    ],
  },
  {
    id: 'benko', name: 'Benko Gambit', side: 'b', level: 3,
    tagline: 'Give a pawn for long-term pressure on the queenside.',
    ideas: ['After ...b5 and ...a6, you open the a- and b-files and put rooks and a fianchettoed bishop on them.', 'The pressure is permanent: a good plan in the endgame too.'],
    plans: ['Play ...g6, ...Bg7 and castle, then double rooks on the b-file.', 'Trade your light-squared bishop for White\'s, and aim at the queenside.'],
    avoid: ['Do not rush to win the pawn back; the pressure is the point.', 'Do not let White consolidate with e4 and a king safe on g2 for free.'],
    lines: [
      line('main', 'White accepts the gambit', 'main', 'The standard plan: trade bishops, castle, then rooks on the open files.',
        '1. d4 Nf6 2. c4 c5 3. d5 b5 4. cxb5 a6 5. bxa6 Bxa6 6. Nc3 g6 7. e4 Bxf1 8. Kxf1 d6 9. Nf3 Bg7 10. g3 O-O 11. Kg2'),
    ],
  },
  {
    id: 'marshall', name: 'Marshall Attack', side: 'b', level: 3,
    tagline: 'Give a pawn in the Ruy Lopez for a strong attack.',
    ideas: ['After ...d5 you sacrifice a pawn, and give up the e5 pawn in return for a lead in development and an attack on the white king.', 'It is one of the best-known gambits at every level.'],
    plans: ['Keep the pieces active: ...Bd6, ...Qh4 and ...Bg4 aim at the white king.', 'Do not trade queens, and do not let the pressure drop.'],
    avoid: ['Do not hurry the attack; White has a safe path if you let go.', 'Know your theory: White can avoid it with the anti-Marshall lines.'],
    lines: [
      line('main', 'The main line', 'main', 'The standard Marshall: a pawn for a long attack.',
        '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O 8. c3 d5 9. exd5 Nxd5 10. Nxe5 Nxe5 11. Rxe5 c6 12. d3 Bd6 13. Re1 Qh4 14. g3 Qh3'),
    ],
  },
];

const NOTES = {
  'queens/accepted': {
    '2w': "The gambit. Offering the c-pawn pulls Black's d-pawn away from the centre.",
    '3w': 'Develop first. There is no hurry to take the pawn back; Black cannot hold it for long.',
    '4w': 'e3 opens the bishop on f1, so it can take back on c4.',
    '5w': 'The pawn comes back, and the bishop stands well on the a2-g8 diagonal.',
    '9w': 'The rook belongs behind the centre, ready for d5 or e4.',
  },
  'queens/declined': {
    '4w': 'Pin the knight on f6: it takes away its pressure on the d4 and e5 squares.',
    '8w': "Resolve the tension in the centre. After the trades you play on the c-file against Black's queenside.",
    '11w': 'The rook takes the open c-file.',
    '12w': "The queen eyes Black's queenside pawns.",
  },
  'kings/classical': {
    '2w': 'The gambit. You give a pawn to open the f-file and get your centre pawns moving.',
    '4w': 'h4 attacks the g5 pawn at once, so Black cannot keep it for free.',
    '5w': 'The knight jumps to e5 and hits g4 and f7.',
    '6w': 'The bishop joins the attack on f7.',
    '8w': 'A pawn in the centre at last, with a lead in development as compensation.',
  },
  'kings/falkbeer': {
    '3w': 'Take the pawn. The counter-gambit only works if White gets into trouble.',
    '4w': 'Challenge the e4 pawn at once rather than hold on to the extra pawn.',
    '6w': 'Develop, and watch for tricks on the e-file and the e1-a5 diagonal.',
  },
  'evans/main': {
    '4w': 'The gambit move. It deflects the bishop from c5 and makes room for c3 and d4.',
    '5w': 'c3 hits the bishop and prepares d4.',
    '6w': 'The centre pawn arrives. Black has to answer in the centre.',
    '7w': 'Castle first, rather than rush to win the pawn back.',
    '9w': 'A last developing move: all your pieces are now ready for the attack.',
  },
  'evans/declined': {
    '5w': 'a4 threatens a5 and traps the bishop, so Black must answer it.',
    '6w': 'Develop. Nothing is lost, and the bishop on b6 is a bit passive.',
  },
  'danish/main': {
    '3w': 'The gambit move: a second pawn is on offer.',
    '4w': 'A developing move instead of recapturing: you offer more material for speed.',
    '5w': 'The bishop looks down the long diagonal at g7.',
    '6w': 'You win a pawn back and keep both bishops active.',
  },
  'morra/accepted': {
    '3w': 'The gambit move. If Black takes, you open lines while ahead in development.',
    '4w': 'Take back with the knight: a piece joins the game.',
    '6w': "The bishop looks at f7, the weak spot in Black's camp.",
    '7w': 'Castle: the king is safe and the rook is ready for the d-file.',
    '8w': 'The queen supports e4 and e5 ideas and clears d1 for a rook.',
    '10w': 'Pin the knight on f6, adding to the pressure on d6 and d5.',
  },
  'morra/declined': {
    '4w': 'Push the pawn to gain space and kick the knight.',
    '6w': 'Take back on d4: you have a big centre and no gambit is left.',
    '8w': 'Keep the bishop on the a2-g8 diagonal.',
  },
  'scotch/main': {
    '4w': 'Bring the bishop out and aim at f7, rather than take back with the knight.',
    '5w': 'c3 opens the way to take back on d4 with a pawn.',
    '6w': 'Kick the knight with e5: you gain time.',
    '8w': 'Take back: a strong pawn centre again.',
    '9w': 'Develop the knight and attack the knight on e4.',
  },
  'vienna/main': {
    '3w': 'The gambit move. If Black takes on f4, e5 gains space and time.',
    '4w': 'Take the pawn: you are fine if you develop quickly.',
    '6w': 'Build the centre and prepare to castle.',
    '7w': 'The bishop attacks the knight on e4 and eyes the kingside.',
    '8w': 'En passant: you capture the pawn that just moved two squares, as if it had stopped on f6.',
  },
  'fried/main': {
    '4w': 'Attack f7 twice, with bishop and knight. Black must find ...d5.',
    '6w': 'The sacrifice: the king is forced out of its shelter.',
    '7w': 'Check with the queen: the king is chased into the centre.',
    '8w': 'Add another attacker: the knight comes into play.',
    '11w': 'A strong centre while the black king is still stuck in the middle.',
  },
  'fried/na5': {
    '6w': 'Check first, then pick up the pawn. Black has put a knight on the rim to get it.',
    '8w': 'Retreat the bishop; the pawn on c6 is a target.',
    '9w': 'The knight goes home. You are a pawn up, but Black has play for it.',
  },
  'budapest/main': {
    '2b': 'The gambit move. Offer the e-pawn for quick piece play.',
    '3b': 'The knight hits e5 and the squares around it, so you win the pawn back.',
    '4b': 'The second knight comes to c6 to hit e5 as well.',
    '5b': 'A check to disturb White\'s development; the bishop also pins a knight once it lands on d2.',
    '7b': 'Take the pawn back with the knight.',
  },
  'budapest/trap': {
    '7w': "White's a3 attacks the bishop. It looks natural, but it runs into a mate.",
    '7b': 'Take the pawn and leave the bishop hanging on purpose.',
    '8w': 'White takes the bishop. It wins a piece, and walks straight into mate.',
    '8b': 'Checkmate: the king on e1 is boxed in by its own pieces and the knight cannot be taken.',
  },
  'albin/main': {
    '2b': 'The countergambit move. Instead of defending the pawn, hit the centre.',
    '3b': 'Push the pawn: it cramps White and is hard to attack.',
    '4b': 'Bring out the knight and attack e5; the pawn on d4 is the key.',
    '5b': 'Develop with ...Be6 and ...Qd7 to castle long.',
  },
  'albin/lasker': {
    '4w': 'e3 looks natural, but it walks into the trap.',
    '4b': 'Check, to pull a piece in front of the d2 square.',
    '5b': 'Ignore the bishop and take on e3: the pawn is ready to run.',
    '7b': 'Promote to a knight, not a queen: the knight checks the king on e2 and wins material.',
  },
  'benko/main': {
    '3b': 'The Benko starts with ...b5 after d5: a pawn for open lines.',
    '4b': 'Hit the pawn with ...a6 to open the a-file.',
    '5b': 'Take back with the bishop: it looks down the long diagonal.',
    '7b': 'Trade bishops: White loses the right to castle.',
    '10b': "You castle at once, while White's king has to spend a move to get to safety.",
  },
  'marshall/main': {
    '7b': 'Castle first, and wait for c3 to play the gambit.',
    '8b': 'The break: ...d5 hits the centre at once.',
    '11b': '...c6 shuts the bishop on b3 out of the game and defends the knight on d5.',
    '12b': 'The bishop aims at h2 and the white kingside.',
    '13b': 'Bring the queen out: the attack begins.',
    '14b': 'The queen on h3 pins down the white kingside.',
  },
};
for (const g of GAMBITS) for (const l of g.lines) l.notes = NOTES[`${g.id}/${l.id}`] ?? {};

export const gambitById = (id) => GAMBITS.find((g) => g.id === id);
export const allLines = () => GAMBITS.flatMap((g) => g.lines.map((l) => ({ ...l, gambit: g, key: `${g.id}/${l.id}` })));
