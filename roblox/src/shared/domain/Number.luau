--!nonstrict
-- ============================================================================
-- Number parsing / display over rods. Port of src/domain/number.js (the
-- mnemonic `decodeChips` helper is codec-only and omitted). `toLocaleString`
-- becomes a small thousands-grouping helper.
-- ============================================================================
local Config = if script then require(script.Parent.Config) else require("./Config")
local Rod = if script then require(script.Parent.Rod) else require("./Rod")

local Number = {}

-- Group an integer with commas: 1234567 -> "1,234,567". Non-negative.
function Number.groupThousands(n: number): string
  local s = string.format("%.0f", n)
  local sign = ""
  if string.sub(s, 1, 1) == "-" then
    sign = "-"
    s = string.sub(s, 2)
  end
  local out = s
  while true do
    local replaced
    out, replaced = string.gsub(out, "^(%d+)(%d%d%d)", "%1,%2")
    if replaced == 0 then
      break
    end
  end
  return sign .. out
end

-- Parse a decimal-ish string -> clamped { intVal: number, fracStr: string }.
function Number.parseDecimal(str: string)
  local cleaned = string.gsub(tostring(str), "[^0-9.]", "")
  local dot = string.find(cleaned, ".", 1, true)
  local ipart, fpart
  if dot then
    ipart = string.sub(cleaned, 1, dot - 1)
    fpart = string.gsub(string.sub(cleaned, dot + 1), "%.", "")
  else
    ipart = cleaned
    fpart = ""
  end
  ipart = string.gsub(ipart, "[^0-9]", "")
  local parsed = tonumber(ipart) or 0
  local intVal = if parsed > Config.MAXINT then Config.MAXINT else parsed
  local fracStr = string.sub(string.gsub(fpart, "[^0-9]", ""), 1, Config.FRAC_COLS)
  return { intVal = intVal, fracStr = fracStr }
end

function Number.displayString(intRods, fracRods): string
  local iv = Rod.intValOf(intRods)
  local fs = Rod.fracStrOf(fracRods)
  local head = Number.groupThousands(iv)
  if fs ~= "" then
    return head .. "." .. fs
  end
  return head
end

return Number
