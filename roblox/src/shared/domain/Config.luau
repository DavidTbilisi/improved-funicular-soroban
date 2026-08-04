--!nonstrict
-- ============================================================================
-- Abacus geometry constants — the one place the soroban's width is set.
--
-- PORT NOTE: the web app uses INT_COLS = 19 and carries the whole board value
-- as a BigInt, because 19 integer digits (10^18) overflow JS's exact-integer
-- range. Luau has no BigInt; its numbers are IEEE doubles, exact only to
-- 2^53 (~9e15). So this port REDUCES the board to 11 integer rods: the scaled
-- board value is at most (10^11 - 1) * 10^FRAC (~1e15), which stays exact with
-- room to spare. The Soroban Village economy only ever reaches the millions
-- (the `magnate` contract tier tops out near 9e7), so 11 rods is generous —
-- this is a deliberate, documented reduction of a range the village never uses.
-- ============================================================================
local Config = {}

Config.INT_COLS = 11  -- A = ones … K = 10^10 (ten-billions)
Config.FRAC_COLS = 4  -- flipped: A = tenths … D = ten-thousandths
Config.MAXINT = 10 ^ Config.INT_COLS - 1  -- 99,999,999,999 — exact as a double

-- Contracted numeric place labels, low place first (index 1 = ones).
Config.INT_PLACES = table.freeze({
  "1", "10", "100", "1k", "10k", "100k", "1m", "10m", "100m", "1b", "10b",
})
Config.FRAC_PLACES = table.freeze({ "0.1", "0.01", "0.001", "0.0001" })

-- 0-based column index -> letter (0 -> "A").
function Config.columnLetter(i: number): string
  return string.char(65 + i)
end

return table.freeze(Config)
