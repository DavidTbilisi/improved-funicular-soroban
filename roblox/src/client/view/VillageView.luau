--!nonstrict
-- ============================================================================
-- VillageView — the village as a 3D diorama in Workspace. The Roblox
-- counterpart of src/view/game/villageScene.js (a Phaser scene of emoji
-- sprites): a ground plane, a 9x6 grid of clickable plots, and a building
-- model per occupied cell. It is a pure renderer + tap surface — it holds no
-- game state; it takes village snapshots in and reports cell taps out.
--
--   renderVillage(village)   -- (re)paint buildings from the snapshot
--   onCellTap(idx)           -- injected; idx is 1-based (Economy port note)
--   flashPayout / pulseDay / celebrate / festival  -- effect hooks
-- ============================================================================
local RS = game:GetService("ReplicatedStorage")
local Buildings = if script
  then require(RS.SorobanVillage.game.Buildings)
  else require("../../shared/game/Buildings")
local Effects = if script then require(script.Parent:WaitForChild("Effects")) else require("./Effects")

local GRID_COLS = Buildings.GRID_COLS
local GRID_ROWS = Buildings.GRID_ROWS
local PLOT = 6 -- studs per cell
local GROUND_Y = 0

local BUILDING_COLOR = {
  hut = Color3.fromRGB(178, 124, 78),
  farm = Color3.fromRGB(198, 176, 74),
  well = Color3.fromRGB(96, 150, 196),
  woodcutter = Color3.fromRGB(120, 92, 64),
  workshop = Color3.fromRGB(140, 140, 148),
  market = Color3.fromRGB(196, 132, 86),
  shrine = Color3.fromRGB(200, 84, 84),
}

local VillageView = {}
VillageView.__index = VillageView

-- 1-based cellIdx -> (row, col), both 1-based.
local function rowcol(idx)
  local i0 = idx - 1
  return math.floor(i0 / GRID_COLS) + 1, (i0 % GRID_COLS) + 1
end

function VillageView.new(opts)
  local self = setmetatable({}, VillageView)
  self.onCellTap = opts.onCellTap or function() end
  self.parent = opts.parent or workspace
  self.origin = opts.cframe or CFrame.new(0, GROUND_Y, 40)

  self.model = Instance.new("Model")
  self.model.Name = "SorobanVillage"
  self.model.Parent = self.parent

  self.plots = {}
  self.buildingsFolder = Instance.new("Folder")
  self.buildingsFolder.Name = "Buildings"
  self.buildingsFolder.Parent = self.model
  self.cellParts = {}

  self:_buildGround()
  return self
end

function VillageView:_cellCFrame(idx)
  local row, col = rowcol(idx)
  local w = GRID_COLS * PLOT
  local d = GRID_ROWS * PLOT
  local x = (col - 0.5) * PLOT - w / 2
  local z = (row - 0.5) * PLOT - d / 2
  return self.origin * CFrame.new(x, 0, z)
end

function VillageView:centerWorld()
  return self.origin.Position + Vector3.new(0, 6, 0)
end

-- A ground-level point on a random plot — where a wandering villager heads.
function VillageView:randomSpot()
  return self:_cellCFrame(math.random(1, GRID_COLS * GRID_ROWS))
end

