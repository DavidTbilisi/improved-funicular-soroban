# improved-funicular-soroban

An interactive **place-value peg soroban** — a Japanese-abacus trainer for a mnemonic
number system. Every column is a food (which *place*), cube faces name the digit (which
*value*), and an L3 "deep-pack" codec turns long numbers into memorable scenes with
checksum seals, in decimal or hex.

## Run it

```sh
npm run dev     # serve at http://localhost:8000 (ES-module dev build)
```

Open `http://localhost:8000/index.html`. A static server is needed because the app is
built from native ES modules, which browsers refuse to import over `file://`.

### Keyboard arithmetic

Focus an integer column with `←` / `→`. Then the home row drives soroban moves —
right hand adds, left hand subtracts:

```
add  J K L ;  = +1 +2 +3 +4     U = +5     I = +10 (carry)
sub  A S D F  = -1 -2 -3 -4     Q = -5     W = -10 (borrow)
```

The trainer applies the move and names the rule — *direct*, *small friend*
(`+5 −friend`), or *big friend* (`+10 −friend`). Compose bigger digits from the
primitives (e.g. `+7` = `U` then `K`). Every move is undoable.

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
