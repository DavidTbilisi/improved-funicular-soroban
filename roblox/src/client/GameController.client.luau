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
local UserInputService = game:GetService("UserInputService")

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
local MovePlan = require(Shared.domain.MovePlan)
local Rod = require(Shared.domain.Rod)
local anzanFolder = Shared:WaitForChild("anzan")
local AnzanLevels = require(anzanFolder:WaitForChild("Levels"))
local AnzanSession = require(anzanFolder:WaitForChild("AnzanSession"))

-- Wait for our sibling instances: a LocalScript in PlayerScripts can start
-- running before the rest of StarterPlayerScripts has replicated to the client,
-- so a raw `script.Parent.view` dot-index races the replication and errors.
local viewFolder = script.Parent:WaitForChild("view")
local BoardView = require(viewFolder:WaitForChild("BoardView"))
local VillageView = require(viewFolder:WaitForChild("VillageView"))
local HudView = require(viewFolder:WaitForChild("HudView"))
local AchievementsView = require(viewFolder:WaitForChild("AchievementsView"))
local WorldView = require(viewFolder:WaitForChild("WorldView"))
local LightingMood = require(viewFolder:WaitForChild("LightingMood"))
local VillagerView = require(viewFolder:WaitForChild("VillagerView"))
local AnzanView = require(viewFolder:WaitForChild("AnzanView"))
local BoardInput = require(script.Parent:WaitForChild("BoardInput"))
local BoardHotkeys = require(script.Parent:WaitForChild("BoardHotkeys"))
local SoundFx = require(script.Parent:WaitForChild("SoundFx"))

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
-- The flash-anzan lantern stall: in the node-free zone, across the spawn path
-- from the counting table, its sign facing the south approach.
local ANZAN_CFRAME = CFrame.new(-26, 0, 34)
local ANZAN_CAM = CFrame.lookAt(Vector3.new(-26, 6, 50), Vector3.new(-26, 4.2, 34))

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

-- Flash anzan: the same DOM-free state machine as the web, driven by task
-- timers. clear() may fire on an already-run thread — _after nulls the handle
-- first, and pcall makes a stale cancel harmless besides.
local anzanTimer = {
  set = function(fn, ms)
    return task.delay(ms / 1000, fn)
  end,
  clear = function(h)
    pcall(task.cancel, h)
  end,
}
local anzan = AnzanSession.new({ rng = Rng.math(), clock = clock, timer = anzanTimer })

-- Achievements ride the village blob (village.ach): unlocks survive a rejoin
-- and travel through the same server heal as everything else. The tracker
-- heals its own shape, so a fresh {} loads as "no progress yet".
local achStore = {
  load = function()
    local a = session.village.ach
    return if type(a) == "table" and a.v == 1 then a else nil
  end,
  save = function(_, data)
    session.village.ach = data
    session.save:save(session.village)
  end,
}
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
    sfx:bead(1)
  end,
  onClickEarth = function(kind, idx, bead)
    bus:run(Commands.ClickEarth.new(store, kind, idx, bead))
    sfx:bead(1)
  end,
  onFocusRod = function(kind, idx)
    setFocusTo(kind, idx)
  end,
})

local hud = HudView.new({ parent = playerGui, callbacks = {} })
local ach = AchievementsView.new({ parent = playerGui })
local mood = LightingMood.new({ parent = workspace, origin = CFrame.new(0, 0, 0) })
local sfx = SoundFx.new()
local soundOn = true
local villagers = VillagerView.new({
  parent = workspace,
  spotFor = function()
    return village:randomSpot()
  end,
})

-- Hut levels house villagers; a shrine brings the elder out.
local function populationOf(v)
  local pop, hasShrine = 0, false
  for _, cell in v.grid do
    if cell then
      if cell.id == "hut" then
        pop += cell.level
      elseif cell.id == "shrine" then
        hasShrine = true
      end
    end
  end
  return math.min(12, pop), hasShrine
end

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

local anzanView = AnzanView.new({
  parent = workspace,
  playerGui = playerGui,
  cframe = ANZAN_CFRAME,
  cb = {
    onStart = function(levelId)
      anzan:start(levelId)
    end,
    onSpeed = function(dir)
      if anzan.level then
        anzan:setSpeed(AnzanLevels.speedStep(anzan.intervalMs, dir))
      end
    end,
    onSubmit = function(text)
      anzan:submit(text)
    end,
    onStop = function()
      anzan:stop()
      leaveAnzanMode()
    end,
  },
})

