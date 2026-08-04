# Soroban Village — Roblox port

A Roblox (Luau) rebuild of the **Soroban Village** game from the web soroban
trainer in this repo. You solve bead-arithmetic contracts to mint soroban
points (sp), build and upgrade a village on a 9×6 grid rendered as a **3D
world**, light festivals, and climb an endless rank/achievement ladder. Your
village is saved per player with `DataStoreService`.

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
      game/    Buildings Economy Challenges Goals Advisor Rank
               Achievements AchievementTracker GameSession GameSave
    server/    → ServerScriptService   (DataStore persistence)
      VillageService.server.luau
    client/    → StarterPlayer.StarterPlayerScripts   (views + controller)
      GameController.client.luau
      view/    BoardView VillageView HudView AchievementsView Effects
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
- **Out of scope.** The other trainer modes, the full 19-rod board, and the
  read-aloud/TTS features are not part of this port.
