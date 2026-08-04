--!nonstrict
local H = require("./harness")
local AbacusStore = require("../src/shared/state/AbacusStore")
local Commands = require("../src/shared/state/Commands")

H.describe("AbacusStore scaled value")
local s = AbacusStore.new(0, "")
H.eq(s:scaledValue(), 0, "empty board is 0")
s:setScaled(1234 * 10 ^ 4) -- 1234.0000
H.eq(s:intValue(), 1234, "setScaled intValue")
H.eq(s:scaledValue(), 1234 * 10 ^ 4, "setScaled roundtrip")

s:setIntValue(90000000)
H.eq(s:intValue(), 90000000, "million-scale intValue exact")
H.eq(s:scaledValue(), 90000000 * 10 ^ 4, "million-scale scaled exact")

-- fraction handling
s:setFromParts(5, "25")
H.eq(s:scaledValue(), 5 * 10 ^ 4 + 2500, "5.25 scaled")

H.describe("Commands + CommandBus")
local store = AbacusStore.new(0, "")
local bus = Commands.CommandBus.new()
bus:run(Commands.SetValue.new(store, "100"))
H.eq(store:intValue(), 100, "SetValue 100")
bus:run(Commands.StepInt.new(store, 5))
H.eq(store:intValue(), 105, "StepInt +5")

-- AddAtColumn: add 7 at the ones column (exponent 0) with carry into tens
local store2 = AbacusStore.new(6, "")
bus:run(Commands.AddAtColumn.new(store2, 0, 7, 1)) -- 6 + 7 = 13
H.eq(store2:intValue(), 13, "AddAtColumn 6+7 carries to 13")

-- add at tens column
local store3 = AbacusStore.new(50, "")
bus:run(Commands.AddAtColumn.new(store3, 1, 8, 1)) -- +80 -> 130
H.eq(store3:intValue(), 130, "AddAtColumn at tens 50+80")

H.describe("Undo restores snapshot")
local store4 = AbacusStore.new(42, "")
local b2 = Commands.CommandBus.new()
b2:run(Commands.StepInt.new(store4, 100))
H.eq(store4:intValue(), 142, "after step")
b2:undo()
H.eq(store4:intValue(), 42, "undo returns to 42")
H.ok(not b2:canUndo(), "history empty after undo")

H.report("state.spec")
