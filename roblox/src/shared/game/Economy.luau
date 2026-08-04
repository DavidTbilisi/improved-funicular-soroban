--!nonstrict
-- ============================================================================
-- Village economy — pure functions over a plain village table. Port of
-- src/game/economy.js. Time is discrete: one village day per SOLVED contract
-- (advanceDay), so the sim is deterministic — no wall clock.
--
-- PORT NOTE: the JS grid is a 0-indexed array of null|{id,level}. Luau arrays
-- are 1-indexed and cannot hold nil holes, so this port uses cellIdx in
-- 1..GRID_CELLS and marks an empty plot with the boolean `false` (kept dense so
-- it serializes cleanly to a DataStore).
-- ============================================================================
local Buildings = if script then require(script.Parent.Buildings) else require("./Buildings")
local buildingById = Buildings.buildingById
local GRID_CELLS = Buildings.GRID_CELLS

local Economy = {}

function Economy.newVillage()
  local grid = {}
  for i = 1, GRID_CELLS do
    grid[i] = false
  end
  return {
    v = 1,
    sp = 20,
    res = { food = 0, wood = 0, coin = 0 },
    day = 1,
    festival = 0,
    grid = grid,
    stats = {
      solves = 0, clean = 0, spEarned = 0, bestPayout = 0,
      streak = 0, bestStreak = 0, festivals = 0, founded = false,
    },
  }
end

-- The festival — the standing resource sink (see economy.js header).
Economy.FESTIVAL_COST = table.freeze({ food = 150, wood = 50, coin = 100 })
Economy.FESTIVAL_SOLVES = 10
Economy.FESTIVAL_BONUS = 0.5
Economy.FESTIVAL_YIELD_DAYS = 10

function Economy.festivalBonus(village): number
  return if village.festival > 0 then Economy.FESTIVAL_BONUS else 0
end

function Economy.festivalCost(village)
  local y = Economy.dailyYield(village)
  return {
    food = math.max(Economy.FESTIVAL_COST.food, Economy.FESTIVAL_YIELD_DAYS * y.food),
    wood = math.max(Economy.FESTIVAL_COST.wood, Economy.FESTIVAL_YIELD_DAYS * y.wood),
    coin = math.max(Economy.FESTIVAL_COST.coin, Economy.FESTIVAL_YIELD_DAYS * y.coin),
  }
end

-- How many of each building stand, regardless of level.
function Economy.counts(village)
  local c = {}
  for _, cell in village.grid do
    if cell then
      c[cell.id] = (c[cell.id] or 0) + 1
    end
  end
  return c
end

function Economy.isUnlocked(village, def): boolean
  if not def.unlock.building then
    return true
  end
  return (Economy.counts(village)[def.unlock.building] or 0) >= 1
end

function Economy.canAfford(village, cost): boolean
  if (cost.sp or 0) > village.sp then
    return false
  end
  for _, k in { "food", "wood", "coin" } do
    if (cost[k] or 0) > village.res[k] then
      return false
    end
  end
  return true
end

-- What is still missing to afford a cost — empty table when affordable.
function Economy.shortfall(village, cost)
  local s = {}
  if (cost.sp or 0) > village.sp then
    s.sp = cost.sp - village.sp
  end
  for _, k in { "food", "wood", "coin" } do
    if (cost[k] or 0) > village.res[k] then
      s[k] = cost[k] - village.res[k]
    end
  end
  return s
end

function Economy.spend(village, cost)
  village.sp -= cost.sp or 0
  for _, k in { "food", "wood", "coin" } do
    village.res[k] -= cost[k] or 0
  end
end

function Economy.refund(village, cost)
  village.sp += cost.sp or 0
  for _, k in { "food", "wood", "coin" } do
    village.res[k] += cost[k] or 0
  end
end

-- cellIdx is 1-based (1..GRID_CELLS).
function Economy.canPlace(village, def, cellIdx)
  if type(cellIdx) ~= "number" or cellIdx % 1 ~= 0 or cellIdx < 1 or cellIdx > GRID_CELLS then
    return { ok = false, reason = "range" }
  end
  if village.grid[cellIdx] then
    return { ok = false, reason = "occupied" }
  end
  if not Economy.isUnlocked(village, def) then
    return { ok = false, reason = "locked" }
  end
  if not Economy.canAfford(village, def.cost) then
    return { ok = false, reason = "cost" }
  end
  return { ok = true }
end

-- Caller checks canPlace first (GameSession does).
function Economy.place(village, def, cellIdx)
  Economy.spend(village, def.cost)
  village.grid[cellIdx] = { id = def.id, level = 1 }
end

-- One day's production: sum(yield * level) over the grid, plus the well aura —
-- while at least one well stands, every farm grows +1 food.
function Economy.dailyYield(village)
  local y = { sp = 0, food = 0, wood = 0, coin = 0 }
  local farms, hasWell = 0, false
  for _, cell in village.grid do
    if cell then
      local def = buildingById(cell.id)
      if def then
        if def.id == "farm" then
          farms += 1
        end
        if def.id == "well" then
          hasWell = true
        end
        for k, v in def.yield do
          y[k] += v * cell.level
        end
      end
    end
  end
  if hasWell then
    y.food += farms
  end
  return y
end

-- Apply a day: bank yields, advance the calendar, burn a festival day.
function Economy.advanceDay(village)
  local y = Economy.dailyYield(village)
  village.res.food += y.food
  village.res.wood += y.wood
  village.res.coin += y.coin
  village.sp += y.sp
  village.day += 1
  if village.festival > 0 then
    village.festival -= 1
  end
  return y
end

-- Shrine blessing on contract payouts: +10% per shrine level, capped at +30%.
function Economy.shrineBonus(village): number
  local levels = 0
  for _, cell in village.grid do
    if cell and cell.id == "shrine" then
      levels += cell.level
    end
  end
  return math.min(0.3, levels * 0.1)
end

-- Upgrading costs resources (not sp) and scales with tier and level, forever.
function Economy.upgradeCost(def, level)
  local t = def.tier
  local cost = { food = 5 * t * level, wood = 5 * t * level }
  if level >= 2 then
    cost.coin = 5 * t * (level - 1)
  end
  return cost
end

return Economy
