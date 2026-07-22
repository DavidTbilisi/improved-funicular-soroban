# improved-funicular-soroban

An interactive **place-value peg soroban** — a Japanese-abacus trainer for a mnemonic
number system. Every column is a food (which *place*), cube faces name the digit (which
*value*), and an L3 "deep-pack" codec turns long numbers into memorable scenes with
checksum seals, in decimal or hex.

**▶ Live demo: https://davidtbilisi.github.io/improved-funicular-soroban/**

## Run it

```sh
npm run dev     # serve at http://localhost:8139 (ES-module dev build)
```

Open `http://localhost:8139/`. A static server is needed because the app is
built from native ES modules, which browsers refuse to import over `file://`.

### The pages

| Page | What it is |
|---|---|
| `index.html` | **Today** — the front door: your day streak, one ~10-minute plan of three concrete tasks with a reason and a deep link each, your mental-track stage, the complement pairs you fumble, and save export/import |
| `explore.html` | **Explore** — the free-play 23-rod board, the live place-value chart, and the L3 deep-pack scenes |
| `practice.html` | **Guided practice** — the leveled bead-arithmetic ladder (see below) |
| `trainer.html` | **Mult / Div trainer** — the authentic rod-placement method, stepped out over six modes |
| `drills.html` | **Codec drills** — 17 timed recall decks (pegs → cells → scenes → seals) plus the finger times-table track |
| `anzan.html` | **Flash anzan** — the endgame: numbers appear one at a time and are gone; add them on the imagined board and type the sum |
| `game.html` | **Soroban Village** — a one-screen resource game where every contract is solved on the beads |
| `reference.html` | **Reference** — the frozen peg, face and hex tables |

### Keyboard arithmetic

Focus any column — integer **or** decimal — with `←` / `→` (or `G` / `H`, keeping
your hands on the home row). Each key is a **literal bead move** — right hand
adds, left hand subtracts:

```
add  J K L ;  = push 1..4 earth beads   U = set heaven (5)    I = carry (+10)
sub  F D S A  = pull 1..4 earth beads   R = clear heaven (5)  E = borrow (-10)
Q    = reset to 0
0-9  = input mode: type a number, Enter places it on the soroban (Esc cancels)
```

The subtract keys are the finger-mirror of the add keys (`F` mirrors `J`, etc).
Carry/borrow cross the decimal point — `+10` on the tenths lands in the ones.
A move that can't be made on the current rod (not enough free/active beads, or
the heaven bead is already set/clear) is **rejected and flagged**, with the
correct complement suggested — you compose it yourself, e.g. `+3` on a 4 is
`U` then `D` (`+5 −2`). Every move is undoable.

### Guided practice (leveled drills)

The **Guided practice** panel is a ladder of bead-arithmetic levels — read & set →
direct → small friend (±) → big friend / carry-borrow (±) → multi-digit. Each level
generates problems you solve **on the beads** with the keyboard; solve enough **in a
row** and the next level unlocks (progress is saved per browser). Because the bead
engine rejects illegal moves, landing on the right answer is proof you used the right
complement — so a level only has to check the final value. `Hint` shows the move,
`Show answer` reveals it and resets the streak.

### Today, and your saved progress

Every page writes its own progress to this browser's `localStorage` — nothing is sent
anywhere, and nothing is shared between browsers. **Today** (`index.html`) is the one
page that reads all of it at once:

| Key | Written by | Holds |
|---|---|---|
| `npv-days` | every page, on each solve / graded rep | the calendar days you practised — the streak |
| `npv-today` | Today | which of today's plan tasks you have ticked (clears at midnight, UTC) |
| `npv-tutorial-progress` | Guided practice | the unlock ladder + best clean streak per level |
| `npv-practice-history` | Guided practice | per-level solve records `{t, ms, clean, support}` |
| `npv-trainer-progress` | Mult / Div trainer | the same, per rod-trainer mode |
| `npv-drill-stats` | Codec drills | per-deck sessions, bests, and per-fact tallies |
| `npv-fault-log` | practice · trainer · village | rejected moves, counted by the complement pair they needed |
| `npv-game-save` | Soroban Village | the village |
| `npv-anzan` | Flash anzan | rounds (each with the pace it ran at), best streaks, fastest pace carried |
| `npv-achievements` | Soroban Village | earned badges + lifetime counters (survive a raze) |
| `npv-support`, `npv-sound`, `npv-bpm` | board pages | mnemonic-mental fade level, sound, metronome tempo |

Days are keyed in **UTC**, matching every timestamp the app already writes, so the day
boundary is the same wherever you practise.

**Export** writes all of it as one versioned JSON file. **Import** writes back every key
the file names and leaves the rest untouched — a partial or older export merges rather
than wipes — and downloads a safety copy of your current save first.

## Develop

```sh
npm test                        # unit suite (node:test, zero deps)
node --test test/codec.test.js  # run one file
npm run test:e2e                # Playwright browser suite (the one dependency)
```

The domain, codec, command, drill-session, tutorial, game and today layers are DOM-free
and fully unit tested. See [CLAUDE.md](CLAUDE.md) for the architecture (layered ESM,
Observer/Command/Strategy/Factory/Adapter) and the conventions that keep it that way.

## Layout

```
*.html              thin shells — each loads styles.css + its own src/pages/*.js
styles.css          the one stylesheet
src/
  domain/           pure logic: pegs, faces, rods, number parsing, complements, codec/
  state/            AbacusStore (Observable) + Commands (undo)
  drill/            decks, modes, session state machine, stats persistence, rng
  tutorial/         the leveled ladder, the rod trainer, solve/fault logs, forecasts
  anzan/            flash anzan: the rung ladder, the flash schedule, its own log
  game/             the Soroban Village economy, contracts, goals, achievements
  today/            the day axis, the unified profile, the plan ladder, save transfer
  view/             one class per panel (observers of the store/session) + figures.js
  pages/            one composition root per page
  boardShell.js     the reusable live board (store + soroban + readout + keyboard)
test/               node:test suites for the DOM-free layers
e2e/                Playwright specs for what a DOM-free test can't see
```
