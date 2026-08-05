# Soroban Village — Roblox port

A Roblox (Luau) rebuild of the **Soroban Village** game from the web soroban
trainer in this repo — as a **walkable 3D world**. You spawn beside a giant
ceremonial soroban, take bead-arithmetic contracts at its counting table to
mint soroban points (sp), build and upgrade a village on a 9×6 grid, light
festivals, and climb an endless rank/achievement ladder. Around the village
lies open country: chop trees, pick berries and lift coin caches for
resources — and since **one village day passes per solved contract**, every
solve pushes the world's boundary outward and new country fills in. Every
15th node the boundary reaches is a **landmark find**: a golden tree (one-time
cache), an ancient ruin (pay to restore it for a permanent contract-payout
blessing, +2% each, capped +10%), or a waystone (barter wood for coin).
Gathering and landmarks yield resources only, never sp: the soroban is
deliberately the most beneficial thing you can do. Your village is saved per player with
`DataStoreService`.

This is a **from-scratch platform rewrite**, not a transpile: Roblox runs Luau,
builds its world from Instances, and persists with DataStores. What carried over
is the game's *logic* — the web app keeps its rules in DOM-free pure modules
(`src/game`, `src/domain`, `src/state`), and those port to Luau almost
line-for-line. The presentation (bead board, village, HUD) is all new, native
Roblox.

## Layout

```
roblox/
  default.project.json     Rojo → Instance tree
  .luaurc                  Luau analysis config
  src/
    shared/    → ReplicatedStorage.SorobanVillage   (pure logic, ported)
      Rng.luau
      domain/  Config Rod Soroban MovePlan Faces Pegs Number
      state/   Observable AbacusStore Commands
      game/    Buildings Economy Challenges Goals Advisor Rank World
               Achievements AchievementTracker GameSession GameSave
    server/    → ServerScriptService   (DataStore persistence + world stage)
      VillageService.server.luau
      WorldSetup.server.luau
    client/    → StarterPlayer.StarterPlayerScripts   (views + controller)
      GameController.client.luau
      view/    BoardView VillageView HudView AchievementsView WorldView Effects
  tests/       headless specs (NOT synced into the game)
```

## Build / run in Studio

1. Install Rojo — via [Rokit](https://github.com/rojo-rbx/rokit) (`rokit add
   rojo-rbx/rojo`), Aftman, `cargo install rojo`, or the Roblox Studio Rojo
   plugin.
2. From `roblox/`, either:
   - **Live sync:** `rojo serve`, then connect from the Studio Rojo plugin; or
   - **One-shot build:** `rojo build -o SorobanVillage.rbxlx` and open the file.
3. Press Play. On join, the server loads (or creates) your village and hands it
   to the client, which builds the 3D board + village and the HUD.

> DataStores only work in a **published** place (or Studio with *Enable Studio
> Access to API Services* ticked in Game Settings → Security). Without it the
> server falls back to a fresh in-memory village per session.

## Sound

Roblox can't synthesize audio, but one uploaded note pitch-shifted through
`Sound.PlaybackSpeed` covers the whole palette. Render the samples (zero-dep
node, mirroring the web `soundService.js` envelopes exactly):

```
node scripts/make-sounds.mjs     # writes roblox/sounds/*.wav
```

Upload the five WAVs once in Studio (Asset Manager → Audio) and paste the
asset ids into `src/client/SoundFx.luau` (`ASSET_IDS`). Until then every
sound call silently no-ops — the game is fully playable in silence.

## Tests

The `shared/` modules are pure and run headlessly under the
[`luau` CLI](https://github.com/luau-lang/luau/releases):

```
./tests/run.sh          # runs every *.spec.luau
luau tests/game.spec.luau
```

The specs prove parity with the web app's Node test suite for the numeric core,
the complement engine, the economy, the payout formula, and the session's
solve/earn/upgrade flow. The 3D/GUI views are verified by playing in Studio.

Type-check a module (the `script` / `Random` "unknown global" notes are the
expected false-positives for Roblox code analyzed outside Studio):

```
luau-analyze src/shared/game/GameSession.luau
```

## Notable port decisions

- **No BigInt.** The web board carries a `BigInt` because it has 19 integer
  rods. Luau numbers are doubles (exact to 2^53), so this port uses an
  **11-rod** board whose scaled value stays exact (~1e15 max). The village
  economy only reaches the millions, so nothing is lost. See
  `shared/domain/Config.luau`.
- **Dual-mode requires.** Every shared module imports with
  `if script then require(script.Parent.X) else require("./X")` so the *same*
  source loads both in Roblox (instance require) and under the `luau` CLI
  (string require) for headless testing.
- **1-based grid.** Lua arrays can't hold nil holes, so village grid cells are
  `1..54` and an empty plot is the boolean `false` (the JS version is 0-based
  with `null`).
- **The world is a pure function of the village day.** `shared/game/World.luau`
  derives the boundary radius from `village.day` and lays gather nodes on a
  deterministic golden-angle spiral — nothing about the map is stored, so a
  healed or imported save always gets the right world, and the layout is
  headlessly testable (`tests/world.spec.luau`). Node respawn timers are
  client-side scenery in a client-authoritative solo game.
- **Two modes, one controller.** Walking uses Roblox's own avatar camera; the
  counting table's ProximityPrompt flips into board mode (the old diorama
  camera + the contracts panel), and "Walk away" flips back. A contract begun
  from the field (tapping a built plot to upgrade) walks you to the table.
- **The die-cross keyboard works at the table.** Board mode enables the web
  board-shell's home-row scheme (`BoardHotkeys.luau`): the right hand adds
  (`K`¹ `J`² `I`³ `,`⁴ `L`⁵), the left subtracts (`D` `S` `E` `C` `F`), keys
  held together chord the compound 6–9 through `Faces.digitFromFaces` (the
  same inverse the web keyboard uses, so a key can never mean a different
  digit here), `U`/`R` carry ±10, `←`/`G` `→`/`H` step the focused rod and
  `Q` clears. Whole digits land through `BoardInput.pressWhole` — strict
  direct-only, so a keyed move and a clicked move grade identically.
- **Out of scope.** The other trainer modes, the full 19-rod board, and the
  read-aloud/TTS features are not part of this port.
