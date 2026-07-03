# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An interactive soroban (Japanese abacus) trainer that teaches a **place-value bead system** and a layered **mnemonic number-encoding scheme** (deep-pack scenes + checksum seals, decimal and hex). Originally one ~1000-line `index.html`; refactored into modular ES modules with a zero-dependency toolchain.

## Commands

- `npm test` — run the unit suite (`node --test`, no dependencies). Tests live in `test/*.test.js` and cover the DOM-free layers (domain, codec, commands, drill session, stats). Run one file with `node --test test/codec.test.js`.
- `npm run dev` — serve over `http://localhost:8000` (`python3 -m http.server`). **Required for the ESM `index.html`**: browsers block `<script type="module">` imports over `file://`, so the app must be served, not opened as a file.

## Architecture

`index.html` is now a thin markup shell that loads `styles.css` and `src/app.js` (the module entry). Everything else is under `src/`, layered so the core is DOM-free and unit-testable:

- **`src/domain/`** — pure logic, no DOM, no globals.
  - `pegs.js` = frozen data tables only (A–Z food pegs, cube faces, audio/visual matrix pegs, hex A–F). `faces.js` = digit→face grammar. `config.js` = abacus geometry (`INT_COLS=11`, `FRAC_COLS=4`, place names). `rod.js` = the numeric core (`{sky,earth}` rods; `index 0 = ones/tenths`). `number.js` = parse/display/`decodeChips`. `soroban.js` = the complement rule engine (`classifyAdd`/`classifySub` → direct / small-friend / big-friend move + carry/borrow) behind keyboard arithmetic.
  - `codec/` = the deep-pack encoder. `cell.js` (matrixCell/hexCell/packAction **factories**), `scene.js` (scene chunking + `sceneStory` narration), `codec.js` (**Strategy**: `DecimalCodec`/`HexCodec` behind `codecForRadix`; seals live here).
- **`src/state/`** — `observable.js` (**Observer** base), `abacusStore.js` (the single source of truth for bead positions; an Observable — mutating it notifies views), `commands.js` (**Command** pattern: `SetValue`/`StepInt`/`ToggleSky`/`ClickEarth` + `CommandBus` with undo via store snapshots).
- **`src/drill/`** — `decks.js` (13 decks as **Strategy** objects, each `gen(rng)`), `drillMode.js` (Typed/Reveal strategies), `drillSession.js` (DOM-free Observable state machine; timing via injected clock, items via injected `rng`, persistence via injected stats service), `statsStore.js` (**Adapter/Repository**: `StatsStore` port with `LocalStorage`/`Memory` adapters + `DrillStatsService`), `rng.js` (`MathRng`/`SequenceRng` — the seam that makes decks deterministic in tests).
- **`src/tutorial/`** — the leveled bead-arithmetic ladder (guided practice). `levels.js` (ordered **Strategy** levels: read → direct → small/big friend ± → multi-digit, each `gen(rng)` → a problem with `startScaled`/`targetScaled`, reusing `classifyAdd`/`classifySub`), `tutorialSession.js` (DOM-free Observable state machine that drives the **shared** `AbacusStore` and detects a solve by comparing `scaledValue()` to the target — the keyboard's move-legality rejection means a correct final value proves correct technique), `progressStore.js` (**Adapter/Repository** for streak-gated unlocks, `LocalStorage`/`Memory` like `statsStore`).
- **`src/view/`** — one class per panel (`soroban`, `readout`, `deepPack`, `reference`, `drill`, `tutorial`). Views **observe** the store/session and emit user intent through injected callbacks; they never mutate state directly.
- **`src/app.js`** — the composition root and the *only* module that touches `document`. It instantiates the graph and wires controls → Commands → store → views.

### Data flow (Observer + Command)

User action → `app.js` builds a **Command** → `CommandBus.run` executes it against `AbacusStore` → store `notify()`s → subscribed **views** re-render. The drill is a parallel loop: `DrillView` forwards input to `DrillSession`, which emits events the view renders. Because the store/session/codec/decks take their dependencies by injection, all of it is tested without a browser.

## Conventions

- **Frozen tables are contracts.** The peg/face/matrix tables and the seal rules (`sealDigit` = digit-sum mod 9→9; `sealHex` = nibble-sum mod 15→F) are described as "frozen"/"registered" and reference external spec docs not in this repo (`soroban-learning-method`, `number-codec-ladder`). Changing a peg or seal rule silently breaks numbers users have already memorized — flag such changes, don't make them casually.
- **Keep the DOM out of `src/domain`, `src/state`, `src/drill`, `src/tutorial`.** New logic belongs there (and gets a test); only `src/view/*` and `app.js` may reference `document`/`window`.
- Emoji are load-bearing data, not decoration — keep `emoji`/`word`/`color` in sync when editing tables.
