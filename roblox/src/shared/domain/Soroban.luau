--!nonstrict
-- ============================================================================
-- Soroban complement rules — the pure decision engine behind bead arithmetic.
-- Port of src/domain/soroban.js (no BigInt, ports verbatim).
--
-- Given the digit on a rod (c = 0..9) and a digit to add/subtract (d = 1..9):
--   direct       — enough free beads, move them straight
--   small friend — blocked by the 5-bead:  +d = +5 -(5-d)   / -d = -5 +(5-d)
--   big friend   — crosses 10, carry/borrow: +d = +10 -(10-d) / -d = -10 +(10-d)
-- ============================================================================
local Soroban = {}

-- Earth move: push/pull n (1..4) earth beads. sign > 0 adds, < 0 subtracts.
function Soroban.earthMoveLegal(c: number, n: number, sign: number): boolean
  local lower = c % 5
  if sign > 0 then
    return lower + n <= 4
  else
    return lower >= n
  end
end

-- Heaven move: set (+5) or clear (-5) the single heaven bead.
function Soroban.heavenMoveLegal(c: number, sign: number): boolean
  if sign > 0 then
    return c < 5
  else
    return c >= 5
  end
end

-- Add digit d (1..9) onto current rod digit c (0..9).
function Soroban.classifyAdd(c: number, d: number)
  local lowerFree = 4 - (c % 5)
  if d <= 4 then
    if lowerFree >= d then
      return { rule = "direct", move = "+" .. d, carry = 0 }
    end
    if c + d <= 9 then
      return { rule = "small", move = "+5 -" .. (5 - d), carry = 0 }
    end
    return { rule = "big", move = "+10 -" .. (10 - d), carry = 1 }
  end
  -- d = 5..9: place the 5-bead plus (d-5) lower beads, if there is room.
  if c <= 4 and (c % 5) + (d - 5) <= 4 then
    local move = if d == 5 then "+5" else "+5 +" .. (d - 5)
    return { rule = "direct", move = move, carry = 0 }
  end
  return { rule = "big", move = "+10 -" .. (10 - d), carry = 1 }
end

-- Subtract digit d (1..9) from current rod digit c (0..9).
function Soroban.classifySub(c: number, d: number)
  local lowerActive = c % 5
  if d <= 4 then
    if lowerActive >= d then
      return { rule = "direct", move = "-" .. d, borrow = 0 }
    end
    if c - d >= 0 then
      return { rule = "small", move = "-5 +" .. (5 - d), borrow = 0 }
    end
    return { rule = "big", move = "-10 +" .. (10 - d), borrow = 1 }
  end
  -- d = 5..9: remove the 5-bead plus (d-5) lower beads, if they are there.
  if c >= 5 and lowerActive >= (d - 5) then
    local move = if d == 5 then "-5" else "-5 -" .. (d - 5)
    return { rule = "direct", move = move, borrow = 0 }
  end
  return { rule = "big", move = "-10 +" .. (10 - d), borrow = 1 }
end

return Soroban
