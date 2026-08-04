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
local Effects = if script then require(script.Parent.Effects) else require("./Effects")

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
local LABEL_Y = 4.6

local COLOR_HEAVEN = Color3.fromRGB(212, 61, 61)
local COLOR_EARTH = Color3.fromRGB(224, 160, 60)
local COLOR_ROD = Color3.fromRGB(120, 96, 72)
local COLOR_ROD_FOCUS = Color3.fromRGB(120, 200, 255)
local COLOR_BAR = Color3.fromRGB(60, 44, 34)
local COLOR_FRAME = Color3.fromRGB(84, 60, 44)

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
  self.model.PrimaryPart = back
end

function BoardView:_buildColumn(c)
  -- Rod post
  local rod = newPart("Rod_" .. c.kind .. c.idx, Vector3.new(0.16, 9.2, 0.16), COLOR_ROD, self.model, Enum.Material.Metal)
  rod.CFrame = self:_at(c.x, -1.1, 0)
  self.rods[c.kind][c.idx] = rod

  -- Digit label above the rod (die-face emoji + value).
  local labelPart = newPart("Lbl_" .. c.kind .. c.idx, Vector3.new(0.1, 0.1, 0.1), COLOR_ROD, self.model)
  labelPart.Transparency = 1
  labelPart.CFrame = self:_at(c.x, LABEL_Y, 0)
  local bb = Instance.new("BillboardGui")
  bb.Size = UDim2.fromScale(1.4, 1.4)
  bb.AlwaysOnTop = false
  bb.Parent = labelPart
  local tl = Instance.new("TextLabel")
  tl.BackgroundTransparency = 1
  tl.Size = UDim2.fromScale(1, 1)
  tl.Font = Enum.Font.GothamBold
  tl.TextScaled = true
  tl.TextColor3 = Color3.fromRGB(240, 235, 225)
  tl.Text = ""
  tl.Parent = bb
  self.labels[c.kind][c.idx] = tl

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
  -- label
  local digit = (rod.sky and 5 or 0) + rod.earth
  local tl = self.labels[kind][idx]
  if tl then
    tl.Text = if digit == 0 then "" else Faces.cubeEmojis(digit) .. " " .. digit
  end
end

-- Highlight the focused rod (the one the keypad drives).
function BoardView:setFocus(kind, idx)
  if self.focus then
    local prev = self.rods[self.focus.kind][self.focus.idx]
    if prev then
      prev.Color = COLOR_ROD
    end
  end
  self.focus = { kind = kind, idx = idx }
  local r = self.rods[kind] and self.rods[kind][idx]
  if r then
    r.Color = COLOR_ROD_FOCUS
    Effects.pop(r, 1.08, 0.12)
  end
end

function BoardView:destroy()
  if self.model then
    self.model:Destroy()
    self.model = nil
  end
end

return BoardView
