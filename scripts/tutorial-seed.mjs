// Writes a script that seeds localStorage with one reviewed game (synthetic engine numbers), so the tutorial checker can open the review screen
// as a brand-new player who has already finished a game. Usage: node scripts/tutorial-seed.mjs <out.js>

import { Chess } from 'chess.js';
import { buildReview, compactReview } from '../client/src/analysis-core.js';
import { writeFileSync } from 'node:fs';
const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. Qe4 c6 10. a3 Na6 11. d4 Kd7 12. Bf4 Nf6 13. Qxe5 Qe8 14. Rd1+ Nd5';
const c = new Chess(); c.loadPgn(pgn);
const moves = c.history({ verbose: true });
const r = new Chess(); const fens = [r.fen()]; for (const m of moves) { r.move(m.san); fens.push(r.fen()); }
// synthetic white-POV evals: roughly equal, then Black slides; first legal move is the "best"
const cps = [0,20,20,25,25,30,30,20,150,150,160,160,150,420,420,430,430,440,440,450,450,440,700,700,720,720,900,900,1000];
const evals = fens.map((f, i) => { const g = new Chess(f); const mv = g.moves({ verbose: true })[0]; const uci = mv ? mv.from + mv.to + (mv.promotion ?? '') : null; return { cp: cps[i] ?? 1000, best: uci, pv: uci ? [uci] : [] }; });
const review = buildReview({ fens, moves, evals, playerColor: 'b', priorRating: { w: 1400, b: 1100 } });
const game = { id: 'seedgame01', t: Date.now(), mode: 'import', color: 'b', playerName: 'Me', opponent: { name: 'Alice', rating: 1400 }, result: '1-0', reason: '', outcome: 'none', pgn: `[White "Alice"]\n[Black "Me"]\n\n${pgn} 1-0`, time: 0, inc: 0, rated: false, plies: moves.length, rating: null, priorRating: 1100, review: compactReview(review) };
console.log('mistakes for black:', review.plies.filter(p => p.color === 'b' && ['inaccuracy','mistake','blunder'].includes(p.cls)).length);
const state = { player: { id: 'seed-player', name: 'Seed' }, ratings: { computer: { r: 1000, games: 0, history: [] }, online: { r: 1000, games: 0, history: [] } }, settings: { sound: false, theme: 'dark', autoReview: false }, games: [game], mistakes: [], teach: { progress: null, tips: {} } };
writeFileSync(process.argv[2], `try{ if(!localStorage.getItem('openchess.v1')) localStorage.setItem('openchess.v1', ${JSON.stringify(JSON.stringify(state))}); }catch(e){}`);
