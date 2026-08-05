--!nonstrict
-- ============================================================================
-- AnzanView — the flash-anzan lantern stall: numbers flash on a hanging sign
-- and vanish; the answer comes from the imagined board. A pure renderer over
-- AnzanSession's events plus an intent surface (level picks, speed, submit).
--
--   world side: posts + crossbeam + glowing lantern + the sign (SurfaceGui
--     with one huge label — the flash — plus progress and pace captions),
--     and a ProximityPrompt exposed as `stallPrompt`.
--   screen side: a PlayerGui panel with the 9 rungs (best/fastest chips from
--     village.anzan), speed − / + , a TextBox answer (mobile keyboard for
--     free; BoardHotkeys already ignores keys while a TextBox has focus).
--
--   cb: { onStart(levelId), onSpeed(dir), onSubmit(text), onStop() }
-- ============================================================================
local RS = game:GetService("ReplicatedStorage")
local Levels = if script
  then require(RS:WaitForChild("SorobanVillage"):WaitForChild("anzan"):WaitForChild("Levels"))
  else require("../../shared/anzan/Levels")
local Effects = if script then require(script.Parent:WaitForChild("Effects")) else require("./Effects")

local DARK = Color3.fromRGB(28, 30, 38)
local PANEL = Color3.fromRGB(38, 41, 52)
local TEXT = Color3.fromRGB(236, 238, 244)
local ACCENT = Color3.fromRGB(120, 200, 255)
local LANTERN = Color3.fromRGB(255, 176, 92)
local WOOD = Color3.fromRGB(96, 70, 48)

local AnzanView = {}
AnzanView.__index = AnzanView

local function mk(class, props, parent)
  local inst = Instance.new(class)
  for k, v in props do
    inst[k] = v
  end
  inst.Parent = parent
  return inst
end

local function corner(inst, r)
  mk("UICorner", { CornerRadius = UDim.new(0, r) }, inst)
end

function AnzanView.new(opts)
  local self = setmetatable({}, AnzanView)
  self.cb = opts.cb or {}
  self.cframe = opts.cframe or CFrame.new(-26, 0, 34)
  self.currentLevelId = nil

  self:_buildStall(opts.parent or workspace)
  self:_buildPanel(opts.playerGui)
  return self
end

-- --- the stall ---------------------------------------------------------------
function AnzanView:_buildStall(parent)
  local m = Instance.new("Model")
  m.Name = "AnzanStall"
  m.Parent = parent
  self.model = m

  local function part(name, size, color, material, cf, canCollide)
    local p = Instance.new("Part")
    p.Name = name
    p.Anchored = true
    p.CanCollide = canCollide ~= false
    p.Size = size
    p.Color = color
    p.Material = material
    p.CFrame = self.cframe * cf
    p.Parent = m
    return p
  end

  part("PostL", Vector3.new(0.5, 8, 0.5), WOOD, Enum.Material.Wood, CFrame.new(-4, 4, 0))
  part("PostR", Vector3.new(0.5, 8, 0.5), WOOD, Enum.Material.Wood, CFrame.new(4, 4, 0))
  part("Beam", Vector3.new(8.8, 0.5, 0.5), WOOD, Enum.Material.Wood, CFrame.new(0, 8.1, 0))
  local lantern = part("Lantern", Vector3.new(1.4, 1.7, 1.4), LANTERN, Enum.Material.Neon, CFrame.new(0, 7, 0), false)
  self.lantern = lantern
  local light = Instance.new("PointLight")
  light.Color = LANTERN
  light.Range = 14
  light.Brightness = 1.4
  light.Parent = lantern

  local sign = part("Sign", Vector3.new(7.4, 4.2, 0.4), Color3.fromRGB(24, 20, 18), Enum.Material.Wood, CFrame.new(0, 4.2, 0))
  self.sign = sign

  local gui = Instance.new("SurfaceGui")
  gui.Face = Enum.NormalId.Back -- the face the anzan camera looks at
  gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
  gui.PixelsPerStud = 50
  gui.LightInfluence = 0
  gui.Parent = sign

  self.flashLabel = mk("TextLabel", {
    BackgroundTransparency = 1, Size = UDim2.fromScale(1, 0.62), Position = UDim2.fromScale(0, 0.14),
    Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = LANTERN, Text = "🏮",
  }, gui)
  self.progressLabel = mk("TextLabel", {
    BackgroundTransparency = 1, Size = UDim2.fromScale(1, 0.12), Position = UDim2.fromScale(0, 0.02),
    Font = Enum.Font.Gotham, TextScaled = true, TextColor3 = TEXT, Text = "flash anzan",
  }, gui)
  self.paceLabel = mk("TextLabel", {
    BackgroundTransparency = 1, Size = UDim2.fromScale(1, 0.12), Position = UDim2.fromScale(0, 0.84),
    Font = Enum.Font.Gotham, TextScaled = true, TextColor3 = Color3.fromRGB(150, 156, 170), Text = "",
  }, gui)

  local prompt = Instance.new("ProximityPrompt")
  prompt.ActionText = "Practice anzan"
  prompt.ObjectText = "🏮 Flash lantern"
  prompt.HoldDuration = 0.25
  prompt.MaxActivationDistance = 12
  prompt.RequiresLineOfSight = false
  prompt.Parent = sign
  self.stallPrompt = prompt