function VillageView:_buildGround()
  local w = GRID_COLS * PLOT
  local d = GRID_ROWS * PLOT
  local ground = Instance.new("Part")
  ground.Name = "Ground"
  ground.Anchored = true
  ground.Size = Vector3.new(w + 4, 1, d + 4)
  ground.Color = Color3.fromRGB(96, 148, 92)
  ground.Material = Enum.Material.Grass
  ground.CFrame = self.origin * CFrame.new(0, -0.5, 0)
  ground.Parent = self.model
  self.model.PrimaryPart = ground

  for idx = 1, GRID_COLS * GRID_ROWS do
    local plot = Instance.new("Part")
    plot.Name = "Plot" .. idx
    plot.Anchored = true
    plot.Size = Vector3.new(PLOT - 0.6, 0.3, PLOT - 0.6)
    plot.Color = Color3.fromRGB(120, 168, 112)
    plot.Material = Enum.Material.Grass
    plot.Transparency = 0.25
    plot.CFrame = self:_cellCFrame(idx) * CFrame.new(0, 0.2, 0)
    plot.Parent = self.model

    local cd = Instance.new("ClickDetector")
    cd.MaxActivationDistance = 128
    cd.Parent = plot
    local i = idx
    cd.MouseClick:Connect(function()
      self.onCellTap(i)
    end)
    cd.MouseHoverEnter:Connect(function()
      if not self.cellParts[i] then
        plot.Transparency = 0.05
      end
    end)
    cd.MouseHoverLeave:Connect(function()
      plot.Transparency = 0.25
    end)
    self.plots[idx] = plot
  end
end

-- Rebuild the building visuals from a village snapshot (cheap: 54 cells).
function VillageView:renderVillage(village)
  self.village = village
  for _, m in self.cellParts do
    if m then
      m:Destroy()
    end
  end
  self.cellParts = {}
  for idx = 1, #village.grid do
    local cell = village.grid[idx]
    if cell then
      self.cellParts[idx] = self:_makeBuilding(idx, cell)
    end
  end
end

-- --- per-building model builders --------------------------------------------
-- Each builder returns a Model with a PrimaryPart (the main mass — what pops
-- and carries the label). All parts stay inside the 4.4-stud plot footprint,
-- anchored and walk-through. `h` is the level-scaled height of the main mass.
local WOOD = Color3.fromRGB(110, 82, 54)
local STONE = Color3.fromRGB(150, 150, 156)
local THATCH = Color3.fromRGB(196, 168, 96)

local function bpart(model, name, size, color, material)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = false
  p.Size = size
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = model
  return p
end

local function bwedge(model, name, size, color, material)
  local w = Instance.new("WedgePart")
  w.Name = name
  w.Anchored = true
  w.CanCollide = false
  w.Size = size
  w.Color = color
  w.Material = material or Enum.Material.SmoothPlastic
  w.Parent = model
  return w
end

-- base = the cell CFrame at ground level; h = level-scaled main-mass height.
local BUILDERS = {}

function BUILDERS.hut(m, base, h, level)
  local body = bpart(m, "Body", Vector3.new(3.8, h, 3.4), BUILDING_COLOR.hut, Enum.Material.WoodPlanks)
  body.CFrame = base * CFrame.new(0, h / 2 + 0.3, 0)
  for _, side in { -1, 1 } do
    local roof = bwedge(m, "Roof", Vector3.new(3.8, 1.4, 2.0), THATCH, Enum.Material.Grass)
    roof.CFrame = base * CFrame.new(0, h + 1.0, side * 1.0)
      * CFrame.Angles(0, if side > 0 then math.pi else 0, 0)
  end
  local door = bpart(m, "Door", Vector3.new(1.0, 1.7, 0.15), WOOD, Enum.Material.Wood)
  door.CFrame = base * CFrame.new(0, 1.15, 1.75)
  return body
end

function BUILDERS.farm(m, base, h, level)
  local soil = bpart(m, "Soil", Vector3.new(4.2, 0.5, 4.2), Color3.fromRGB(96, 68, 46), Enum.Material.Ground)
  soil.CFrame = base * CFrame.new(0, 0.55, 0)
  local rows = math.min(4, 2 + math.floor(level / 2))
  for r = 1, rows do
    local crop = bpart(m, "Crops" .. r, Vector3.new(3.8, 0.5 + math.min(level, 6) * 0.1, 0.6),
      BUILDING_COLOR.farm, Enum.Material.Grass)
    crop.CFrame = base * CFrame.new(0, 1.0, (r - (rows + 1) / 2) * 1.0)
  end
  return soil
end

