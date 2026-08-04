--!nonstrict
-- ============================================================================
-- GameController — the client composition root, the Roblox counterpart of
-- src/pages/game.js. It builds the shared GameSession over the shared
-- AbacusStore, wires the 3D board + village + HUD views to it, and routes the
-- session's events into view effects. Village state is loaded from / saved to
-- the server (VillageService) via Remotes.
-- ============================================================================
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")

local Shared = RS:WaitForChild("SorobanVillage")
local Remotes = require(Shared:WaitForChild("Remotes"))
local Rng = require(Shared.Rng)
local AbacusStore = require(Shared.state.AbacusStore)
local Commands = require(Shared.state.Commands)
local Config = require(Shared.domain.Config)
local GameSave = require(Shared.game.GameSave)
local GameSession = require(Shared.game.GameSession)
local AchievementTracker = require(Shared.game.AchievementTracker)
local Goals = require(Shared.game.Goals)
local Advisor = require(Shared.game.Advisor)
local Buildings = require(Shared.game.Buildings)

local BoardView = require(script.Parent.view.BoardView)
local VillageView = require(script.Parent.view.VillageView)
local HudView = require(script.Parent.view.HudView)
local AchievementsView = require(script.Parent.view.AchievementsView)
local BoardInput = require(script.Parent.BoardInput)

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- --- fixed camera framing (tune in Studio if needed) -----------------------
local camera = workspace.CurrentCamera
camera.CameraType = Enum.CameraType.Scriptable
camera.CFrame = CFrame.lookAt(Vector3.new(0, 34, 64), Vector3.new(0, 6, 16))

-- --- persistence seam: client store backed by the server -------------------
local remotes = Remotes.client()
local currentVillage = remotes.GetVillage:InvokeServer()
local clientStore = {
  load = function()
    return currentVillage
  end,
  save = function(_, v)
    currentVillage = v
    remotes.SaveVillage:FireServer(v)
  end,
}

-- --- core objects ----------------------------------------------------------
local store = AbacusStore.new(0, "")
local bus = Commands.CommandBus.new()
local save = GameSave.new(clientStore)
local clock = { now = function() return os.clock() * 1000 end }
local session = GameSession.new({ save = save, rng = Rng.math(), store = store, clock = clock })

local achStore = { _v = nil, load = function(self) return self._v end, save = function(self, v) self._v = v end }
local tracker = AchievementTracker.new(achStore)
tracker:seed(session.village)

-- --- views -----------------------------------------------------------------
local village = VillageView.new({
  parent = workspace,
  cframe = CFrame.new(0, 0, 0),
  onCellTap = function(idx)
    onCellTap(idx)
  end,
})

local board = BoardView.new({
  parent = workspace,
  cframe = CFrame.new(0, 12, 30) * CFrame.Angles(math.rad(-18), 0, 0),
  onToggleHeaven = function(kind, idx)
    bus:run(Commands.ToggleSky.new(store, kind, idx))
  end,
  onClickEarth = function(kind, idx, bead)
    bus:run(Commands.ClickEarth.new(store, kind, idx, bead))
  end,
  onFocusRod = function(kind, idx)
    setFocusTo(kind, idx)
  end,
})

local hud = HudView.new({ parent = playerGui, callbacks = {} })
local ach = AchievementsView.new({ parent = playerGui })

-- --- focus manager (which rod the keypad drives) ---------------------------
local focusIdx = 1 -- index into board.cols
local function currentFocus()
  return board.cols[focusIdx]
end
function setFocusTo(kind, idx)
  for i, c in board.cols do
    if c.kind == kind and c.idx == idx then
      focusIdx = i
      board:setFocus(kind, idx)
      return
    end
  end
end
local function stepFocus(dir)
  focusIdx = math.clamp(focusIdx + dir, 1, #board.cols)
  local c = board.cols[focusIdx]
  board:setFocus(c.kind, c.idx)
end
-- default focus: the ones rod (int idx 1)
setFocusTo("int", 1)

-- --- placement mode --------------------------------------------------------
local selectedBuilding = nil
function onCellTap(idx)
  if selectedBuilding then
    session:placeBuilding(selectedBuilding, idx)
  else
    session:startUpgrade(idx)
  end
end

-- --- HUD callbacks ---------------------------------------------------------
hud.cb = {
  onDeal = function(tierId)
    session:startChallenge(tierId)
  end,
  onSelectBuilding = function(id)
    selectedBuilding = id
    hud:setHint("Placing " .. id .. " — click an empty plot (click a built plot with none selected to upgrade).")
  end,
  onFestival = function()
    session:lightFestival()
  end,
  onReset = function()
    session:resetSave()
  end,
  onAbandon = function()
    session:abandonChallenge()
  end,
  onAchievements = function()
    ach:toggle(tracker:states())
  end,
  onFocusStep = function(dir)
    stepFocus(dir)
  end,
  onKeypad = function(value, sign)
    local c = currentFocus()
    local ok = BoardInput.pressDigit(store, c.kind, c.idx, value, sign)
    if not ok then
      session:fault()
      hud:toast("✋ That bead move isn't legal here — a trade is needed first.")
    end
  end,
  onCarry = function(sign)
    local c = currentFocus()
    local ok = BoardInput.carry(store, c.kind, c.idx, sign)
    if not ok then
      session:fault()
      hud:toast("✋ No room to carry there — trade on the next rod first.")
    end
  end,
}

-- --- reflect the store onto the board --------------------------------------
store:subscribe(function()
  board:update(store)
end)
board:update(store)

-- --- village refresh (shared by several events) ----------------------------
local function refreshVillage(v)
  hud:setVillage(v)
  village:renderVillage(v)
  hud:setGoal(Goals.nextGoal(v))
  hud:setHint(Advisor.nextHint(v).msg)
end

-- --- session event router --------------------------------------------------
session:subscribe(function(evt)
  local t = evt.type
  if t == "loaded" or t == "reset" then
    refreshVillage(evt.village)
  elseif t == "placed" then
    refreshVillage(evt.village)
    village:previewCell(evt.cellIdx)
    selectedBuilding = nil
  elseif t == "festival" then
    refreshVillage(evt.village)
    village:festival()
  elseif t == "abandoned" then
    refreshVillage(evt.village)
    hud:clearContract()
  elseif t == "challenge" then
    hud:showContract(evt)
    setFocusTo("int", 1)
  elseif t == "refused" then
    hud:toast("Can't do that: " .. tostring(evt.reason))
  elseif t == "solved" then
    hud:clearContract()
    refreshVillage(evt.village)
    if evt.kind == "earn" then
      village:flashPayout(nil, "+" .. evt.payout .. " 🧮")
    else
      village:flashPayout(evt.cell, "⬆️ L" .. (evt.village.grid[evt.cell] and evt.village.grid[evt.cell].level or ""))
    end
    village:pulseDay(evt.day)
    if evt.milestone == "founded" then
      village:celebrate()
      hud:toast("🎌 Village founded!")
    else
      hud:toast(evt.clean and "✨ Clean solve! +" .. evt.payout .. " sp" or "Solved — " .. evt.verdict)
    end
  end
end)

-- achievements
tracker:observe(session)
tracker:subscribe(function(evt)
  if evt.type == "unlocked" then
    ach:toast(evt.achievement)
  end
end)

-- go
session:start()
