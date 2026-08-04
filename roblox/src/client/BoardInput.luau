--!nonstrict
-- ============================================================================
-- BoardInput — applies a PRIMITIVE bead move to the AbacusStore, validated by
-- the complement engine. This is the graded "do it the soroban way" path
-- (mirrors the web board-shell's die-cross keyboard): an illegal primitive is
-- refused and the caller counts it as a fault, exactly as in guided practice.
-- (Direct bead taps go through Commands.ClickEarth/ToggleSky instead, with no
-- fault — the free-exploration path, like typing a value in the web app.)
--
-- Pure of Roblox APIs (only touches the store + Soroban), so it is unit-tested
-- headlessly alongside the domain specs.
-- ============================================================================
local Soroban = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Soroban)
  else require("../shared/domain/Soroban")
local Rod = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Rod)
  else require("../shared/domain/Rod")
local Config = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Config)
  else require("../shared/domain/Config")

local BoardInput = {}

-- Push/pull `n` (1..4) earth beads on rod (kind, idx). sign +1 adds, -1 subs.
-- Returns true if legal (and applied), false if refused (a fault).
function BoardInput.earthMove(store, kind, idx, n, sign)
  local rod = store:rodsOf(kind)[idx]
  if not rod then
    return false
  end
  local c = Rod.rodValue(rod)
  if not Soroban.earthMoveLegal(c, n, sign) then
    return false
  end
  rod.earth += sign * n
  store:notify(store)
  return true
end

-- Set/clear the heaven bead on rod (kind, idx). sign +1 sets (+5), -1 clears.
function BoardInput.heavenMove(store, kind, idx, sign)
  local rod = store:rodsOf(kind)[idx]
  if not rod then
    return false
  end
  local c = Rod.rodValue(rod)
  if not Soroban.heavenMoveLegal(c, sign) then
    return false
  end
  rod.sky = sign > 0
  store:notify(store)
  return true
end

-- A die-cross keypad press: value 1..5 with a sign. 1..4 = earth, 5 = heaven.
function BoardInput.pressDigit(store, kind, idx, value, sign)
  if value >= 1 and value <= 4 then
    return BoardInput.earthMove(store, kind, idx, value, sign)
  elseif value == 5 then
    return BoardInput.heavenMove(store, kind, idx, sign)
  end
  return false
end

-- The rod one place higher than (kind, idx): the carry target. Returns
-- (kind, idx) or nil at the top of the board.
function BoardInput.carryTarget(kind, idx)
  if kind == "int" then
    if idx < Config.INT_COLS then
      return "int", idx + 1
    end
    return nil
  end
  -- frac tenths (idx 1) carries into ones (int idx 1); deeper frac carries up.
  if idx == 1 then
    return "int", 1
  end
  return "frac", idx - 1
end

-- +10 / -10 carry: a single unit on the next-higher rod (an earth move of 1),
-- validated like any primitive.
function BoardInput.carry(store, kind, idx, sign)
  local tkind, tidx = BoardInput.carryTarget(kind, idx)
  if not tkind then
    return false
  end
  return BoardInput.earthMove(store, tkind, tidx, 1, sign)
end

return BoardInput
