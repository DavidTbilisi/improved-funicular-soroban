--!nonstrict
-- ============================================================================
-- VillageService — server-authoritative persistence for each player's village.
--
--   join  -> load "village:<userId>" from a DataStore, HEAL it with the shared
--            GameSave.fix (the same validator the web app runs), cache it, and
--            answer the client's GetVillage invoke.
--   play  -> the client fires SaveVillage with its current village after every
--            solve/build/festival; we cache it and debounce a DataStore write.
--   leave -> flush the cache to the DataStore. BindToClose flushes everyone.
--
-- Client-authoritative gameplay is acceptable here: this is a solo educational
-- trainer with no shared or competitive economy. GameSave.fix still guards
-- against a malformed blob so a bad payload can never corrupt the save.
-- ============================================================================
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("SorobanVillage")
local Remotes = require(Shared:WaitForChild("Remotes"))
local GameSave = require(Shared.game:WaitForChild("GameSave"))

local SAVE_DEBOUNCE = 6 -- seconds between DataStore writes per player
local net = Remotes.server()

-- A walkable world: the avatar spawns and explores. (WorldSetup.server.luau
-- builds the server-side ground + spawn pad the character stands on.)
Players.CharacterAutoLoads = true

-- DataStore may be unavailable in unpublished Studio without API access; degrade
-- to per-session in-memory villages rather than erroring on every call.
local store: DataStore? = nil
do
  local ok, ds = pcall(function()
    return DataStoreService:GetDataStore("SorobanVillage_v1")
  end)
  if ok then
    store = ds
  else
    warn("[VillageService] DataStore unavailable — villages will not persist this session.")
  end
end

local cache = {} -- [userId] = { village = blob, dirty = bool, lastSave = 0 }
local function keyFor(userId: number): string
  return "village:" .. userId
end

local function loadVillage(player: Player)
  local raw = nil
  if store then
    local ok, result = pcall(function()
      return store:GetAsync(keyFor(player.UserId))
    end)
    if ok then
      raw = result
    else
      warn("[VillageService] load failed for " .. player.Name .. ": " .. tostring(result))
    end
  end
  -- GameSave.fix turns nil / legacy / corrupt into a safe, playable village.
  local village = GameSave.fix(raw)
  cache[player.UserId] = { village = village, dirty = false, lastSave = 0 }
  return village
end

local function writeVillage(userId: number)
  local entry = cache[userId]
  if not entry or not entry.dirty or not store then
    if entry then
      entry.dirty = false
    end
    return
  end
  local ok, err = pcall(function()
    store:UpdateAsync(keyFor(userId), function()
      return entry.village
    end)
  end)
  if ok then
    entry.dirty = false
    entry.lastSave = os.clock()
  else
    warn("[VillageService] save failed for " .. userId .. ": " .. tostring(err))
  end
end

-- The client asks for its village on join.
net.GetVillage.OnServerInvoke = function(player: Player)
  local entry = cache[player.UserId]
  if entry then
    return entry.village
  end
  return loadVillage(player)
end

-- The client pushes its current village; validate, cache, debounce a write.
net.SaveVillage.OnServerEvent:Connect(function(player: Player, blob)
  if type(blob) ~= "table" then
    return
  end
  local village = GameSave.fix(blob) -- never trust the client's shape
  local entry = cache[player.UserId] or { village = village, dirty = false, lastSave = 0 }
  entry.village = village
  entry.dirty = true
  cache[player.UserId] = entry
  if os.clock() - entry.lastSave >= SAVE_DEBOUNCE then
    writeVillage(player.UserId)
  end
end)

Players.PlayerAdded:Connect(loadVillage)

Players.PlayerRemoving:Connect(function(player: Player)
  writeVillage(player.UserId)
  cache[player.UserId] = nil
end)

-- Periodic autosave for long sessions (a dirty village still flushes if the
-- player never triggers the debounce window again).
task.spawn(function()
  while true do
    task.wait(SAVE_DEBOUNCE)
    for userId in cache do
      writeVillage(userId)
    end
  end
end)

game:BindToClose(function()
  for userId in cache do
    writeVillage(userId)
  end
end)
