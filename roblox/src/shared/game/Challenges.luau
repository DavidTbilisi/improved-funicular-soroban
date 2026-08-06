--!nonstrict
-- ============================================================================
-- Village contracts — the sp faucet. Port of src/game/challenges.js. Each tier
-- is a Strategy with gen(self, rng) -> problem { a,b,op,prompt,sub,startScaled,
-- targetScaled }. The session seeds the board to startScaled and detects a solve
-- by integer compare against targetScaled. Prompts are plain text (the web app's
-- <b> HTML is dropped); numbers are grouped with commas.
-- ============================================================================
local Config = if script
  then require(script.Parent.Parent.domain.Config)
  else require("../domain/Config")
local Soroban = if script
  then require(script.Parent.Parent.domain.Soroban)
  else require("../domain/Soroban")
local MovePlan = if script
  then require(script.Parent.Parent.domain.MovePlan)
  else require("../domain/MovePlan")
local Number = if script
  then require(script.Parent.Parent.domain.Number)
  else require("../domain/Number")

local Challenges = {}

local SCALE = 10 ^ Config.FRAC_COLS
local function scaled(v)
  return math.floor(v * SCALE + 0.5)
end
local function pick(rng, arr)
  return arr[rng:int(#arr) + 1]
end
local fmt = Number.groupThousands

-- Cosmetic scene prefixes per tier — the arithmetic itself stays canonical.
local FLAVORS = {
  errand = { "🏠 Hut errand", "🧺 Basket count", "🐓 Hen count" },
  delivery = { "🌾 Grain delivery", "💧 Water rounds", "🍞 Bread run" },
  ledger = { "📜 Ledger entry", "💰 Till count", "⚖️ Weigh-in" },
  caravan = { "🐫 Caravan load", "🛶 River freight", "📦 Crate tally" },
  magnate = { "🏯 Castle levy", "🚢 Harbor manifest", "🌾 Granary census" },
  guild = { "🏭 Guild order", "🌲 Timber order", "🧵 Cloth order" },
  tax = { "⛩️ Tax season", "🏪 Market share-out", "💰 Split the purse" },
}

local function mk(rng, tierId, a, b, op)
  local target = if op == "+" then a + b else a - b
  local sym = if op == "+" then "+" else "\u{2212}"
  return {
    a = a, b = b, op = op,
    prompt = string.format("%s: %s %s %s", pick(rng, FLAVORS[tierId]), fmt(a), sym, fmt(b)),
    sub = string.format("beads start at %s — reach the answer", fmt(a)),
    startScaled = scaled(a),
    targetScaled = scaled(target),
  }
end

local function mkMul(rng, tierId, a, m)
  return {
    a = a, b = m, op = "×",
    prompt = string.format("%s: %s × %s", pick(rng, FLAVORS[tierId]), fmt(a), fmt(m)),
    sub = string.format("beads start at %s — add %s until you reach %s", fmt(a), fmt(a), fmt(a * m)),
    startScaled = scaled(a),
    targetScaled = scaled(a * m),
  }
end

local function mkDiv(rng, tierId, D, b)
  return {
    a = D, b = b, op = "÷", q = D / b,
    prompt = string.format("%s: %s ÷ %s", pick(rng, FLAVORS[tierId]), fmt(D), fmt(b)),
    sub = string.format("beads start at %s — subtract %s repeatedly down to 0", fmt(D), fmt(b)),
    startScaled = scaled(D),
    targetScaled = 0,
  }
end

Challenges.CHALLENGE_TIERS = {
  {
    id = "errand", title = "Errand", math = "direct add / subtract", baseSp = 5, timeFloorMs = 4000,
    gen = function(self, rng)
      for _ = 1, 80 do
        local add = rng:int(2) == 0
        local a, b = rng:int(10), 1 + rng:int(9)
        if add and a + b <= 9 and Soroban.classifyAdd(a, b).rule == "direct" then
          return mk(rng, self.id, a, b, "+")
        end
        if not add and a - b >= 0 and Soroban.classifySub(a, b).rule == "direct" then
          return mk(rng, self.id, a, b, "-")
        end
      end
      return mk(rng, self.id, 1, 1, "+")
    end,
  },
  {
    id = "delivery", title = "Delivery", math = "small friend (5-bead trade)", baseSp = 8, timeFloorMs = 5000,
    gen = function(self, rng)
      for _ = 1, 80 do
        local add = rng:int(2) == 0
        local a, b = rng:int(10), 1 + rng:int(4)
        if add and a + b <= 9 and Soroban.classifyAdd(a, b).rule == "small" then
          return mk(rng, self.id, a, b, "+")
        end
        if not add and a - b >= 0 and Soroban.classifySub(a, b).rule == "small" then
          return mk(rng, self.id, a, b, "-")
        end
      end
      return mk(rng, self.id, 4, 3, "+")
    end,
  },
  {
    id = "ledger", title = "Ledger", math = "big friend (carry / borrow)", baseSp = 12, timeFloorMs = 6000,
    gen = function(self, rng)
      for _ = 1, 80 do
        local add = rng:int(2) == 0
        if add then
          local a, b = rng:int(10), 1 + rng:int(9)
          if a + b >= 10 and a + b <= 18 and Soroban.classifyAdd(a, b).rule == "big" then
            return mk(rng, self.id, a, b, "+")
          end
        else
          local A, b = 10 + rng:int(9), 1 + rng:int(9)
          if A - b >= 0 and Soroban.classifySub(A % 10, b).rule == "big" then
            return mk(rng, self.id, A, b, "-")
          end
        end
      end
      return mk(rng, self.id, 8, 5, "+")
    end,
  },
  {
    id = "caravan", title = "Caravan", math = "compound trade / two-digit carry", baseSp = 22, timeFloorMs = 9000,
    gen = function(self, rng)
      for _ = 1, 200 do
        local kind = rng:int(2)
        if kind == 0 then
          local add = rng:int(2) == 0
          if add then
            local a, b = 5 + rng:int(4), 6 + rng:int(4)
            if a + b >= 10 and #MovePlan.planAdd(a, b).story > 1 then
              return mk(rng, self.id, a, b, "+")
            end
          else
            local A, b = 10 + rng:int(5), 6 + rng:int(4)
            if A - b >= 0 and A % 10 < b and #MovePlan.planSub(A % 10, b).story > 1 then
              return mk(rng, self.id, A, b, "-")
            end
          end
        else
          local add = rng:int(2) == 0
          local a, b = 10 + rng:int(90), 10 + rng:int(90)
          if add then
            if (a % 10) + (b % 10) >= 10 then
              return mk(rng, self.id, a, b, "+")
            end
          else
            local hi, lo = math.max(a, b), math.min(a, b)
            if (hi % 10) < (lo % 10) then
              return mk(rng, self.id, hi, lo, "-")
            end
          end
        end
      end
      return mk(rng, self.id, 6, 7, "+")
    end,
  },
  {
    id = "magnate", title = "Magnate", math = "add / subtract in the millions", baseSp = 28, timeFloorMs = 11000,
    gen = function(self, rng)
      local M = 10 ^ (5 + rng:int(3))
      for _ = 1, 200 do
        local add = rng:int(2) == 0
        if rng:int(2) == 0 then
          local a, b = rng:int(10), 1 + rng:int(9)
          if add and Soroban.classifyAdd(a, b).rule ~= "direct" then
            return mk(rng, self.id, a * M, b * M, "+")
          end
          if not add and a >= b and Soroban.classifySub(a, b).rule ~= "direct" then
            return mk(rng, self.id, a * M, b * M, "-")
          end
        else
          local a, b = 10 + rng:int(90), 10 + rng:int(90)
          if add then
            if (a % 10) + (b % 10) >= 10 then
              return mk(rng, self.id, a * M, b * M, "+")
            end
          else
            local hi, lo = math.max(a, b), math.min(a, b)
            if (hi % 10) < (lo % 10) then
              return mk(rng, self.id, hi * M, lo * M, "-")
            end
          end
        end
      end
      return mk(rng, self.id, 7 * M, 8 * M, "+")
    end,
  },
  {
    id = "guild", title = "Guild order", math = "multiply by repeated addition", baseSp = 38, timeFloorMs = 14000,
    gen = function(self, rng)
      local a = 12 + rng:int(38) -- 12..49
      local m = 2 + rng:int(2) -- x2..x3
      return mkMul(rng, self.id, a, m)
    end,
  },
  {
    id = "tax", title = "Tax season", math = "divide by repeated subtraction", baseSp = 50, timeFloorMs = 16000,
    gen = function(self, rng)
      local b = 2 + rng:int(8) -- divisor 2..9
      local q = 3 + rng:int(5) -- quotient 3..7
      return mkDiv(rng, self.id, b * q, b)
    end,
  },
}

function Challenges.tierById(id: string)
  for _, t in Challenges.CHALLENGE_TIERS do
    if t.id == id then
      return t
    end
  end
  return nil
end

-- The payout breakdown for a solve. `streak` is the clean streak BEFORE this
-- solve, so the first solve of a run carries no bonus yet.
function Challenges.payoutParts(tier, judge, streak)
  streak = streak or 0
  local base = tier.baseSp
  return {
    base = base,
    cleanBonus = if judge.faults == 0 then math.ceil(base / 2) else 0,
    fastBonus = if judge.elapsedMs <= tier.timeFloorMs then math.ceil(base / 4) else 0,
    streakBonus = math.min(streak, 10) * math.ceil(base / 20),
  }
end

-- Total sp for a solve; `bonus` is the shrine blessing (0 … 0.3).
function Challenges.payout(tier, judge, bonus, streak)
  bonus = bonus or 0
  streak = streak or 0
  local p = Challenges.payoutParts(tier, judge, streak)
  return math.floor((p.base + p.cleanBonus + p.fastBonus + p.streakBonus) * (1 + bonus))
end

return Challenges
