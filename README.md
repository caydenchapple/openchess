# OpenChess

Free, open-source chess. **No sign-up, no ads, no paywall, no AI services or API keys.**

- ♞ **Play the computer** — 12 levels (≈400 → full strength), Stockfish 19 running in your browser
- 🌐 **Play people online** — quick pairing by time control, or a private invite link for a friend
- 📊 **Post-game review** — every move rated (best → blunder), accuracy by phase, evaluation graph, opening detection, estimated performance rating
- 🎓 **Built-in coach** (plain code, no AI model) — game summary, strengths, three personal lessons with drills, an explanation of each key mistake, opening notes, "position insight", and a training plan
- 📚 **Step-by-step lessons** — 10 lessons in 5 units (checkmate, free pieces, opening principles, forks, skewers, pins, mate in two, pawn endings, a thinking routine), daily practice with spaced repetition, stars, and a daily 🔥 streak with weekly freezes. Recommendations follow the mistakes found in your own reviewed games.
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

## Lessons

`client/src/lessons-data.js` holds the curriculum, `lessons-logic.js` the learning engine (stars, Leitner-box spaced repetition at
1/3/7/14/30 days, daily plan, streaks, recommendations) and `views/learn.js` the screens. Every exercise with one best answer was
generated and then checked with Stockfish 19: `npm run generate:lessons` rebuilds the sets, `npm run verify:lessons` re-checks all of them.
The teaching text is ours and summarises widely used training ideas (pattern recognition, spaced repetition, a candidate-move routine,
early endgame study, learning from your own games). It is not a promise of results.

## Deploying as a static site (Cloudflare Pages or Zephyr Cloud)

```bash
npm run build:static
npx wrangler pages deploy dist --project-name <your-project>   # Cloudflare Pages
```


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
