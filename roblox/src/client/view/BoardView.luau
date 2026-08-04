--!nonstrict
-- ============================================================================
-- BoardView — the soroban as a 3D Part model that reflects an AbacusStore and
-- emits bead-click intent. The Roblox counterpart of src/view/sorobanView.js:
-- the JS version set each bead's `style.top` in pixels; here each bead tweens
-- along its vertical rod. Beads carry ClickDetectors so tapping one moves it.
--
-- Callbacks (injected, like the JS view — a view never mutates the store):
--   onToggleHeaven(kind, idx)      -- tapped the heaven bead of a rod
--   onClickEarth(kind, idx, bead)  -- tapped earth bead `bead` (0..3) of a rod
--   onFocusRod(kind, idx)          -- tapped a rod (selects it for the keypad)
--
-- kind is "int" | "frac"; idx is the 1-based rod index into store:rodsOf(kind).
-- ============================================================================
local Config = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Config)
  else require("../../shared/domain/Config")
local Rod = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Rod)
  else require("../../shared/domain/Rod")
local Faces = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Faces)
  else require("../../shared/domain/Faces")
local Pegs = if script
  then require(game:GetService("ReplicatedStorage").SorobanVillage.domain.Pegs)
  else require("../../shared/domain/Pegs")
local Effects = if script then require(script.Parent:WaitForChild("Effects")) else require("./Effects")

local TweenService = game:GetService("TweenService")

-- Geometry (studs).
local COL_SPACING = 1.3
local POINT_GAP = 0.9
local BEAD_SIZE = Vector3.new(1.05, 0.62, 0.5)
local HEAVEN_UP_Y = 3.0
local HEAVEN_DOWN_Y = 0.75
local EARTH_TOP_Y = -0.72
local EARTH_STEP = 0.78
local EARTH_INACTIVE_Y = -3.8
local BEAD_TWEEN = TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local RAIL_Y = 4.75 -- the readout rail crowns the board, above the heaven beads
local RAIL_H = 2.3 -- two rows: food-peg icons over digits
local DIE_Y = 7.4 -- the die-face panel floats above the focused peg

local COLOR_HEAVEN = Color3.fromRGB(212, 61, 61)
local COLOR_EARTH = Color3.fromRGB(224, 160, 60)
local COLOR_ROD = Color3.fromRGB(120, 96, 72)
local COLOR_ROD_FOCUS = Color3.fromRGB(120, 200, 255)
local COLOR_BAR = Color3.fromRGB(60, 44, 34)
local COLOR_FRAME = Color3.fromRGB(84, 60, 44)
local COLOR_READOUT = Color3.fromRGB(240, 235, 225)
local COLOR_READOUT_DIM = Color3.fromRGB(126, 112, 100)
local COLOR_READOUT_FOCUS = Color3.fromRGB(120, 200, 255)

local BoardView = {}
BoardView.__index = BoardView

local function newPart(name, size, color, parent, material)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = false
  p.Size = size
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = parent
  return p
end

-- Ordered visual columns: integer rods high-place->low (left->right), a point
-- gap, then fraction rods. Each entry: { kind, idx (1-based), x }.
local function buildColumnLayout()
  local cols = {}
  local x = 0
  for i = Config.INT_COLS, 1, -1 do
    table.insert(cols, { kind = "int", idx = i, x = x })
    x += COL_SPACING
  end
  x += POINT_GAP - COL_SPACING
  for j = 1, Config.FRAC_COLS do
    x += COL_SPACING
    table.insert(cols, { kind = "frac", idx = j, x = x })
  end
  -- centre the board on x = 0
  local width = x
  for _, c in cols do
    c.x -= width / 2
  end
  return cols, width
end

function BoardView.new(opts)
  local self = setmetatable({}, BoardView)
  self.onToggleHeaven = opts.onToggleHeaven or function() end
  self.onClickEarth = opts.onClickEarth or function() end
  self.onFocusRod = opts.onFocusRod or function() end
  self.origin = opts.cframe or CFrame.new(0, 6, 0)
  self.parent = opts.parent or workspace

  self.model = Instance.new("Model")
  self.model.Name = "SorobanBoard"
  self.model.Parent = self.parent

  self.cols, self.width = buildColumnLayout()
  self.beads = { int = {}, frac = {} }
  self.rods = { int = {}, frac = {} }
  self.labels = { int = {}, frac = {} }
  self.focus = nil

  self:_build()
  return self