-- --- board mode -------------------------------------------------------------
local boardMode = false
local anzanMode = false
local lastContractEvt = nil
local hotkeys -- BoardHotkeys, assigned below (forward-declared for the closures)

-- Chained contracts: solving one deals the next of the same tier, so a run of
-- problems needs no clicking — the web game's rule (src/pages/game.js), which is
-- the drill page's auto-advance transplanted. **Abandon is the off switch**; the
-- chain otherwise runs forever.
--
-- Only EARN contracts chain. An upgrade contract pays its cost up front and
-- names a plot, so re-dealing it would spend resources on a level the player
-- never asked for.
--
-- The delay is what makes the payout readable — without it the board resets out
-- from under the solve. Cancellation is a generation counter rather than
-- `task.cancel`, matching AnzanSession: the pending call still fires, and
-- checks whether it is still the one that was booked.
local CHAIN_DELAY_S = 1.4
local chainGen = 0

local function cancelChain()
  chainGen += 1
end

-- Sprint: hold Shift to hurry (the world is a couple hundred studs across).
local WALK_SPEED, SPRINT_SPEED = 16, 26
local sprinting = false
local function currentWalkSpeed()
  return if sprinting then SPRINT_SPEED else WALK_SPEED
end

local function humanoidOf(char)
  return char and char:FindFirstChildOfClass("Humanoid")
end

function enterBoardMode()
  if boardMode then
    return
  end
  if anzanMode then
    anzan:stop() -- a contract outranks practice; the stall yields cleanly
    leaveAnzanMode()
  end
  boardMode = true
  camera.CameraType = Enum.CameraType.Scriptable
  camera.CFrame = BOARD_CAM
  local hum = humanoidOf(player.Character)
  if hum then
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
  -- Walking away stops the chain. A live contract survives the walk (it is
  -- re-shown when you sit back down), but DEALING one to someone out in the
  -- field would start its clock while they pick berries and quietly spend the
  -- speed bonus they were chaining for.
  cancelChain()
  boardMode = false
  camera.CameraType = Enum.CameraType.Custom
  local hum = humanoidOf(player.Character)
  if hum then
    hum.WalkSpeed = currentWalkSpeed()
  end
  world.standPrompt.Enabled = true
  if hotkeys then
    hotkeys:setEnabled(false)
  end
  hud:setBoardMode(false)
end

-- --- anzan mode -------------------------------------------------------------
function enterAnzanMode()
  if anzanMode or boardMode then
    return
  end
  anzanMode = true
  camera.CameraType = Enum.CameraType.Scriptable
  camera.CFrame = ANZAN_CAM
  local hum = humanoidOf(player.Character)
  if hum then
    hum.WalkSpeed = 0
  end
  anzanView.stallPrompt.Enabled = false
  anzanView:setRecords(session.village.anzan)
  anzanView:setPanelVisible(true)
end

function leaveAnzanMode()
  if not anzanMode then
    return
  end
  anzanMode = false
  camera.CameraType = Enum.CameraType.Custom
  local hum = humanoidOf(player.Character)
  if hum then
    hum.WalkSpeed = currentWalkSpeed()
  end
  anzanView.stallPrompt.Enabled = true
  anzanView:setPanelVisible(false)
end

anzanView.stallPrompt.Triggered:Connect(function()
  enterAnzanMode()
end)

-- Hold Shift to sprint (never while seated — the modes own the walk speed).
local function setSprint(on)
  sprinting = on
  if not (boardMode or anzanMode) then
    local hum = humanoidOf(player.Character)
    if hum then
      hum.WalkSpeed = currentWalkSpeed()
    end
  end
end
UserInputService.InputBegan:Connect(function(input)
  if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.RightShift then
    setSprint(true)
  end
end)
UserInputService.InputEnded:Connect(function(input)
  if input.KeyCode == Enum.KeyCode.LeftShift or input.KeyCode == Enum.KeyCode.RightShift then
    setSprint(false)
  end
end)

-- A respawn mid-mode would revive the humanoid at default speed with a
-- Scriptable camera pointed elsewhere — just drop back to walking.
player.CharacterAdded:Connect(function()
  if boardMode then
    leaveBoardMode()
  end
  if anzanMode then
    anzan:stop()
    leaveAnzanMode()
  end
end)

