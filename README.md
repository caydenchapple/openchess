# OpenChess

Free, open-source chess. **No sign-up, no ads, no paywall, no AI services or API keys.**

- ♞ **Play the computer** — 20+ levels from about 100 up to full strength, measured by self-play on Stockfish's Elo scale (about ±80); the top levels are named after champions (Spassky, Polgár, Karpov, Anand, Kasparov, Carlsen)
- ♚ **Bobby Fischer bot** — plays his repertoire (1.e4; the Najdorf and King's Indian as Black, including the opening of the "Game of the Century") with his taste for bishops and the initiative, at his peak strength
- ♟ **Feels like a real board** — premoves (queue your reply while the opponent thinks), pieces that slide and lift, wooden move sounds, five board colours, and look-back through the game while it is live (click a move, ← → ↑ ↓, Home/End)
- 🌐 **Play a friend online with a code** — host a game and share the 6-letter code, or join with one. No public matchmaking. Draw offers, and takebacks the opponent has to accept
- 🪜 **Start at 100 and climb** — everyone begins at a rating of 100. Opponents open up as you beat the one below them (or get close to their rating), with a rung for every level from beginner to Stockfish
- 📊 **Post-game review** — every move rated like Chess.com (Brilliant !!, Great !, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder) with a plain-language note on each, accuracy by phase, evaluation graph, opening detection, estimated performance rating
- 🎓 **Built-in coach** (plain code, no AI model) — game summary, strengths, three personal lessons with drills, an explanation of each key mistake, opening notes, "position insight", and a training plan
- 📚 **Training that fits you** — you don't pick lessons. Each session is built from your ratings, your reviewed games and how you solve exercises, at a difficulty you should solve about 3 times in 4, with spaced repetition and a daily streak
- ▶ **Play through your game** — autoplay, step with the arrow keys, click the computer's line move by move, and "Try it yourself" to find the better move and get Stockfish's verdict
- 🧭 **Light-touch teaching** — a controls card, one-time tips, a 3-step coach walk-through of your first review, and a "?" how-to-play panel (plan in [docs/GAME_BRIEF.md](docs/GAME_BRIEF.md))
- 🧩 **Train on your own mistakes** — every blunder becomes a puzzle
- 🔒 **Private** — games, ratings and settings live in your browser's `localStorage`

## Run it

Requires Node 22.9+.

```bash
npm install
npm start        # builds the client and serves http://localhost:3000
```

Other commands: `npm run dev` (watch mode), `npm test`, `docker build -t openchess .`, and — with the server running — `npm run check:tutorial` (walks the first-review coach on desktop and two phone shapes with Playwright; needs `npx playwright install chromium` once).

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
network, two lines per position). Win-probability curve and per-move accuracy follow Lichess' formulas; move classes come from
win-% lost (<2 excellent, <5 good, <10 inaccuracy, <20 mistake, else blunder), plus three special ones: **Brilliant**
(the engine's own move, and a real sacrifice: you are a piece or more down after the reply and still down a few moves later or mating, while
not already winning), **Great** (the best move when the next-best is at least 15 win-% worse, so it is the only move that holds, and it is not a simple recapture)
and **Miss** (the opponent just erred, you were better, and your move let it go without losing). `client/src/notes.js` writes the
note for each move: forks, pins, skewers, discovered attacks, hung pieces, allowed mates, and what the better move would have done. Mistake themes (hung
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

- Single Node process; rooms live in memory (restart = ongoing online games end).
- WebSocket and HTTP share one port; a reverse proxy must pass `Upgrade` headers on `/ws/<CODE>`.
- Optional env: `PORT` (default 3000), `ALLOWED_ORIGINS` (extra WebSocket origins, comma separated).
- Stockfish is served from `/vendor/stockfish/` (≈3.5 MB, cached for a week).
- Everything else (engine, review, coach) runs in the player's browser, so hosting costs almost nothing.

## Training

`client/src/lessons-data.js` holds the topics (short lessons plus exercises), `lessons-logic.js` the player model, and `views/learn.js` the screens.
There is no lesson menu: `planSession` builds each session. Every topic has a skill rating for you and every exercise a difficulty on the same
Elo-like scale; sessions pick exercises you should solve about 3 times in 4, steer toward the mistakes found in your reviewed games
(hung pieces → free pieces, missed tactics → forks/skewers/pins, …), bring missed exercises back after 1/3/7/14/30 days, and show a short lesson
only the first time a topic comes up (never for things far below your level). Exercises with one best answer were generated and checked with
Stockfish 19: `npm run generate:lessons` rebuilds them, `npm run verify:lessons` re-checks all of them. The teaching text is ours and summarises
widely used training ideas (pattern recognition, spaced repetition, a candidate-move routine, early endgame study, learning from your own games).
It is not a promise of results.

## Computer levels

Strength is set by a node budget (not time), so a slow phone plays as strongly as a laptop. The ladder starts below a random mover: the first two
bots deliberately give pieces away (about 125 and 200), then come human-like bots that ask Stockfish for its five best moves and pick one by a
softmax over the win-chance each loses, plus occasional slips that hang material (so they play sensible-looking moves with the odd mistake,
instead of full-strength play with random junk). From 2000 up it is the engine at a bigger node budget. About 4,500 games between the settings
were fitted on one scale (Bradley–Terry), anchored so that Stockfish's own limiter at UCI_Elo 2000 (60k nodes) = 2000 (`scripts/calibrate-ladder.mjs`,
games in `calibration/`). What to keep in mind: each number is good to about ±80; it is Stockfish's scale, not Chess.com, Lichess or FIDE, and nothing was
measured against people; a purely random mover measures about 350. The legends are set to the peak rating of the player they are named after: that is their
strength, not their style. Only Bobby Fischer has a style (see `client/src/fischer.js`). Details and the full table are at the top of `client/src/levels.js`.

**Your rating** starts at 100 and moves with a standard Elo update against the opponent's rating (bigger steps for your first 12 games). Opponents open
as you beat the one below them (or reach within 150 of your rating). The post-game "estimated level" comes from `client/src/perf-model.js`: a curve fitted to the
average centipawn loss of bots of known strength, shrunk toward your rating on short games.

## Deploying to Cloudflare (site + online rooms)

```bash
npx wrangler login
npm run deploy:cloudflare      # deploys the room server (Worker + Durable Object in worker/) and the static site (Pages)
```

The Worker runs the same room code as the Node server, one Durable Object per room code, and `dist/config.js` tells the site where it is,
so online games work from the static site. Other static hosts: `npm run build:static`, upload `dist/`, and deploy the Worker separately.



Everything except online play runs in the browser, so `dist/` can be hosted anywhere static:

```bash
npm run build:static                 # builds the client and copies public/ to dist/
npx zephyr-cli deploy ./dist         # uploads it to Zephyr Cloud (org/project are set in zephyr.config.mjs)
```

Or `npx zephyr-cli deploy ./dist` for Zephyr Cloud. On a static host there is no game server, so the "Play people online" card says it is unavailable and play against
the computer, reviews, coaching and training all work. For online play, run `npm start` on a Node host with WebSocket support.

## Project layout

```
server/      index.js (HTTP + WebSocket) · rooms.js (games, lobby, clocks)
client/src/  main.js router · views/* · engine.js · analysis*.js · coach.js · opening-notes.js
             teaching.js + review-steps.js + tutorial/ (tutorial kit: coach overlay, tips, how-to panel)
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
