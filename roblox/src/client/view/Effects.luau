--!nonstrict
-- ============================================================================
-- Effects — small TweenService helpers, the Roblox stand-ins for the Phaser
-- tweens the web village used (flashPayout, pulseDay, celebrate, festival).
-- Pure presentation; safe to no-op if given a destroyed instance.
-- ============================================================================
local TweenService = game:GetService("TweenService")

local Effects = {}

local function alive(inst): boolean
  return typeof(inst) == "Instance" and inst.Parent ~= nil
end

-- Tween any set of properties; returns the Tween so callers can chain :Completed.
function Effects.tween(inst, seconds, props, style, dir)
  if not alive(inst) then
    return nil
  end
  local info = TweenInfo.new(
    seconds,
    style or Enum.EasingStyle.Quad,
    dir or Enum.EasingDirection.Out
  )
  local t = TweenService:Create(inst, info, props)
  t:Play()
  return t
end

-- A quick scale "pop": grow then settle. `part` must have a base Size.
function Effects.pop(part, scale, seconds)
  if not alive(part) then
    return
  end
  scale = scale or 1.25
  seconds = seconds or 0.18
  local base = part:GetAttribute("baseSize") or part.Size
  part:SetAttribute("baseSize", base)
  local up = TweenService:Create(
    part, TweenInfo.new(seconds, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
    { Size = base * scale }
  )
  up.Completed:Connect(function()
    if alive(part) then
      TweenService:Create(
        part, TweenInfo.new(seconds, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
        { Size = base }
      ):Play()
    end
  end)
  up:Play()
end

-- Float a bit of text (e.g. "+12 🧮") upward from a world position and fade it.
function Effects.floatLabel(text, worldPos, color)
  local part = Instance.new("Part")
  part.Anchored = true
  part.CanCollide = false
  part.CanQuery = false
  part.Transparency = 1
  part.Size = Vector3.new(1, 1, 1)
  part.CFrame = CFrame.new(worldPos)
  part.Parent = workspace

  local gui = Instance.new("BillboardGui")
  gui.Size = UDim2.fromScale(6, 2)
  gui.AlwaysOnTop = true
  gui.Parent = part

  local label = Instance.new("TextLabel")
  label.BackgroundTransparency = 1
  label.Size = UDim2.fromScale(1, 1)
  label.Font = Enum.Font.GothamBold
  label.TextScaled = true
  label.TextColor3 = color or Color3.fromRGB(255, 224, 130)
  label.TextStrokeTransparency = 0.4
  label.Text = text
  label.Parent = gui

  TweenService:Create(part, TweenInfo.new(1.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
    CFrame = part.CFrame + Vector3.new(0, 4, 0),
  }):Play()
  local fade = TweenService:Create(label, TweenInfo.new(1.1), { TextTransparency = 1, TextStrokeTransparency = 1 })
  fade:Play()
  fade.Completed:Connect(function()
    part:Destroy()
  end)
end

return Effects
