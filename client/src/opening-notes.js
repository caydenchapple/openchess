// Hand-written notes for the openings in openings.js. First matching pattern wins, so specific
// lines come before their parent families. Only general, well-established ideas — no deep theory.
const n = (idea, plans, pitfalls, keySquares, nextStep) => ({ idea, plans, pitfalls, keySquares, nextStep });

export const OPENING_NOTES = [
  [/Fried Liver/, n(
    'White sacrifices a knight on f7 to drag the black king into the open and attack it with the queen and pieces.',
    ['As White: after Nxf7 Kxf7 play Qf3+ and bring the knight to c3 and e4 with a strong attack.', 'As Black: avoid it with 5...Na5! (hitting the bishop) instead of 5...Nxd5, or choose 3...Bc5.'],
    ['Taking on d5 with the knight allows the sacrifice.', 'As White, do not sacrifice without a follow-up — count the attackers.'],
    'f7, d5 and the black king\'s escape squares.',
    'Learn the safer 5...Na5 line as Black, or the main attacking ideas as White.')],
  [/Evans Gambit/, n(
    'White gives up a pawn with b4 to gain time for a big pawn centre (c3 and d4) and open lines against the black king.',
    ['Play c3 and d4 quickly, then castle and bring rooks to the centre.', 'As Black, you can return the pawn at the right moment to neutralise the attack.'],
    ['Black grabbing everything can fall behind in development.', 'White should not delay the d4 break.'],
    'd4, e5 and the a1–h8 diagonal.',
    'Study how both sides handle the centre after c3 and d4.')],
  [/Giuoco|Italian Game/, n(
    'Develop quickly and aim the bishop at f7. White fights for the centre with c3 and d4; Black mirrors with ...Nf6, ...d6 and ...O-O.',
    ['White: c3, d3 (slow) or d4 (sharp), castle, then play for f4 or a kingside space gain.', 'Black: ...d6, ...O-O, ...a6 and ...Ba7 to keep the bishop safe, then break with ...d5.'],
    ['Early Ng5 attacks on f7 can backfire if your pieces are not developed.', 'Watch for pins on the f3 knight.'],
    'e4, d4/d5 and f7/f2.',
    'Learn the quiet "Giuoco Pianissimo" plan (c3, d3, Nbd2) — it is easy to play at any level.')],
  [/Ruy Lopez/, n(
    'The bishop on b5 pressures the knight that defends e5. White builds a strong centre with c3 and d4 and keeps a long-term space advantage.',
    ['White: castle, play Re1, c3 and d4, then manoeuvre the knight to g3 or f5.', 'Black: ...a6, ...Nf6, ...Be7, ...b5, ...d6 and ...O-O, then challenge the centre with ...exd4 or ...Bg4.'],
    ['Trying to win the e4 pawn too early can run into tricks.', 'After Bxc6 dxc6 Black has the bishop pair; do not rush to trade queens without a plan.'],
    'e5, d4, c6 and the b5–e8 diagonal.',
    'Learn the main "Closed Ruy Lopez" plan with ...Be7 and ...O-O and c3/d4.')],
  [/^Scotch/, n(
    'White opens the centre immediately with d4, aiming for quick activity and space.',
    ['White: recapture with the knight, develop with Nc3 and Be3, castle, and use the open d-file.', 'Black: ...Bc5 or ...Nf6 to hit the centre and develop quickly.'],
    ['Do not move the queen out early — it can be chased.', 'Do not leave the d4 knight hanging to ...Nxd4 ideas.'],
    'd4, e5 and the c5 and f6 squares.',
    'Play the main line and practise trading on d4 and developing with tempo.')],
  [/King's Gambit/, n(
    'White offers the f-pawn to open the f-file and build a big centre, at the cost of a weaker king.',
    ['White: develop quickly, play d4 and Nf3, and use the open f-file for the rook.', 'Black: keep the extra pawn if safe or counter in the centre with ...d5.'],
    ['Black playing ...Qh4+ early can make White\'s king very uncomfortable if White is careless.', 'White must keep developing rather than recapturing f4 slowly.'],
    'f4, e4/d4 and g1 (the king).',
    'Play it only if you enjoy open positions; learn to castle quickly as White.')],
  [/Vienna Game/, n(
    'White develops the knight and prepares f4 — a flexible way to fight for the centre with fewer risks than the King\'s Gambit.',
    ['White: Nc3, then f4 or Bc4 and Nf3, castle and aim for central breaks.', 'Black: ...Nf6 and ...d5 to equalise in the centre.'],
    ['Black taking on e4 too early can fall into tricks.', 'White should not play f4 before developing.'],
    'e4, f4 and the d5 square.',
    'Learn to meet 2...Nf6 with either 3.f4 or 3.Bc4 and a clear plan.')],
  [/Bishop's Opening/, n(
    'White develops the bishop first and keeps options open (Nf3 or Nc3, c3 and d4).',
    ['White: Nf3, c3 and d4 to build the centre.', 'Black: ...Nf6 and ...d5 for a comfortable game.'],
    ['Beware of early queen sorties.', 'Do not let Black play ...d5 for free.'],
    'e4, d4 and f7.', 'Aim for the c3/d4 centre.')],
  [/Petrov/, n(
    'Black mirrors White with ...Nf6, counter-attacking e4 and aiming for a solid, equal game.',
    ['Black: after 3.Nxe5 d6 4.Nf3 Nxe4 develop calmly with ...d5 and ...Be7.', 'White: play d4 and Bd3 for a safe edge and aim to castle quickly.'],
    ['Do not take on e5 on move 3 with ...Nxe5 (an old trap).', 'Watch for the Nc3 and Re1 pin on the e-file.'],
    'e4/e5 and the e-file.', 'Know the first six moves of the main line.')],
  [/Philidor/, n(
    'Black defends e5 with ...d6 and a flexible, solid structure, giving up some space.',
    ['Black: ...Nf6, ...Be7, ...O-O and ...c6 or ...Nbd7.', 'White: play d4 and keep a space advantage.'],
    ['Black can become passive if the bishop on c8 never gets out.', 'Beware of Bg5 pins.'],
    'e5, d5, f6.', 'Practise the ...Nf6/...Be7/...O-O setup.')],
  [/Four Knights/, n(
    'A symmetrical, solid classical opening where both sides develop their knights and bishops naturally.',
    ['White: Bb5, castle, d3 and Bg5 pins.', 'Black: mirror with ...Bb4 and ...O-O.'],
    ['Do not rush Nd5 — it can be undermined.', 'Remember pins on c3/f6.'],
    'e4/e5, d4/d5.', 'Learn the Spanish Four Knights ideas.')],
  [/Latvian|Center Game|Ponziani|Philidor|King's Knight Opening|King's Pawn Game/, n(
    'Open game: fight for the centre with pawns and develop knights and bishops with tempo.',
    ['Develop knights before bishops, castle early, and connect the rooks.', 'Challenge the centre with d4 (White) or ...d5 (Black) when it is safe.'],
    ['Avoid moving the same piece twice in the opening.', 'Do not bring the queen out early.'],
    'e4, e5, d4, d5.', 'Compare your first few moves with the plan of the opening: which piece could you have developed sooner?')],
  [/Najdorf/, n(
    'Black plays ...a6 to prepare ...b5 and keep options for ...e5 or ...e6, aiming for sharp counterplay.',
    ['White: Be3, f3, Qd2, O-O-O and a kingside pawn storm (the English Attack), or Bg5/Be2 lines.', 'Black: ...e5 or ...e6 and ...b5, using the c-file and queenside pawn majority.'],
    ['Do not open the position without being castled.', 'Do not neglect development to grab pawns.'],
    'd5, d4, e5 and the c-file.', 'Learn one set-up for White (English Attack) or Black (...e5).')],
  [/Dragon/, n(
    'Black fianchettos the bishop to g7, aiming it along the long diagonal at the white queenside.',
    ['White: the Yugoslav Attack — Be3, f3, Qd2, O-O-O, h4–h5.', 'Black: ...Nc6, ...O-O, ...Bd7, ...Rc8 and a ...Rxc3 exchange sacrifice at the right time.'],
    ['Black\'s king can be attacked on the h-file; be careful with timing.', 'White must castle queenside before pushing the h-pawn.'],
    'g7 diagonal, d4, h-file.', 'Understand the race: White attacks the king, Black attacks along the c-file.')],
  [/Sveshnikov/, n(
    'Black plays ...e5 early, accepting a backward d6 pawn for active pieces and a strong central pawn.',
    ['Black: ...Nf6, ...e5 and ...d5 at the right time.', 'White: play Nd5 and aim at the d6 pawn.'],
    ['Weak d6 and the d5 outpost can be a big issue for Black.', 'Know the Nd5 and Bxf6 ideas.'],
    'd5, d6.', 'Learn the standard pawn structure and key outposts.')],
  [/Alapin/, n(
    'White plays c3 to build the d4 centre without allowing the open Sicilian main lines.',
    ['White: d4 next, then Nf3 and Bd3.', 'Black: ...d5 or ...Nf6 hit the centre at once.'],
    ['After ...d5 exd5 Qxd5 do not leave the knight on c3 hanging to tricks.', 'Don\'t delay development.'],
    'd4/d5 and c3.', 'Know the two good answers: 2...d5 and 2...Nf6.')],
  [/Smith-Morra/, n(
    'White sacrifices a pawn for rapid development and open lines against the black king.',
    ['White: Nc3, Bc4, castle, Qe2, Rd1 and e5 breaks.', 'Black: accept the gambit and neutralise the pressure with ...d6, ...Nc6 and ...e6.'],
    ['Black should not take every pawn without developing.', 'White should keep developing pieces rather than recapturing.'],
    'e4, d4 (open files) and f7.', 'Aim to get all pieces out before grabbing material.')],
  [/^Sicilian/, n(
    'Black fights for the centre with a flank pawn, creating an unbalanced game with chances for both sides.',
    ['White: open the centre with d4 and develop; consider a kingside attack.', 'Black: use the half-open c-file and aim for queenside counterplay.'],
    ['Do not grab pawns while behind in development.', 'Be careful with an exposed king in open positions.'],
    'd4/d5 and the c-file.', 'Pick one Sicilian system (e.g. ...d6/...Nf6/...a6 or a ...e6 set-up) and learn its plans.')],
  [/French/, n(
    'Black builds a solid pawn chain with ...e6 and ...d5, accepting a cramped game for a sturdy position, then hits the centre with ...c5.',
    ['Black: ...c5 and ...Nc6 to attack d4; develop the light bishop actively (often to d7 or via ...b6/...Ba6).', 'White: advance with e5 to gain space or exchange to simplify.'],
    ['The bishop on c8 can become buried.', 'In the Exchange line do not be too passive.'],
    'd4, e5, c5.', 'Learn the structure of the Advance and Winawer; the plan is the same each time: hit the centre.')],
  [/Caro-Kann/, n(
    'Black supports ...d5 with a pawn on c6, keeping a solid structure and an easy-to-develop light bishop.',
    ['Black: ...Bf5 early, then ...e6, ...Nd7 and ...Ngf6.', 'White: keep space with e5 (Advance) or open lines with exchanges.'],
    ['Do not block your own bishop behind ...e6 before developing it.', 'Beware early queen exchanges leading to dull endings.'],
    'd5, e5, c6.', 'Know the plan: bishop out, then solid structure.')],
  [/Scandinavian/, n(
    'Black strikes at e4 at once with ...d5, accepting early queen activity for a quick fight for the centre.',
    ['Black: after exd5 Qxd5 Nc3 Qa5 develop with ...c6, ...Nf6 and ...Bf5.', 'White: develop with tempo against the queen (Nc3, Bc4, d4).'],
    ['Do not lose time with the queen more than needed.', 'Do not neglect development.'],
    'd5, d4 and the queen\'s escape squares.', 'Learn a safe queen retreat (a5 or d6) and a simple set-up.')],
  [/Alekhine/, n(
    'Black provokes White\'s pawns forward with ...Nf6 and aims to attack them later.',
    ['Black: ...d6 and ...Nb6 to undermine the centre.', 'White: keep the pawns protected and develop sensibly.'],
    ['Overextended pawns can become targets.', 'Do not neglect development.'],
    'd4, e5, c5.', 'Learn to meet the four pawns attack with calm development.')],
  [/Pirc|Modern/, n(
    'Black lets White build a centre and plans to attack it with pieces and a fianchettoed bishop.',
    ['Black: ...g6, ...Bg7, ...d6, ...Nf6, ...O-O and then ...c5 or ...e5.', 'White: take space and attack on the kingside.'],
    ['Black can fall into a space disadvantage if the centre is not challenged.', 'Do not castle into a pawn storm without a counterattack.'],
    'g7 diagonal, e5/c5.', 'Learn a simple set-up and when to break with ...c5/...e5.')],
  [/Nimzowitsch/, n('Black develops the knight first and aims for ...e5 and ...d5 at the right moment.', ['Black: ...e5 or ...d5 and develop naturally.', 'White: take the centre with e4/d4.'], ['Hedge your central ambitions.', 'Do not be too passive.'], 'e5, d5.', 'Understand the unusual move orders.')],
  [/Queen's Gambit Accepted/, n(
    'Black takes the c4 pawn and gives it back later to gain a free development and easy play.',
    ['Black: ...Nf6, ...e6 and ...c5 or ...a6 to hit the centre.', 'White: play e3 or e4 and regain the pawn with a bishop or Qa4+.'],
    ['Do not hold the pawn too long.', 'Do not lag in development.'],
    'd4, c4 and e5.', 'Know that this line is about development — keep your plan simple.')],
  [/Slav|Semi-Slav/, n(
    'Black supports d5 with ...c6, keeping the light bishop free to develop outside the pawn chain.',
    ['Black: ...Nf6, ...dxc4 then ...Bf5, or ...e6 for a Semi-Slav.', 'White: take space, e3/Nf3 and Qb3 ideas.'],
    ['Be careful about being cramped after ...e6.', 'Know the move order to avoid transposing into lines you do not know.'],
    'c4, d5, e4/e5.', 'Learn the plan: develop the c8 bishop before ...e6.')],
  [/Queen's Gambit Declined|Queen's Gambit/, n(
    'White offers a pawn to gain control of the centre; Black declines with ...e6 and keeps a solid structure.',
    ['White: Nc3, Nf3, Bg5/Bf4, e3 and castle; aim to hit the centre with cxd5 (Exchange) and a minority attack.', 'Black: ...Nf6, ...Be7, ...O-O and ...c5 or ...c6 to free the position.'],
    ['Black should not leave the light bishop buried too long.', 'Do not lose time with early queen moves.'],
    'd4/d5, c4/c5, e4/e5.', 'Learn the standard queenside minority attack and the ...c5 break.')],
  [/London/, n(
    'A solid system: develop the bishop to f4 before playing e3, then build a compact centre with Nf3, c3 and Nbd2.',
    ['White: d4, Bf4, e3, Nf3, c3, Bd3, Nbd2, then castle and aim for e4.', 'Black: ...c5 or ...e5 to challenge the centre immediately.'],
    ['Do not play too passively — the bishop can be hit by ...Nh5 or ...e5.', 'Watch the b2 pawn.'],
    'e4 break, f4 bishop, e5.', 'Learn the standard setup and when to play e4 or Ne5.')],
  [/Colle|Torre|Jobava/, n(
    'A simple system for White based on solid development rather than theory.',
    ['White: pieces to natural squares, castle, then aim for e4 or an attack on the kingside.', 'Black: challenge with ...c5 and ...Nc6.'],
    ['Be ready to react to ...c5 and ...e5 breaks.', 'Do not neglect your own king.'],
    'd4, e4/e5, f4/g5.', 'Learn the typical plans and standard tactics, e.g. against ...Bxh2+.')],
  [/Catalan/, n(
    'White fianchettoes the bishop to g2 to pressure the long diagonal and the queenside after c4.',
    ['White: Nf3, O-O, Qc2 and then queen-side pressure; recapture the c4 pawn if taken.', 'Black: ...Be7, ...O-O and ...dxc4 or ...c6 solid.'],
    ['Black taking c4 must be careful about being passive.', 'White should not play passively.'],
    'g2 bishop diagonal, c4, d5.', 'Understand the long-term pressure plan.')],
  [/Nimzo-Indian/, n(
    'Black pins the knight on c3 with ...Bb4 to fight for e4 and control the centre with pieces instead of pawns.',
    ['Black: ...O-O, ...d5 or ...c5, and be ready to trade the bishop for the knight.', 'White: a3, Qc2 or e3 to gain the bishop pair.'],
    ['Be careful about doubled pawns after Bxc3.', 'Do not miss the e4 break.'],
    'e4, c3, d5.', 'Know the structure after Bxc3 and the plan for each side.')],
  [/King's Indian Attack/, n(
    'White builds a flexible fianchetto system (Nf3, g3, Bg2, O-O, d3) and plays for e4 and a kingside attack.',
    ['White: castle, d3, Nbd2, e4 and then f4 or Re1; adapt to Black\'s set-up.', 'Black: strike in the centre with ...c5 and ...d5.'],
    ['Be careful about being too slow against ...e5 and ...d5.', 'Keep an eye on the long diagonal.'],
    'e4, f4, g2 bishop.', 'Learn the same set-up against many replies.')],
  [/King's Indian/, n(
    'Black lets White build a centre, then attacks it with ...e5 or ...c5 and a kingside pawn storm using the fianchettoed bishop.',
    ['Black: ...g6, ...Bg7, ...d6, ...O-O, ...e5 and ...f5.', 'White: queenside expansion with c5 and take space.'],
    ['Black can get squeezed if the ...e5/...c5 break does not come in time.', 'White should not drop the c4 pawn.'],
    'e5, f5, g7 bishop, c5.', 'Learn the typical race: queenside versus kingside play.')],
  [/Grünfeld|Neo-Gr/, n(
    'Black strikes at the centre with ...d5 at once and fights White\'s big pawn centre with pieces and pressure.',
    ['Black: ...Nf6, ...g6, ...d5, then pressure d4 with ...c5 and ...Bg7.', 'White: keep the centre supported and develop sensibly.'],
    ['The centre can collapse if undermined too early.', 'Know when to take on d5.'],
    'd4, d5, c5.', 'Study how Black attacks the d4 pawn.')],
  [/Benko|Benoni/, n(
    'Black sacrifices or concedes space to open the queenside files and play for active piece play.',
    ['Black: ...b5 or ...exd5 and use the open files.', 'White: take space with e4, d5.'],
    ['Do not play without a plan on the queenside.', 'Do not neglect piece safety.'],
    'b5, d5, c-file.', 'Learn the typical queenside play.')],
  [/Dutch/, n(
    'Black grabs space on the kingside with ...f5, aiming for an attacking, unbalanced game.',
    ['Black: ...Nf6, ...e6, ...Be7, ...O-O and ...d6 or ...d5.', 'White: develop and use the e4 square and the weakened kingside.'],
    ['Do not weaken your king without piece support.', 'Beware of Bg5 and e4 breaks.'],
    'e4, e5, f5.', 'Pick a set-up (Stonewall or Leningrad) and learn its plans.')],
  [/Queen's Indian|Bogo-Indian|Indian Defense/, n(
    'Black develops with ...Nf6 and fights for e4 and the centre with flexible piece play.',
    ['Black: ...b6 and ...Bb7 or ...Bb4+ to control e4.', 'White: take space with Nc3 and e4 or play for a central break.'],
    ['Do not be passive in the opening.', 'Do not neglect the centre completely.'],
    'e4, e5 and d5.', 'Learn the typical piece placement and where the pawns go.')],
  [/English/, n(
    'White fights for d5 and the centre from the flank, keeping flexible options; often a reversed Sicilian.',
    ['White: Nc3, g3, Bg2, e3 or e4 and d3/d4 at the right time.', 'Black: respond with ...e5 and ...Nf6, or ...c5.'],
    ['Do not let Black take over the centre.', 'Know how to play after ...e5.'],
    'd5, d4, c4.', 'Learn one structure (e.g. reversed Sicilian) well.')],
  [/Réti|Nimzo-Larsen|Bird|Polish|Grob|Uncommon/, n(
    'A flank opening: control the centre with pieces and flexible pawn moves instead of occupying it at once.',
    ['Develop knights and bishops to natural squares and castle.', 'Strike in the centre with d4 or e4 once ready.'],
    ['Avoid being too passive.', 'Do not let your opponent take the whole centre unchallenged.'],
    'e4, d4, d5.', 'Compare your setup with a classical opening and decide when to break in the centre.')],
  [/Queen's Pawn/, n(
    'A closed game starting with d4: control e5, develop knights and bishops, and decide on a central structure.',
    ['Play Nf3, c4/e3 and develop naturally; castle.', 'Look for the right moment to break with c4 or e4.'],
    ['Do not allow ...e5 without a reason.', 'Do not bring out the queen early.'],
    'd4, e4/e5, c4.', 'Pick a system (London, Queen\'s Gambit) and learn its plans.')],
];

