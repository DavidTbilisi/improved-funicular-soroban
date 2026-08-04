--!nonstrict
-- ============================================================================
-- Frozen peg data — PORT SUBSET. The web app carries several peg systems for
-- its mnemonic number-codec; this port keeps the two the 3D board renders:
-- CUBE_FACES (each rod's digit as a die face) and ALPHABET_PEGS (the A–Z food
-- pegs behind the rod rail's place icons). Both are frozen contracts — the
-- emoji/word pairs match src/domain/pegs.js exactly (see CLAUDE.md).
-- ============================================================================
local Pegs = {}

-- Food pegs A–Z — the place-value icons (rod letter -> peg).
Pegs.ALPHABET_PEGS = table.freeze({
  A = table.freeze({ emoji = "🍎", word = "Apple" }),
  B = table.freeze({ emoji = "🍌", word = "Banana" }),
  C = table.freeze({ emoji = "🥐", word = "Croissant" }),
  D = table.freeze({ emoji = "🍩", word = "Donut" }),
  E = table.freeze({ emoji = "🥚", word = "Egg" }),
  F = table.freeze({ emoji = "🍟", word = "Fries" }),
  G = table.freeze({ emoji = "🍇", word = "Grapes" }),
  H = table.freeze({ emoji = "🍯", word = "Honey" }),
  I = table.freeze({ emoji = "🍦", word = "Ice cream" }),
  J = table.freeze({ emoji = "🍮", word = "Jelly" }),
  K = table.freeze({ emoji = "🥝", word = "Kiwi" }),
  L = table.freeze({ emoji = "🍋", word = "Lemon" }),
  M = table.freeze({ emoji = "🥭", word = "Mango" }),
  N = table.freeze({ emoji = "🍜", word = "Noodles" }),
  O = table.freeze({ emoji = "🧅", word = "Onion" }),
  P = table.freeze({ emoji = "🍕", word = "Pizza" }),
  Q = table.freeze({ emoji = "🥧", word = "Quiche" }),
  R = table.freeze({ emoji = "🍚", word = "Rice" }),
  S = table.freeze({ emoji = "🍝", word = "Spaghetti" }),
  T = table.freeze({ emoji = "🌮", word = "Taco" }),
  U = table.freeze({ emoji = "🍲", word = "Udon" }),
  V = table.freeze({ emoji = "🍰", word = "Vanilla cake" }),
  W = table.freeze({ emoji = "🧇", word = "Waffles" }),
  X = table.freeze({ emoji = "🍛", word = "Xacuti curry" }),
  Y = table.freeze({ emoji = "🥣", word = "Yogurt" }),
  Z = table.freeze({ emoji = "🥒", word = "Zucchini" }),
})

-- Cube digit faces — vertical axis (which value). 0 = bare, 1-4 = earth face,
-- 5 = rose (sky bead), 6-9 = rose + earth face.
Pegs.CUBE_FACES = table.freeze({
  [1] = table.freeze({ emoji = "🚕", word = "Taxi", color = "#e8c832" }),
  [2] = table.freeze({ emoji = "🍊", word = "Tangerine", color = "#e8842c" }),
  [3] = table.freeze({ emoji = "👽", word = "Alien", color = "#3fa34d" }),
  [4] = table.freeze({ emoji = "🌊", word = "Wave", color = "#3b7dd8" }),
  [5] = table.freeze({ emoji = "🌹", word = "Rose", color = "#d43d3d" }),
  [6] = table.freeze({ emoji = "😇", word = "Angel", color = "#e6e6e6" }),
})

return table.freeze(Pegs)
