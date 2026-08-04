--!nonstrict
-- ============================================================================
-- Village advisor — turns the village into ONE concrete "do this next" hint.
-- Port of src/game/advisor.js. Every hint is { id, msg } (plain text).
-- ============================================================================
local Buildings = if script then require(script.Parent.Buildings) else require("./Buildings")
local Economy = if script then require(script.Parent.Economy) else require("./Economy")
local Goals = if script then require(script.Parent.Goals) else require("./Goals")
local buildingById = Buildings.buildingById
local RES_EMOJI = Buildings.RES_EMOJI

local Advisor = {}

-- Fixed key order so hint text is deterministic (JS relied on insertion order).
local RES_ORDER = { "sp", "food", "wood", "coin" }

function Advisor.costText(cost): string
  local parts = {}
  for _, k in RES_ORDER do
    local n = cost[k]
    if n and n ~= 0 then
      if k == "sp" then
        table.insert(parts, n .. " sp")
      else
        table.insert(parts, n .. " " .. RES_EMOJI[k])
      end
    end
  end
  return table.concat(parts, " + ")
end
local costText = Advisor.costText

local function countKeys(t)
  local n = 0
  for _ in pairs(t) do
    n += 1
  end
  return n
end

-- The cheapest pending upgrade on the grid, with its cell. Nil on empty grid.
function Advisor.cheapestUpgrade(village)
  local best = nil
  for i = 1, #village.grid do
    local cell = village.grid[i]
    if cell then
      local def = buildingById(cell.id)
      if def then
        local cost = Economy.upgradeCost(def, cell.level)
        local total = (cost.food or 0) + (cost.wood or 0) + (cost.coin or 0)
        if not best or total < best.total then
          best = { cell = i, def = def, level = cell.level, cost = cost, total = total }
        end
      end
    end
  end
  return best
end

-- "Light it now" — only when none is burning and the feast is affordable.
local function festivalHint(v)
  local cost = Economy.festivalCost(v)
  if v.festival > 0 or not Economy.canAfford(v, cost) then
    return nil
  end
  return {
    id = "festival",
    msg = string.format(
      "Light a festival (%s on hand ✓) — +50%% sp on every payout for the next %d solves.",
      costText(cost), Economy.FESTIVAL_SOLVES
    ),
  }
end

-- "Which building should I grow?" — shared by the level-2 rung and endgame.
local function upgradeHint(v, id, why)
  local up = Advisor.cheapestUpgrade(v)
  if not up then
    return { id = "rebuild", msg = "The grid is empty — build something first; contracts pay for the ground." }
  end
  local name = string.format("%s %s (L%d→L%d)", up.def.emoji, up.def.name, up.level, up.level + 1)
  local miss = Economy.shortfall(v, up.cost)
  if countKeys(miss) > 0 then
    return { id = id, msg = string.format(
      "%s Cheapest next step: the %s for %s — short %s; every solved contract banks a day of yields.",
      why, name, costText(up.cost), costText(miss)
    ) }
  end
  return { id = id, msg = string.format(
    "%s Cheapest next step: click the %s — %s on hand ✓.", why, name, costText(up.cost)
  ) }
end

-- The next goal is a building: unlock it, afford it, or go earn.
local function buildHint(v, def)
  if not Economy.isUnlocked(v, def) then
    local need = buildingById(def.unlock.building)
    return { id = "unlock", msg = string.format(
      "The %s %s unlocks after your first %s %s — build that first.",
      def.emoji, def.name, need.emoji, string.lower(need.name)
    ) }
  end
  if Economy.canAfford(v, def.cost) then
    return { id = "build", msg = string.format(
      "You can afford the %s %s (%s) — pick it under Build, then click an empty plot.",
      def.emoji, def.name, costText(def.cost)
    ) }
  end
  return { id = "save", msg = string.format(
    "Next up: the %s %s costs %s — short %s. Contracts mint sp, and each solve banks a day of yields.",
    def.emoji, def.name, costText(def.cost), costText(Economy.shortfall(v, def.cost))
  ) }
end

function Advisor.nextHint(village)
  local v = village
  if v.stats.solves == 0 then
    return { id = "first-contract", msg = "Take an Errand contract — reaching the answer on the beads mints your first sp." }
  end
  local goal = Goals.nextGoal(v)
  if goal then
    local def = buildingById(goal.id)
    if def then
      return buildHint(v, def)
    end
    if goal.id == "clean3" then
      local left = math.max(1, 3 - v.stats.clean)
      return { id = "clean3", msg = string.format(
        "Solve %d more contract%s clean — no fumbles, and beat the pace floor.",
        left, if left > 1 then "s" else ""
      ) }
    elseif goal.id == "level2" then
      return upgradeHint(v, "level2", "Levels multiply the daily yield.")
    elseif goal.id == "streak5" then
      return { id = "streak5", msg = string.format(
        "Best streak so far: %d. Chain clean solves to 5 in a row — leave \"keep contracts coming\" on, and remember a fumble resets it.",
        v.stats.bestStreak
      ) }
    elseif goal.id == "sp250" then
      return { id = "sp250", msg = string.format(
        "Mint %d more sp — harder tiers pay more, and a live streak adds a bonus on every solve.",
        250 - v.stats.spEarned
      ) }
    elseif goal.id == "found" then
      local shrine = nil
      for _, c in v.grid do
        if c and c.id == "shrine" then
          shrine = c
          break
        end
      end
      local cost = Economy.upgradeCost(buildingById("shrine"), shrine.level)
      local miss = Economy.shortfall(v, cost)
      local tail = if countKeys(miss) > 0
        then string.format(" once you have %s more.", costText(miss))
        else string.format(" (%s on hand ✓).", costText(cost))
      return { id = "found", msg =
        "Raise the shrine to level 3 to found the village — click it to take the upgrade contract" .. tail }
    elseif goal.id == "festival" then
      return festivalHint(v) or { id = "festival-save", msg = string.format(
        "Feast the village: a festival costs %s — short %s.",
        costText(Economy.festivalCost(v)), costText(Economy.shortfall(v, Economy.festivalCost(v)))
      ) }
    end
  end
  -- Endless mode.
  return festivalHint(v)
    or upgradeHint(v, "endless", "The ladder is complete — levels never stop, and yields scale with them.")
end

return Advisor
