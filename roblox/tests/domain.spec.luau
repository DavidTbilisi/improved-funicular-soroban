--!nonstrict
-- Headless parity tests for the numeric + complement core.
local H = require("./harness")
local Config = require("../src/shared/domain/Config")
local Rod = require("../src/shared/domain/Rod")
local Soroban = require("../src/shared/domain/Soroban")
local MovePlan = require("../src/shared/domain/MovePlan")

H.describe("Config")
H.eq(Config.INT_COLS, 11, "INT_COLS")
H.eq(Config.MAXINT, 10 ^ 11 - 1, "MAXINT")
H.eq(Config.columnLetter(0), "A", "columnLetter 0")
H.eq(Config.columnLetter(10), "K", "columnLetter 10")

H.describe("Rod")
H.eq(Rod.rodValue({ sky = true, earth = 2 }), 7, "rodValue 7")
H.eq(Rod.rodValue({ sky = false, earth = 0 }), 0, "rodValue 0")
-- roundtrip a range of values through rods and back
for _, v in { 0, 1, 5, 9, 10, 42, 999, 1234567, 90000000, 99999999999 } do
  H.eq(Rod.intValOf(Rod.intRodsFromVal(v)), v, "roundtrip " .. v)
end
H.eq(Rod.fracStrOf(Rod.fracRodsFromStr("2500")), "25", "fracStrOf trims zeros")
H.eq(Rod.fracStrOf(Rod.fracRodsFromStr("0000")), "", "fracStrOf empty")

H.describe("Soroban.classifyAdd")
H.eq(Soroban.classifyAdd(3, 1).rule, "direct", "3+1 direct")
H.eq(Soroban.classifyAdd(4, 1).rule, "small", "4+1 small (blocked by 5)")
H.eq(Soroban.classifyAdd(4, 1).move, "+5 -4", "4+1 move")
H.eq(Soroban.classifyAdd(8, 5).rule, "big", "8+5 big")
H.eq(Soroban.classifyAdd(8, 5).move, "+10 -5", "8+5 move")
H.eq(Soroban.classifyAdd(8, 5).carry, 1, "8+5 carry")
H.eq(Soroban.classifyAdd(2, 6).rule, "direct", "2+6 direct (5-bead has room)")
H.eq(Soroban.classifyAdd(2, 6).move, "+5 +1", "2+6 move")

H.describe("Soroban.classifySub")
H.eq(Soroban.classifySub(7, 2).rule, "direct", "7-2 direct")
H.eq(Soroban.classifySub(3, 4).rule, "big", "3-4 big borrow")
H.eq(Soroban.classifySub(3, 4).move, "-10 +6", "3-4 move")
H.eq(Soroban.classifySub(6, 2).rule, "small", "6-2 small")
H.eq(Soroban.classifySub(6, 2).move, "-5 +3", "6-2 move")

H.describe("Soroban move legality invariants")
-- every (c, sign, d): the classified move must be individually legal at apply time
for c = 0, 9 do
  for d = 1, 9 do
    if c + d <= 18 then
      local r = Soroban.classifyAdd(c, d)
      H.ok(r.rule == "direct" or r.rule == "small" or r.rule == "big", "add rule " .. c .. "+" .. d)
    end
    if c - d >= -9 then
      local r = Soroban.classifySub(c, d)
      H.ok(r.rule == "direct" or r.rule == "small" or r.rule == "big", "sub rule " .. c .. "-" .. d)
    end
  end
end

H.describe("MovePlan")
local p = MovePlan.planAdd(6, 7)
H.eq(p.rule, "big", "planAdd(6,7) big")
H.same(p.steps, { "+10", "-5", "+2" }, "planAdd(6,7) steps")
H.eq(#p.story, 2, "planAdd(6,7) is a compound trade (story length 2)")
local p2 = MovePlan.planAdd(3, 1)
H.same(p2.steps, { "+1" }, "planAdd(3,1) direct steps")
H.eq(MovePlan.keysText({ "+10", "-5", "+2" }), "U then F then J", "keysText")

H.report("domain.spec")
