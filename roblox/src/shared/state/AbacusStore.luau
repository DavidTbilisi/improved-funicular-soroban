--!nonstrict
-- ============================================================================
-- AbacusStore — the single source of truth for bead positions. Observable
-- Subject: any mutation notifies subscribed views. Port of
-- src/state/abacusStore.js, with the BigInt scaled value replaced by a plain
-- Luau number (exact under MAX_SCALED ~1e15 with the reduced 11-rod board).
-- ============================================================================
local Observable = if script then require(script.Parent.Observable) else require("./Observable")
local Rod = if script
  then require(script.Parent.Parent.domain.Rod)
  else require("../domain/Rod")
local Config = if script
  then require(script.Parent.Parent.domain.Config)
  else require("../domain/Config")

local FRAC_SCALE = 10 ^ Config.FRAC_COLS
local MAX_SCALED = Config.MAXINT * FRAC_SCALE + (FRAC_SCALE - 1)

local function clamp(v, lo, hi)
  if v < lo then
    return lo
  elseif v > hi then
    return hi
  end
  return v
end

-- Left-pad a non-negative integer to `width` digits.
local function padZeros(n: number, width: number): string
  local s = string.format("%.0f", n)
  while #s < width do
    s = "0" .. s
  end
  return s
end

local AbacusStore = setmetatable({}, { __index = Observable })
AbacusStore.__index = AbacusStore

function AbacusStore.new(intVal: number?, fracStr: string?)
  local self = setmetatable(Observable.new(), AbacusStore)
  self._int = Rod.intRodsFromVal(intVal or 0)
  self._frac = Rod.fracRodsFromStr(fracStr or "")
  return self
end

function AbacusStore:getInt()
  return self._int
end
function AbacusStore:getFrac()
  return self._frac
end

-- Cloneable snapshot for Memento-style undo.
function AbacusStore:snapshot()
  local function copy(rods)
    local out = {}
    for i, r in rods do
      out[i] = { sky = r.sky, earth = r.earth }
    end
    return out
  end
  return { int = copy(self._int), frac = copy(self._frac) }
end

function AbacusStore:restore(snap)
  local function copy(rods)
    local out = {}
    for i, r in rods do
      out[i] = { sky = r.sky, earth = r.earth }
    end
    return out
  end
  self._int = copy(snap.int)
  self._frac = copy(snap.frac)
  self:notify(self)
end

function AbacusStore:setInt(rods)
  self._int = rods
  self:notify(self)
end
function AbacusStore:setFrac(rods)
  self._frac = rods
  self:notify(self)
end

function AbacusStore:setFromParts(intVal: number, fracStr: string)
  self._int = Rod.intRodsFromVal(intVal)
  self._frac = Rod.fracRodsFromStr(fracStr)
  self:notify(self)
end

function AbacusStore:setIntValue(iv: number)
  local n = clamp(iv, 0, Config.MAXINT)
  self._int = Rod.intRodsFromVal(n)
  self:notify(self)
end

function AbacusStore:intValue(): number
  return Rod.intValOf(self._int)
end

-- The whole number (integer + fraction) as one integer, value * 10^FRAC_COLS.
function AbacusStore:scaledValue(): number
  local fracInt = 0
  for j = 1, #self._frac do
    fracInt = fracInt + Rod.rodValue(self._frac[j]) * 10 ^ (Config.FRAC_COLS - j)
  end
  return self:intValue() * FRAC_SCALE + fracInt
end

function AbacusStore:setScaled(v: number)
  v = clamp(math.floor(v + 0.5), 0, MAX_SCALED)
  local intPart = math.floor(v / FRAC_SCALE)
  local fracPart = v % FRAC_SCALE
  self._int = Rod.intRodsFromVal(intPart)
  self._frac = Rod.fracRodsFromStr(padZeros(fracPart, Config.FRAC_COLS))
  self:notify(self)
end

function AbacusStore:rodsOf(kind: string)
  if kind == "int" then
    return self._int
  end
  return self._frac
end

return AbacusStore
