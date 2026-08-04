--!nonstrict
local H = require("./harness")
local Economy = require("../src/shared/game/Economy")
local Buildings = require("../src/shared/game/Buildings")
local Challenges = require("../src/shared/game/Challenges")
local Rank = require("../src/shared/game/Rank")
local Goals = require("../src/shared/game/Goals")
local Advisor = require("../src/shared/game/Advisor")
local GameSave = require("../src/shared/game/GameSave")
local GameSession = require("../src/shared/game/GameSession")
local AchievementTracker = require("../src/shared/game/AchievementTracker")
local AbacusStore = require("../src/shared/state/AbacusStore")
local Rng = require("../src/shared/Rng")

-- A minimal in-memory ProgressStore port (load/save).
local function memStore()
  return { _v = nil, load = function(self) return self._v end, save = function(self, v) self._v = v end }
end

H.describe("Economy: newVillage + yields")
local v = Economy.newVillage()
H.eq(v.sp, 20, "starting sp")
H.eq(#v.grid, Buildings.GRID_CELLS, "grid length 54")
H.eq(v.grid[1], false, "empty plot is false")
-- place a farm on plot 1, a well on plot 2 -> well aura gives +1 food per farm
v.sp = 100
Economy.place(v, Buildings.buildingById("farm"), 1)
Economy.place(v, Buildings.buildingById("well"), 2)
local y = Economy.dailyYield(v)
H.eq(y.food, 2 + 1 + 1, "farm(2) + well(1) + aura(+1 per farm)")

H.describe("Economy: upgradeCost ladder")
local hutDef = Buildings.buildingById("hut")
H.same(Economy.upgradeCost(hutDef, 1), { food = 5, wood = 5 }, "hut L1->2 cost")
H.eq(Economy.upgradeCost(hutDef, 2).coin, 5, "L2->3 adds coin")

H.describe("Challenges: payout formula")
local tier = Challenges.tierById("errand")
-- clean + fast, streak 0: base 5 + cleanBonus ceil(5/2)=3 + fastBonus ceil(5/4)=2 = 10
H.eq(Challenges.payout(tier, { faults = 0, elapsedMs = 0 }, 0, 0), 10, "errand clean+fast payout")
-- fumbled (faults>0), slow: base only = 5
H.eq(Challenges.payout(tier, { faults = 1, elapsedMs = 999999 }, 0, 0), 5, "errand fumbled+slow payout")
-- shrine bonus 0.3 applied
H.eq(Challenges.payout(tier, { faults = 0, elapsedMs = 0 }, 0.3, 0), math.floor(10 * 1.3), "with shrine bonus")

H.describe("Challenges: gen is deterministic & valid")
local seqTier = Challenges.tierById("errand")
local p = seqTier:gen(Rng.sequence({ 0, 3, 2 })) -- add path
H.ok(p.startScaled ~= p.targetScaled, "problem is not a no-op")
H.ok(p.prompt ~= nil and #p.prompt > 0, "prompt built")

H.describe("Rank")
H.eq(Rank.villageRank(Economy.newVillage()).n, 0, "fresh village rank 0")
local rv = Economy.newVillage()
rv.stats.spEarned = 500 -- 10 points -> largest n with n(n+2)<=10 is n=2 (2*4=8)
H.eq(Rank.villageRank(rv).n, 2, "rank from 500 sp")
H.eq(Rank.rankTitle(0), "Camp", "rank title 0")
H.eq(Rank.rankTitle(2), "Village", "rank title 2")

H.describe("GameSession: earn flow (clean solve pays out & advances a day)")
local store = AbacusStore.new(0, "")
local save = GameSave.new(memStore())
local session = GameSession.new({
  save = save, rng = Rng.sequence({ 0, 3, 2, 0, 3, 2 }), store = store,
  clock = { now = function() return 0 end },
})
local solved = nil
session:subscribe(function(evt) if evt.type == "solved" then solved = evt end end)
session:startChallenge("errand")
H.ok(session:isActive(), "contract active")
local target = session.challenge.problem.targetScaled
store:setScaled(target) -- simulate reaching the answer on the beads
H.ok(solved ~= nil, "solved event fired")
H.ok(solved.clean, "clean solve (no faults, fast)")
H.ok(solved.payout >= 10, "paid at least base+bonuses")
H.eq(session.village.stats.solves, 1, "one solve recorded")
H.eq(session.village.day, 2, "village advanced one day")
H.ok(not session:isActive(), "contract cleared after solve")

H.describe("GameSession: fault spoils the clean bonus")
local store2 = AbacusStore.new(0, "")
local session2 = GameSession.new({
  save = GameSave.new(memStore()), rng = Rng.sequence({ 0, 3, 2 }), store = store2,
  clock = { now = function() return 0 end },
})
local solved2 = nil
session2:subscribe(function(evt) if evt.type == "solved" then solved2 = evt end end)
session2:startChallenge("errand")
session2:fault()
store2:setScaled(session2.challenge.problem.targetScaled)
H.ok(not solved2.clean, "solve with a fault is not clean")
H.eq(solved2.verdict, "fumbled", "verdict fumbled")

H.describe("GameSession: upgrade flow raises a building level")
local store3 = AbacusStore.new(0, "")
local sess3 = GameSession.new({
  save = GameSave.new(memStore()), rng = Rng.sequence({ 0, 3, 2, 0, 3, 2 }), store = store3,
  clock = { now = function() return 0 end },
})
sess3.village.sp = 200
sess3.village.res.food = 100
sess3.village.res.wood = 100
Economy.place(sess3.village, Buildings.buildingById("hut"), 5)
sess3:startUpgrade(5)
H.ok(session:isActive() == false and sess3:isActive(), "upgrade contract active")
store3:setScaled(sess3.challenge and sess3.challenge.problem.targetScaled or -1)
H.eq(sess3.village.grid[5].level, 2, "hut raised to level 2")

H.describe("AchievementTracker: first-solve unlocks")
local store4 = AbacusStore.new(0, "")
local sess4 = GameSession.new({
  save = GameSave.new(memStore()), rng = Rng.sequence({ 0, 3, 2 }), store = store4,
  clock = { now = function() return 0 end },
})
local tracker = AchievementTracker.new(memStore(), { now = function() return "T" end })
tracker:seed(sess4.village)
tracker:observe(sess4)
local unlocked = {}
tracker:subscribe(function(evt) if evt.type == "unlocked" then table.insert(unlocked, evt.achievement.id) end end)
sess4:startChallenge("errand")
store4:setScaled(sess4.challenge.problem.targetScaled)
local sawFirstSolve = false
for _, id in unlocked do if id == "first-solve" then sawFirstSolve = true end end
H.ok(sawFirstSolve, "first-solve achievement unlocked on first solve")

H.describe("Advisor + Goals")
H.eq(Goals.nextGoal(Economy.newVillage()).id, "hut", "first goal is hut")
H.eq(Advisor.nextHint(Economy.newVillage()).id, "first-contract", "advisor hint on fresh village")

H.report("game.spec")
