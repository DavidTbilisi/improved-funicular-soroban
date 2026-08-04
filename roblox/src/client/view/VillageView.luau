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

function VillageView:_makeBuilding(idx, cell)
  local def = Buildings.buildingById(cell.id)
  local height = 2 + math.min(cell.level, 12) * 0.5
  local part = Instance.new("Part")
  part.Name = "B" .. idx .. "_" .. cell.id
  part.Anchored = true
  part.CanCollide = false
  part.Size = Vector3.new(PLOT - 1.6, height, PLOT - 1.6)
  part.Color = (def and BUILDING_COLOR[cell.id]) or Color3.fromRGB(180, 180, 180)
  part.Material = Enum.Material.SmoothPlastic
  part.CFrame = self:_cellCFrame(idx) * CFrame.new(0, height / 2 + 0.3, 0)
  part.Parent = self.buildingsFolder

  local bb = Instance.new("BillboardGui")
  bb.Size = UDim2.fromScale(3, 3)
  bb.StudsOffsetWorldSpace = Vector3.new(0, height / 2 + 1.4, 0)
  bb.AlwaysOnTop = false
  bb.Parent = part
  local tl = Instance.new("TextLabel")
  tl.BackgroundTransparency = 1
  tl.Size = UDim2.fromScale(1, 1)
  tl.Font = Enum.Font.GothamBold
  tl.TextScaled = true
  tl.TextColor3 = Color3.fromRGB(255, 255, 255)
  tl.TextStrokeTransparency = 0.3
  tl.Text = (def and def.emoji or "🏠") .. " L" .. cell.level
  tl.Parent = bb

  Effects.pop(part, 1.15, 0.16)
  return part
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
    if m then
      Effects.pop(m, 1.2, 0.2)
    end
  end
end

function VillageView:festival()
  Effects.floatLabel("🏮 Festival! +50% sp", self:centerWorld(), Color3.fromRGB(255, 170, 90))
  for _, m in self.cellParts do
    if m then
      Effects.pop(m, 1.12, 0.22)
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
