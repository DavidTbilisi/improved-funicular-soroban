--!nonstrict
-- ============================================================================
-- WorldView — the walkable overworld: the day-boundary ring, the gather nodes
-- (trees / berry bushes / coin caches with ProximityPrompts), and the counting
-- table that anchors the soroban. A pure renderer + intent surface over
-- shared/game/World: it holds no game state — the controller tells it which
-- day to show and it reports harvests and table use back through callbacks.
--
--   setDay(day)          -- (re)fit the boundary + spawn any newly-in-range
--                           nodes; returns true when the boundary moved
--   consume(id, gains)   -- hide a harvested node, float its yield, respawn it
--   onGather(id, kind)   -- injected: a node's prompt was triggered
--   onUseBoard()         -- injected: the counting-table prompt was triggered
--
-- Respawn timers are client-side (task.delay) on purpose: nodes are per-player
-- scenery in a client-authoritative solo game, not shared server state.
-- ============================================================================
local RS = game:GetService("ReplicatedStorage")
local World = if script
  then require(RS.SorobanVillage.game.World)
  else require("../../shared/game/World")
local Buildings = if script
  then require(RS.SorobanVillage.game.Buildings)
  else require("../../shared/game/Buildings")
local Effects = if script then require(script.Parent:WaitForChild("Effects")) else require("./Effects")

local RES_EMOJI = Buildings.RES_EMOJI

local FENCE_SEGMENTS = 28
local FENCE_HEIGHT = 14

local COLOR_TRUNK = Color3.fromRGB(110, 82, 54)
local COLOR_LEAVES = Color3.fromRGB(58, 132, 66)
local COLOR_BUSH = Color3.fromRGB(74, 122, 60)
local COLOR_BERRY = Color3.fromRGB(112, 78, 180)
local COLOR_COIN = Color3.fromRGB(226, 184, 66)
local COLOR_FENCE = Color3.fromRGB(120, 200, 255)
local COLOR_WOOD = Color3.fromRGB(96, 70, 48)

local WorldView = {}
WorldView.__index = WorldView

local function newPart(name, size, color, parent, material)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.Size = size
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = parent
  return p
end

function WorldView.new(opts)
  local self = setmetatable({}, WorldView)
  self.onGather = opts.onGather or function() end
  self.onUseBoard = opts.onUseBoard or function() end
  self.parent = opts.parent or workspace
  self.boardCFrame = opts.boardCFrame or CFrame.new(0, 12, 30)

  self.model = Instance.new("Model")
  self.model.Name = "SorobanWorld"
  self.model.Parent = self.parent

  self.fenceFolder = Instance.new("Folder")
  self.fenceFolder.Name = "Boundary"
  self.fenceFolder.Parent = self.model
  self.nodeFolder = Instance.new("Folder")
  self.nodeFolder.Name = "GatherNodes"
  self.nodeFolder.Parent = self.model

  self.nodes = {} -- [id] = { model, prompt, parts = {part -> baseTransparency} }
  self.radius = nil
  self.day = 0

  self:_buildStand()
  return self
end

-- --- the counting table ------------------------------------------------------
-- The board floats as a monument; the stand roots it to the ground and carries
-- the "sit down and reckon" prompt that flips the controller into board mode.
function WorldView:_buildStand()
  local base = self.boardCFrame.Position
  local stand = Instance.new("Model")
  stand.Name = "CountingTable"
  stand.Parent = self.model

  -- dais the player walks onto
  local dais = newPart("Dais", Vector3.new(14, 1, 8), COLOR_WOOD, stand, Enum.Material.WoodPlanks)
  dais.CFrame = CFrame.new(base.X, 0.5, base.Z)
  -- two posts up to the board's underside
  for _, dx in { -8, 8 } do
    local post = newPart("Post", Vector3.new(1, base.Y - 1, 1), COLOR_WOOD, stand, Enum.Material.Wood)
    post.CFrame = CFrame.new(base.X + dx, (base.Y - 1) / 2 + 1, base.Z)
  end

  local prompt = Instance.new("ProximityPrompt")
  prompt.ActionText = "Use the soroban"
  prompt.ObjectText = "🧮 Counting table"
  prompt.HoldDuration = 0.25
  prompt.MaxActivationDistance = 14
  prompt.RequiresLineOfSight = false
  prompt.Parent = dais
  prompt.Triggered:Connect(function()
    self.onUseBoard()
  end)
  self.standPrompt = prompt
end

-- --- the boundary ------------------------------------------------------------
function WorldView:_setFence(radius)
  self.fenceFolder:ClearAllChildren()
  local segLen = 2 * math.pi * radius / FENCE_SEGMENTS + 1
  for i = 1, FENCE_SEGMENTS do
    local angle = i / FENCE_SEGMENTS * 2 * math.pi
    local seg = newPart(
      "Fence" .. i,
      Vector3.new(segLen, FENCE_HEIGHT, 1),
      COLOR_FENCE,
      self.fenceFolder,
      Enum.Material.ForceField
    )
    seg.Transparency = 0.3
    seg.CFrame = CFrame.new(0, FENCE_HEIGHT / 2 - 0.5, 0)
      * CFrame.Angles(0, angle, 0)
      * CFrame.new(0, 0, -radius)
  end
