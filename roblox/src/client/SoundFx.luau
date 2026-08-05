--!nonstrict
-- ============================================================================
-- SoundFx — the web soundService's palette on Roblox. The web synthesizes
-- live; Roblox plays samples — but ONE uploaded note pitch-shifted through
-- Sound.PlaybackSpeed covers the whole digit scale, the carry pair and both
-- arpeggios, so five samples (rendered by scripts/make-sounds.mjs, uploaded
-- once in Studio) recreate the design:
--
--   bead(sign)      one bead seating; subtract rings lower (430/520)
--   digit(d, sign)  the C-major digit scale C5..D6; subtract takes the
--                   downward-glide sample — pitch says WHICH digit, the
--                   glide says which direction
--   carry(sign)     two notes crossing into the neighbour rod (rise / fall)
--   reject()        the sawtooth "illegal move" buzz
--   reset()         the falling clear
--   solve()         C-E-G  ·  levelUp()  C-E-G-C
--
-- Every method no-ops while disabled or while an id is unset (ASSET_IDS = 0),
-- so the module is safe to wire before any upload has happened.
-- ============================================================================
local SoundService = game:GetService("SoundService")
local Debris = game:GetService("Debris")

-- Paste the ids from Studio's Asset Manager after uploading roblox/sounds/*.
local ASSET_IDS = {
  tone = 0, -- tone-c5.wav (triangle C5, the pitch-shift base)
  toneDown = 0, -- tone-c5-down.wav (subtract glide variant)
  bead = 0, -- bead.wav
  reject = 0, -- reject.wav
  reset = 0, -- reset.wav
}

local C5 = 523.25
-- One note per digit 1-9, ascending C major — index matches the web table.
local DIGIT_NOTES = { 523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66 }

local SoundFx = {}
SoundFx.__index = SoundFx

function SoundFx.new(opts)
  local self = setmetatable({}, SoundFx)
  self.enabled = if opts and opts.enabled ~= nil then opts.enabled else true
  self.templates = {}
  for key, id in ASSET_IDS do
    if id ~= 0 then
      local s = Instance.new("Sound")
      s.Name = "Sfx_" .. key
      s.SoundId = "rbxassetid://" .. id
      s.Volume = 0.5
      s.Parent = SoundService
      self.templates[key] = s
    end
  end
  return self
end

function SoundFx:setEnabled(on)
  self.enabled = on
end

-- Overlapping notes need their own instances: clone, play, let Debris sweep.
function SoundFx:_play(key, playbackSpeed, volume)
  if not self.enabled then
    return
  end
  local template = self.templates[key]
  if not template then
    return -- id not filled in yet — silently disabled, like the web's no-context degrade
  end
  local s = template:Clone()
  s.PlaybackSpeed = playbackSpeed or 1
  s.Volume = volume or s.Volume
  s.Parent = SoundService
  s:Play()
  Debris:AddItem(s, 2)
end

function SoundFx:_seq(freqs, step, volume)
  for i, f in freqs do
    task.delay((i - 1) * step, function()
      self:_play("tone", f / C5, volume)
    end)
  end
end

function SoundFx:bead(sign)
  self:_play("bead", if (sign or 1) > 0 then 1 else 430 / 520, 0.4)
end

function SoundFx:digit(d, sign)
  local f = DIGIT_NOTES[d]
  if not f then
    return
  end
  self:_play(if (sign or 1) > 0 then "tone" else "toneDown", f / C5, 0.45)
end

function SoundFx:carry(sign)
  self:_seq(if (sign or 1) > 0 then { 392, 588 } else { 588, 392 }, 0.06, 0.4)
end

function SoundFx:reject()
  self:_play("reject", 1, 0.4)
end

function SoundFx:reset()
  self:_play("reset", 1, 0.35)
end

function SoundFx:solve()
  self:_seq({ 523, 659, 784 }, 0.08, 0.4)
end

function SoundFx:levelUp()
  self:_seq({ 523, 659, 784, 1047 }, 0.1, 0.45)
end

return SoundFx
