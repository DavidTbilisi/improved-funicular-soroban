--!nonstrict
local H = require("./harness")
local AbacusStore = require("../src/shared/state/AbacusStore")
local BoardInput = require("../src/client/BoardInput")
local Rod = require("../src/shared/domain/Rod")

local function digitAt(store, kind, idx)
  return Rod.rodValue(store:rodsOf(kind)[idx])
end

H.describe("BoardInput earth moves + legality")
local s = AbacusStore.new(0, "")
-- ones rod is int idx 1
H.ok(BoardInput.earthMove(s, "int", 1, 3, 1), "+3 earth legal from 0")
H.eq(digitAt(s, "int", 1), 3, "rod now shows 3")
H.ok(not BoardInput.earthMove(s, "int", 1, 3, 1), "+3 more is illegal (only 1 free earth) -> fault")
H.eq(digitAt(s, "int", 1), 3, "rod unchanged after refused move")
H.ok(BoardInput.earthMove(s, "int", 1, 1, 1), "+1 earth legal -> 4")
H.eq(digitAt(s, "int", 1), 4, "rod now 4")

H.describe("BoardInput heaven moves")
H.ok(BoardInput.heavenMove(s, "int", 1, 1), "+5 heaven legal from 4 -> 9")
H.eq(digitAt(s, "int", 1), 9, "rod now 9")
H.ok(not BoardInput.heavenMove(s, "int", 1, 1), "+5 again illegal (heaven already down)")
H.ok(BoardInput.heavenMove(s, "int", 1, -1), "-5 heaven legal from 9 -> 4")
H.eq(digitAt(s, "int", 1), 4, "rod now 4")

H.describe("BoardInput carry crosses to the next rod")
local s2 = AbacusStore.new(0, "")
-- put 9 on ones, then carry +10 to tens
BoardInput.earthMove(s2, "int", 1, 4, 1)
BoardInput.heavenMove(s2, "int", 1, 1) -- ones = 9
H.ok(BoardInput.carry(s2, "int", 1, 1), "carry +10 lands a unit on the tens rod")
H.eq(digitAt(s2, "int", 2), 1, "tens rod now 1")
H.eq(s2:intValue(), 19, "board reads 19")

H.describe("BoardInput carry target mapping")
local k, i = BoardInput.carryTarget("frac", 1)
H.eq(k, "int", "tenths carries into ones (kind)")
H.eq(i, 1, "tenths carries into ones (idx)")
H.eq(BoardInput.carryTarget("int", 11), nil, "top rod has no carry target")

H.report("input.spec")
