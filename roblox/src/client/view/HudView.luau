--!nonstrict
-- ============================================================================
-- HudView — the 2D ScreenGui: resource chips, contract list, build palette,
-- festival button, the active-contract panel with a die-cross keypad, and the
-- goal + advisor line. The Roblox counterpart of src/view/game/hudView.js. It
-- observes nothing directly — the controller drives it and passes intent
-- callbacks (a view emits intent, never mutates state).
-- ============================================================================
local RS = game:GetService("ReplicatedStorage")
local Buildings = if script then require(RS.SorobanVillage.game.Buildings) else require("../../shared/game/Buildings")
local Challenges = if script then require(RS.SorobanVillage.game.Challenges) else require("../../shared/game/Challenges")
local Rank = if script then require(RS.SorobanVillage.game.Rank) else require("../../shared/game/Rank")
local RES_EMOJI = Buildings.RES_EMOJI

local HudView = {}
HudView.__index = HudView

-- --- tiny GUI builder ------------------------------------------------------
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

local DARK = Color3.fromRGB(28, 30, 38)
local PANEL = Color3.fromRGB(38, 41, 52)
local ACCENT = Color3.fromRGB(120, 200, 255)
local GREEN = Color3.fromRGB(78, 168, 96)
local RED = Color3.fromRGB(196, 84, 84)
local TEXT = Color3.fromRGB(236, 238, 244)

local function corner(o, r)
  mk("UICorner", { CornerRadius = UDim.new(0, r or 8) }, o)
end

local function label(text, parent, props)
  local l = mk("TextLabel", {
    BackgroundTransparency = 1, Text = text, TextColor3 = TEXT,
    Font = Enum.Font.Gotham, TextScaled = true, Size = UDim2.fromScale(1, 1),
  }, parent)
  if props then
    for k, v in props do
      l[k] = v
    end
  end
  return l
end

local function button(text, parent, color, cb)
  local b = mk("TextButton", {
    Text = text, TextColor3 = TEXT, BackgroundColor3 = color or PANEL,
    Font = Enum.Font.GothamMedium, TextScaled = true, AutoButtonColor = true,
    BorderSizePixel = 0,
  }, parent)
  corner(b, 8)
  mk("UIPadding", { PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6) }, b)
  if cb then
    b.Activated:Connect(cb)
  end
  return b
end

-- --- construction ----------------------------------------------------------
function HudView.new(opts)
  local self = setmetatable({}, HudView)
  self.cb = opts.callbacks or {}
  self.selectedBuilding = nil
  self.buildButtons = {}

  -- Respect the GUI inset: with IgnoreGuiInset the top bar slid under Roblox's
  -- own top-left buttons and the sp chip was unreadable.
  local gui = mk("ScreenGui", { Name = "SorobanVillageHud", ResetOnSpawn = false, IgnoreGuiInset = false }, opts.parent)
  gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
  self.gui = gui

  self:_buildTopBar(gui)
  self:_buildSidePanel(gui)
  self:_buildContractPanel(gui)
  self:_buildBottom(gui)
  return self
end

function HudView:_buildTopBar(gui)
  local bar = mk("Frame", {
    Size = UDim2.new(1, 0, 0, 44), Position = UDim2.new(0, 0, 0, 0),
    BackgroundColor3 = DARK, BackgroundTransparency = 0.1, BorderSizePixel = 0,
  }, gui)
  mk("UIListLayout", {
    FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 8),
    VerticalAlignment = Enum.VerticalAlignment.Center, HorizontalAlignment = Enum.HorizontalAlignment.Left,
    SortOrder = Enum.SortOrder.LayoutOrder,
  }, bar)
  mk("UIPadding", { PaddingLeft = UDim.new(0, 12), PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4) }, bar)

  self.chips = {}
  local order = 1
  for _, k in { "sp", "food", "wood", "coin" } do
    local chip = mk("Frame", {
      Size = UDim2.new(0, 120, 1, -8), BackgroundColor3 = PANEL, LayoutOrder = order, BorderSizePixel = 0,
    }, bar)
    corner(chip, 8)
    self.chips[k] = label(RES_EMOJI[k] .. " 0", chip, { TextXAlignment = Enum.TextXAlignment.Center })
    order += 1
  end
  self.dayLabel = label("Day 1", mk("Frame", { Size = UDim2.new(0, 90, 1, -8), BackgroundColor3 = PANEL, LayoutOrder = order, BorderSizePixel = 0 }, bar))
  order += 1
  local rankFrame = mk("Frame", { Size = UDim2.new(0, 190, 1, -8), BackgroundColor3 = PANEL, LayoutOrder = order, BorderSizePixel = 0 }, bar)
  corner(rankFrame, 8)
  self.rankLabel = label("🏙️ Camp", rankFrame, { TextXAlignment = Enum.TextXAlignment.Center })
  order += 1

  self.soundBtn = mk("TextButton", {
    Size = UDim2.new(0, 44, 1, -8), BackgroundColor3 = PANEL, LayoutOrder = order, BorderSizePixel = 0,
    Font = Enum.Font.Gotham, TextScaled = true, Text = "🔊", TextColor3 = TEXT,
  }, bar)
  corner(self.soundBtn, 8)
  self.soundBtn.Activated:Connect(function()
    if self.cb.onToggleSound then
      self.cb.onToggleSound()
    end
  end)
