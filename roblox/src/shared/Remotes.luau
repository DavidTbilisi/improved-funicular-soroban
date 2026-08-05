--!nonstrict
-- ============================================================================
-- Remotes — the single source of truth for the client<->server wire. The server
-- creates the folder + remotes; the client waits for them. Roblox-only (touches
-- Instances); not exercised by the headless specs.
--
--   GetVillage  (RemoteFunction) — client invokes on join; server returns the
--                                  healed village blob for that player.
--   SaveVillage (RemoteEvent)    — client fires with its current village blob;
--                                  server caches + debounces a DataStore write.
--   AwardBadge  (RemoteEvent)    — client reports an achievement unlock; the
--                                  server RE-VALIDATES against its healed
--                                  village before touching BadgeService.
-- ============================================================================
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = {}
Remotes.FOLDER = "SorobanVillageNet"

local function ensure(parent: Instance, className: string, name: string): Instance
  local existing = parent:FindFirstChild(name)
  if existing then
    return existing
  end
  local inst = Instance.new(className)
  inst.Name = name
  inst.Parent = parent
  return inst
end

-- Server: create (idempotently) and return the remotes.
function Remotes.server()
  local folder = ensure(ReplicatedStorage, "Folder", Remotes.FOLDER)
  return {
    folder = folder,
    GetVillage = ensure(folder, "RemoteFunction", "GetVillage"),
    SaveVillage = ensure(folder, "RemoteEvent", "SaveVillage"),
    AwardBadge = ensure(folder, "RemoteEvent", "AwardBadge"),
  }
end

-- Client: wait for the remotes the server made.
function Remotes.client()
  local folder = ReplicatedStorage:WaitForChild(Remotes.FOLDER)
  return {
    folder = folder,
    GetVillage = folder:WaitForChild("GetVillage"),
    SaveVillage = folder:WaitForChild("SaveVillage"),
    AwardBadge = folder:WaitForChild("AwardBadge"),
  }
end

return Remotes
