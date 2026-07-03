# improved-funicular-soroban

An interactive **place-value peg soroban** — a Japanese-abacus trainer for a mnemonic
number system. Every column is a food (which *place*), cube faces name the digit (which
*value*), and an L3 "deep-pack" codec turns long numbers into memorable scenes with
checksum seals, in decimal or hex.

**▶ Live demo: https://davidtbilisi.github.io/improved-funicular-soroban/**

## Run it

```sh
npm run dev     # serve at http://localhost:8000 (ES-module dev build)
```

Open `http://localhost:8000/index.html`. A static server is needed because the app is
built from native ES modules, which browsers refuse to import over `file://`.

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

## Develop

```sh
npm test                        # run the full suite (node:test, zero deps)
node --test test/codec.test.js  # run one file
```

The domain, codec, command, drill-session and stats layers are DOM-free and fully unit
tested. See [CLAUDE.md](CLAUDE.md) for the architecture (layered ESM, Observer/Command/
Strategy/Factory/Adapter) and the conventions that keep it that way.

## Layout

```
index.html          thin shell — loads styles.css + src/app.js
styles.css          extracted stylesheet
src/
  domain/           pure logic: pegs, faces, rods, number parsing, codec/
  state/            AbacusStore (Observable) + Commands (undo)
  drill/            decks, modes, session state machine, stats persistence, rng
  view/             one class per panel (observers of the store/session)
  app.js            composition root (the only module that touches the DOM)
test/               node:test suites for the DOM-free layers
```
