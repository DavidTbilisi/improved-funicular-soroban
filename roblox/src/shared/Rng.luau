--!nonstrict
-- ============================================================================
-- Rng — the deterministic-seedable RNG seam, mirroring src/drill/rng.js. The
-- game core takes an `rng` with a single method `:int(n)` returning an integer
-- in [0, n). MathRng wraps a fresh Random; SequenceRng replays a fixed list
-- (the test seam that makes contract generation deterministic).
-- ============================================================================
local Rng = {}

local MathRng = {}
MathRng.__index = MathRng

-- seed is optional; omit for a nondeterministic stream (Roblox `Random`).
function Rng.math(seed: number?)
  local r = if seed ~= nil then Random.new(seed) else Random.new()
  return setmetatable({ _r = r }, MathRng)
end

-- Integer in [0, n).
function MathRng:int(n: number): number
  if n <= 0 then
    return 0
  end
  return self._r:NextInteger(0, n - 1)
end

local SequenceRng = {}
SequenceRng.__index = SequenceRng

-- Replays `seq` (a list of integers) then falls back to 0, wrapping like the JS
-- SequenceRng: the value returned is `seq[i] % n`.
function Rng.sequence(seq: { number })
  return setmetatable({ _seq = seq, _i = 0 }, SequenceRng)
end

function SequenceRng:int(n: number): number
  if n <= 0 then
    return 0
  end
  self._i += 1
  local v = self._seq[self._i] or 0
  return v % n
end

return Rng
