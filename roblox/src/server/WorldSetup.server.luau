--!nonstrict
-- ============================================================================
-- WorldSetup — the server-side stage: a ground plane and a spawn pad. These
-- must exist ON THE SERVER (unlike every view, which is client-built scenery)
-- because the character's physics needs a floor the server knows about.
--
-- The ground's top sits a hair BELOW the village ground's top (y = 0) so the
-- two grass planes never z-fight where they overlap.
-- ============================================================================
local ground = Instance.new("Part")
ground.Name = "WorldGround"
ground.Anchored = true
ground.Locked = true
ground.Size = Vector3.new(600, 2, 600)
ground.CFrame = CFrame.new(0, -1.05, 0)
ground.Color = Color3.fromRGB(88, 138, 84)
ground.Material = Enum.Material.Grass
ground.TopSurface = Enum.SurfaceType.Smooth
ground.BottomSurface = Enum.SurfaceType.Smooth
ground.Parent = workspace

-- Spawn just south of the counting table (board at z = 30), facing the village.
local spawn = Instance.new("SpawnLocation")
spawn.Name = "VillageSpawn"
spawn.Anchored = true
spawn.Size = Vector3.new(8, 1, 8)
spawn.CFrame = CFrame.new(0, 0.5, 52) -- identity look vector faces -Z: the village
spawn.Color = Color3.fromRGB(140, 140, 148)
spawn.Material = Enum.Material.Slate
spawn.Duration = 0 -- no spawn forcefield
spawn.Neutral = true
spawn.Parent = workspace
