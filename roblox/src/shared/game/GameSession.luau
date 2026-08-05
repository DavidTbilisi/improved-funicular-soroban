--!nonstrict
-- ============================================================================
-- GameSession — the village game's state machine, Observable. Port of
-- src/game/gameSession.js. Seeds the shared AbacusStore while disarmed, then
-- watches it: reaching the target scaledValue IS the solve (the board's
-- move-legality already polices technique).
--
-- Injected: buildings, tiers, save (GameSave), rng (:int), store (AbacusStore),
-- clock ({ now = () -> ms }). cellIdx is 1-based (see Economy port note).
-- Emitted events mirror the JS payloads (see that file's header).
-- ============================================================================
local Observable = if script
  then require(script.Parent.Parent.state.Observable)
  else require("../state/Observable")
local Buildings = if script then require(script.Parent.Buildings) else require("./Buildings")
local Challenges = if script then require(script.Parent.Challenges) else require("./Challenges")
local Economy = if script then require(script.Parent.Economy) else require("./Economy")
local World = if script then require(script.Parent.World) else require("./World")
local AnzanLevels = if script
  then require(script.Parent.Parent.anzan.Levels)
  else require("../anzan/Levels")

local buildingById = Buildings.buildingById
local GRID_CELLS = Buildings.GRID_CELLS
local FOUNDING_LEVEL = Buildings.FOUNDING_LEVEL

local GameSession = setmetatable({}, { __index = Observable })
GameSession.__index = GameSession

function GameSession.new(deps)
  local self = setmetatable(Observable.new(), GameSession)
  self.buildings = deps.buildings or Buildings.BUILDINGS
  self.tiers = deps.tiers or Challenges.CHALLENGE_TIERS
  self.save = deps.save
  self.rng = deps.rng
  self.store = deps.store
  self.clock = deps.clock or { now = function() return 0 end }
  self.village = self.save:load()
  self.challenge = nil
  self.armed = false
  self.store:subscribe(function()
    self:_onStore()
  end)
  return self
end

function GameSession:isActive()
  return self.challenge ~= nil
end

-- Announce the loaded village so views paint; call before shell.start().
function GameSession:start()
  self:notify({ type = "loaded", village = self.village })
end

function GameSession:startChallenge(tierId)
  if self:isActive() then
    return self:_refuse("busy")
  end
  local tier = Challenges.tierById(tierId)
  if not tier then
    return
  end
  self:_begin(tier, { kind = "earn", cell = nil })
end

-- Upgrade contract: pay the resource cost now, earn the level by solving.
function GameSession:startUpgrade(cellIdx)
  if self:isActive() then
    return self:_refuse("busy")
  end
  if type(cellIdx) ~= "number" or cellIdx % 1 ~= 0 or cellIdx < 1 or cellIdx > GRID_CELLS then
    return self:_refuse("range")
  end
  local cell = self.village.grid[cellIdx]
  if not cell then
    return self:_refuse("empty")
  end
  local def = buildingById(cell.id)
  local cost = Economy.upgradeCost(def, cell.level)
  if not Economy.canAfford(self.village, cost) then
    return self:_refuse("cost")
  end
  Economy.spend(self.village, cost)
  self.save:save(self.village)
  local tier = self.tiers[math.min(#self.tiers, def.tier + cell.level)]
  self:_begin(tier, { kind = "upgrade", cell = cellIdx, cost = cost })
end

function GameSession:_begin(tier, extra)
  local problem = tier:gen(self.rng)
  self.challenge = {
    tier = tier, problem = problem, faults = 0, t0 = 0,
    kind = extra.kind, cell = extra.cell, cost = extra.cost,
  }
  self.armed = false
  self.store:setScaled(problem.startScaled) -- notify fires while disarmed
  self.armed = true
  self.challenge.t0 = self.clock.now()
  self:notify({
    type = "challenge", kind = extra.kind, tierId = tier.id, title = tier.title,
    prompt = problem.prompt, sub = problem.sub, baseSp = tier.baseSp,
    timeFloorMs = tier.timeFloorMs, cell = extra.cell,
  })
end

function GameSession:abandonChallenge()
  if not self:isActive() then
    return
  end
  local ch = self.challenge
  self.challenge = nil
  self.armed = false
  if ch.kind == "upgrade" then
    Economy.refund(self.village, ch.cost)
    self.save:save(self.village)
  end
  self:notify({ type = "abandoned", village = self.village })
end

-- The app reports a fumble (illegal/rejected move) during the active contract.
function GameSession:fault()
  if self:isActive() then
    self.challenge.faults += 1
  end
end

-- Light a festival: burn the feast, boost payouts for FESTIVAL_SOLVES days.
function GameSession:lightFestival()
  local v = self.village
  if v.festival > 0 then
    return self:_refuse("festival")
  end
  local cost = Economy.festivalCost(v)
  if not Economy.canAfford(v, cost) then
    return self:_refuse("cost")
  end
  Economy.spend(v, cost)
  v.festival = Economy.FESTIVAL_SOLVES
  v.stats.festivals += 1
  self.save:save(v)
  self:notify({ type = "festival", village = v })
end

-- Bank a flash-anzan round. Anzan IS soroban work, so a correct round pays sp
-- (through the same shrine/festival/ruin blessings as contracts) and feeds
-- Rank via spEarned — but it never advances the day (world growth stays tied
-- to solved contracts) and never touches the contract stats, so contract
-- achievements and goals stay truthful.
-- result: { levelId, ok, intervalMs, streak, justPassed } — streak AFTER the
-- round, as AnzanSession's result event reports it.
function GameSession:anzanResult(result)
  local level = AnzanLevels.levelById(result and result.levelId)
  if not level then
    return self:_refuse("unknown")
  end
  local v = self.village
  local pay, parts = 0, nil
  if result.ok then
    local before = math.max(0, (result.streak or 1) - 1)
    parts = AnzanLevels.payoutParts(level, result.intervalMs, before)
    pay = AnzanLevels.payout(level, result.intervalMs,
      Economy.shrineBonus(v) + Economy.festivalBonus(v) + Economy.ruinBonus(v), before)
    v.sp += pay
    v.stats.spEarned += pay
  end
  local a = v.anzan
  if (result.streak or 0) > (a.best[level.id] or 0) then
    a.best[level.id] = result.streak
  end
  -- "Cleared at this pace" means carrying the whole floor without a miss —
  -- one lucky round at 200 ms is not a personal best (the web log's rule).
  if result.justPassed then
    local f = a.fastest[level.id]
    if not f or result.intervalMs < f then
      a.fastest[level.id] = result.intervalMs
    end
  end
  self.save:save(v)
  self:notify({
    type = "anzan", ok = result.ok, levelId = level.id, payout = pay, parts = parts,
    streak = result.streak, justPassed = result.justPassed, village = v,
  })
end

-- Visit a landmark node (the every-15th finds): claim a golden tree's cache,
-- pay to restore a ruin, or barter at a waystone. Resources only, never sp,
-- never a day — the ruin's blessing only MULTIPLIES what solving earns.
function GameSession:visitLandmark(id)
  if type(id) ~= "number" or id % 1 ~= 0 or not World.isLandmark(id) then
    return self:_refuse("unknown")
  end
  local node = World.nodeAt(id)
  local v = self.village
  if node.dist > World.radiusForDay(v.day) then
    return self:_refuse("range") -- beyond today's boundary
  end
  local def = World.LANDMARKS[node.kind]
  local key = tostring(id) -- DataStore JSON needs string keys
  if node.kind == "goldtree" then
    if v.landmarks.claimed[key] then
      return self:_refuse("claimed")
    end
    for k, n in def.gains do
      v.res[k] += n
    end
    v.landmarks.claimed[key] = true
    self.save:save(v)
    self:notify({ type = "landmark", kind = "goldtree", id = id, gains = def.gains, village = v })
  elseif node.kind == "ruin" then
    if v.landmarks.restored[key] then
      return self:_refuse("claimed")
    end
    if not Economy.canAfford(v, def.cost) then
      return self:_refuse("cost")
    end
    Economy.spend(v, def.cost)
    v.landmarks.restored[key] = true
    self.save:save(v)
    self:notify({ type = "landmark", kind = "ruin", id = id, cost = def.cost,
      bonus = Economy.ruinBonus(v), village = v })
  else -- waystone: barter give -> get, repeatable (cooldown is view-side)
    for k, n in def.give do
      if v.res[k] < n then
        return self:_refuse("cost")
      end
    end
    for k, n in def.give do
      v.res[k] -= n
    end
    for k, n in def.get do
      v.res[k] += n
    end
    self.save:save(v)
    self:notify({ type = "landmark", kind = "waystone", id = id, give = def.give, get = def.get, village = v })
  end
end

-- Harvest a world gather node (chop / pick / collect). Resources only — no sp,
-- no day advance: gathering supplements the economy but never progresses it,
-- which is what keeps the soroban the most beneficial thing in the world.
function GameSession:gather(kind)
  local def = World.GATHER[kind]
  if not def then
    return self:_refuse("unknown")
  end
  local v = self.village
  for k, n in def.gains do
    v.res[k] += n
  end
  self.save:save(v)
  self:notify({ type = "gathered", kind = kind, gains = def.gains, village = v })
end

-- Placing costs only resources on hand and never touches the board.
function GameSession:placeBuilding(buildingId, cellIdx)
  local def = buildingById(buildingId)
  if not def then
    return
  end
  local chk = Economy.canPlace(self.village, def, cellIdx)
  if not chk.ok then
    return self:_refuse(chk.reason)
  end
  Economy.place(self.village, def, cellIdx)
  self.save:save(self.village)
  self:notify({ type = "placed", cellIdx = cellIdx, buildingId = buildingId, village = self.village })
end

function GameSession:resetSave()
  self.challenge = nil
  self.armed = false
  self.village = self.save:reset()
  self:notify({ type = "reset", village = self.village })
end

function GameSession:_onStore()
  if not self.armed or not self.challenge then
    return
  end
  if self.store:scaledValue() == self.challenge.problem.targetScaled then
    self:_solve()
  end
end

function GameSession:_solve()
  local ch = self.challenge
  self.challenge = nil
  self.armed = false
  local elapsedMs = self.clock.now() - ch.t0
  local overTime = elapsedMs > ch.tier.timeFloorMs
  local clean = not overTime and ch.faults == 0
  local verdict = if clean then "clean" elseif ch.faults > 0 then "fumbled" else "slow"

  local v = self.village
  local pay, parts, milestone = 0, nil, nil
  if ch.kind == "earn" then
    local judge = { faults = ch.faults, elapsedMs = elapsedMs }
    parts = Challenges.payoutParts(ch.tier, judge, v.stats.streak)
    pay = Challenges.payout(ch.tier, judge,
      Economy.shrineBonus(v) + Economy.festivalBonus(v) + Economy.ruinBonus(v), v.stats.streak)
    v.sp += pay
    v.stats.spEarned += pay
    if pay > v.stats.bestPayout then
      v.stats.bestPayout = pay
    end
  else
    local cell = v.grid[ch.cell]
    cell.level += 1
    if cell.id == "shrine" and cell.level >= FOUNDING_LEVEL and not v.stats.founded then
      v.stats.founded = true
      milestone = "founded"
    end
  end
  v.stats.solves += 1
  if clean then
    v.stats.clean += 1
  end
  v.stats.streak = if clean then v.stats.streak + 1 else 0
  if v.stats.streak > v.stats.bestStreak then
    v.stats.bestStreak = v.stats.streak
  end
  local yields = Economy.advanceDay(v) -- one day per solved contract
  self.save:save(v)
  self:notify({
    type = "solved", kind = ch.kind, tierId = ch.tier.id, clean = clean, verdict = verdict,
    elapsedMs = elapsedMs, timeFloorMs = ch.tier.timeFloorMs, faults = ch.faults,
    payout = pay, parts = parts, yields = yields, day = v.day, village = v,
    cell = ch.cell, milestone = milestone, streak = v.stats.streak,
  })
end

function GameSession:_refuse(reason)
  self:notify({ type = "refused", reason = reason })
end

return GameSession
