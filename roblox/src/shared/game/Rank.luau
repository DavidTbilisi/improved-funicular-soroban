--!nonstrict
-- ============================================================================
-- Village rank — a pure, always-climbing "how big is my village" number.
-- Port of src/game/rank.js.
--   score       = sum(building levels) + floor(spEarned / SP_PER_POINT)
--   threshold(n)= n*(n+2)   — score to be AT rank n (rungs widen)
-- ============================================================================
local Rank = {}

Rank.SP_PER_POINT = 50

local RANK_NAMES = {
  "Camp", "Hamlet", "Village", "Town", "Township",
  "City", "Borough", "Metropolis", "Capital", "Megalopolis",
}

function Rank.rankTitle(n: number): string
  if n < #RANK_NAMES then
    return RANK_NAMES[n + 1] -- 0-based n -> 1-based Lua
  end
  return RANK_NAMES[#RANK_NAMES] .. " " .. (n - #RANK_NAMES + 2)
end

function Rank.totalLevels(village): number
  local sum = 0
  for _, cell in village.grid or {} do
    if cell then
      sum += cell.level
    end
  end
  return sum
end

function Rank.villageRank(village)
  local spEarned = (village.stats and village.stats.spEarned) or 0
  local score = Rank.totalLevels(village) + math.floor(spEarned / Rank.SP_PER_POINT)
  -- Largest n with n*(n+2) <= score, by exact integer stepping.
  local n = math.max(0, math.floor(math.sqrt(score + 1)) - 1)
  while (n + 1) * (n + 3) <= score do
    n += 1
  end
  while n > 0 and n * (n + 2) > score do
    n -= 1
  end
  local base = n * (n + 2)
  return { n = n, title = Rank.rankTitle(n), cur = score - base, next = 2 * n + 3, score = score }
end

return Rank
