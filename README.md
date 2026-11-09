# OpenChess

Free, open-source chess. **No sign-up, no ads, no paywall, no AI services or API keys.**

- ♞ **Play the computer** — 12 levels (≈400 → full strength), Stockfish 19 running in your browser
- 🌐 **Play people online** — quick pairing by time control, or a private invite link for a friend
- 📊 **Post-game review** — every move rated (best → blunder), accuracy by phase, evaluation graph, opening detection, estimated performance rating
- 🎓 **Built-in coach** (plain code, no AI model) — game summary, strengths, three personal lessons with drills, an explanation of each key mistake, opening notes, "position insight", and a training plan
- 🧩 **Train on your own mistakes** — every blunder becomes a puzzle
- 🔒 **Private** — games, ratings and settings live in your browser's `localStorage`

## Run it

Requires Node 22.9+.

```bash
npm install
npm start        # builds the client and serves http://localhost:3000
```

Other commands: `npm run dev` (watch mode), `npm test`, `docker build -t openchess .`

## How it works

```
browser                                          server (Node, ~500 lines)
├─ chessground + chess.js   board & rules        ├─ Express: static files
├─ Stockfish 19 lite (WASM) play + analysis      └─ ws: matchmaking, rooms, server-side clocks
├─ analysis-core.js         review maths
├─ coach.js + opening-notes.js   the coach
└─ localStorage             games, ratings
```

**Review maths** (`client/src/analysis-core.js`): Stockfish evaluates every position at depth 12 (lite
network). Win-probability curve and per-move accuracy follow Lichess' formulas; move classes come from
win-% lost (<2 excellent, <5 good, <10 inaccuracy, <20 mistake, else blunder). Mistake themes (hung
piece, missed tactic/mate, allowed mate, blown advantage, opening/endgame errors) are detected from the
engine's best moves and replies using the rules of chess.
The **performance rating is a rough estimate** from average centipawn loss and can be off by hundreds of
points on short games; depth 12 on the lite network can also misjudge very close calls.

**The coach** (`client/src/coach.js`): explanations are assembled from engine facts — what the better
move was and what it does (captures, gives check, develops, castles), what your opponent could capture
after your move, how the evaluation changed. Lessons are picked from your most frequent mistake themes
(with an example move from your game) and phase accuracy; the training plan is built from your stats
across games. `opening-notes.js` holds hand-written ideas/plans/pitfalls for the ~100 openings in
`openings.js`. It covers the common cases only; for anything unusual, trust the engine numbers.

**Ratings.** A local Elo kept per browser, separate pools for computer and online games. Not comparable
with FIDE/Lichess/Chess.com and not verifiable by others — there are no accounts, by design. Games with a
hint or takeback are unrated.

**Online play.** The server is authoritative: it validates every move with chess.js, runs the clocks,
handles resign / draw offers / flagging, and gives a disconnected player 45 s to reconnect. Players are
just a random id + display name from the browser. There is no chat (nothing to moderate).

## Hosting notes

- Single Node process; game state is in memory (restart = ongoing online games end).
- WebSocket and HTTP share one port; a reverse proxy must pass `Upgrade` headers on `/ws`.
- Optional env: `PORT` (default 3000), `ALLOWED_ORIGINS` (extra WebSocket origins, comma separated).
- Stockfish is served from `/vendor/stockfish/` (≈3.5 MB, cached for a week).
- Everything else (engine, review, coach) runs in the player's browser, so hosting costs almost nothing.

## Project layout

```
server/      index.js (HTTP + WebSocket) · rooms.js (games, lobby, clocks)
client/src/  main.js router · views/* · engine.js · analysis*.js · coach.js · opening-notes.js
             board.js · store.js · rating.js · openings.js · stats.js
scripts/build.js   bundles the client with esbuild, copies Stockfish + chessground CSS into public/
test/        node:test suites (rooms, websocket, review maths, coach)
```

## Contributing

Issues and PRs welcome. Ideas: more openings and notes, richer tactic detection (forks, pins, skewers)
in `coach.js`, endgame trainer, puzzle import, i18n, persistence for online games, a stronger (full
NNUE) engine option.

## License

GPL-3.0-or-later (see `LICENSE`). Stockfish and chessground are GPL-3.0; chess.js is BSD-2-Clause;
chessground's cburnett piece set is by Colin M.L. Burnett (GPL-2.0+).
