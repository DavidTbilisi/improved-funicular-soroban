# Hardness by simulation — the village economy as a stock-and-flow model

`hardness.flow` is a [flowloom](https://github.com/DavidTbilisi/flowloom) model
of the Soroban Village economy. Because one village day passes **per solved
contract**, the whole game is a discrete dynamical system in "solves" — which
makes it unusually honest to simulate: the model's time axis *is* the player's
practice count, no wall-clock assumptions needed.

The model is a continuous mean-field approximation of
`src/game/{economy,challenges,buildings}.js`: a player whose bead fluency
grows with practice, playing the hardest tier they can keep mostly clean
(the flow-channel policy), spending sp on ground, resources on upgrades, and
lighting festivals when the feast is on hand. Placements, upgrade costs,
yields, the shrine blessing, and the payout formula are copied from the
source files.

## Run it

```bash
flowloom run     design/hardness.flow            # the shipped economy
flowloom run     design/hardness.flow --set tuned=0   # the pre-retune economy
flowloom summary design/hardness.flow            # classified dynamics, no arrays
flowloom sweep   design/hardness.flow --param learnRate --range 0.003..0.02/6 \
                 --metric final:DaysToFound      # founding day vs player ability
```

(`flowloom` is `~/code/flowloom` — `npm i -g .` there, or call
`node dist-cli/cli.js` directly.)

## The three questions, and what the model showed

**Q1 — pacing.** Founding (shrine L3) lands at solve **35–43 across a 7×
range of learner speed**, and the grid fills around solve 83. The arc is
self-balancing: payout grows with the same skill curve that gates the tiers,
so fast and slow learners reach the milestones in nearly the same number of
solves — they differ in wall-clock, not in structure. No change needed.

**Q2 — the incentive gradient (the real hardness defect).** With the original
flat ladder (baseSp 5, 8, 12, 18, 22, 25, 30 over floors 4–16 s), sp per
*second* did not rise with difficulty: base/floor plateaued after Ledger
(1.25, 1.6, 2.0, 2.0, 2.0, 1.79, 1.88), and the flat +1 sp streak step was
harvested fastest on 4-second errands. Simulated head-to-head, the same
player **earned more by grinding two tiers down than by playing at their
level — pushing paid only 0.54–0.81 sp-per-second of grinding**, and a mere
1.16× per solve. Since a village day also passes per solve, grinding was
better for yields too: the game paid players to avoid the arithmetic it
teaches.

*The retune that shipped:* baseSp **5, 8, 12, 22, 28, 38, 50** (base/floor
now strictly rising: 1.25 → 3.1) and a streak step of **⌈base/20⌉** sp
(identical for base ≤ 20, so the early game feels no change). Result:
pushing pays 1.4–1.9× per solve and ~0.85–1.0 per second — near-parity in
wall-clock terms, decisively better per solve and per village day. Founding
and grid-fill days are unchanged to the decimal.

**Q3 — the festival sink.** The fixed 300-unit feast burns at most 30
units/solve (no stacking), while yields grow without bound — the model showed
coverage pinned at 100% within ~20 solves of founding and the stores
diverging to **65,000 units by solve 400**: resources stop meaning anything.
Sweeping a scaled feast showed cost ≈ 10 days of production keeps coverage
at ~0.86 and the stores at a working balance (~5k, proportional to income).

*The retune that shipped:* `festivalCost()` prices the feast at
`FESTIVAL_YIELD_DAYS` (10) days of the village's own production per resource,
floored at the original 150 🌾 + 50 🪵 + 100 🪙 — young villages see exactly
the old price; rich villages keep facing a real decision.

## Reading the loops

`flowloom loops design/hardness.flow` finds the structure you'd expect: the
big reinforcing engine (solve → sp → buildings → yields → upgrades → bigger
payouts → …) braked by balancing loops through upgrade costs rising with
level and the scaled feast — plus the shrine and festival loops feeding the
payout multiplier. The retune's effect, in loop terms: the feast's balancing
loop used to detach from the reinforcing engine once yields outgrew the fixed
cost; pricing it to production keeps the brake attached forever.

## Caveats (what the model abstracts)

- Food/wood/coin are pooled into one resource stock; the build mix is assumed
  to roughly track the spending ratio.
- Solve quality (`cleanP`, `fastP`) and the grind bonus (+0.25 clean, +0.30
  fast two tiers down) are estimates; conclusions were checked for robustness
  by sweeping, not by trusting point values.
- The policy player always pushes; real players mix. The Q2 finding is about
  what the *optimal* strategy is, which is exactly what reward tuning shapes.
