--!nonstrict
-- ============================================================================
-- Rod arithmetic — the pure numeric core of the abacus. No float error: works
-- in digit places / integer scaling. Port of src/domain/rod.js.
--
-- A rod is a plain table: { sky: boolean, earth: 0..4 }.  value = (sky?5:0)+earth
-- Unlike the JS version (0-indexed arrays), Lua arrays are 1-indexed here, so
-- intRods[1] = ones, fracRods[1] = tenths (low place first in both).
-- ============================================================================
local Config = if script then require(script.Parent.Config) else require("./Config")

local Rod = {}

function Rod.rodValue(rod): number
  return (rod.sky and 5 or 0) + rod.earth
end

function Rod.digitToRod(d: number)
  return { sky = d >= 5, earth = d % 5 }
end

-- iv: a non-negative integer (plain Luau number, exact under MAXINT).
function Rod.intRodsFromVal(iv: number)
  local r = {}
  for i = 0, Config.INT_COLS - 1 do
    local digit = math.floor(iv / 10 ^ i) % 10
    r[i + 1] = Rod.digitToRod(digit)
  end
  return r
end

-- fs: a string of fraction digits, tenths-first.
function Rod.fracRodsFromStr(fs: string)
  local r = {}
  for j = 0, Config.FRAC_COLS - 1 do
    local d = 0
    if j < #fs then
      d = tonumber(string.sub(fs, j + 1, j + 1)) or 0
    end
    r[j + 1] = Rod.digitToRod(d)
  end
  return r
end

function Rod.intValOf(intRods): number
  local s = 0
  for i = 0, #intRods - 1 do
    s = s + Rod.rodValue(intRods[i + 1]) * 10 ^ i
  end
  return s
end

-- Fraction digits, tenths-first, with trailing zeros trimmed.
function Rod.fracStrOf(fracRods): string
  local parts = {}
  for j = 1, #fracRods do
    parts[j] = tostring(Rod.rodValue(fracRods[j]))
  end
  local s = table.concat(parts)
  return (string.gsub(s, "0+$", ""))
end

return Rod
