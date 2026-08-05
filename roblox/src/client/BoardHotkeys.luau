--!nonstrict
-- ============================================================================
-- BoardHotkeys — the web board-shell's die-cross home-row keyboard, ported for
-- board mode. Each hand IS the digit's die face (center 1,
-- left 2, top 3, bottom 4, right 5 = rose); the right hand adds and the left
-- mirrors it for subtraction — the hand is the sign:
--
--   add:      K = 1   J = 2   I = 3   , = 4   L = 5
--   subtract: D = 1   S = 2   E = 3   C = 4   F = 5
--
-- Cells pressed within CHORD_S spell the compound 6-9 as a CHORD (left+right
-- = 7, top+right = 8, …), resolved by Faces.digitFromFaces — the same inverse
-- the web keyboard and touch pad use, so a key and the cell it mirrors can
-- never mean different digits. An opposite-hand key commits the pending group
-- first, so add and subtract never blur together. The ±10 carry is not a die
-- cell, so it keeps its own keys (U / R); ←/G →/H step the focused rod; Q
-- clears the board. Enabled only while seated at the counting table.
-- ============================================================================
-- Input comes off UserInputService.InputBegan, and DELIBERATELY ignores
-- gameProcessedEvent: Roblox's core camera claims bare I as its zoom-in hotkey
-- and marks it processed, which silently ate the +3 cell (a core binding also
-- outranks any developer ContextActionService priority, so binding above it is
-- not an option). The guard that actually matters is typing: nothing fires
-- while a TextBox (chat) has focus. Stolen-key side effects don't apply while
-- seated — the camera is Scriptable (zoom/arrows do nothing) and the walk
-- speed is zero (S/D don't move you).
local UserInputService = game:GetService("UserInputService")
local RS = game:GetService("ReplicatedStorage")
local Faces = require(RS.SorobanVillage.domain.Faces)

local ADD_CELLS = {
  [Enum.KeyCode.K] = "center",
  [Enum.KeyCode.J] = "left",
  [Enum.KeyCode.I] = "top",
  [Enum.KeyCode.Comma] = "bottom",
  [Enum.KeyCode.L] = "right",
}
local SUB_CELLS = {
  [Enum.KeyCode.D] = "center",
  [Enum.KeyCode.S] = "left",
  [Enum.KeyCode.E] = "top",
  [Enum.KeyCode.C] = "bottom",
  [Enum.KeyCode.F] = "right",
}
local CHORD_S = 0.045 -- cells pressed within this window group into one digit

local BoardHotkeys = {}
BoardHotkeys.__index = BoardHotkeys

-- cb: { onDigit(sign, d), onCarry(sign), onFocusStep(dir), onReset() }
function BoardHotkeys.new(cb)
  local self = setmetatable({}, BoardHotkeys)
  self.cb = cb
  self.enabled = false
  self.chord = nil -- { sign, cells = { [pos] = true } }
  self.gen = 0 -- bumping this cancels any pending chord timer
  self.conn = UserInputService.InputBegan:Connect(function(input)
    self:_onInput(input)
  end)
  return self
end

function BoardHotkeys:setEnabled(on)
  if not on then
    self:_flush()
  end
  self.enabled = on
end

-- Commit the pending chord: resolve the lit cells into a digit and fire it.
function BoardHotkeys:_flush()
  local chord = self.chord
  self.chord = nil
  self.gen += 1
  if not chord then
    return
  end
  local cells = {}
  for p in chord.cells do
    table.insert(cells, p)
  end
  local d = Faces.digitFromFaces(cells) -- nil for a non-die combo -> ignored
  if d and d > 0 then
    self.cb.onDigit(chord.sign, d)
  end
end

function BoardHotkeys:_push(sign, cell)
  if self.chord and self.chord.sign ~= sign then
    self:_flush() -- an opposite-hand key commits the pending group first
  end
  if not self.chord then
    self.chord = { sign = sign, cells = {} }
  end
  self.chord.cells[cell] = true
  self.gen += 1
  local myGen = self.gen
  task.delay(CHORD_S, function()
    if self.gen == myGen then
      self:_flush()
    end
  end)
end

function BoardHotkeys:_onInput(input)
  if not self.enabled then
    return
  end
  if input.UserInputType ~= Enum.UserInputType.Keyboard then
    return
  end
  if UserInputService:GetFocusedTextBox() then
    return -- typing (chat) — every key belongs to the text box
  end
  local k = input.KeyCode
  local cell = ADD_CELLS[k] or SUB_CELLS[k]
  if cell then
    self:_push(if ADD_CELLS[k] then 1 else -1, cell)
    return
  end
  -- Any other key commits a pending chord first, preserving move order.
  self:_flush()
  if k == Enum.KeyCode.U then
    self.cb.onCarry(1)
  elseif k == Enum.KeyCode.R then
    self.cb.onCarry(-1)
  elseif k == Enum.KeyCode.Left or k == Enum.KeyCode.G then
    self.cb.onFocusStep(-1) -- toward higher places (left on the board)
  elseif k == Enum.KeyCode.Right or k == Enum.KeyCode.H then
    self.cb.onFocusStep(1)
  elseif k == Enum.KeyCode.Q then
    self.cb.onReset()
  end
end

function BoardHotkeys:destroy()
  if self.conn then
    self.conn:Disconnect()
    self.conn = nil
  end
end

return BoardHotkeys
