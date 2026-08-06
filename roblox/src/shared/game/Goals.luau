--!nonstrict
-- ============================================================================
-- Village goals — a fixed milestone ladder derived PURELY from the village
-- table. Port of src/game/goals.js. Gives the HUD one "next goal" hint.
-- ============================================================================
local Economy = if script then require(script.Parent.Economy) else require("./Economy")

local Goals = {}

local function has(id)
  return function(v)
    return (Economy.counts(v)[id] or 0) >= 1
  end
end

local function anyLevel2(v)
  for _, c in v.grid do
    if c and c.level >= 2 then
      return true
    end
  end
  return false
end

Goals.GOALS = {
  { id = "hut", emoji = "🏠", label = "Build a hut", done = has("hut") },
  { id = "farm", emoji = "🌾", label = "Plant a farm", done = has("farm") },
  { id = "clean3", emoji = "✨", label = "Make 3 clean solves", done = function(v) return v.stats.clean >= 3 end },
  { id = "well", emoji = "💧", label = "Dig a well", done = has("well") },
  { id = "woodcutter", emoji = "🌲", label = "Hire a woodcutter", done = has("woodcutter") },
  { id = "level2", emoji = "⬆️", label = "Raise any building to level 2", done = anyLevel2 },
  { id = "workshop", emoji = "🏭", label = "Open a workshop", done = has("workshop") },
  { id = "streak5", emoji = "🔥", label = "Hold a 5-clean streak", done = function(v) return v.stats.bestStreak >= 5 end },
  { id = "market", emoji = "🏪", label = "Open a market", done = has("market") },
  { id = "sp250", emoji = "🧮", label = "Mint 250 sp all-time", done = function(v) return v.stats.spEarned >= 250 end },
  { id = "shrine", emoji = "⛩️", label = "Raise a shrine", done = has("shrine") },
  { id = "found", emoji = "🎌", label = "Shrine to level 3 — found the village", done = function(v) return v.stats.founded end },
  { id = "festival", emoji = "🏮", label = "Light a festival", done = function(v) return v.stats.festivals >= 1 end },
}

-- Every rung with its done flag, in ladder order.
function Goals.goalStates(village)
  local out = {}
  for _, g in Goals.GOALS do
    table.insert(out, { id = g.id, emoji = g.emoji, label = g.label, done = g.done(village) })
  end
  return out
end

-- The first undone rung, or nil once the ladder is complete.
function Goals.nextGoal(village)
  for _, g in Goals.goalStates(village) do
    if not g.done then
      return g
    end
  end
  return nil
end

return Goals