function BUILDERS.well(m, base, h, level)
  local ring = bpart(m, "Ring", Vector3.new(2.4, 1.1, 2.4), STONE, Enum.Material.Slate)
  ring.CFrame = base * CFrame.new(0, 0.85, 0)
  local water = bpart(m, "Water", Vector3.new(1.7, 0.2, 1.7), BUILDING_COLOR.well, Enum.Material.Glass)
  water.CFrame = base * CFrame.new(0, 1.35, 0)
  for _, side in { -1, 1 } do
    local post = bpart(m, "Post", Vector3.new(0.3, 2.6, 0.3), WOOD, Enum.Material.Wood)
    post.CFrame = base * CFrame.new(side * 1.2, 2.0, 0)
  end
  local cap = bpart(m, "Cap", Vector3.new(3.0, 0.3, 1.4), WOOD, Enum.Material.Wood)
  cap.CFrame = base * CFrame.new(0, 3.4, 0)
  return ring
end

function BUILDERS.woodcutter(m, base, h, level)
  local cabin = bpart(m, "Cabin", Vector3.new(3.2, h, 2.8), BUILDING_COLOR.woodcutter, Enum.Material.Wood)
  cabin.CFrame = base * CFrame.new(-0.4, h / 2 + 0.3, 0)
  for i = 1, 3 do
    local log = bpart(m, "Log" .. i, Vector3.new(0.7, 0.7, 2.6), WOOD, Enum.Material.Wood)
    log.Shape = Enum.PartType.Cylinder
    log.CFrame = base * CFrame.new(1.7, 0.65 + (i - 1) * 0.55, 0) * CFrame.Angles(0, 0, math.rad(90))
      * CFrame.Angles(math.rad(90), 0, 0)
  end
  return cabin
end

function BUILDERS.workshop(m, base, h, level)
  local hall = bpart(m, "Hall", Vector3.new(4.0, h, 3.4), BUILDING_COLOR.workshop, Enum.Material.Concrete)
  hall.CFrame = base * CFrame.new(0, h / 2 + 0.3, 0)
  local chimney = bpart(m, "Chimney", Vector3.new(0.8, 2.0, 0.8), Color3.fromRGB(110, 90, 84), Enum.Material.Brick)
  chimney.CFrame = base * CFrame.new(1.3, h + 1.0, -1.0)
  if level >= 2 then
    local smoke = Instance.new("ParticleEmitter")
    smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
    smoke.Rate = 2
    smoke.Lifetime = NumberRange.new(2, 3)
    smoke.Speed = NumberRange.new(0.6, 1.1)
    smoke.Size = NumberSequence.new(0.6, 1.8)
    smoke.Transparency = NumberSequence.new(0.6, 1)
    smoke.Parent = chimney
  end
  return hall
end

function BUILDERS.market(m, base, h, level)
  local counter = bpart(m, "Counter", Vector3.new(3.8, 1.2, 1.6), WOOD, Enum.Material.WoodPlanks)
  counter.CFrame = base * CFrame.new(0, 0.9, 0.8)
  for _, side in { -1, 1 } do
    local post = bpart(m, "Post", Vector3.new(0.25, 3.2, 0.25), WOOD, Enum.Material.Wood)
    post.CFrame = base * CFrame.new(side * 1.8, 1.9, -0.6)
  end
  for i = 0, 3 do
    local stripe = bpart(m, "Awning" .. i, Vector3.new(1.0, 0.15, 2.6),
      if i % 2 == 0 then BUILDING_COLOR.market else Color3.fromRGB(240, 234, 222),
      Enum.Material.Fabric)
    stripe.CFrame = base * CFrame.new(-1.5 + i * 1.0, 3.5, -0.2) * CFrame.Angles(math.rad(-8), 0, 0)
  end
  return counter
end

