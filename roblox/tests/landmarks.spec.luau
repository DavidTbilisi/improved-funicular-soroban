--!nonstrict
local H = require("./harness")
local World = require("../src/shared/game/World")
local Economy = require("../src/shared/game/Economy")
local Challenges = require("../src/shared/game/Challenges")
local Achievements = require("../src/shared/game/Achievements")
local GameSave = require("../src/shared/game/GameSave")
local GameSession = require("../src/shared/game/GameSession")
local AbacusStore = require("../src/shared/state/AbacusStore")
local Rng = require("../src/shared/Rng")

local function memStore()
  return { _v = nil, load = function(self) return self._v end, save = function(self, v) self._v = v end }
end
local function newSession(mem)
  return GameSession.new({
    save = GameSave.new(mem), rng = Rng.sequence({ 0 }), store = AbacusStore.new(0, ""),
    clock = { now = function() return 0 end },
  })
end

H.describe("World: landmark promotion keeps every other id stable")
local LEGACY = { "tree", "berry", "tree", "berry", "coin" }
local stable = true
for _, i in { 1, 2, 3, 4, 5, 7, 14, 16, 31, 101, 299 } do
  if World.nodeAt(i).kind ~= LEGACY[(i % 5) + 1] then
    stable = false
  end
end
H.ok(stable, "non-multiples of 15 keep their legacy kind")
H.eq(World.nodeAt(15).kind, "goldtree", "id 15 = goldtree")
H.eq(World.nodeAt(30).kind, "ruin", "id 30 = ruin")
H.eq(World.nodeAt(45).kind, "waystone", "id 45 = waystone")
H.eq(World.nodeAt(60).kind, "goldtree", "id 60 cycles back to goldtree")
H.ok(World.nodeAt(15).landmark == true, "landmark flag set")
H.ok(World.nodeAt(14).landmark == nil, "no flag on plain nodes")
H.ok(World.isLandmark(15) and not World.isLandmark(14), "isLandmark predicate")

H.describe("World: landmark defs are resources-only")
local clean = true
for kind, def in World.LANDMARKS do
  for _, tbl in { def.gains, def.give, def.get, def.cost } do
    for k in tbl or {} do
      if k ~= "food" and k ~= "wood" and k ~= "coin" then
        clean = false
      end
    end
  end
  if not (def.name and def.action and def.emoji) then
    clean = false
  end
end
H.ok(clean, "every landmark def has name/action/emoji and touches only food/wood/coin")

