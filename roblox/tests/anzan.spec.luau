--!nonstrict
local H = require("./harness")
local Levels = require("../src/shared/anzan/Levels")
local AnzanSession = require("../src/shared/anzan/AnzanSession")
local Economy = require("../src/shared/game/Economy")
local GameSave = require("../src/shared/game/GameSave")
local GameSession = require("../src/shared/game/GameSession")
local AbacusStore = require("../src/shared/state/AbacusStore")
local Rng = require("../src/shared/Rng")

local function memStore()
  return { _v = nil, load = function(self) return self._v end, save = function(self, v) self._v = v end }
end

-- A single-slot fake timer: holds exactly one pending callback, which is all
-- the self-chaining schedule ever books — tick() walks the round by hand.
local function fakeTimer()
  local t = { pending = nil, ms = nil, nextId = 0 }
  t.set = function(fn, ms)
    t.nextId += 1
    t.pending = fn
    t.ms = ms
    return t.nextId
  end
  t.clear = function()
    t.pending = nil
    t.ms = nil
  end
  t.tick = function()
    local fn = t.pending
    t.pending = nil
    if fn then
      fn()
    end
  end
  return t
end

local function fakeClock()
  local c = { t = 0 }
  c.now = function()
    return c.t
  end
  return c
end

H.describe("Levels: ladder data")
H.eq(#Levels.ANZAN_LEVELS, 9, "nine rungs")
local shaped = true
for _, l in Levels.ANZAN_LEVELS do
  if not (l.id and l.terms and l.digits and l.baseMs and l.floor and l.baseSp) then
    shaped = false
  end
end
H.ok(shaped, "every rung carries id/terms/digits/baseMs/floor/baseSp")
H.eq(Levels.levelById("ten3").terms, 10, "levelById hit")
H.eq(Levels.levelById("nope"), nil, "levelById miss")

H.describe("Levels: genRound width rule")
local warm = Levels.levelById("warm")
local r1 = Levels.genRound(warm, Rng.sequence({ 0, 0, 0 }))
H.same(r1.terms, { 1, 1, 1 }, "digits=1 lower bound is 1")
local three3 = Levels.levelById("three3")
local r3 = Levels.genRound(three3, Rng.sequence({ 0, 899, 100 }))
H.same(r3.terms, { 100, 999, 200 }, "digits=3 spans exactly 100..999")
H.eq(r3.sum, 1299, "sum is the total")

H.describe("Levels: speedStep snaps and clamps")
H.eq(Levels.speedStep(1000, 0), 1000, "identity on a member")
H.eq(Levels.speedStep(990, 0), 1000, "snaps to nearest")
H.eq(Levels.speedStep(2000, -1), 2600, "learner paces extend above 2000")
H.eq(Levels.speedStep(4000, -1), 4000, "clamps at the slowest learner pace")
H.eq(Levels.speedStep(200, 1), 200, "clamps at fastest")
H.eq(Levels.speedStep(1000, 1), 800, "one rung faster")

H.describe("AnzanSession: the exact event walk")
local timer = fakeTimer()
local clock = fakeClock()
local s = AnzanSession.new({ rng = Rng.sequence({ 2, 4, 6 }), clock = clock, timer = timer })
local events = {}
s:subscribe(function(evt)
  table.insert(events, evt.type .. (if evt.value then ":" .. evt.value else ""))
end)
s:start("warm")
H.eq(events[1], "started", "started first")
H.eq(events[2], "flash:3", "first term lit (2+1 from rng 2)")
local litMs = math.round(1600 * Levels.LIT_SHARE)
H.eq(timer.ms, litMs, "flash books litMs")
timer.tick()
H.eq(events[3], "blank", "then blank")
H.eq(timer.ms, 1600 - litMs, "blank books the gap")
timer.tick()
H.eq(events[4], "flash:5", "second term")
timer.tick()
timer.tick()
H.eq(events[6], "flash:7", "third term")
timer.tick()
timer.tick()
H.eq(events[8], "answer", "answer phase after the last blank")
H.ok(s:isAccepting(), "accepting an answer")
H.eq(timer.pending, nil, "nothing scheduled while waiting")

H.describe("AnzanSession: submit grading + streak")
clock.t = 2500
local res = s:submit("15")
H.eq(res.ok, true, "3+5+7 = 15 accepted (string parse)")
H.eq(res.elapsedMs, 2500, "answer clock measured from the last blank")
H.eq(res.streak, 1, "streak counts")
H.eq(res.intervalMs, 1600, "result reports the shown pace")
H.eq(s:submit("15"), nil, "submit outside answer phase returns nil")
s:newRound()
timer.tick() -- blank after flash 1... walk to answer:
for _ = 1, 5 do
  timer.tick()
end
H.ok(s:isAccepting(), "second round reached answer")
H.eq(s:submit("garbage").ok, false, "garbage counts as wrong")
H.eq(s.streak, 0, "wrong resets the streak")

H.describe("AnzanSession: pace pinning across mid-round speed change")
local t2 = fakeTimer()
local s2 = AnzanSession.new({ rng = Rng.sequence({ 0, 0, 0, 0, 0, 0 }), clock = fakeClock(), timer = t2 })
s2:start("warm", 1000)
H.eq(t2.ms, math.round(1000 * Levels.LIT_SHARE), "round runs at 1000")
s2:setSpeed(200)
t2.tick() -- blank of term 1 — still the pinned pace
H.eq(t2.ms, 1000 - math.round(1000 * Levels.LIT_SHARE), "mid-round gap still at the pinned 1000")
for _ = 1, 5 do
  t2.tick() -- flash2, blank2, flash3, blank3, answer
end
local res2 = s2:submit(3)
H.eq(res2.intervalMs, 1000, "result reports the PINNED pace, not the new setting")
s2:newRound()
H.eq(t2.ms, math.round(200 * Levels.LIT_SHARE), "next round adopts the new pace")

H.describe("AnzanSession: stop is exact")
local t3 = fakeTimer()
local s3 = AnzanSession.new({ rng = Rng.sequence({ 0, 0, 0 }), clock = fakeClock(), timer = t3 })
s3:start("warm")
H.ok(t3.pending ~= nil, "a flash is scheduled")
s3:stop()
H.eq(t3.pending, nil, "stop clears the one pending handle")
H.ok(not s3:isActive(), "idle after stop")
local count = 0
s3:subscribe(function()
  count += 1
end)
s3:stop()
H.eq(count, 0, "stop while idle emits nothing")

H.describe("AnzanSession: justPassed at the floor, not after")
local t4 = fakeTimer()
local s4 = AnzanSession.new({ rng = Rng.sequence({ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }), clock = fakeClock(), timer = t4 })
s4:start("ten3") -- floor 3
local passes = {}
for round = 1, 4 do
  while not s4:isAccepting() do
    t4.tick()
  end
  local r = s4:submit(s4.round.sum)
  table.insert(passes, r.justPassed)
  s4:newRound()
end
H.same(passes, { false, false, true, false }, "justPassed exactly at streak == floor")

H.describe("Levels: payout formula")
local ten3 = Levels.levelById("ten3")
H.eq(Levels.payout(ten3, ten3.baseMs, 0, 0), 40, "base pace pays base")
H.eq(Levels.payoutParts(ten3, 200, 0).paceBonus, 20, "competition pace adds ceil(base/2)")
H.eq(Levels.payoutParts(ten3, 600, 0).paceBonus, 10, "pace bonus ramps linearly")
H.eq(Levels.payoutParts(ten3, 0, 15).streakBonus, 10 * 2, "streak bonus caps at 10")
H.eq(Levels.payout(ten3, 200, 0.3, 0), math.floor(60 * 1.3), "blessings multiply")

H.describe("GameSession.anzanResult: pays sp, never a day, records bests")
local mem = memStore()
local gs = GameSession.new({
  save = GameSave.new(mem), rng = Rng.sequence({ 0 }), store = AbacusStore.new(0, ""),
  clock = { now = function() return 0 end },
})
gs:start()
local gsEvents = {}
gs:subscribe(function(evt)
  table.insert(gsEvents, evt)
end)
local sp0, day0, solves0 = gs.village.sp, gs.village.day, gs.village.stats.solves
gs:anzanResult({ levelId = "warm", ok = true, intervalMs = 1600, streak = 1, justPassed = false })
H.eq(gs.village.sp, sp0 + 6, "warm at base pace pays 6")
H.eq(gs.village.stats.spEarned, 6, "feeds Rank via spEarned")
H.eq(gs.village.day, day0, "never advances the day")
H.eq(gs.village.stats.solves, solves0, "never touches contract stats")
H.eq(gs.village.anzan.best.warm, 1, "best streak recorded")
H.eq(gs.village.anzan.fastest.warm, nil, "no fastest without justPassed")
H.ok(mem._v ~= nil, "saved")
H.eq(gsEvents[#gsEvents].type, "anzan", "anzan event emitted")
gs:anzanResult({ levelId = "warm", ok = true, intervalMs = 800, streak = 5, justPassed = true })
H.eq(gs.village.anzan.fastest.warm, 800, "fastest recorded on justPassed")
gs:anzanResult({ levelId = "warm", ok = true, intervalMs = 1000, streak = 5, justPassed = true })
H.eq(gs.village.anzan.fastest.warm, 800, "a slower clear never raises fastest")
local spBefore = gs.village.sp
gs:anzanResult({ levelId = "warm", ok = false, intervalMs = 800, streak = 0 })
H.eq(gs.village.sp, spBefore, "failed round pays nothing")
gs:anzanResult({ levelId = "dragon", ok = true, intervalMs = 800, streak = 1 })
H.eq(gsEvents[#gsEvents].type, "refused", "unknown level refused")

H.describe("GameSave.fix: anzan round-trip + junk drop")
local healed = GameSave.fix({
  anzan = {
    best = { warm = 7, bogus = 3, ten3 = -2 },
    fastest = { warm = 800, ten3 = 99999, five1 = "fast" },
  },
})
H.eq(healed.anzan.best.warm, 7, "best survives")
H.eq(healed.anzan.best.bogus, nil, "unknown level dropped")
H.eq(healed.anzan.best.ten3, nil, "negative dropped")
H.eq(healed.anzan.fastest.warm, 800, "fastest survives")
H.eq(healed.anzan.fastest.ten3, nil, "implausible pace dropped")
H.eq(healed.anzan.fastest.five1, nil, "non-numeric dropped")
H.same(GameSave.fix(nil).anzan, { best = {}, fastest = {} }, "missing heals empty")

H.report("anzan.spec")