end

function HudView:setSoundIcon(on)
  self.soundBtn.Text = if on then "🔊" else "🔇"
end

function HudView:_buildSidePanel(gui)
  -- Board-mode only: while walking the world IS the interface, so the panel
  -- stays hidden until the player sits down at the counting table.
  local panel = mk("Frame", {
    Size = UDim2.new(0, 250, 1, -120), Position = UDim2.new(1, -262, 0, 56),
    BackgroundColor3 = DARK, BackgroundTransparency = 0.15, BorderSizePixel = 0,
    Visible = false,
  }, gui)
  corner(panel, 10)
  self.sidePanel = panel
  local scroll = mk("ScrollingFrame", {
    Size = UDim2.new(1, -12, 1, -12), Position = UDim2.fromOffset(6, 6),
    BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 6,
    CanvasSize = UDim2.new(0, 0, 0, 0), AutomaticCanvasSize = Enum.AutomaticSize.Y,
  }, panel)
  local list = mk("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

  local walk = button("🚶 Walk away", scroll, Color3.fromRGB(60, 90, 120), function()
    if self.cb.onLeaveBoard then
      self.cb.onLeaveBoard()
    end
  end)
  walk.Size = UDim2.new(1, 0, 0, 32)

  label("📜 Contracts", scroll, { Size = UDim2.new(1, 0, 0, 24), Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left })
  for _, tier in Challenges.CHALLENGE_TIERS do
    local b = button(string.format("%s — %d sp\n%s", tier.title, tier.baseSp, tier.math), scroll, PANEL, function()
      if self.cb.onDeal then
        self.cb.onDeal(tier.id)
      end
    end)
    b.Size = UDim2.new(1, 0, 0, 46)
    b.TextScaled = false
    b.TextSize = 13
  end

  label("🏗️ Build (pick, then click a plot)", scroll, { Size = UDim2.new(1, 0, 0, 24), Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left })
  for _, def in Buildings.BUILDINGS do
    local costText = def.cost.sp and (def.cost.sp .. " sp") or "—"
    local b = button(string.format("%s %s (%s)", def.emoji, def.name, costText), scroll, PANEL, function()
      self:_selectBuilding(def.id)
    end)
    b.Size = UDim2.new(1, 0, 0, 34)
    b.TextScaled = false
    b.TextSize = 14
    self.buildButtons[def.id] = b
  end

  self.festivalBtn = button("🏮 Light Festival", scroll, Color3.fromRGB(150, 96, 40), function()
    if self.cb.onFestival then
      self.cb.onFestival()
    end
  end)
  self.festivalBtn.Size = UDim2.new(1, 0, 0, 34)

  local reset = button("♻️ Reset village", scroll, Color3.fromRGB(70, 50, 50), function()
    if self.cb.onReset then
      self.cb.onReset()
    end
  end)
  reset.Size = UDim2.new(1, 0, 0, 30)
  reset.TextSize = 13
  reset.TextScaled = false

  local ach = button("🏅 Achievements", scroll, PANEL, function()
    if self.cb.onAchievements then
      self.cb.onAchievements()
    end
  end)
  ach.Size = UDim2.new(1, 0, 0, 30)
end

function HudView:_selectBuilding(id)
  self.selectedBuilding = id
  for bid, b in self.buildButtons do
    b.BackgroundColor3 = if bid == id then GREEN else PANEL
  end
  if self.cb.onSelectBuilding then
    self.cb.onSelectBuilding(id)
  end
end

function HudView:_buildContractPanel(gui)
  local panel = mk("Frame", {
    Size = UDim2.new(0, 520, 0, 168), Position = UDim2.new(0.5, -260, 1, -184),
    BackgroundColor3 = DARK, BackgroundTransparency = 0.08, BorderSizePixel = 0, Visible = false,
  }, gui)
  corner(panel, 12)
  self.contractPanel = panel

  self.promptLabel = label("", panel, {
    Size = UDim2.new(1, -16, 0, 34), Position = UDim2.fromOffset(8, 6),
    Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left, TextScaled = false, TextSize = 20,
  })
  self.subLabel = label("", panel, {
    Size = UDim2.new(1, -16, 0, 18), Position = UDim2.fromOffset(8, 40),
    TextColor3 = Color3.fromRGB(180, 186, 200), TextXAlignment = Enum.TextXAlignment.Left, TextScaled = false, TextSize = 13,
  })

  -- die-cross keypad: subtract row (left) and add row (right), plus carry + focus
  local pad = mk("Frame", { Size = UDim2.new(1, -16, 0, 76), Position = UDim2.fromOffset(8, 62), BackgroundTransparency = 1 }, panel)
  mk("UIListLayout", {
    FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 4),
    HorizontalAlignment = Enum.HorizontalAlignment.Center, VerticalAlignment = Enum.VerticalAlignment.Center,
  }, pad)

  local function keyCell(text, color, cb)
    local b = button(text, pad, color, cb)
    b.Size = UDim2.new(0, 42, 1, 0)
    return b
  end
  keyCell("◀", PANEL, function() if self.cb.onFocusStep then self.cb.onFocusStep(-1) end end)
  for v = 5, 1, -1 do
    keyCell("-" .. v, RED, function() if self.cb.onKeypad then self.cb.onKeypad(v, -1) end end)
  end
  keyCell("-10", Color3.fromRGB(120, 60, 60), function() if self.cb.onCarry then self.cb.onCarry(-1) end end)
  keyCell("+10", Color3.fromRGB(60, 110, 70), function() if self.cb.onCarry then self.cb.onCarry(1) end end)
  for v = 1, 5 do
    keyCell("+" .. v, GREEN, function() if self.cb.onKeypad then self.cb.onKeypad(v, 1) end end)
  end
  keyCell("▶", PANEL, function() if self.cb.onFocusStep then self.cb.onFocusStep(1) end end)

  -- The die-cross key legend (the web board-shell's home-row scheme).
  label("⌨  add: K¹ J² I³ ,⁴ L⁵ · sub: D¹ S² E³ C⁴ F⁵ · hold two = 6–9 · U/R = ±10 · ◀ G  H ▶ = rod · Q = clear", panel, {
    Size = UDim2.new(1, -140, 0, 18), Position = UDim2.fromOffset(8, 144),
    TextColor3 = Color3.fromRGB(148, 154, 168), TextXAlignment = Enum.TextXAlignment.Left,
    TextScaled = false, TextSize = 12,
  })

  self.abandonBtn = button("✖ Abandon", panel, Color3.fromRGB(80, 54, 54), function()
    if self.cb.onAbandon then
      self.cb.onAbandon()
    end
  end)
  self.abandonBtn.Size = UDim2.new(0, 110, 0, 22)
  self.abandonBtn.Position = UDim2.new(1, -118, 0, 142)
  self.abandonBtn.TextScaled = false
  self.abandonBtn.TextSize = 13
end

function HudView:_buildBottom(gui)
  local strip = mk("Frame", {
    Size = UDim2.new(0.5, 0, 0, 46), Position = UDim2.new(0, 12, 1, -58),
    BackgroundColor3 = DARK, BackgroundTransparency = 0.2, BorderSizePixel = 0,
  }, gui)
  corner(strip, 8)
  self.goalLabel = label("🎯 …", strip, {
    Size = UDim2.new(1, -12, 0, 18), Position = UDim2.fromOffset(8, 3),
    Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left, TextScaled = false, TextSize = 14,
  })
  self.hintLabel = label("", strip, {
    Size = UDim2.new(1, -12, 0, 20), Position = UDim2.fromOffset(8, 22),
    TextColor3 = Color3.fromRGB(190, 196, 210), TextXAlignment = Enum.TextXAlignment.Left, TextScaled = false, TextSize = 12,
  })
end

-- --- public updates --------------------------------------------------------
function HudView:setVillage(village)
  self.chips.sp.Text = RES_EMOJI.sp .. " " .. village.sp
  self.chips.food.Text = RES_EMOJI.food .. " " .. village.res.food
  self.chips.wood.Text = RES_EMOJI.wood .. " " .. village.res.wood
  self.chips.coin.Text = RES_EMOJI.coin .. " " .. village.res.coin
  self.dayLabel.Text = "Day " .. village.day
  local r = Rank.villageRank(village)
  self.rankLabel.Text = "🏙️ " .. r.title
  if village.festival > 0 then
    self.festivalBtn.Text = "🏮 Festival: " .. village.festival .. " left"
  else
    self.festivalBtn.Text = "🏮 Light Festival"
  end
end

-- Board mode shows the contract/build panel; walking hides it (and the keypad —
-- the controller re-shows an in-flight contract when the player sits back down).
function HudView:setBoardMode(on)
  self.sidePanel.Visible = on
  if not on then
    self.contractPanel.Visible = false
  end
end

function HudView:showContract(evt)
  self.promptLabel.Text = evt.prompt
  self.subLabel.Text = evt.sub
  self.contractPanel.Visible = true
end

function HudView:clearContract()
  self.contractPanel.Visible = false
end

function HudView:setGoal(goal)
  self.goalLabel.Text = if goal then ("🎯 " .. goal.emoji .. " " .. goal.label) else "🎉 All goals complete"
end

function HudView:setHint(text)
  self.hintLabel.Text = text or ""
end

function HudView:toast(text)
  self:setHint(text)
end

function HudView:destroy()
  if self.gui then
    self.gui:Destroy()
    self.gui = nil
  end
end

return HudView
