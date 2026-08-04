--!nonstrict
-- ============================================================================
-- Village buildings — frozen data tables. Port of src/game/buildings.js.
-- Each building: { id, emoji, name, tier, cost, yield, unlock, desc }.
-- The well's farm aura and the shrine's payout bonus are BEHAVIORS and live in
-- Economy.luau; this table carries data only. Levels are endless.
-- ============================================================================
local Buildings = {}

Buildings.GRID_COLS = 9
Buildings.GRID_ROWS = 6
Buildings.GRID_CELLS = Buildings.GRID_COLS * Buildings.GRID_ROWS -- cellIdx = row*COLS + col
Buildings.FOUNDING_LEVEL = 3

-- Resource glyphs — shared frozen data.
Buildings.RES_EMOJI = table.freeze({ sp = "🧮", food = "🌾", wood = "🪵", coin = "🪙" })

Buildings.BUILDINGS = table.freeze({
  table.freeze({
    id = "hut", emoji = "🛖", name = "Hut", tier = 1,
    cost = table.freeze({ sp = 10 }), yield = table.freeze({ coin = 1 }),
    unlock = table.freeze({}), desc = "Villagers pay a coin of rent each day.",
  }),
  table.freeze({
    id = "farm", emoji = "🌾", name = "Farm", tier = 1,
    cost = table.freeze({ sp = 15 }), yield = table.freeze({ food = 2 }),
    unlock = table.freeze({}), desc = "Grows food every day.",
  }),
  table.freeze({
    id = "well", emoji = "💧", name = "Well", tier = 1,
    cost = table.freeze({ sp = 20 }), yield = table.freeze({ food = 1 }),
    unlock = table.freeze({ building = "farm" }),
    desc = "A little food itself — and while a well stands, every farm grows +1 food a day.",
  }),
  table.freeze({
    id = "woodcutter", emoji = "🪓", name = "Woodcutter", tier = 2,
    cost = table.freeze({ sp = 25, food = 5 }), yield = table.freeze({ wood = 2 }),
    unlock = table.freeze({ building = "farm" }), desc = "Fells timber for bigger works.",
  }),
  table.freeze({
    id = "workshop", emoji = "🏭", name = "Workshop", tier = 3,
    cost = table.freeze({ sp = 40, wood = 10 }), yield = table.freeze({ coin = 3 }),
    unlock = table.freeze({ building = "woodcutter" }), desc = "Turns timber into steady coin.",
  }),
  table.freeze({
    id = "market", emoji = "🏪", name = "Market", tier = 4,
    cost = table.freeze({ sp = 60, wood = 15, food = 10 }), yield = table.freeze({ coin = 2, sp = 1 }),
    unlock = table.freeze({ building = "workshop" }),
    desc = "Trade brings coin — and even a trickle of soroban points.",
  }),
  table.freeze({
    id = "shrine", emoji = "⛩️", name = "Shrine", tier = 5,
    cost = table.freeze({ sp = 100, coin = 20 }), yield = table.freeze({}),
    unlock = table.freeze({ building = "market" }),
    desc = "Each shrine level blesses contracts: +10% sp payout (village cap +30%). Level 3 founds the village — and levels never stop.",
  }),
})

function Buildings.buildingById(id: string)
  for _, b in Buildings.BUILDINGS do
    if b.id == id then
      return b
    end
  end
  return nil
end

return table.freeze(Buildings)