-- --- gathering + landmarks --------------------------------------------------
function onGatherNode(nodeId, kind)
  if World.isLandmark(nodeId) then
    -- visuals react to the session event, since a claim can be refused
    session:visitLandmark(nodeId)
  else
    world:consume(nodeId, World.GATHER[kind].gains)
    session:gather(kind)
  end
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

-- --- the coach: a refused move becomes the lesson ---------------------------
-- The web board-shell's rule: an illegal primitive is refused WITH the exact
-- complement chain to key by hand. MovePlan flattens any ±digit into single
-- keyable steps, and MOVE_KEYS names the home-row keys that play them.
local PLACE_NAMES = {
  int = { "ones", "tens", "hundreds", "thousands", "10-thousands", "100-thousands",
    "millions", "10-millions", "100-millions", "billions", "10-billions" },
  frac = { "tenths", "hundredths", "thousandths", "ten-thousandths" },
}
local function placeName(kind, idx)
  return PLACE_NAMES[kind][idx] or (kind .. " " .. idx)
end

local function tradeToast(sign, d)
  local c = currentFocus()
  local cur = Rod.rodValue(store:rodsOf(c.kind)[c.idx])
  local plan = if sign > 0 then MovePlan.planAdd(cur, d) else MovePlan.planSub(cur, d)
  local keys = MovePlan.keysText(plan.steps)
  local trade = if plan.rule == "big" then "carry" else "five"
  hud:toast(("⚠ %s%d on %s needs a %s trade: %s%s"):format(
    if sign > 0 then "+" else "−", d, placeName(c.kind, c.idx), trade,
    MovePlan.stepsText(plan.steps),
    if keys then "  (" .. keys .. ")" else ""))
end

local function carryToast(sign)
  local c = currentFocus()
  local op = if sign > 0 then "+10" else "−10"
  local tkind, tidx = BoardInput.carryTarget(c.kind, c.idx)
  if not tkind then
    hud:toast("⚠ " .. op .. " on " .. placeName(c.kind, c.idx) .. " — there is no rod beyond the top.")
    return
  end
  local nextDigit = Rod.rodValue(store:rodsOf(tkind)[tidx])
  local nbr = placeName(tkind, tidx)
  hud:toast(if sign > 0
    then ("⚠ %s — %s can't take a carry bead (it's at %d)."):format(op, nbr, nextDigit)
    else ("⚠ %s — %s has no earth bead to borrow (it's at %d)."):format(op, nbr, nextDigit))
end

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
  onToggleSound = function()
    soundOn = not soundOn
    sfx:setEnabled(soundOn)
    hud:setSoundIcon(soundOn)
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
    if ok then
      sfx:digit(value, sign)
    else
      session:fault()
      sfx:reject()
      tradeToast(sign, value)
    end
  end,
  onCarry = function(sign)
    local c = currentFocus()
    local ok = BoardInput.carry(store, c.kind, c.idx, sign)
    if ok then
      sfx:carry(sign)
    else
      session:fault()
      sfx:reject()
      carryToast(sign)
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
    if ok then
      sfx:digit(d, sign)
    else
      session:fault()
      sfx:reject()
      tradeToast(sign, d)
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
    sfx:reset()
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
  villagers:setPopulation(populationOf(v))
  hud:setGoal(Goals.nextGoal(v))
  hud:setHint(Advisor.nextHint(v).msg)
end

