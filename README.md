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
| `index.html` | **Today** — the front door: your day streak, one ~10-minute plan of three concrete tasks with a reason and a deep link each, **what is fading** across every track, your mental-track stage, the complement pairs you fumble, and save export/import |
| `explore.html` | **Explore** — the free-play 23-rod board, the live place-value chart, and the L3 deep-pack scenes |
| `practice.html` | **Guided practice** — the leveled bead-arithmetic ladder (see below) |
| `trainer.html` | **Mult / Div trainer** — the authentic rod-placement method, stepped out over six modes |
| `drills.html` | **Codec drills** — 17 timed recall decks (pegs → cells → scenes → seals) plus the finger times-table track |
| `anzan.html` | **Flash anzan** — the endgame: numbers appear one at a time and are gone; add them on the imagined board and type the sum. A rung you are stalling on points back at the board level that drills its trades |
| `yomiage.html` | **Read-aloud** (読上算) — the numbers are *spoken* and never shown: set each one on the beads as you hear it and hand in what the board reads. The third modality, and the one exercise where the board does the remembering |
| `exam.html` | **Kyu exam** — a timed paper in three sections (見取算 a column of terms, 掛算, 割算), modelled on the 珠算検定 grades. Sat on the beads: the board is the answer sheet, and nothing is marked until the paper is down |
| `vault.html` | **Vault** — store a real number, encode it to scenes, and be tested on recall over expanding intervals. Entries can be **sealed**: only the length and seals are kept, so the app never holds the digits |
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

The panel also forecasts **how much more practice until you can drop the beads** and work
on imagined rods — and once it says you can, it names the **flash-anzan rung** your level
and your record point at, so the runway does not simply end at "Mental".

### Read-aloud (読上算)

The numbers are **called aloud** and never appear: the caller opens with “Ready” (the board
is cleared for you on it), speaks each number *as a number* — “three hundred twenty-five”,
never “three two five” — and asks for the total. You set each one on the beads as it lands,
so the board carries the running sum and your memory carries nothing. **There is no replay.**

It is a third modality rather than a harder anzan: guided practice reaches the rods through
the eyes, flash anzan does the same faster, and this one never shows a numeral at all.
The difficulty is the **gap** between calls, not how fast the voice talks. The column is
the kyu paper's 見取算 column — same generator, same rules.

If the browser has no speech voice installed (many Linux boxes, most CI containers) the page
says so and shows the words instead: a soundless caller is still a usable exercise.

### The kyu exam

A soroban paper, and the app's one **external** yardstick — every other rank here it
invented. Ten grades from 10級 to 1級, each three sections: **見取算** a column of terms
added and subtracted in order, **掛算** multiplication, **割算** division. Each section is
scored out of 100 with its own clock, and **every section must reach 70 on its own** — an
average would let a perfect column carry a failed division.

You work each question on the beads and hand in what the board reads. The paper does not
mark as you go: every other page here answers you immediately because that is what practice
is for, and an exam measures what you can do without it. It **certifies nothing** — the
papers are shorter than the real ones and the division is exact — but the shape of the work
and the standard are the real ones. 見取算 in particular is the classic exercise nothing
else in the app asks for: guided practice tops out at two operands, and flash anzan does the
long column with no board.

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
| `npv-yomiage` | Read-aloud | rounds, each with the gap the caller left, best streaks, fastest gap carried |
| `npv-exam` | Kyu exam | every paper sat: per-section scores, what passed, how long it took |
| `npv-vault` | Vault | the numbers you are memorising, plus their review schedule. **The only key holding content rather than performance** — a `full` entry contains its digits in plain text, which is what the `sealed` mode is for |
| `npv-achievements` | Soroban Village | earned badges + lifetime counters (survive a raze) |
| `npv-support`, `npv-sound`, `npv-bpm`, `npv-voice-rate` | board pages | mnemonic-mental fade level, sound, metronome tempo, caller speed |

Days are keyed in **UTC**, matching every timestamp the app already writes, so the day
boundary is the same wherever you practise.

Nothing new is stored for **retention**: what is left of each skill is estimated from the
logs above. A track's half-life grows with the number of *separate days* you have practised
it — forty reps in one sitting is one day of learning — discounted by how cleanly those days
went, and what remains halves every half-life. It is a rough model, but it is the only thing
that puts a tutorial level, a drill deck and an anzan rung on one axis, which is what lets
Today's plan choose between them instead of guessing from a flat "untouched for 3 days".

