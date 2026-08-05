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
local World = if script then require(script.Parent.World) else require("./World")
local Achievements = if script then require(script.Parent.Achievements) else require("./Achievements")
local AnzanLevels = if script
  then require(script.Parent.Parent:WaitForChild("anzan"):WaitForChild("Levels"))
  else require("../anzan/Levels")
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
  -- Landmark claims: numeric-string keys that must name real landmark ids —
  -- anything else (junk keys, non-landmark ids, values that aren't `true`)
  -- silently drops, so a hostile blob can't grow the save unboundedly.
  if type(raw.landmarks) == "table" then
    for _, field in { "claimed", "restored" } do
      local src = raw.landmarks[field]
      if type(src) == "table" then
        for k, val in src do
          local id = tonumber(k)
          if val == true and id and id % 1 == 0 and id > 0 and World.isLandmark(id)
            and World.nodeAt(id).dist <= World.MAX_RADIUS then
            v.landmarks[field][tostring(id)] = true
          end
        end
      end
    end
  end
  -- Flash-anzan records: whitelisted by known level id; best is a streak
  -- count, fastest an interval that must be a plausible pace.
  if type(raw.anzan) == "table" then
    for _, lvl in AnzanLevels.ANZAN_LEVELS do
      local b = if type(raw.anzan.best) == "table" then num(raw.anzan.best[lvl.id], 0) else nil
      if b ~= nil then
        v.anzan.best[lvl.id] = b
      end
      local f = if type(raw.anzan.fastest) == "table" then num(raw.anzan.fastest[lvl.id], 100) else nil
      if f ~= nil and f <= 5000 then
        v.anzan.fastest[lvl.id] = f
      end
    end
  end
  -- The achievement tracker's blob: shape-whitelist here (known achievement
  -- ids, numeric counters, known-shape sets); the tracker heals the rest of
  -- its own structure on load.
  if type(raw.ach) == "table" and raw.ach.v == 1 then
    local a = { v = 1, seeded = raw.ach.seeded == true, unlocked = {}, counters = {} }
    if type(raw.ach.unlocked) == "table" then
      for _, def in Achievements.ACHIEVEMENTS do
        if type(raw.ach.unlocked[def.id]) == "string" then
          a.unlocked[def.id] = raw.ach.unlocked[def.id]
        end
      end
    end
    if type(raw.ach.counters) == "table" then
      for _, k in { "solves", "clean", "fast", "upgrades", "placed", "festivals", "earnSp", "bestStreak", "maxLevel" } do
        local m = num(raw.ach.counters[k], 0)
        if m ~= nil then
          a.counters[k] = m
        end
      end
      for _, setKey in { "tiersSolved", "placedTypes" } do
        local src = raw.ach.counters[setKey]
        if type(src) == "table" then
          a.counters[setKey] = {}
          for k, val in src do
            if val == true and type(k) == "string" then
              a.counters[setKey][k] = true
            end
          end
        end
      end
    end
    v.ach = a
  end
  v.v = 1
  return v
end

-- Instance method form used by load().
function GameSave:_fix(raw)
  return GameSave.fix(raw)
end

return GameSave