end

-- World CFrame for a local offset relative to the board origin.
function BoardView:_at(x, y, z)
  return self.origin * CFrame.new(x, y, z or 0)
end

function BoardView:_build()
  local halfH = 5.2
  -- Back plate
  local back = newPart("Back", Vector3.new(self.width + 1.5, halfH * 2 + 1.5, 0.4), COLOR_FRAME, self.model, Enum.Material.Wood)
  back.CFrame = self:_at(0, -1.1, -0.6)
  -- Reckoning bar
  local bar = newPart("Bar", Vector3.new(self.width + 1.2, 0.55, 0.7), COLOR_BAR, self.model, Enum.Material.Wood)
  bar.CFrame = self:_at(0, 0, 0)

  for _, c in self.cols do
    self:_buildColumn(c)
  end
  self:_buildReadout()
  self.model.PrimaryPart = back
end

-- The readout rail: the Roblox counterpart of the web board's RodRailView +
-- aligned number row. Two fixed rows on a SurfaceGui strip — each rod's
-- food-peg place icon over its digit — with the focused peg lifted like the
-- perpetual calendar's month tab, and a die-face panel above it showing the
-- focused digit as lit cube cells (the web's cubeFaceGrid). Free-floating
-- per-rod billboards jumbled into a pile at reading distance; a surface can't.
function BoardView:_buildReadout()
  local railW = self.width + 1.5
  local rail = newPart("Readout", Vector3.new(railW, RAIL_H, 0.3), COLOR_BAR, self.model, Enum.Material.Wood)
  rail.CFrame = self:_at(0, RAIL_Y, 0.15)

  local gui = Instance.new("SurfaceGui")
  gui.Face = Enum.NormalId.Back -- the face the play camera looks at
  gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
  gui.PixelsPerStud = 50
  gui.LightInfluence = 0
  gui.Parent = rail

  self.pegSlots = { int = {}, frac = {} }
  self.digits = { int = {}, frac = {} }

  local function cellsFor(c)
    local u = (c.x + railW / 2) / railW
    -- The rod's place letter: int idx 1 = ones = A upward; frac idx 1 = tenths
    -- = A again (the web flips the fraction pegs — same letters, other side).
    local peg = Pegs.ALPHABET_PEGS[Config.columnLetter(c.idx - 1)]

    local pegL = Instance.new("TextLabel")
    pegL.BackgroundTransparency = 1
    pegL.Size = UDim2.new(COL_SPACING / railW, 0, 0.5, 0)
    pegL.AnchorPoint = Vector2.new(0.5, 0)
    pegL.Position = UDim2.new(u, 0, 0.06, 0)
    pegL.Font = Enum.Font.GothamBold
    pegL.TextScaled = true
    pegL.Text = peg.emoji
    pegL.Parent = gui
    self.pegSlots[c.kind][c.idx] = { label = pegL, u = u }

    local tl = Instance.new("TextLabel")
    tl.BackgroundColor3 = COLOR_READOUT_FOCUS
    tl.BackgroundTransparency = 1 -- lit only when the rod holds focus
    tl.BorderSizePixel = 0
    tl.Size = UDim2.new(COL_SPACING / railW, 0, 0.42, 0)
    tl.AnchorPoint = Vector2.new(0.5, 1)
    tl.Position = UDim2.new(u, 0, 1, 0)
    tl.Font = Enum.Font.GothamBold
    tl.TextScaled = true
    tl.TextColor3 = COLOR_READOUT_DIM
    tl.Text = "0"
    tl.Parent = gui
    self.labels[c.kind][c.idx] = tl
    self.digits[c.kind][c.idx] = 0
  end
  for _, c in self.cols do
    cellsFor(c)
  end

  -- Decimal point: a thin marker in the int|frac gap, like the web's `point`.
  local intEdge = self.cols[Config.INT_COLS]
  local fracEdge = self.cols[Config.INT_COLS + 1]
  if intEdge and fracEdge then
    local dot = Instance.new("Frame")
    dot.BackgroundColor3 = COLOR_READOUT_FOCUS
    dot.BorderSizePixel = 0
    dot.AnchorPoint = Vector2.new(0.5, 1)
    dot.Size = UDim2.new(0, 5, 0, 5)
    dot.Position = UDim2.new(((intEdge.x + fracEdge.x) / 2 + railW / 2) / railW, 0, 1, -6)
    dot.Parent = gui
  end

  self:_buildDiePanel()
end

-- The die-face panel — the web's cubeFaceGrid as a floating square: five cells
-- in the frozen CUBE_LAYOUT cross, lighting the faces the focused digit spells.
function BoardView:_buildDiePanel()
  local panel = newPart("DiePanel", Vector3.new(2.4, 2.4, 0.25), COLOR_BAR, self.model, Enum.Material.Wood)
  panel.CFrame = self:_at(0, DIE_Y, 0.15)
  self.diePanel = panel

  local gui = Instance.new("SurfaceGui")
  gui.Face = Enum.NormalId.Back
  gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
  gui.PixelsPerStud = 50
  gui.LightInfluence = 0
  gui.Parent = panel

  local frame = Instance.new("Frame")
  frame.BackgroundColor3 = Color3.fromRGB(26, 22, 19)
  frame.BorderSizePixel = 0
  frame.Size = UDim2.fromScale(1, 1)
  frame.Parent = gui
  local corner = Instance.new("UICorner")
  corner.CornerRadius = UDim.new(0, 12)
  corner.Parent = frame
  local stroke = Instance.new("UIStroke")
  stroke.Color = COLOR_READOUT_FOCUS
  stroke.Thickness = 2
  stroke.Transparency = 0.35
  stroke.Parent = frame

  -- Cell centers for the cross: top / left / center / right / bottom.
  local AT = {
    top = Vector2.new(0.5, 0.18),
    left = Vector2.new(0.18, 0.5),
    center = Vector2.new(0.5, 0.5),
    right = Vector2.new(0.82, 0.5),
    bottom = Vector2.new(0.5, 0.82),
  }
  self.dieCells = {}
  for _, f in Faces.CUBE_LAYOUT do
    local cell = Instance.new("TextLabel")
    cell.BackgroundTransparency = 1
    cell.AnchorPoint = Vector2.new(0.5, 0.5)
    cell.Size = UDim2.fromScale(0.3, 0.3)
    cell.Position = UDim2.fromScale(AT[f.pos].X, AT[f.pos].Y)
    cell.Font = Enum.Font.GothamBold
    cell.TextScaled = true
    cell.TextColor3 = COLOR_READOUT_DIM
    cell.Text = "·"
    cell.Parent = frame
    self.dieCells[f.value] = cell
  end
end

-- Light the cells the focused rod's digit spells (empty set for 0).
function BoardView:_renderDie()
  if not (self.focus and self.dieCells) then
    return
  end
  local digit = self.digits[self.focus.kind][self.focus.idx] or 0
  local on = {}
  for _, v in Faces.cubeFaceValues(digit) do
    on[v] = true
  end
  for value, cell in self.dieCells do
    cell.Text = if on[value] then Pegs.CUBE_FACES[value].emoji else "·"
  end
end

function BoardView:_buildColumn(c)
  -- Rod post
  local rod = newPart("Rod_" .. c.kind .. c.idx, Vector3.new(0.16, 9.2, 0.16), COLOR_ROD, self.model, Enum.Material.Metal)
  rod.CFrame = self:_at(c.x, -1.1, 0)
  self.rods[c.kind][c.idx] = rod

  -- Heaven bead
  local heaven = newPart("Heaven", BEAD_SIZE, COLOR_HEAVEN, self.model)
  heaven.CFrame = self:_at(c.x, HEAVEN_UP_Y, 0)
  self:_wireClick(heaven, function()
    self.onFocusRod(c.kind, c.idx)
    self.onToggleHeaven(c.kind, c.idx)
  end)

  -- Earth beads
  local earths = {}
  for b = 0, 3 do
    local bead = newPart("Earth" .. b, BEAD_SIZE, COLOR_EARTH, self.model)
    bead.CFrame = self:_at(c.x, EARTH_INACTIVE_Y - b * EARTH_STEP, 0)
    self:_wireClick(bead, function()
      self.onFocusRod(c.kind, c.idx)
      self.onClickEarth(c.kind, c.idx, b)
    end)
    earths[b] = bead
  end

  self.beads[c.kind][c.idx] = { heaven = heaven, earth = earths, x = c.x }
end

function BoardView:_wireClick(part, fn)
  local cd = Instance.new("ClickDetector")
  cd.MaxActivationDistance = 64
  cd.Parent = part
  cd.MouseClick:Connect(fn)
end

-- Reflect the whole store onto the beads.
function BoardView:update(store)
  for _, c in self.cols do
    local rod = store:rodsOf(c.kind)[c.idx]
    self:_place(c.kind, c.idx, rod)
  end
end

function BoardView:_place(kind, idx, rod)
  local set = self.beads[kind][idx]
  if not set then
    return
  end
  local e = rod.earth
  -- heaven
  local hy = if rod.sky then HEAVEN_DOWN_Y else HEAVEN_UP_Y
  TweenService:Create(set.heaven, BEAD_TWEEN, { CFrame = self:_at(set.x, hy, 0) }):Play()
  -- earth
  for b = 0, 3 do
    local y
    if b < e then
      y = EARTH_TOP_Y - b * EARTH_STEP
    else
      y = EARTH_INACTIVE_Y - (b - e) * EARTH_STEP
    end
    TweenService:Create(set.earth[b], BEAD_TWEEN, { CFrame = self:_at(set.x, y, 0) }):Play()
  end
  -- readout cell: zeros stay visible but dim, so the row reads as one number
  local digit = (rod.sky and 5 or 0) + rod.earth
  self.digits[kind][idx] = digit
  local tl = self.labels[kind][idx]
  if tl then
    tl.Text = tostring(digit)
    tl.TextColor3 = if digit == 0 then COLOR_READOUT_DIM else COLOR_READOUT
  end
  if self.focus and self.focus.kind == kind and self.focus.idx == idx then
    self:_renderDie()
  end
end

-- Highlight the focused rod (the one the keypad drives): tint its readout
-- cell, lift its peg like the calendar's month tab, and slide the die panel
-- over it.
function BoardView:setFocus(kind, idx)
  if self.focus then
    local prev = self.rods[self.focus.kind][self.focus.idx]
    if prev then
      prev.Color = COLOR_ROD
    end
    local prevCell = self.labels[self.focus.kind][self.focus.idx]
    if prevCell then
      prevCell.BackgroundTransparency = 1
    end
    local prevSlot = self.pegSlots[self.focus.kind][self.focus.idx]
    if prevSlot then
      prevSlot.label.Position = UDim2.new(prevSlot.u, 0, 0.06, 0)
      prevSlot.label.Size = UDim2.new(COL_SPACING / (self.width + 1.5), 0, 0.5, 0)
    end
  end
  self.focus = { kind = kind, idx = idx }
  local r = self.rods[kind] and self.rods[kind][idx]
  if r then
    r.Color = COLOR_ROD_FOCUS
    Effects.pop(r, 1.08, 0.12)
  end
  local cell = self.labels[kind] and self.labels[kind][idx]
  if cell then
    cell.BackgroundTransparency = 0.72
  end
  local slot = self.pegSlots[kind] and self.pegSlots[kind][idx]
  if slot then
    slot.label.Position = UDim2.new(slot.u, 0, -0.06, 0) -- lifted
    slot.label.Size = UDim2.new(COL_SPACING * 1.3 / (self.width + 1.5), 0, 0.58, 0)
  end
  local set = self.beads[kind] and self.beads[kind][idx]
  if set and self.diePanel then
    Effects.tween(self.diePanel, 0.16, { CFrame = self:_at(set.x, DIE_Y, 0.15) })
  end
  self:_renderDie()
end

function BoardView:destroy()
  if self.model then
    self.model:Destroy()
    self.model = nil
  end
end

return BoardView
