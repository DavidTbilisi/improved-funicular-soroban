--!nonstrict
-- ============================================================================
-- BoardHotkeys — the web board-shell's die-cross home-row keyboard, ported for
-- board mode. Each hand IS the digit's die face (center 1,
-- left 2, top 3, bottom 4, right 5 = rose); the right hand adds and the left
-- mirrors it for subtraction — the hand is the sign:
--
--   add:      K = 1   J = 2   I = 3 (or P)   , = 4   L = 5
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
-- While seated, these keys BELONG TO THE BOARD, and that is claimed rather than
-- hoped for: the whole set is bound through ContextActionService and sunk.
--
-- This replaced a UserInputService.InputBegan listener that ignored
-- gameProcessedEvent on the theory that a stolen key still arrives, merely
-- flagged. It does not, and `I` proved it — measured, not guessed:
--
--   * bare I never reaches InputBegan (every other board key does);
--   * nor a ContextActionService binding, even at priority 100000;
--   * only Shift+I gets through, because the binding that owns I matches the
--     UNMODIFIED key.
--
-- So the owner is a CoreScript binding (Roblox's camera zoom-in), dispatched in
-- a queue no LocalScript can outrank. **Bare I cannot be reclaimed**, which is
-- why the top cell of the right hand carries an alias — see TOP_ALIAS below.
--
-- Claiming the rest through CAS is still the right mechanism: it is what stops
-- the next Roblox binding from quietly eating another cell, and sinking is safe
-- precisely because we are seated — the camera is Scriptable (zoom and arrows
-- do nothing), the walk speed is zero (S/D don't move you), and the counting
-- table's prompt is disabled (E is ours). Nothing is bound while walking.
local ContextActionService = game:GetService("ContextActionService")
local UserInputService = game:GetService("UserInputService")
local RS = game:GetService("ReplicatedStorage")
local Faces = require(RS.SorobanVillage.domain.Faces)

local ACTION = "sorobanBoardKeys"
-- Above every developer-context binding. It does NOT outrank a CoreScript's —
-- raising this further was measured and changes nothing (see the note above).
local PRIORITY = Enum.ContextActionPriority.High.Value + 1

-- The right hand's TOP cell has two keys. `I` is the one the die cross wants
-- (it sits above K, and it is what the web keyboard and the touch pad use), and
-- it still works held with Shift — but bare I belongs to Roblox and cannot be
-- taken back, so the cell would otherwise be unreachable with one finger.
-- `P` is the alias: the free key on the right hand's own top row. It is a
-- consolation, not the grammar — hence one line, easy to move if a better key
-- turns up. The left hand needs none; its top cell is E and nothing claims it.
local TOP_ALIAS = Enum.KeyCode.P

local ADD_CELLS = {
  [Enum.KeyCode.K] = "center",
  [Enum.KeyCode.J] = "left",
  [Enum.KeyCode.I] = "top",
  [TOP_ALIAS] = "top",
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

-- Every key the board answers to, in one list — this is what gets bound, so a
-- key that is handled below but missing here would simply never arrive.
local BOARD_KEYS = {
  Enum.KeyCode.K, Enum.KeyCode.J, Enum.KeyCode.I, TOP_ALIAS, Enum.KeyCode.Comma, Enum.KeyCode.L,
  Enum.KeyCode.D, Enum.KeyCode.S, Enum.KeyCode.E, Enum.KeyCode.C, Enum.KeyCode.F,
  Enum.KeyCode.U, Enum.KeyCode.R,
  Enum.KeyCode.G, Enum.KeyCode.H, Enum.KeyCode.Left, Enum.KeyCode.Right,
  Enum.KeyCode.Q,
}

local BoardHotkeys = {}
BoardHotkeys.__index = BoardHotkeys

-- cb: { onDigit(sign, d), onCarry(sign), onFocusStep(dir), onReset() }
function BoardHotkeys.new(cb)
  local self = setmetatable({}, BoardHotkeys)
  self.cb = cb
  self.enabled = false
  self.chord = nil -- { sign, cells = { [pos] = true } }
  self.gen = 0 -- bumping this cancels any pending chord timer
  return self
end

function BoardHotkeys:setEnabled(on)
  on = not not on
  if on == self.enabled then
    return
  end
  self.enabled = on
  if not on then
    self:_flush()
    ContextActionService:UnbindAction(ACTION)
    return
  end
  ContextActionService:BindActionAtPriority(ACTION, function(_, state, input)
    if state ~= Enum.UserInputState.Begin then
      return Enum.ContextActionResult.Sink
    end
    self:_onKey(input.KeyCode)
    return Enum.ContextActionResult.Sink
  end, false, PRIORITY, table.unpack(BOARD_KEYS))
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

function BoardHotkeys:_onKey(k)
  if UserInputService:GetFocusedTextBox() then
    return -- typing (chat) — every key belongs to the text box
  end
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
  self:setEnabled(false)
end

return BoardHotkeys
