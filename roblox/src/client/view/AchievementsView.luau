--!nonstrict
-- ============================================================================
-- AchievementsView — the unlock toast + a browsable panel with progress bars.
-- Roblox counterpart of src/view/game/achievementsView.js. The controller
-- feeds it unlock events and the tracker's live states.
-- ============================================================================
local TweenService = game:GetService("TweenService")

local TEXT = Color3.fromRGB(236, 238, 244)
local DARK = Color3.fromRGB(28, 30, 38)
local PANEL = Color3.fromRGB(44, 47, 60)
local TIER_COLOR = {
  bronze = Color3.fromRGB(176, 124, 78),
  silver = Color3.fromRGB(176, 184, 196),
  gold = Color3.fromRGB(224, 190, 90),
}

local function mk(class, props, parent)
  local o = Instance.new(class)
  for k, v in props do
    o[k] = v
  end
  if parent then
    o.Parent = parent
  end
  return o
end
local function corner(o, r)
  mk("UICorner", { CornerRadius = UDim.new(0, r or 8) }, o)
end

local AchievementsView = {}
AchievementsView.__index = AchievementsView

function AchievementsView.new(opts)
  local self = setmetatable({}, AchievementsView)
  local gui = mk("ScreenGui", { Name = "SorobanVillageAchievements", ResetOnSpawn = false, IgnoreGuiInset = true }, opts.parent)
  self.gui = gui

  -- toast (top-center, hidden off-screen)
  local toast = mk("Frame", {
    Size = UDim2.new(0, 340, 0, 56), Position = UDim2.new(0.5, -170, 0, -70),
    BackgroundColor3 = DARK, BorderSizePixel = 0,
  }, gui)
  corner(toast, 10)
  self.toastFrame = toast
  self.toastLabel = mk("TextLabel", {
    BackgroundTransparency = 1, Size = UDim2.new(1, -12, 1, -8), Position = UDim2.fromOffset(6, 4),
    TextColor3 = TEXT, Font = Enum.Font.GothamBold, TextScaled = false, TextSize = 15,
    TextWrapped = true, Text = "",
  }, toast)

  -- panel (hidden)
  local panel = mk("Frame", {
    Size = UDim2.new(0, 420, 0, 460), Position = UDim2.new(0.5, -210, 0.5, -230),
    BackgroundColor3 = DARK, BorderSizePixel = 0, Visible = false,
  }, gui)
  corner(panel, 12)
  self.panel = panel
  mk("TextLabel", {
    BackgroundTransparency = 1, Size = UDim2.new(1, -16, 0, 30), Position = UDim2.fromOffset(8, 6),
    TextColor3 = TEXT, Font = Enum.Font.GothamBold, TextScaled = false, TextSize = 18,
    Text = "🏅 Achievements", TextXAlignment = Enum.TextXAlignment.Left,
  }, panel)
  local close = mk("TextButton", {
    Size = UDim2.fromOffset(28, 28), Position = UDim2.new(1, -34, 0, 6),
    BackgroundColor3 = PANEL, Text = "✖", TextColor3 = TEXT, Font = Enum.Font.GothamBold, TextSize = 14, BorderSizePixel = 0,
  }, panel)
  corner(close, 6)
  close.Activated:Connect(function()
    self:hide()
  end)
  self.list = mk("ScrollingFrame", {
    Size = UDim2.new(1, -16, 1, -46), Position = UDim2.fromOffset(8, 40),
    BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 6,
    CanvasSize = UDim2.new(0, 0, 0, 0), AutomaticCanvasSize = Enum.AutomaticSize.Y,
  }, panel)
  mk("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, self.list)
  return self
end

function AchievementsView:toast(achievement)
  self.toastLabel.Text = string.format("🏅 Unlocked: %s %s\n%s", achievement.emoji, achievement.title, achievement.desc)
  local frame = self.toastFrame
  TweenService:Create(frame, TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
    Position = UDim2.new(0.5, -170, 0, 54),
  }):Play()
  task.delay(3.2, function()
    if frame and frame.Parent then
      TweenService:Create(frame, TweenInfo.new(0.3), { Position = UDim2.new(0.5, -170, 0, -70) }):Play()
    end
  end)
end

function AchievementsView:render(states)
  for _, c in self.list:GetChildren() do
    if c:IsA("Frame") then
      c:Destroy()
    end
  end
  for i, s in states do
    local row = mk("Frame", { Size = UDim2.new(1, 0, 0, 48), BackgroundColor3 = PANEL, LayoutOrder = i, BorderSizePixel = 0 }, self.list)
    corner(row, 8)
    mk("TextLabel", {
      BackgroundTransparency = 1, Size = UDim2.new(1, -12, 0, 20), Position = UDim2.fromOffset(8, 4),
      TextColor3 = if s.done then (TIER_COLOR[s.tier] or TEXT) else TEXT,
      Font = Enum.Font.GothamBold, TextScaled = false, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left,
      Text = string.format("%s %s  %s", s.emoji, s.title, if s.done then "✓" else ""),
    }, row)
    mk("TextLabel", {
      BackgroundTransparency = 1, Size = UDim2.new(1, -12, 0, 16), Position = UDim2.fromOffset(8, 24),
      TextColor3 = Color3.fromRGB(180, 186, 200), Font = Enum.Font.Gotham, TextScaled = false, TextSize = 11,
      TextXAlignment = Enum.TextXAlignment.Left,
      Text = string.format("%s   (%d / %d)", s.desc, s.cur, s.target),
    }, row)
    -- progress bar
    local track = mk("Frame", { Size = UDim2.new(1, -16, 0, 3), Position = UDim2.new(0, 8, 1, -6), BackgroundColor3 = Color3.fromRGB(60, 64, 78), BorderSizePixel = 0 }, row)
    local frac = if s.target > 0 then math.clamp(s.cur / s.target, 0, 1) else 1
    mk("Frame", { Size = UDim2.new(frac, 0, 1, 0), BackgroundColor3 = TIER_COLOR[s.tier] or TEXT, BorderSizePixel = 0 }, track)
  end
end

function AchievementsView:toggle(states)
  if self.panel.Visible then
    self:hide()
  else
    self:render(states)
    self.panel.Visible = true
  end
end

function AchievementsView:hide()
  self.panel.Visible = false
end

function AchievementsView:destroy()
  if self.gui then
    self.gui:Destroy()
    self.gui = nil
  end
end

return AchievementsView
