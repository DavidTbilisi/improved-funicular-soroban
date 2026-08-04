--!nonstrict
-- ============================================================================
-- Frozen peg data — PORT SUBSET. The web app carries several peg systems for
-- its mnemonic number-codec (food A–Z, audio/visual matrix pegs); those belong
-- to trainer modes that are out of scope for the Soroban Village port. Only the
-- CUBE_FACES table is kept here, because the 3D board renders each rod's digit
-- as a die face. Treat it as a frozen contract (see CLAUDE.md).
-- ============================================================================
local Pegs = {}

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
