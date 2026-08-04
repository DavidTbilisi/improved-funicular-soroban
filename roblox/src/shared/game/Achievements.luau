--!nonstrict
-- ============================================================================
-- Achievements — a frozen ladder of badges with a progress(ctx) reducer. Port
-- of src/game/achievements.js. ctx = { village, counters }. done ≡ cur ≥ target.
-- ============================================================================
local Buildings = if script then require(script.Parent.Buildings) else require("./Buildings")
local Challenges = if script then require(script.Parent.Challenges) else require("./Challenges")
local Rank = if script then require(script.Parent.Rank) else require("./Rank")

local Achievements = {}

local TIER_COUNT = #Challenges.CHALLENGE_TIERS
local BUILDING_COUNT = #Buildings.BUILDINGS

local function co(ctx)
  return ctx.counters
end

-- cumulative counter >= target
local function count(key, target)
  return function(ctx)
    return { cur = co(ctx)[key] or 0, target = target }
  end
end

local function countKeys(t)
  local n = 0
  for _ in pairs(t or {}) do
    n += 1
  end
  return n
end

Achievements.ACHIEVEMENTS = {
  -- First steps
  { id = "first-solve", emoji = "🧮", title = "First contract", tier = "bronze",
    desc = "Solve your first contract on the beads.", progress = count("solves", 1) },
  { id = "first-build", emoji = "🛖", title = "Break ground", tier = "bronze",
    desc = "Place your first building.", progress = count("placed", 1) },
  { id = "first-upgrade", emoji = "⬆️", title = "Level up", tier = "bronze",
    desc = "Raise a building a level.", progress = count("upgrades", 1) },
  { id = "first-festival", emoji = "🏮", title = "Lantern light", tier = "bronze",
    desc = "Light your first festival.", progress = count("festivals", 1) },
  { id = "founded", emoji = "🎌", title = "Village founded", tier = "silver",
    desc = "Raise a shrine to level 3.",
    progress = function(ctx)
      local founded = ctx.village and ctx.village.stats and ctx.village.stats.founded
      return { cur = if founded then 1 else 0, target = 1 }
    end },

  -- Mastery
  { id = "clean-10", emoji = "✨", title = "Steady hands", tier = "bronze",
    desc = "Land 10 clean solves.", progress = count("clean", 10) },
  { id = "clean-50", emoji = "✨", title = "Practised", tier = "silver",
    desc = "Land 50 clean solves.", progress = count("clean", 50) },
  { id = "clean-250", emoji = "✨", title = "Bead master", tier = "gold",
    desc = "Land 250 clean solves.", progress = count("clean", 250) },
  { id = "streak-5", emoji = "🔥", title = "On a roll", tier = "bronze",
    desc = "Hold a 5-clean streak.", progress = count("bestStreak", 5) },
  { id = "streak-10", emoji = "🔥", title = "Unbroken", tier = "silver",
    desc = "Hold a 10-clean streak.", progress = count("bestStreak", 10) },
  { id = "streak-25", emoji = "🔥", title = "Flawless run", tier = "gold",
    desc = "Hold a 25-clean streak.", progress = count("bestStreak", 25) },
  { id = "fast-25", emoji = "⚡", title = "Quick hands", tier = "silver",
    desc = "Beat the pace floor 25 times.", progress = count("fast", 25) },
  { id = "tax-solve", emoji = "🧾", title = "Tax season", tier = "silver",
    desc = "Solve a Tax-season (division) contract.",
    progress = function(ctx)
      local t = co(ctx).tiersSolved or {}
      return { cur = if t.tax then 1 else 0, target = 1 }
    end },
  { id = "all-tiers", emoji = "📜", title = "Every contract", tier = "gold",
    desc = "Solve at least one of every contract tier.",
    progress = function(ctx)
      return { cur = countKeys(co(ctx).tiersSolved), target = TIER_COUNT }
    end },

  -- Village & the endless climb
  { id = "sp-500", emoji = "🪙", title = "Full coffers", tier = "bronze",
    desc = "Mint 500 sp all-time.", progress = count("earnSp", 500) },
  { id = "sp-5000", emoji = "🪙", title = "Rich village", tier = "gold",
    desc = "Mint 5,000 sp all-time.", progress = count("earnSp", 5000) },
  { id = "level-10", emoji = "🏗️", title = "Tall order", tier = "silver",
    desc = "Raise any building to level 10.", progress = count("maxLevel", 10) },
  { id = "level-25", emoji = "🏛️", title = "Landmark", tier = "gold",
    desc = "Raise any building to level 25.", progress = count("maxLevel", 25) },
  { id = "level-50", emoji = "🗼", title = "Endless spire", tier = "gold",
    desc = "Raise any building to level 50 — levels never cap.", progress = count("maxLevel", 50) },
  { id = "all-buildings", emoji = "🏘️", title = "Master builder", tier = "gold",
    desc = "Place one of every kind of building.",
    progress = function(ctx)
      return { cur = countKeys(co(ctx).placedTypes), target = BUILDING_COUNT }
    end },
  { id = "festivals-10", emoji = "🎆", title = "Festival season", tier = "silver",
    desc = "Light 10 festivals.", progress = count("festivals", 10) },
  { id = "rank-5", emoji = "🏙️", title = "Boomtown", tier = "silver",
    desc = "Reach Village Rank 5.",
    progress = function(ctx) return { cur = Rank.villageRank(ctx.village).n, target = 5 } end },
  { id = "rank-10", emoji = "🌆", title = "Great city", tier = "gold",
    desc = "Reach Village Rank 10.",
    progress = function(ctx) return { cur = Rank.villageRank(ctx.village).n, target = 10 } end },
  { id = "rank-25", emoji = "🌇", title = "Metropolis", tier = "gold",
    desc = "Reach Village Rank 25.",
    progress = function(ctx) return { cur = Rank.villageRank(ctx.village).n, target = 25 } end },
}

-- Every rung with its live progress + done flag, in ladder order.
function Achievements.achievementStates(ctx)
  local out = {}
  for _, a in Achievements.ACHIEVEMENTS do
    local p = a.progress(ctx)
    table.insert(out, {
      id = a.id, emoji = a.emoji, title = a.title, desc = a.desc, tier = a.tier,
      cur = math.min(p.cur, p.target), target = p.target, done = p.cur >= p.target,
    })
  end
  return out
end

return Achievements
