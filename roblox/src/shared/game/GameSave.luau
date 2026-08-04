--!nonstrict
-- ============================================================================
-- Game save persistence — GameSave owns the village blob's shape and rides on
-- any ProgressStore port (a DataStore adapter on the server, an in-memory table
-- on the client / in tests). Port of src/game/saveStore.js. load() always
-- returns a village safe to play: _fix() rebuilds from newVillage() and copies
-- only the fields of the stored blob that validate.
-- ============================================================================
local Economy = if script then require(script.Parent.Economy) else require("./Economy")
local Buildings = if script then require(script.Parent.Buildings) else require("./Buildings")
local buildingById = Buildings.buildingById
local GRID_CELLS = Buildings.GRID_CELLS

local GameSave = {}
GameSave.__index = GameSave

function GameSave.new(store)
  return setmetatable({ store = store }, GameSave)
end

function GameSave:load()
  return self:_fix(self.store:load())
end

function GameSave:save(village)
  self.store:save(village)
end

function GameSave:reset()
  local v = Economy.newVillage()
  self:save(v)
  return v
end

-- Static so the server can heal a blob without an instance (GameSave.fix).
function GameSave.fix(raw)
  local v = Economy.newVillage()
  if type(raw) ~= "table" then
    return v
  end
  local function num(x, min)
    if type(x) == "number" and x == x and x >= min then
      return math.floor(x)
    end
    return nil
  end
  local n
  n = num(raw.sp, 0); if n ~= nil then v.sp = n end
  n = num(raw.day, 1); if n ~= nil then v.day = n end
  n = num(raw.festival, 0); if n ~= nil then v.festival = n end
  for _, k in { "food", "wood", "coin" } do
    local m = if raw.res then num(raw.res[k], 0) else nil
    if m ~= nil then
      v.res[k] = m
    end
  end
  if type(raw.grid) == "table" then
    for i = 1, GRID_CELLS do
      local c = raw.grid[i]
      if type(c) == "table" and buildingById(c.id) and type(c.level) == "number"
        and c.level % 1 == 0 and c.level >= 1 then
        v.grid[i] = { id = c.id, level = c.level }
      end
    end
  end
  if type(raw.stats) == "table" then
    for _, k in { "solves", "clean", "spEarned", "bestPayout", "streak", "bestStreak", "festivals" } do
      local m = num(raw.stats[k], 0)
      if m ~= nil then
        v.stats[k] = m
      end
    end
    if raw.stats.founded == true then
      v.stats.founded = true
    end
  end
  v.v = 1
  return v
end

-- Instance method form used by load().
function GameSave:_fix(raw)
  return GameSave.fix(raw)
end

return GameSave