export const FALLBACK_NOTES = {
  open: n(
    'An open game: both sides develop quickly and the centre opens early.',
    ['Develop knights before bishops, castle early, and connect the rooks.', 'Challenge the centre when you are safe.'],
    ['Avoid moving the same piece twice.', 'Do not bring out the queen early.'],
    'e4, e5, d4, d5.', 'Compare your first few moves with the plan of the opening: which piece could you have developed sooner?'),
  closed: n(
    'A closed game: slower manoeuvring around a pawn centre, where piece placement matters more than speed.',
    ['Develop sensibly, fight for e4/e5, and decide where to break.', 'Improve your worst piece.'],
    ['Do not neglect development.', 'Be careful about passive structures.'],
    'd4, e4, c4.', 'Pick a system and learn the pawn structure and plans.'),
  flank: n(
    'A flank or semi-open opening: control the centre with pieces, then break with a pawn at the right moment.',
    ['Develop, castle, then strike with d4 or e4.', 'Avoid being too passive.'],
    ['Do not let your opponent take the whole centre unchallenged.', 'Do not neglect development.'],
    'e4, d4, d5.', 'Compare your setup with the classical openings.'),
  generic: n(
    'Focus on the basics: control the centre, develop pieces, castle, and connect the rooks.',
    ['Move each piece once to a good square.', 'Do not attack too early.'],
    ['Avoid early queen moves.', 'Do not leave pieces undefended.'],
    'The four central squares.', 'Pick a simple opening for each colour and learn its plans.'),
};