end

-- --- gather nodes ------------------------------------------------------------
function WorldView:_makeNode(n)
  local def = World.GATHER[n.kind]
  local m = Instance.new("Model")
  m.Name = n.kind .. n.id
  m.Parent = self.nodeFolder

  local promptHost
  if n.kind == "tree" then
    local trunk = newPart("Trunk", Vector3.new(1.4, 6, 1.4), COLOR_TRUNK, m, Enum.Material.Wood)
    trunk.CFrame = CFrame.new(n.x, 3, n.z)
    local leaves = newPart("Leaves", Vector3.new(5.5, 5.5, 5.5), COLOR_LEAVES, m, Enum.Material.Grass)
    leaves.Shape = Enum.PartType.Ball
    leaves.CanCollide = false
    leaves.CFrame = CFrame.new(n.x, 7.5, n.z)
    promptHost = trunk
  elseif n.kind == "berry" then
    local bush = newPart("Bush", Vector3.new(3.2, 2.6, 3.2), COLOR_BUSH, m, Enum.Material.Grass)
    bush.Shape = Enum.PartType.Ball
    bush.CFrame = CFrame.new(n.x, 1.3, n.z)
    local berry = newPart("Berry", Vector3.new(0.8, 0.8, 0.8), COLOR_BERRY, m, Enum.Material.SmoothPlastic)
    berry.Shape = Enum.PartType.Ball
    berry.CanCollide = false
    berry.CFrame = CFrame.new(n.x + 0.9, 2.2, n.z + 0.5)
    promptHost = bush
  else -- coin cache
    local sack = newPart("Cache", Vector3.new(1.8, 1.4, 1.8), COLOR_COIN, m, Enum.Material.Metal)
    sack.CFrame = CFrame.new(n.x, 0.7, n.z)
    local light = Instance.new("PointLight")
    light.Color = COLOR_COIN
    light.Range = 6
    light.Brightness = 0.8
    light.Parent = sack
    promptHost = sack
  end

  local prompt = Instance.new("ProximityPrompt")
  prompt.ActionText = def.action
  prompt.ObjectText = def.emoji .. " " .. def.name
  prompt.HoldDuration = 0.4
  prompt.MaxActivationDistance = 10
  prompt.RequiresLineOfSight = false
  prompt.Parent = promptHost
  prompt.Triggered:Connect(function()
    self.onGather(n.id, n.kind)
  end)

  local parts = {}
  for _, p in m:GetDescendants() do
    if p:IsA("BasePart") then
      parts[p] = p.Transparency
    end
  end
  self.nodes[n.id] = { model = m, prompt = prompt, parts = parts, kind = n.kind }
  return self.nodes[n.id]
end

-- (Re)fit the world to a village day. Idempotent; spawns only what is newly in
-- range, so calling on every solve is cheap. Returns true when the map grew.
function WorldView:setDay(day)
  local radius = World.radiusForDay(day)
  local grew = self.radius ~= nil and radius > self.radius
  local firstFit = self.radius == nil
  if firstFit or grew then
    self:_setFence(radius)
  end
  self.radius = radius
  self.day = day
  for _, n in World.nodesUpTo(day) do
    if not self.nodes[n.id] then
      local node = self:_makeNode(n)
      if not firstFit then
        for p in node.parts do
          Effects.pop(p, 1.25, 0.3)
        end
      end
    end
  end
  return grew
end

-- A harvest: hide the node, float what it gave, bring it back after its rest.
function WorldView:consume(id, gains)
  local node = self.nodes[id]
  if not node or node.model.Parent == nil then
    return
  end
  local def = World.GATHER[node.kind]
  local pivot = node.model:GetPivot().Position

  local bits = {}
  for k, n in gains do
    table.insert(bits, "+" .. n .. " " .. (RES_EMOJI[k] or k))
  end
  Effects.floatLabel(table.concat(bits, "  "), pivot + Vector3.new(0, 3, 0), COLOR_COIN)

  node.prompt.Enabled = false
  for p in node.parts do
    p.Transparency = 1
    p.CanCollide = false
    p.CanQuery = false
  end
  task.delay(def.respawnS, function()
    if node.model.Parent == nil then
      return
    end
    for p, t in node.parts do
      p.Transparency = t
      p.CanQuery = true
      p.CanCollide = p.Name ~= "Leaves" and p.Name ~= "Berry"
      Effects.pop(p, 1.2, 0.25)
    end
    node.prompt.Enabled = true
  end)
end

function WorldView:destroy()
  if self.model then
    self.model:Destroy()
    self.model = nil
  end
end

return WorldView
