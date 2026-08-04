--!nonstrict
-- ============================================================================
-- Command pattern — every abacus-mutating intent is a Command with
-- execute()/undo(), run by a CommandBus with Memento-snapshot undo. Port of
-- src/state/commands.js (BigInt deltas become plain-number deltas).
-- ============================================================================
local Number = if script
  then require(script.Parent.Parent.domain.Number)
  else require("../domain/Number")
local Config = if script
  then require(script.Parent.Parent.domain.Config)
  else require("../domain/Config")

local Commands = {}

-- --- Command base ----------------------------------------------------------
local Command = {}
Command.__index = Command

function Command.new(store)
  return setmetatable({ store = store, _before = nil }, Command)
end

function Command:execute()
  self._before = self.store:snapshot()
  self:apply()
end

function Command:undo()
  if self._before then
    self.store:restore(self._before)
  end
end

function Command:apply()
  error("abstract command")
end

-- Helper: derive a subclass of Command.
local function subclass()
  local cls = setmetatable({}, { __index = Command })
  cls.__index = cls
  return cls
end

-- --- SetValue --------------------------------------------------------------
local SetValue = subclass()
Commands.SetValue = SetValue
function SetValue.new(store, str)
  local self = setmetatable(Command.new(store), SetValue)
  self.str = str
  return self
end
function SetValue:apply()
  local parsed = Number.parseDecimal(self.str)
  self.store:setFromParts(parsed.intVal, parsed.fracStr)
end

-- --- StepInt ---------------------------------------------------------------
local StepInt = subclass()
Commands.StepInt = StepInt
function StepInt.new(store, delta)
  local self = setmetatable(Command.new(store), StepInt)
  self.delta = delta
  return self
end
function StepInt:apply()
  self.store:setIntValue(self.store:intValue() + self.delta)
end

-- --- AddAtColumn -----------------------------------------------------------
-- Add/subtract `amount` at a column by its power-of-ten exponent (0 = ones,
-- 1 = tens, -1 = tenths), carry/borrow handled by the scaled representation.
local AddAtColumn = subclass()
Commands.AddAtColumn = AddAtColumn
function AddAtColumn.new(store, exponent, amount, sign)
  local self = setmetatable(Command.new(store), AddAtColumn)
  self.exponent = exponent
  self.amount = amount
  self.sign = sign
  return self
end
function AddAtColumn:apply()
  local delta = self.sign * self.amount * 10 ^ (self.exponent + Config.FRAC_COLS)
  self.store:setScaled(self.store:scaledValue() + delta)
end

-- --- ToggleSky -------------------------------------------------------------
local ToggleSky = subclass()
Commands.ToggleSky = ToggleSky
function ToggleSky.new(store, kind, idx)
  local self = setmetatable(Command.new(store), ToggleSky)
  self.kind = kind
  self.idx = idx
  return self
end
function ToggleSky:apply()
  local rods = self.store:rodsOf(self.kind)
  rods[self.idx].sky = not rods[self.idx].sky
  self.store:notify(self.store)
end

-- --- ClickEarth ------------------------------------------------------------
local ClickEarth = subclass()
Commands.ClickEarth = ClickEarth
function ClickEarth.new(store, kind, idx, bead)
  local self = setmetatable(Command.new(store), ClickEarth)
  self.kind = kind
  self.idx = idx
  self.bead = bead
  return self
end
function ClickEarth:apply()
  local rod = self.store:rodsOf(self.kind)[self.idx]
  if self.bead + 1 <= rod.earth then
    rod.earth = self.bead
  else
    rod.earth = self.bead + 1
  end
  self.store:notify(self.store)
end

-- --- CommandBus (Invoker) --------------------------------------------------
local CommandBus = {}
CommandBus.__index = CommandBus
Commands.CommandBus = CommandBus

function CommandBus.new()
  return setmetatable({ _history = {} }, CommandBus)
end

function CommandBus:canUndo(): boolean
  return #self._history > 0
end

function CommandBus:run(command)
  command:execute()
  table.insert(self._history, command)
  return command
end

function CommandBus:undo()
  local command = table.remove(self._history)
  if command then
    command:undo()
  end
  return command
end

return Commands