-- --- session event router --------------------------------------------------
session:subscribe(function(evt)
  local t = evt.type
  if t == "loaded" or t == "reset" then
    if t == "reset" then
      cancelChain() -- a reset wipes the village the chain was paying into
      lastContractEvt = nil
      hud:clearContract()
    end
    refreshVillage(evt.village)
    world:setDay(evt.village.day)
    world:setLandmarks(evt.village.landmarks)
    mood:setDay(evt.village.day)
    mood:setFestival(evt.village.festival > 0)
  elseif t == "placed" then
    refreshVillage(evt.village)
    village:previewCell(evt.cellIdx)
    selectedBuilding = nil
  elseif t == "festival" then
    refreshVillage(evt.village)
    village:festival()
    mood:setFestival(true)
    sfx:levelUp()
  elseif t == "gathered" then
    hud:setVillage(evt.village)
  elseif t == "anzan" then
    hud:setVillage(evt.village)
    anzanView:setRecords(evt.village.anzan)
    if evt.ok then
      sfx:solve()
      hud:toast(("🏮 +%d sp — flash anzan%s"):format(evt.payout,
        if evt.justPassed then " · rung cleared!" else ""))
    else
      sfx:reject()
    end
  elseif t == "landmark" then
    hud:setVillage(evt.village)
    if evt.kind == "goldtree" then
      world:flashGains(evt.id, evt.gains)
      world:setLandmarks(evt.village.landmarks)
      sfx:levelUp()
      hud:toast("🌟 Golden harvest!")
    elseif evt.kind == "ruin" then
      world:setLandmarks(evt.village.landmarks)
      sfx:levelUp()
      hud:toast(("🏛️ Ruin restored — contracts now pay +%d%%."):format(evt.bonus * 100 + 0.5))
    else
      world:consume(evt.id, evt.get)
      sfx:carry(1)
      hud:toast("🗿 Traded 5 🌲 → 4 💰.")
    end
  elseif t == "abandoned" then
    lastContractEvt = nil
    cancelChain() -- the off switch
    refreshVillage(evt.village)
    hud:clearContract()
  elseif t == "challenge" then
    lastContractEvt = evt
    cancelChain() -- a fresh deal supersedes anything still pending
    enterBoardMode() -- an upgrade tapped from the field walks you to the table
    hud:showContract(evt)
    setFocusTo("int", 1)
  elseif t == "refused" then
    sfx:reject()
    hud:toast("Can't do that: " .. tostring(evt.reason))
  elseif t == "solved" then
    lastContractEvt = nil
    -- An earn solve leaves the panel up: the chain replaces its text in 1.4s,
    -- and hiding it in between is a flicker. Nothing else can strand it —
    -- walking away hides the whole panel, and the only other thing that cancels
    -- a pending chain is a new contract, which fills it.
    if evt.kind ~= "earn" then
      hud:clearContract()
    end
    refreshVillage(evt.village)
    local grew = world:setDay(evt.day)
    mood:setDay(evt.day)
    mood:setFestival(evt.village.festival > 0) -- festival days burn down per solve
    if evt.kind == "earn" then
      village:flashPayout(nil, "+" .. evt.payout .. " 🧮")
    else
      village:flashPayout(evt.cell, "⬆️ L" .. (evt.village.grid[evt.cell] and evt.village.grid[evt.cell].level or ""))
    end
    village:pulseDay(evt.day)
    if evt.milestone == "founded" then
      village:celebrate()
      sfx:levelUp()
      hud:toast("🎌 Village founded!")
    else
      sfx:solve()
      local msg = evt.clean and "✨ Clean solve! +" .. evt.payout .. " sp" or "Solved — " .. evt.verdict
      if grew then
        msg ..= "  🌍 The boundary pushed outward!"
      end
      if evt.kind == "earn" then
        msg ..= "  ▶ next one coming — ✖ Abandon to stop."
      end
      hud:toast(msg)
    end
    -- Deal the next of the same tier. Re-checked at fire time: the player may
    -- have abandoned, walked off, or taken a different contract in the meantime.
    if evt.kind == "earn" then
      chainGen += 1
      local gen = chainGen
      task.delay(CHAIN_DELAY_S, function()
        if gen ~= chainGen or not boardMode or session:isActive() then
          return
        end
        session:startChallenge(evt.tierId)
      end)
    end
  end
end)

-- --- anzan event router ------------------------------------------------------
anzan:subscribe(function(evt)
  local t = evt.type
  if t == "started" then
    anzanView:onStarted(evt)
  elseif t == "flash" then
    anzanView:onFlash(evt)
  elseif t == "blank" then
    anzanView:onBlank()
  elseif t == "answer" then
    anzanView:onAnswer()
  elseif t == "speed" then
    anzanView:onSpeed(evt)
  elseif t == "result" then
    anzanView:onResult(evt)
    session:anzanResult({
      levelId = evt.levelId, ok = evt.ok, intervalMs = evt.intervalMs,
      streak = evt.streak, justPassed = evt.justPassed,
    })
    task.delay(1.4, function()
      if anzanMode and anzan.level and not anzan:isActive() then
        anzan:newRound() -- chain rounds while seated at the lantern
      end
    end)
  end
end)

-- achievements
tracker:observe(session)
tracker:subscribe(function(evt)
  if evt.type == "unlocked" then
    ach:toast(evt.achievement)
    sfx:levelUp()
    remotes.AwardBadge:FireServer(evt.achievement.id) -- server re-validates
  end
end)

-- go
session:start()
