# Teaching plan

**Does OpenChess need a tutorial?** Mostly no. Moving a piece (click/tap a piece, then a highlighted square, or drag it) is the most
widely known verb in games, legal moves are shown as dots, and we do not teach the rules of chess. So there is **no coach on the
game screen**: the board is the first thing players touch, with a controls card that fades after ~25 s.

What players *cannot* guess is the part that makes OpenChess different — the **review loop** after a game — and a few small rules
of the site (clocks, unrated games). Those are taught where they first matter.

> Status: this plan is a hypothesis. It has **not** yet been checked against five fresh players. Per the skill, run a no-tutorial
> baseline with five new players, add only what they miss, and drop rows they never needed.

| Learn | First moment it matters | Taught by | Learned when (a state) | If missed |
|---|---|---|---|---|
| Click a piece, then a highlighted square (or drag) | Start of any game | Controls card (corner, fades ~25 s, dims entries as they are used) + how-to-play panel | the player has made a move | Always in the "?" panel |
| The clock starts after Black's first move | First timed game | `tips.once('clock')` | tip shown once | Status line under the board says it too |
| You are in check — what to do | First time the player is in check | `tips.once('check')` | tip shown once | Status line adds "— check!" |
| Hint / Take back make the game unrated | Before pressing them | Button tooltips + the existing toast on use | — | Result card says "Unrated" |
| **Next mistake jumps to your errors** | First review | Coach step 1 (points at the button) | `onMistake` (the board shows one of your mistakes) | Idle ladder: nudge 8 s, hand 16 s, offer to skip 30 s |
| **Show the better move** | Right after step 1 | Coach step 2 | `viewingBetter` | same |
| Step with ← → / click a move | First review | Coach step 3 (info card, "Got it") | `Got it` | "?" panel lists it |
| Show the solution when stuck | Train page, 3 wrong tries in a row | `tips.fail('train-stuck', after 3)` | a correct answer ends the streak | The button is always visible |

**Skipped on purpose:** promotion (the picker explains itself), time-control names, ratings (explained on the result card and in About).
**Never taught again:** a finished or skipped tutorial does not return; a player who already reviewed a game before this feature
existed is never taught (`skipIfPlayed`). Replay (in the "?" panel) writes nothing to the save.
