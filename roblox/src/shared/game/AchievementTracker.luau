--!nonstrict
-- ============================================================================
-- AchievementTracker — persistence + unlock engine behind Achievements. Port of
-- src/game/achievementTracker.js. Rides its OWN ProgressStore (separate from the
-- village save) so earned badges survive a raze. Observable: observes a
-- GameSession, updates counters, and notifies { type="unlocked", achievement }.
-- ============================================================================
local Observable = if script
  then require(script.Parent.Parent.state.Observable)
  else require("../state/Observable")
local Achievements = if script then require(script.Parent.Achievements) else require("./Achievements")
local ACHIEVEMENTS = Achievements.ACHIEVEMENTS

local function freshCounters()
  return {
    solves = 0, clean = 0, fast = 0, upgrades = 0, placed = 0, festivals = 0,
    earnSp = 0, bestStreak = 0, maxLevel = 0, tiersSolved = {}, placedTypes = {},
  }
end

local function maxGridLevel(village)
  local m = 0
  for _, cell in (village and village.grid) or {} do
    if cell and cell.level > m then
      m = cell.level
    end
  end
  return m
end

local function isoNow()
  return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

local AchievementTracker = setmetatable({}, { __index = Observable })
AchievementTracker.__index = AchievementTracker

function AchievementTracker.new(store, opts)
  local self = setmetatable(Observable.new(), AchievementTracker)
  self.store = store
  self.now = (opts and opts.now) or isoNow
  self.village = nil
  self.data = self:_load()
  return self
end

function AchievementTracker:_load()
  local raw = self.store:load()
  local d = if type(raw) == "table" then raw else {}
  if type(d.v) ~= "number" then
    d.v = 1
  end
  if type(d.seeded) ~= "boolean" then
    d.seeded = false
  end
  if type(d.unlocked) ~= "table" then
    d.unlocked = {}
  end
  local base = freshCounters()
  local existing = d.counters or {}
  for k, v in existing do
    base[k] = v
  end
  base.tiersSolved = existing.tiersSolved or {}
  base.placedTypes = existing.placedTypes or {}
  d.counters = base
  return d
end

function AchievementTracker:_persist()
  self.store:save(self.data)
end

-- Call once with the loaded village, before observe().
function AchievementTracker:seed(village)
  self.village = village
  if not self.data.seeded then
    self:_seedCounters(village)
    self.data.seeded = true
    self:_persist()
  end
  self:evaluate(true)
  return self
end

function AchievementTracker:_seedCounters(village)
  local c = self.data.counters
  local s = (village and village.stats) or {}
  c.solves = s.solves or 0
  c.clean = s.clean or 0
  c.earnSp = s.spEarned or 0
  c.festivals = s.festivals or 0
  c.bestStreak = s.bestStreak or 0
  local placed, upgrades, maxLevel = 0, 0, 0
  for _, cell in (village and village.grid) or {} do
    if cell then
      placed += 1
      upgrades += cell.level - 1
      if cell.level > maxLevel then
        maxLevel = cell.level
      end
      c.placedTypes[cell.id] = true
    end
  end
  c.placed = placed
  c.upgrades = upgrades
  c.maxLevel = maxLevel
end

function AchievementTracker:observe(session)
  return session:subscribe(function(evt)
    self:_onEvent(evt)
  end)
end

function AchievementTracker:_onEvent(evt)
  if evt.village then
    self.village = evt.village
  end
  local c = self.data.counters
  local touched = false
  if evt.type == "solved" then
    c.solves += 1
    if evt.clean then
      c.clean += 1
    end
    if type(evt.elapsedMs) == "number" and evt.elapsedMs <= evt.timeFloorMs then
      c.fast += 1
    end
    if evt.kind == "earn" then
      c.earnSp += evt.payout or 0
    elseif evt.kind == "upgrade" then
      c.upgrades += 1
    end
    if evt.tierId then
      c.tiersSolved[evt.tierId] = true
    end
    if type(evt.streak) == "number" and evt.streak > c.bestStreak then
      c.bestStreak = evt.streak
    end
    local ml = maxGridLevel(self.village)
    if ml > c.maxLevel then
      c.maxLevel = ml
    end
    touched = true
  elseif evt.type == "placed" then
    c.placed += 1
    if evt.buildingId then
      c.placedTypes[evt.buildingId] = true
    end
    touched = true
  elseif evt.type == "festival" then
    c.festivals += 1
    touched = true
  end
  if touched then
    self:_persist()
  end
  self:evaluate(false)
end

-- Cross the ladder against the live context; write + announce new unlocks.
function AchievementTracker:evaluate(silent)
  local ctx = { village = self.village, counters = self.data.counters }
  local newly = {}
  for _, a in ACHIEVEMENTS do
    if not self.data.unlocked[a.id] then
      local p = a.progress(ctx)
      if p.cur >= p.target then
        self.data.unlocked[a.id] = self.now()
        table.insert(newly, a)
      end
    end
  end
  if #newly > 0 then
    self:_persist()
    if not silent then
      for _, a in newly do
        self:notify({ type = "unlocked", achievement = a })
      end
    end
  end
end

-- Panel read: every rung with live progress, but `done` from the PERSISTED unlock.
function AchievementTracker:states(village)
  village = village or self.village
  local out = {}
  for _, s in Achievements.achievementStates({ village = village, counters = self.data.counters }) do
    local at = self.data.unlocked[s.id] or nil
    s.done = at ~= nil
    s.at = at
    table.insert(out, s)
  end
  return out
end

function AchievementTracker:unlockedCount()
  local n = 0
  for _ in pairs(self.data.unlocked) do
    n += 1
  end
  return n
end

return AchievementTracker
