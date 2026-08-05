--!nonstrict
-- ============================================================================
-- VillagerView — the village looks inhabited. Cheap block-figures (no
-- Humanoid, no pathfinding: two parts and a tween) wander between plot
-- centers, pausing as if on errands. Pure ambience, zero game state — the
-- controller feeds it a population count derived from hut levels, and an
-- "elder" in shrine red appears once a shrine stands.
-- ============================================================================
local Effects = if script then require(script.Parent:WaitForChild("Effects")) else require("./Effects")

local PALETTE = {
  Color3.fromRGB(94, 134, 168),
  Color3.fromRGB(168, 128, 84),
  Color3.fromRGB(120, 150, 96),
  Color3.fromRGB(160, 108, 128),
  Color3.fromRGB(140, 140, 100),
}
local ELDER = Color3.fromRGB(200, 84, 84)
local SKIN = Color3.fromRGB(232, 196, 160)
local WALK_STUDS_PER_S = 3

local VillagerView = {}
VillagerView.__index = VillagerView

-- opts.spotFor(): -> CFrame — a ground-level point worth walking to (the
-- controller passes a picker over the village's plot centers).
function VillagerView.new(opts)
  local self = setmetatable({}, VillagerView)
  self.spotFor = opts.spotFor or function()
    return CFrame.new(math.random(-20, 20), 0, math.random(-14, 14))
  end
  self.folder = Instance.new("Folder")
  self.folder.Name = "Villagers"
  self.folder.Parent = opts.parent or workspace
  self.villagers = {} -- array of { model, gen }
  self.gen = 0
  self.elder = false
  return self
end

local function makeFigure(parent, color)
  local m = Instance.new("Model")
  m.Name = "Villager"
  local torso = Instance.new("Part")
  torso.Name = "Torso"
  torso.Anchored = true
  torso.CanCollide = false
  torso.Size = Vector3.new(0.9, 1.3, 0.55)
  torso.Color = color
  torso.Material = Enum.Material.SmoothPlastic
  torso.Parent = m
  local head = Instance.new("Part")
  head.Name = "Head"
  head.Anchored = true
  head.CanCollide = false
  head.Shape = Enum.PartType.Ball
  head.Size = Vector3.new(0.7, 0.7, 0.7)
  head.Color = SKIN
  head.Material = Enum.Material.SmoothPlastic
  head.Parent = m
  m.PrimaryPart = torso
  m.Parent = parent
  return m
end

function VillagerView:_wander(entry)
  local myGen = entry.gen
  task.spawn(function()
    while entry.model.Parent and entry.gen == myGen do
      local target = self.spotFor()
      local from = entry.model:GetPivot().Position
      local to = target.Position
      local dist = (Vector3.new(to.X, 0, to.Z) - Vector3.new(from.X, 0, from.Z)).Magnitude
      if dist > 0.5 then
        local look = CFrame.lookAt(Vector3.new(from.X, 1.15, from.Z), Vector3.new(to.X, 1.15, to.Z))
        local seconds = dist / WALK_STUDS_PER_S
        -- tween the torso; the head is re-seated each step by pivot math
        local goal = CFrame.new(to.X, 1.15, to.Z) * (look - look.Position)
        local steps = math.max(1, math.floor(seconds * 10))
        for s = 1, steps do
          if not entry.model.Parent or entry.gen ~= myGen then
            return
          end
          local u = s / steps
          local pos = Vector3.new(from.X, 1.15, from.Z):Lerp(Vector3.new(to.X, 1.15, to.Z), u)
          local bob = math.abs(math.sin(u * dist * 2)) * 0.12
          entry.model:PivotTo(CFrame.new(pos + Vector3.new(0, bob, 0)) * (goal - goal.Position))
          entry.model.Head.CFrame = entry.model.Torso.CFrame * CFrame.new(0, 1.05, 0)
          task.wait(seconds / steps)
        end
      end
      task.wait(1 + math.random() * 2.5)
    end
  end)
end

-- Population = how many figures wander; elder = one robed in shrine red.
function VillagerView:setPopulation(n, elder)
  n = math.clamp(n, 0, 12)
  elder = elder == true
  if n == #self.villagers and elder == self.elder then
    return
  end
  self.gen += 1
  for _, entry in self.villagers do
    entry.gen = -1
    entry.model:Destroy()
  end
  self.villagers = {}
  self.elder = elder
  for i = 1, n do
    local color = if elder and i == 1 then ELDER else PALETTE[(i % #PALETTE) + 1]
    local model = makeFigure(self.folder, color)
    model:PivotTo(self.spotFor() * CFrame.new(0, 1.15, 0))
    model.Head.CFrame = model.Torso.CFrame * CFrame.new(0, 1.05, 0)
    local entry = { model = model, gen = self.gen }
    table.insert(self.villagers, entry)
    Effects.pop(model.PrimaryPart, 1.3, 0.25)
    self:_wander(entry)
  end
end

function VillagerView:destroy()
  self.gen += 1
  if self.folder then
    self.folder:Destroy()
    self.folder = nil
  end
  self.villagers = {}
end

return VillagerView
