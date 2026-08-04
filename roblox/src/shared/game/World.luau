--!nonstrict
-- ============================================================================
-- World — the walkable overworld as pure data + math. New to the Roblox port
-- (the web game is a diorama; this port is a place you stand in).
--
-- Two ideas, both deliberately pure so they test headlessly:
--
--   * The map GROWS WITH THE VILLAGE DAY. One day passes per solved contract
--     (Economy.advanceDay), so radiusForDay ties exploration to the soroban:
--     solving is literally what pushes the boundary out. Nothing is stored —
--     the world is a function of `village.day`, so a healed or imported save
--     always gets the right map.
--
--   * GATHER NODES (chop a tree, pick berries, lift a coin cache) are laid out
--     on a deterministic golden-angle spiral: node i sits at a radius that
--     grows with sqrt(i), so density stays even and `nodesUpTo(day)` is the
--     same list on every device and every session with no seed to persist.
--
-- Balance: gathering yields RESOURCES only, never sp. sp — the build/rank
-- currency — comes only from solving contracts, so the soroban stays the most
-- beneficial thing you can do; gathering is the scenic route to a festival.
-- ============================================================================

local World = {}

-- --- map growth -------------------------------------------------------------
World.START_RADIUS = 64 -- studs of world on day 1
World.GROWTH_PER_DAY = 6 -- each solved contract pushes the boundary this far
World.MAX_RADIUS = 220 -- the world stops growing here

function World.radiusForDay(day: number): number
  local d = math.max(1, math.floor(day))
  return math.min(World.MAX_RADIUS, World.START_RADIUS + World.GROWTH_PER_DAY * (d - 1))
end

-- --- gather nodes -----------------------------------------------------------
-- What each node kind hands over when harvested, and how long it needs to
-- come back. `gains` keys are village resource names (never sp — see header).
World.GATHER = table.freeze({
  tree = table.freeze({
    name = "Tree", action = "Chop", emoji = "🌲",
    gains = table.freeze({ wood = 2 }), respawnS = 45,
  }),
  berry = table.freeze({
    name = "Berry bush", action = "Pick", emoji = "🫐",
    gains = table.freeze({ food = 2 }), respawnS = 40,
  }),
  coin = table.freeze({
    name = "Coin cache", action = "Collect", emoji = "🪙",
    gains = table.freeze({ coin = 2 }), respawnS = 90,
  }),
})

-- Node i's distance from the origin grows with sqrt(i) (even density) and its
-- angle steps by the golden angle (no spokes). MIN_NODE_R keeps every node
-- clear of the village grid, the counting table and the spawn pad.
World.MIN_NODE_R = 46
World.NODE_SPACING = 9
local GOLDEN = 2.39996322972865332
-- Two trees : two bushes : one cache, repeating.
local KIND_CYCLE = table.freeze({ "tree", "berry", "tree", "berry", "coin" })

function World.nodeAt(i: number)
  local dist = World.MIN_NODE_R + World.NODE_SPACING * math.sqrt(i)
  local angle = i * GOLDEN
  return {
    id = i,
    kind = KIND_CYCLE[(i % #KIND_CYCLE) + 1],
    x = math.cos(angle) * dist,
    z = math.sin(angle) * dist,
    dist = dist,
  }
end

-- Every node inside the day's boundary, in id order. Deterministic: calling
-- twice (or on two devices) yields the same layout.
function World.nodesUpTo(day: number)
  local radius = World.radiusForDay(day)
  local nodes = {}
  local i = 1
  while true do
    local n = World.nodeAt(i)
    if n.dist > radius then
      break
    end
    table.insert(nodes, n)
    i += 1
  end
  return nodes
end

return table.freeze(World)