**Export** writes all of it as one versioned JSON file. **Import** writes back every key
the file names and leaves the rest untouched — a partial or older export merges rather
than wipes — and downloads a safety copy of your current save first.

### On a phone

Every bead move is a home-row key, and a phone has no home row — so on a coarse pointer the
board grows a **touch pad**, and it is the same object the keyboard is: the **die cross**,
one hand each side, right adding and left subtracting, each cell in its fixed position
(centre 1, left 2, top 3, bottom 4, right 5 = the rose). A tap runs the same handler a key
does, so an illegal move is refused with the same complement to compose. The one thing it
cannot copy is the chord: 6–9 are two keys held together, a finger cannot hold two cells,
so they get their own row — still labelled with both faces, so the compound stays visible.

The nav becomes one horizontally-scrolling row (eleven pages wrapped is a four-line wall),
the page you are on is scrolled into view, and the village cockpit — which never scrolls on
a desktop — becomes an ordinary scrolling column, because a 412 px screen cannot hold the
diorama, the side panel and the contract strip at once and `overflow: hidden` on a layout
that does not fit only makes half of it unreachable.

### Offline, and installable

The app is a **static shell with a service worker**: on the first visit it precaches every
page, module and stylesheet it has — the whole app, the village included — so it opens with
no network at all. That is the point of a trainer you do daily: the train is exactly where
you have ten minutes and no signal.

Every response is **stale-while-revalidate**. There is no build step and so no content
hashes, which means there is no safe way to know a cached file is current; the cache
answers first and the network refreshes it behind the answer. The cost is being at most
**one load behind** after a deploy, and the nav bar offers a reload when a new version has
landed. Your progress lives in `localStorage`, which the cache never touches, so a stale
shell can never cost you a day's practice.

The precache list is **derived, not hand-written**: `scripts/offline-manifest.mjs` walks
each page's stylesheet and entry module and follows the import graph, and `npm test` fails
if `offline-manifest.json` has drifted from it. A page added without regenerating would
work online and break only offline, which is the one failure nobody would notice.

`manifest.webmanifest` makes it installable — Add to Home Screen on a phone, or install it
as a desktop app. Both the manifest and the service worker use **relative** paths, so the
same files work at a domain root and under the `/improved-funicular-soroban/` subpath on
GitHub Pages.

## Develop

```sh
npm test                        # unit suite (node:test, zero deps)
node --test test/codec.test.js  # run one file
npm run test:e2e                # Playwright browser suite (the one dependency)
npm run offline:manifest        # regenerate the precache list (after adding a page/module)
npm run icons                   # redraw the app icons (PNGs, encoded with node's zlib)
```

The domain, codec, command, drill-session, tutorial, game and today layers are DOM-free
and fully unit tested. See [CLAUDE.md](CLAUDE.md) for the architecture (layered ESM,
Observer/Command/Strategy/Factory/Adapter) and the conventions that keep it that way.

## Layout

```
*.html              thin shells — each loads styles.css + its own src/pages/*.js
styles.css          the one stylesheet
sw.js               the offline shell: precache + stale-while-revalidate
offline-manifest.json  the precache list — generated, and checked by npm test
manifest.webmanifest   installable-app metadata; icons/ holds its PNGs
scripts/            maintenance scripts (the manifest, the icons) — never shipped
src/
  domain/           pure logic: pegs, faces, rods, number parsing, complements, codec/
  state/            AbacusStore (Observable) + Commands (undo)
  drill/            decks, modes, session state machine, stats persistence, rng
  tutorial/         the leveled ladder, the rod trainer, solve/fault logs, forecasts
  anzan/            flash anzan: the rung ladder, the flash schedule, its own log
  yomiage/          read-aloud: the call grammar, the rung ladder, the spoken schedule
  exam/             the kyu ladder, the paper generators + marking, the attempt log
  vault/            stored numbers: entry + modes, recall verification, review scheduling
  game/             the Soroban Village economy, contracts, goals, achievements
  review/           retention: the decay model, and every track on one axis
  today/            the day axis, the unified profile, the plan ladder, save transfer
  view/             one class per panel (observers of the store/session) + figures.js
  pages/            one composition root per page
  boardShell.js     the reusable live board (store + soroban + readout + keyboard)
test/               node:test suites for the DOM-free layers
e2e/                Playwright specs for what a DOM-free test can't see
```