H.describe("goldtree: one-time claim, boundary-gated")
local mem = memStore()
local s = newSession(mem)
s:start()
local events = {}
s:subscribe(function(evt) table.insert(events, evt) end)
s:visitLandmark(15)
H.eq(events[#events].type, "refused", "day 1: id 15 is beyond the boundary")
H.eq(events[#events].reason, "range", "refused with 'range'")
s.village.day = 4 -- radiusForDay(4) = 82 > dist(15) ≈ 80.9
local wood0, day0, sp0 = s.village.res.wood, s.village.day, s.village.sp
s:visitLandmark(15)
H.eq(events[#events].type, "landmark", "claim emits landmark")
H.eq(s.village.res.wood, wood0 + World.LANDMARKS.goldtree.gains.wood, "wood banked")
H.eq(s.village.landmarks.claimed["15"], true, "claim persisted under string key")
H.ok(mem._v ~= nil, "claim saved")
s:visitLandmark(15)
H.eq(events[#events].reason, "claimed", "second visit refused as claimed")
s:visitLandmark(16)
H.eq(events[#events].reason, "unknown", "non-landmark id refused")
H.eq(s.village.day, day0, "no day advanced")
H.eq(s.village.sp, sp0, "no sp minted")

H.describe("ruin: pay once, permanent payout blessing")
local s2 = newSession(memStore())
s2:start()
local ev2 = {}
s2:subscribe(function(evt) table.insert(ev2, evt) end)
s2.village.day = 7 -- covers dist(30) ≈ 95.3
s2:visitLandmark(30)
H.eq(ev2[#ev2].reason, "cost", "poor village refused")
s2.village.res = { food = 30, wood = 30, coin = 30 }
s2:visitLandmark(30)
H.eq(ev2[#ev2].type, "landmark", "restoration emits landmark")
H.eq(s2.village.res.wood, 10, "cost spent (wood 30-20)")
H.eq(s2.village.landmarks.restored["30"], true, "restoration persisted")
H.eq(Economy.ruinBonus(s2.village), 0.02, "one ruin = +2%")
for _, id in { 75, 120, 165, 210, 255 } do -- more ruins (id/15-1 % 3 == 1)
  s2.village.landmarks.restored[tostring(id)] = true
end
H.eq(Economy.ruinBonus(s2.village), 0.1, "bonus caps at +10%")
-- (a single +2% floors away on a small payout — the capped blessing shows)
local tier = Challenges.tierById("tax")
local judge = { faults = 0, elapsedMs = 0 }
H.ok(Challenges.payout(tier, judge, 0.1, 0) > Challenges.payout(tier, judge, 0, 0),
  "a fully blessed village makes the same solve pay more")

H.describe("waystone: repeatable barter")
local s3 = newSession(memStore())
s3:start()
local ev3 = {}
s3:subscribe(function(evt) table.insert(ev3, evt) end)
s3.village.day = 9 -- covers dist(45) ≈ 106.4
s3:visitLandmark(45)
H.eq(ev3[#ev3].reason, "cost", "no wood, no trade")
s3.village.res.wood = 12
s3:visitLandmark(45)
H.eq(ev3[#ev3].type, "landmark", "trade emits landmark")
H.eq(s3.village.res.wood, 7, "gave 5 wood")
H.eq(s3.village.res.coin, 4, "got 4 coin")
s3:visitLandmark(45)
H.eq(s3.village.res.coin, 8, "repeatable (cooldown is view-side only)")

H.describe("GameSave.fix: landmark + ach round-trip, junk dropped")
local aid = Achievements.ACHIEVEMENTS[1].id
local healed = GameSave.fix({
  landmarks = {
    claimed = { ["15"] = true, ["7"] = true, ["15.5"] = true, ["375"] = true, ["30"] = "yes" },
    restored = { ["30"] = true },
  },
  ach = {
    v = 1, seeded = true,
    unlocked = { [aid] = "2026-08-05T00:00:00Z", bogus = "2026-01-01T00:00:00Z" },
    counters = { solves = 7, clean = -3, tiersSolved = { errand = true, [1] = true } },
  },
})
H.eq(healed.landmarks.claimed["15"], true, "real claim survives")
H.eq(healed.landmarks.claimed["7"], nil, "non-landmark id dropped")
H.eq(healed.landmarks.claimed["15.5"], nil, "fractional id dropped")
H.eq(healed.landmarks.claimed["375"], nil, "beyond MAX_RADIUS dropped")
H.eq(healed.landmarks.claimed["30"], nil, "non-true value dropped")
H.eq(healed.landmarks.restored["30"], true, "restoration survives")
H.eq(healed.ach.unlocked[aid], "2026-08-05T00:00:00Z", "known unlock survives")
H.eq(healed.ach.unlocked.bogus, nil, "unknown achievement id dropped")
H.eq(healed.ach.counters.solves, 7, "counter survives")
H.eq(healed.ach.counters.clean, nil, "negative counter dropped (tracker refills defaults)")
H.eq(healed.ach.counters.tiersSolved.errand, true, "set member survives")
H.eq(healed.ach.counters.tiersSolved[1], nil, "non-string set key dropped")
local fresh = GameSave.fix(nil)
H.same(fresh.landmarks, { claimed = {}, restored = {} }, "missing landmarks heal empty")
H.same(fresh.ach, {}, "missing ach heals to fresh {}")

H.report("landmarks.spec")
