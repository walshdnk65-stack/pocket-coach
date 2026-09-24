# Pocket Coach

A no-limit Texas Hold'em trainer that runs in the browser. You play against four bots, each with a different style. On your turn you can press **Ask the coach** for a recommendation based on your cards, the board, the pot odds and how each bot has played the hand.

## Play

**▶ [Play Pocket Coach](https://walshdnk65-stack.github.io/pocket-coach/)**

Or download `index.html` and open it in any modern browser. It's a single file with no server or install needed. It loads its fonts from Google Fonts and falls back to system fonts when offline.

Keyboard: **F** fold · **C** check/call · **R** bet/raise · **T** ask the coach · **N** next hand.

## The table

| Bot | Style | How to beat it |
| --- | --- | --- |
| The Rock | Tight, passive | Steal their blinds; fold when they suddenly bet big |
| The Maniac | Loose, aggressive | Call down lighter with good hands; let them bluff into you |
| The Station | Loose, passive | Never bluff; bet your good hands big |
| The Shark | Tight, aggressive | Respect their re-raises; avoid big pots without a big hand |

## What the coach does

- Recommends fold, check, call, bet or raise, with a size.
- Estimates your **equity** (how often you win) by Monte Carlo simulation. Opponents are dealt hands from a range narrowed by their actions and style, not random cards.
- Compares equity with the **pot odds** you need, and counts **outs** with the rule of 4 and 2.
- Describes your hand (top pair, overpair, set, draws) and the board texture.
- Gives a read on each opponent and a short lesson on the concept behind the advice: position, value betting, semi-bluffs, set mining, continuation bets and so on.
- Reviews each of your decisions as you play and flags leaks like folding when you could check, or calling without the odds.

The **Hand chart** tab shows opening ranges by position, and **History** logs every hand.

The advice comes from a simplified teaching model built on sound fundamentals and on exploiting each bot's habits. It isn't a game-theory-optimal solver.

## Project layout

```
src/head.html   title, fonts and styles
src/body.html   page markup
src/engine.js   cards, 7-card hand evaluator, preflop rankings, draws, equity simulation
src/game.js     table flow, betting, side pots, showdown, bot decisions
src/coach.js    range estimates, advice, lessons, decision review
src/ui.js       rendering and input
build.sh        assembles src/ into index.html
tests/          headless simulation test
```

## Develop

Edit files in `src/`, then rebuild and test:

```sh
sh build.sh
node tests/simulate.js
```

The test plays 400 hands and checks that chips are conserved, the coach always answers, and the hand evaluator ranks hands correctly.
