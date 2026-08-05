--!nonstrict
-- ============================================================================
-- LightingMood — the sky as a consequence of practice. One village day passes
-- per solved contract, so the sun sweeps morning → evening over six solves and
-- wraps to a fresh morning (always daylight — a village you can't see isn't a
-- reward). A festival overrides everything with warm lantern dusk for as long
-- as its days last. Pure mood, no game state: the controller feeds it the same
-- day/festival numbers every other view gets.
-- ============================================================================
local Lighting = game:GetService("Lighting")
local Effects = if script then require(script.Parent:WaitForChild("Effects")) else require("./Effects")

local DAY_START = 8 -- 8:00, a new morning
local DAY_END = 17 -- 17:00, evening on the sixth solve
local DAY_SPAN = 6 -- solves per sweep
local FESTIVAL_CLOCK = 18.2 -- lantern dusk

local AMBIENT_DAY = Color3.fromRGB(96, 100, 110)
local AMBIENT_DUSK = Color3.fromRGB(128, 84, 58)
local OUTDOOR_DAY = Color3.fromRGB(128, 128, 128)
local OUTDOOR_DUSK = Color3.fromRGB(150, 96, 64)
local LANTERN = Color3.fromRGB(255, 176, 92)

local LightingMood = {}
LightingMood.__index = LightingMood

function LightingMood.new(opts)
  local self = setmetatable({}, LightingMood)
  self.festival = false

  Lighting.Brightness = 2
  Lighting.Ambient = AMBIENT_DAY
  Lighting.OutdoorAmbient = OUTDOOR_DAY
  Lighting.ClockTime = DAY_START
  if not Lighting:FindFirstChildOfClass("Atmosphere") then
    local atmo = Instance.new("Atmosphere")
    atmo.Density = 0.35
    atmo.Haze = 1.2
    atmo.Parent = Lighting
  end

  -- Lanterns around the village perimeter — lit only during a festival.
  self.lanterns = Instance.new("Folder")
  self.lanterns.Name = "FestivalLanterns"
  self.lanterns.Parent = opts and opts.parent or workspace
  local origin = (opts and opts.origin or CFrame.new()).Position
  for i = 1, 6 do
    local angle = i / 6 * 2 * math.pi
    local pos = origin + Vector3.new(math.cos(angle) * 32, 5.5, math.sin(angle) * 24)
    local post = Instance.new("Part")
    post.Name = "LanternPost" .. i
    post.Anchored = true
    post.Size = Vector3.new(0.4, 11, 0.4)
    post.Color = Color3.fromRGB(70, 52, 40)
    post.Material = Enum.Material.Wood
    post.CFrame = CFrame.new(pos.X, 2.75, pos.Z)
    post.Parent = self.lanterns
    local lamp = Instance.new("Part")
    lamp.Name = "Lantern" .. i
    lamp.Anchored = true
    lamp.CanCollide = false
    lamp.Shape = Enum.PartType.Ball
    lamp.Size = Vector3.new(1.3, 1.3, 1.3)
    lamp.Color = LANTERN
    lamp.Material = Enum.Material.Neon
    lamp.Transparency = 1 -- unlit until a festival
    lamp.CFrame = CFrame.new(pos)
    lamp.Parent = self.lanterns
    local light = Instance.new("PointLight")
    light.Color = LANTERN
    light.Range = 16
    light.Brightness = 1.6
    light.Enabled = false
    light.Parent = lamp
  end
  return self
end

function LightingMood:_clockForDay(day)
  local step = (math.max(1, day) - 1) % DAY_SPAN
  return DAY_START + step * (DAY_END - DAY_START) / (DAY_SPAN - 1)
end

function LightingMood:setDay(day)
  self.day = day
  if self.festival then
    return -- the festival owns the sky until its days burn down
  end
  Effects.tween(Lighting, 1.5, { ClockTime = self:_clockForDay(day) })
end

function LightingMood:setFestival(on)
  if on == self.festival then
    return
  end
  self.festival = on
  if on then
    Effects.tween(Lighting, 1.5, {
      ClockTime = FESTIVAL_CLOCK, Ambient = AMBIENT_DUSK, OutdoorAmbient = OUTDOOR_DUSK,
    })
  else
    Effects.tween(Lighting, 1.5, {
      ClockTime = self:_clockForDay(self.day or 1), Ambient = AMBIENT_DAY, OutdoorAmbient = OUTDOOR_DAY,
    })
  end
  for _, inst in self.lanterns:GetDescendants() do
    if inst:IsA("PointLight") then
      inst.Enabled = on
    elseif inst:IsA("BasePart") and inst.Name:match("^Lantern%d") then
      Effects.tween(inst, 0.6, { Transparency = if on then 0 else 1 })
    end
  end
end

function LightingMood:destroy()
  if self.lanterns then
    self.lanterns:Destroy()
    self.lanterns = nil
  end
end

return LightingMood
