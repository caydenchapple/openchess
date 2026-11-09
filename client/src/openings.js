// A compact opening book: ECO code | name | moves in SAN. Longest matching prefix wins.
// Every line is replayed through chess.js in the test-suite, so typos can't sneak in.
const RAW = `
A00|Uncommon Opening|1. g4
A00|Polish Opening|1. b4
A00|Grob Opening|1. g4 d5
A01|Nimzo-Larsen Attack|1. b3
A02|Bird's Opening|1. f4
A04|Réti Opening|1. Nf3
A06|Réti Opening: Nimzo-Larsen|1. Nf3 d5 2. b3
A09|Réti Opening: Advance Variation|1. Nf3 d5 2. c4
A10|English Opening|1. c4
A20|English Opening: Reversed Sicilian|1. c4 e5
A30|English Opening: Symmetrical Variation|1. c4 c5
A40|Queen's Pawn Game|1. d4
A45|Indian Defense|1. d4 Nf6
A46|Torre Attack|1. d4 Nf6 2. Nf3 e6 3. Bg5
A48|London System|1. d4 Nf6 2. Nf3 g6 3. Bf4
A80|Dutch Defense|1. d4 f5
B00|King's Pawn Opening|1. e4
B00|Nimzowitsch Defense|1. e4 Nc6
B01|Scandinavian Defense|1. e4 d5
B01|Scandinavian Defense: Main Line|1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5
B02|Alekhine's Defense|1. e4 Nf6
B06|Modern Defense|1. e4 g6
B07|Pirc Defense|1. e4 d6 2. d4 Nf6 3. Nc3
B10|Caro-Kann Defense|1. e4 c6
B12|Caro-Kann Defense: Advance Variation|1. e4 c6 2. d4 d5 3. e5
B13|Caro-Kann Defense: Exchange Variation|1. e4 c6 2. d4 d5 3. exd5 cxd5
B15|Caro-Kann Defense: Main Line|1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4
B18|Caro-Kann Defense: Classical Variation|1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5
B20|Sicilian Defense|1. e4 c5
B21|Sicilian Defense: Smith-Morra Gambit|1. e4 c5 2. d4 cxd4 3. c3
B22|Sicilian Defense: Alapin Variation|1. e4 c5 2. c3
B23|Sicilian Defense: Closed|1. e4 c5 2. Nc3
B27|Sicilian Defense: Open|1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4
B30|Sicilian Defense: Old Sicilian|1. e4 c5 2. Nf3 Nc6
B33|Sicilian Defense: Sveshnikov Variation|1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5
B40|Sicilian Defense: French Variation|1. e4 c5 2. Nf3 e6
B50|Sicilian Defense: Modern Variations|1. e4 c5 2. Nf3 d6
B52|Sicilian Defense: Canal Attack|1. e4 c5 2. Nf3 d6 3. Bb5+
B56|Sicilian Defense: Classical Variation|1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3
B70|Sicilian Defense: Dragon Variation|1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6
B90|Sicilian Defense: Najdorf Variation|1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
C00|French Defense|1. e4 e6
C01|French Defense: Exchange Variation|1. e4 e6 2. d4 d5 3. exd5 exd5
C02|French Defense: Advance Variation|1. e4 e6 2. d4 d5 3. e5
C03|French Defense: Tarrasch Variation|1. e4 e6 2. d4 d5 3. Nd2
C10|French Defense: Paulsen Variation|1. e4 e6 2. d4 d5 3. Nc3
C11|French Defense: Classical Variation|1. e4 e6 2. d4 d5 3. Nc3 Nf6
C15|French Defense: Winawer Variation|1. e4 e6 2. d4 d5 3. Nc3 Bb4
C20|King's Pawn Game|1. e4 e5
C21|Center Game|1. e4 e5 2. d4 exd4
C23|Bishop's Opening|1. e4 e5 2. Bc4
C24|Bishop's Opening: Berlin Defense|1. e4 e5 2. Bc4 Nf6
C25|Vienna Game|1. e4 e5 2. Nc3
C30|King's Gambit|1. e4 e5 2. f4
C33|King's Gambit Accepted|1. e4 e5 2. f4 exf4
C30|King's Gambit Declined|1. e4 e5 2. f4 Bc5
C40|King's Knight Opening|1. e4 e5 2. Nf3
C40|Latvian Gambit|1. e4 e5 2. Nf3 f5
C41|Philidor Defense|1. e4 e5 2. Nf3 d6
C42|Petrov's Defense|1. e4 e5 2. Nf3 Nf6
C44|Scotch Game|1. e4 e5 2. Nf3 Nc6 3. d4
C44|Ponziani Opening|1. e4 e5 2. Nf3 Nc6 3. c3
C45|Scotch Game: Main Line|1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4
C46|Four Knights Game|1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6
C47|Four Knights Game: Scotch Variation|1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. d4
C50|Italian Game|1. e4 e5 2. Nf3 Nc6 3. Bc4
C50|Italian Game: Hungarian Defense|1. e4 e5 2. Nf3 Nc6 3. Bc4 Be7
C51|Evans Gambit|1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4
C53|Italian Game: Giuoco Piano|1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5
C54|Italian Game: Giuoco Pianissimo|1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3
C55|Italian Game: Two Knights Defense|1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6
C57|Italian Game: Two Knights, Fried Liver Attack|1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7
C60|Ruy Lopez|1. e4 e5 2. Nf3 Nc6 3. Bb5
C62|Ruy Lopez: Steinitz Defense|1. e4 e5 2. Nf3 Nc6 3. Bb5 d6
C63|Ruy Lopez: Schliemann Defense|1. e4 e5 2. Nf3 Nc6 3. Bb5 f5
C64|Ruy Lopez: Classical Defense|1. e4 e5 2. Nf3 Nc6 3. Bb5 Bc5
C65|Ruy Lopez: Berlin Defense|1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6
C68|Ruy Lopez: Exchange Variation|1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6
C70|Ruy Lopez: Morphy Defense|1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4
C78|Ruy Lopez: Archangel Variation|1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O b5
C84|Ruy Lopez: Closed|1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
D00|London System|1. d4 d5 2. Bf4
D00|Queen's Pawn Game: Colle System|1. d4 d5 2. Nf3 Nf6 3. e3
D02|Queen's Pawn Game: Symmetrical Variation|1. d4 d5 2. Nf3
D06|Queen's Gambit|1. d4 d5 2. c4
D07|Queen's Gambit Declined: Chigorin Defense|1. d4 d5 2. c4 Nc6
D10|Slav Defense|1. d4 d5 2. c4 c6
D20|Queen's Gambit Accepted|1. d4 d5 2. c4 dxc4
D30|Queen's Gambit Declined|1. d4 d5 2. c4 e6
D35|Queen's Gambit Declined: Exchange Variation|1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5
D37|Queen's Gambit Declined: Three Knights|1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3
D43|Semi-Slav Defense|1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6
D50|Queen's Gambit Declined: Classical|1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5
D70|Neo-Grünfeld Defense|1. d4 Nf6 2. c4 g6 3. f3
D80|Grünfeld Defense|1. d4 Nf6 2. c4 g6 3. Nc3 d5
E00|Catalan Opening|1. d4 Nf6 2. c4 e6 3. g3
E10|Indian Defense: Normal Variation|1. d4 Nf6 2. c4 e6 3. Nf3
E11|Bogo-Indian Defense|1. d4 Nf6 2. c4 e6 3. Nf3 Bb4+
E12|Queen's Indian Defense|1. d4 Nf6 2. c4 e6 3. Nf3 b6
E20|Nimzo-Indian Defense|1. d4 Nf6 2. c4 e6 3. Nc3 Bb4
E60|King's Indian Defense|1. d4 Nf6 2. c4 g6
E70|King's Indian Defense: Normal Variation|1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6
E90|King's Indian Defense: Classical|1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2
A57|Benko Gambit|1. d4 Nf6 2. c4 c5 3. d5 b5
A60|Benoni Defense|1. d4 Nf6 2. c4 c5 3. d5 e6
A41|Old Indian Setup|1. d4 d6
D01|Jobava London System|1. d4 d5 2. Nc3 Nf6 3. Bf4
D03|Torre Attack|1. d4 d5 2. Nf3 Nf6 3. Bg5
A05|King's Indian Attack|1. Nf3 Nf6 2. g3
A07|King's Indian Attack|1. Nf3 d5 2. g3
A15|English Opening: Anglo-Indian|1. c4 Nf6
A22|English Opening: Bremen System|1. c4 e5 2. Nc3 Nf6
A25|English Opening: Closed|1. c4 e5 2. Nc3 Nc6
`;

export const OPENINGS = RAW.trim().split('\n').map((line) => {
  const [eco, name, moveText] = line.split('|');
  const moves = moveText.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
  return { eco, name, moves };
}).sort((a, b) => b.moves.length - a.moves.length);

/** Longest known opening that is a prefix of `sans`. Returns {eco,name,plies} or null. */
export function detectOpening(sans) {
  for (const o of OPENINGS) {
    if (o.moves.length <= sans.length && o.moves.every((m, i) => m === sans[i])) {
      return { eco: o.eco, name: o.name, plies: o.moves.length };
    }
  }
  return null;
}

/** How many leading plies of `sans` are still inside some known opening line. */
export function bookDepth(sans) {
  let best = 0;
  for (const o of OPENINGS) {
    let i = 0;
    while (i < o.moves.length && i < sans.length && o.moves[i] === sans[i]) i++;
    if (i > best) best = i;
  }
  return best;
}
