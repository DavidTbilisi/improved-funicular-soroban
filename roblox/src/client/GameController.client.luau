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
local World = require(Shared.game.World)

-- Wait for our sibling instances: a LocalScript in PlayerScripts can start
-- running before the rest of StarterPlayerScripts has replicated to the client,
-- so a raw `script.Parent.view` dot-index races the replication and errors.
local viewFolder = script.Parent:WaitForChild("view")
local BoardView = require(viewFolder:WaitForChild("BoardView"))
local VillageView = require(viewFolder:WaitForChild("VillageView"))
local HudView = require(viewFolder:WaitForChild("HudView"))
local AchievementsView = require(viewFolder:WaitForChild("AchievementsView"))
local WorldView = require(viewFolder:WaitForChild("WorldView"))
local BoardInput = require(script.Parent:WaitForChild("BoardInput"))
local BoardHotkeys = require(script.Parent:WaitForChild("BoardHotkeys"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- --- two modes: walk the world / sit at the counting table -----------------
-- Walk mode is Roblox's own avatar camera. Board mode locks the camera to the
-- framing the diorama build used (known-good), driven by the table's prompt.
local camera = workspace.CurrentCamera
-- Close enough that beads read at a glance, high enough that the village still
-- peeks over the board's top rail (plot clicks for build/upgrade happen here).
local BOARD_CAM = CFrame.lookAt(Vector3.new(0, 22, 48), Vector3.new(0, 9, 20))
local BOARD_CFRAME = CFrame.new(0, 12, 30) * CFrame.Angles(math.rad(-18), 0, 0)

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
  cframe = BOARD_CFRAME,
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

local world = WorldView.new({
  parent = workspace,
  boardCFrame = BOARD_CFRAME,
  onGather = function(nodeId, kind)
    onGatherNode(nodeId, kind)
  end,
  onUseBoard = function()
    enterBoardMode()
  end,
})

-- --- board mode -------------------------------------------------------------
local boardMode = false
local lastContractEvt = nil
local savedWalkSpeed = nil
local hotkeys -- BoardHotkeys, assigned below (forward-declared for the closures)

local function humanoidOf(char)
  return char and char:FindFirstChildOfClass("Humanoid")
end

function enterBoardMode()
  if boardMode then
    return
  end
  boardMode = true
  camera.CameraType = Enum.CameraType.Scriptable
  camera.CFrame = BOARD_CAM
  local hum = humanoidOf(player.Character)
  if hum then
    savedWalkSpeed = hum.WalkSpeed
    hum.WalkSpeed = 0 -- reckoning, not wandering
  end
  world.standPrompt.Enabled = false -- already seated
  if hotkeys then
    hotkeys:setEnabled(true) -- the die-cross home row only works at the table
  end
  hud:setBoardMode(true)
  if session:isActive() and lastContractEvt then
    hud:showContract(lastContractEvt) -- a walked-away contract is still live
  end
end

function leaveBoardMode()
  if not boardMode then
    return
  end
  boardMode = false
  camera.CameraType = Enum.CameraType.Custom
  local hum = humanoidOf(player.Character)
  if hum then
    hum.WalkSpeed = savedWalkSpeed or 16
  end
  world.standPrompt.Enabled = true
  if hotkeys then
    hotkeys:setEnabled(false)
  end
  hud:setBoardMode(false)
end

-- A respawn mid-board-mode would revive the humanoid at default speed with a
-- Scriptable camera pointed elsewhere — just drop back to walking.
player.CharacterAdded:Connect(function()
  if boardMode then
    leaveBoardMode()
  end
end)

-- --- gathering --------------------------------------------------------------
function onGatherNode(nodeId, kind)
  world:consume(nodeId, World.GATHER[kind].gains)
  session:gather(kind)
end

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
  onLeaveBoard = function()
    leaveBoardMode()
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

-- --- the die-cross home-row keyboard (board mode only) ----------------------
-- Whole digits (chords make 6-9) go through pressWhole — STRICT direct-only,
-- same contract as the clickable keypad, so a key and a click can never grade
-- a move differently.
hotkeys = BoardHotkeys.new({
  onDigit = function(sign, d)
    local c = currentFocus()
    local ok = BoardInput.pressWhole(store, c.kind, c.idx, d, sign)
    if not ok then
      session:fault()
      hud:toast("✋ " .. (if sign > 0 then "+" else "−") .. d .. " doesn't fit directly here — a trade is needed first.")
    end
  end,
  onCarry = function(sign)
    hud.cb.onCarry(sign)
  end,
  onFocusStep = function(dir)
    stepFocus(dir)
  end,
  onReset = function()
    session:fault() -- clearing mid-contract spoils a clean solve, as on the web
    bus:run(Commands.SetValue.new(store, "0"))
    hud:toast("♻ Board cleared to 0.")
  end,
})

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
    world:setDay(evt.village.day)
  elseif t == "placed" then
    refreshVillage(evt.village)
    village:previewCell(evt.cellIdx)
    selectedBuilding = nil
  elseif t == "festival" then
    refreshVillage(evt.village)
    village:festival()
  elseif t == "gathered" then
    hud:setVillage(evt.village)
  elseif t == "abandoned" then
    lastContractEvt = nil
    refreshVillage(evt.village)
    hud:clearContract()
  elseif t == "challenge" then
    lastContractEvt = evt
    enterBoardMode() -- an upgrade tapped from the field walks you to the table
    hud:showContract(evt)
    setFocusTo("int", 1)
  elseif t == "refused" then
    hud:toast("Can't do that: " .. tostring(evt.reason))
  elseif t == "solved" then
    lastContractEvt = nil
    hud:clearContract()
    refreshVillage(evt.village)
    local grew = world:setDay(evt.day)
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
      local msg = evt.clean and "✨ Clean solve! +" .. evt.payout .. " sp" or "Solved — " .. evt.verdict
      if grew then
        msg ..= "  🌍 The boundary pushed outward!"
      end
      hud:toast(msg)
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
