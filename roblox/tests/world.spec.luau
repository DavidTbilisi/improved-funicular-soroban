--!nonstrict
local H = require("./harness")
local World = require("../src/shared/game/World")
local Economy = require("../src/shared/game/Economy")
local GameSave = require("../src/shared/game/GameSave")
local GameSession = require("../src/shared/game/GameSession")
local AbacusStore = require("../src/shared/state/AbacusStore")
local Rng = require("../src/shared/Rng")

local function memStore()
  return { _v = nil, load = function(self) return self._v end, save = function(self, v) self._v = v end }
end

H.describe("World: radiusForDay")
H.eq(World.radiusForDay(1), World.START_RADIUS, "day 1 is the start radius")
H.eq(World.radiusForDay(2), World.START_RADIUS + World.GROWTH_PER_DAY, "one day, one step")
H.ok(World.radiusForDay(5) > World.radiusForDay(4), "monotone growth")
H.eq(World.radiusForDay(9999), World.MAX_RADIUS, "capped at MAX_RADIUS")
H.eq(World.radiusForDay(0), World.START_RADIUS, "day 0 clamps to day 1")
H.eq(World.radiusForDay(2.7), World.radiusForDay(2), "fractional day floors")

H.describe("World: node layout is deterministic and in bounds")
local a = World.nodesUpTo(3)
local b = World.nodesUpTo(3)
H.eq(#a, #b, "same count on every call")
H.ok(#a > 0, "day 3 has nodes")
H.same(a[1], b[1], "same first node on every call")
local r3 = World.radiusForDay(3)
local allIn, allKinds = true, true
for _, n in a do
  if n.dist > r3 then
    allIn = false
  end
  if not World.GATHER[n.kind] then
    allKinds = false
  end
end
H.ok(allIn, "every node inside the day's boundary")
H.ok(allKinds, "every node kind has a GATHER entry")
H.ok(#World.nodesUpTo(10) > #World.nodesUpTo(1), "the world fills in as days pass")
H.ok(a[1].dist >= World.MIN_NODE_R, "nodes keep clear of the village")

H.describe("World: GATHER yields resources only, never sp")
local spFree = true
for _, def in World.GATHER do
  H.ok(def.respawnS > 0, def.name .. " has a respawn")
  for k in def.gains do
    if k ~= "food" and k ~= "wood" and k ~= "coin" then
      spFree = false
    end
  end
end
H.ok(spFree, "gains are food/wood/coin only")

H.describe("GameSession: gather banks resources, saves, and emits")
local store = AbacusStore.new(0, "")
local mem = memStore()
local session = GameSession.new({
  save = GameSave.new(mem), rng = Rng.sequence({ 0 }), store = store,
  clock = { now = function() return 0 end },
})
local events = {}
session:subscribe(function(evt)
  table.insert(events, evt)
end)
local wood0 = session.village.res.wood
session:gather("tree")
H.eq(session.village.res.wood, wood0 + World.GATHER.tree.gains.wood, "tree adds wood")
H.eq(events[#events].type, "gathered", "gathered event emitted")
H.eq(events[#events].kind, "tree", "event carries the kind")
H.ok(mem._v ~= nil, "gather persists the village")
local day0 = session.village.day
local sp0 = session.village.sp
session:gather("berry")
session:gather("coin")
H.eq(session.village.day, day0, "gathering never advances the day")
H.eq(session.village.sp, sp0, "gathering never mints sp")
session:gather("dragon")
H.eq(events[#events].type, "refused", "unknown kind refused")
H.eq(events[#events].reason, "unknown", "with reason 'unknown'")

H.report("world.spec")