function BUILDERS.shrine(m, base, h, level)
  local basePad = bpart(m, "Base", Vector3.new(3.6, 0.4, 2.6), STONE, Enum.Material.Slate)
  basePad.CFrame = base * CFrame.new(0, 0.5, 0)
  for _, side in { -1, 1 } do
    local pillar = bpart(m, "Pillar", Vector3.new(0.45, h + 1.2, 0.45), BUILDING_COLOR.shrine, Enum.Material.SmoothPlastic)
    pillar.CFrame = base * CFrame.new(side * 1.35, (h + 1.2) / 2 + 0.7, 0)
  end
  local lintel = bpart(m, "Lintel", Vector3.new(3.9, 0.4, 0.6), BUILDING_COLOR.shrine, Enum.Material.SmoothPlastic)
  lintel.CFrame = base * CFrame.new(0, h + 1.9, 0)
  local lintel2 = bpart(m, "Lintel2", Vector3.new(3.2, 0.3, 0.5), BUILDING_COLOR.shrine, Enum.Material.SmoothPlastic)
  lintel2.CFrame = base * CFrame.new(0, h + 1.3, 0)
  return basePad
end

function VillageView:_makeBuilding(idx, cell)
  local def = Buildings.buildingById(cell.id)
  local h = 2 + math.min(cell.level, 12) * 0.5
  local base = self:_cellCFrame(idx)

  local model = Instance.new("Model")
  model.Name = "B" .. idx .. "_" .. cell.id
  model.Parent = self.buildingsFolder

  local builder = BUILDERS[cell.id]
  local primary
  if builder then
    primary = builder(model, base, h, cell.level)
  else
    primary = bpart(model, "Body", Vector3.new(PLOT - 1.6, h, PLOT - 1.6),
      Color3.fromRGB(180, 180, 180), Enum.Material.SmoothPlastic)
    primary.CFrame = base * CFrame.new(0, h / 2 + 0.3, 0)
  end
  model.PrimaryPart = primary

  local bb = Instance.new("BillboardGui")
  bb.Size = UDim2.fromScale(3, 3)
  bb.StudsOffsetWorldSpace = Vector3.new(0, h + 2.6, 0)
  bb.AlwaysOnTop = false
  bb.Parent = primary
  local tl = Instance.new("TextLabel")
  tl.BackgroundTransparency = 1
  tl.Size = UDim2.fromScale(1, 1)
  tl.Font = Enum.Font.GothamBold
  tl.TextScaled = true
  tl.TextColor3 = Color3.fromRGB(255, 255, 255)
  tl.TextStrokeTransparency = 0.3
  tl.Text = (def and def.emoji or "🏠") .. " L" .. cell.level
  tl.Parent = bb

  Effects.pop(primary, 1.15, 0.16)
  return model
end

-- A placement preview isn't state — just briefly light the plot.
function VillageView:previewCell(idx)
  local plot = self.plots[idx]
  if plot then
    Effects.pop(plot, 1.1, 0.12)
  end
end

function VillageView:flashPayout(cellIdx, text)
  local pos
  if cellIdx and self.plots[cellIdx] then
    pos = self.plots[cellIdx].Position + Vector3.new(0, 3, 0)
  else
    pos = self:centerWorld()
  end
  Effects.floatLabel(text, pos, Color3.fromRGB(255, 224, 130))
end

function VillageView:pulseDay(day)
  local p = self.model.PrimaryPart
  if p then
    Effects.pop(p, 1.02, 0.14)
  end
end

function VillageView:celebrate()
  for _, m in self.cellParts do
    if m and m.PrimaryPart then
      Effects.pop(m.PrimaryPart, 1.2, 0.2)
    end
  end
end

function VillageView:festival()
  Effects.floatLabel("🏮 Festival! +50% sp", self:centerWorld(), Color3.fromRGB(255, 170, 90))
  for _, m in self.cellParts do
    if m and m.PrimaryPart then
      Effects.pop(m.PrimaryPart, 1.12, 0.22)
    end
  end
end

function VillageView:destroy()
  if self.model then
    self.model:Destroy()
    self.model = nil
  end
end

return VillageView