end

-- --- the panel ---------------------------------------------------------------
function AnzanView:_buildPanel(playerGui)
  local gui = mk("ScreenGui", { Name = "SorobanAnzan", ResetOnSpawn = false, IgnoreGuiInset = false }, playerGui)
  self.gui = gui

  local panel = mk("Frame", {
    Size = UDim2.new(0, 250, 1, -120), Position = UDim2.new(1, -262, 0, 56),
    BackgroundColor3 = DARK, BackgroundTransparency = 0.15, BorderSizePixel = 0, Visible = false,
  }, gui)
  corner(panel, 10)
  self.panel = panel

  local scroll = mk("ScrollingFrame", {
    Size = UDim2.new(1, -16, 1, -16), Position = UDim2.fromOffset(8, 8),
    BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 6,
    AutomaticCanvasSize = Enum.AutomaticSize.Y, CanvasSize = UDim2.new(),
  }, panel)
  mk("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

  local function button(text, color, fn)
    local b = mk("TextButton", {
      Size = UDim2.new(1, 0, 0, 32), BackgroundColor3 = color, BorderSizePixel = 0,
      Font = Enum.Font.Gotham, TextScaled = true, TextColor3 = TEXT, Text = text,
    }, scroll)
    corner(b, 8)
    b.Activated:Connect(fn)
    return b
  end

  button("🚶 Walk away", Color3.fromRGB(60, 90, 120), function()
    if self.cb.onStop then
      self.cb.onStop()
    end
  end)

  mk("TextLabel", {
    Size = UDim2.new(1, 0, 0, 24), BackgroundTransparency = 1, Font = Enum.Font.GothamBold,
    TextScaled = true, TextColor3 = TEXT, Text = "🏮 Flash anzan", TextXAlignment = Enum.TextXAlignment.Left,
  }, scroll)

  -- speed row
  local speedRow = mk("Frame", { Size = UDim2.new(1, 0, 0, 30), BackgroundTransparency = 1 }, scroll)
  local slower = mk("TextButton", {
    Size = UDim2.new(0, 40, 1, 0), BackgroundColor3 = PANEL, BorderSizePixel = 0,
    Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = TEXT, Text = "−",
  }, speedRow)
  corner(slower, 8)
  self.speedLabel = mk("TextLabel", {
    Size = UDim2.new(1, -90, 1, 0), Position = UDim2.fromOffset(45, 0), BackgroundTransparency = 1,
    Font = Enum.Font.Gotham, TextScaled = true, TextColor3 = ACCENT, Text = "speed",
  }, speedRow)
  local faster = mk("TextButton", {
    Size = UDim2.new(0, 40, 1, 0), Position = UDim2.new(1, -40, 0, 0), BackgroundColor3 = PANEL,
    BorderSizePixel = 0, Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = TEXT, Text = "+",
  }, speedRow)
  corner(faster, 8)
  slower.Activated:Connect(function()
    if self.cb.onSpeed then
      self.cb.onSpeed(-1)
    end
  end)
  faster.Activated:Connect(function()
    if self.cb.onSpeed then
      self.cb.onSpeed(1)
    end
  end)

  -- answer row (shown during the answer phase)
  self.answerBox = mk("TextBox", {
    Size = UDim2.new(1, 0, 0, 34), BackgroundColor3 = PANEL, BorderSizePixel = 0,
    Font = Enum.Font.GothamBold, TextScaled = true, TextColor3 = TEXT, Text = "",
    PlaceholderText = "sum?", ClearTextOnFocus = false, Visible = false,
  }, scroll)
  corner(self.answerBox, 8)
  self.answerBox.FocusLost:Connect(function(enterPressed)
    if enterPressed and self.cb.onSubmit then
      self.cb.onSubmit(self.answerBox.Text)
    end
  end)
  self.submitBtn = button("✔ Submit", Color3.fromRGB(78, 168, 96), function()
    if self.cb.onSubmit then
      self.cb.onSubmit(self.answerBox.Text)
    end
  end)
  self.submitBtn.Visible = false

  mk("TextLabel", {
    Size = UDim2.new(1, 0, 0, 22), BackgroundTransparency = 1, Font = Enum.Font.GothamBold,
    TextScaled = true, TextColor3 = TEXT, Text = "Rungs", TextXAlignment = Enum.TextXAlignment.Left,
  }, scroll)

  self.rungButtons = {}
  for _, level in Levels.ANZAN_LEVELS do
    local b = button(level.title, PANEL, function()
      if self.cb.onStart then
        self.cb.onStart(level.id)
      end
    end)
    b.Size = UDim2.new(1, 0, 0, 40)
    self.rungButtons[level.id] = b
  end
end

-- --- state in ----------------------------------------------------------------
-- Refresh the per-rung chips from village.anzan ({best, fastest} by id).
function AnzanView:setRecords(anzan)
  for id, b in self.rungButtons do
    local level = Levels.levelById(id)
    local best = anzan and anzan.best and anzan.best[id]
    local fastest = anzan and anzan.fastest and anzan.fastest[id]
    local meta = ""
    if best and best > 0 then
      meta = ("  · best %d"):format(best)
    end
    if fastest then
      meta = meta .. ("  · ⚡%dms"):format(fastest)
    end
    b.Text = level.title .. meta
  end
end

function AnzanView:setPanelVisible(on)
  self.panel.Visible = on
  if not on then
    self.answerBox.Visible = false
    self.submitBtn.Visible = false
    self.flashLabel.Text = "🏮"
    self.progressLabel.Text = "flash anzan"
    self.paceLabel.Text = ""
  end
end

function AnzanView:onStarted(evt)
  self.currentLevelId = evt.levelId
  self.answerBox.Visible = false
  self.submitBtn.Visible = false
  self.paceLabel.Text = ("%d × %d digits @ %d ms"):format(evt.terms, evt.digits, evt.intervalMs)
  self.progressLabel.Text = evt.title
end

function AnzanView:onFlash(evt)
  self.flashLabel.Text = tostring(evt.value)
  self.progressLabel.Text = ("%d / %d"):format(evt.index + 1, evt.total)
end

function AnzanView:onBlank()
  self.flashLabel.Text = "" -- the gap is load-bearing
end

function AnzanView:onAnswer()
  self.flashLabel.Text = "= ?"
  self.answerBox.Text = ""
  self.answerBox.Visible = true
  self.submitBtn.Visible = true
  self.answerBox:CaptureFocus()
end

function AnzanView:onResult(evt)
  self.answerBox.Visible = false
  self.submitBtn.Visible = false
  self.flashLabel.Text = (if evt.ok then "✓ " else "✗ ") .. evt.sum
  if evt.ok then
    Effects.pop(self.lantern, 1.35, 0.25)
  end
end

function AnzanView:onSpeed(evt)
  self.paceLabel.Text = ("@ %d ms · round %0.1f s"):format(evt.intervalMs, evt.roundMs / 1000)
end

function AnzanView:destroy()
  if self.model then
    self.model:Destroy()
  end
  if self.gui then
    self.gui:Destroy()
  end
end

return AnzanView
