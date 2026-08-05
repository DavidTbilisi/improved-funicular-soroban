--!nonstrict
-- ============================================================================
-- AnzanSession — the flash-anzan state machine, Roblox-free and Observable.
-- Faithful port of src/anzan/anzanSession.js; read that header for the design.
--
-- THE SCHEDULE IS SELF-CHAINING: each step books exactly ONE timer for the
-- next, so stopping is exact (one handle to clear — an abandoned round can
-- never flash a stray number into the next) and the whole thing walks
-- tick-by-tick against a fake single-slot timer in tests/anzan.spec.luau.
-- _after nulls the handle BEFORE running the callback, which is the invariant
-- that makes cancel-after-fire impossible (and lets task.cancel be used
-- safely on the client: a fired thread is never cancelled).
--
-- The pace is PINNED per round (roundMsPinned): a speed click mid-flash can
-- never rescale a round already being read, and the result event reports the
-- pace that was actually shown.
--
-- Events: started / flash / blank / answer / result / speed / stopped —
-- payloads match the web (minus the log-derived best/fastest, which live in
-- the village blob here; see GameSession.anzanResult).
-- ============================================================================
local Observable = if script
  then require(script.Parent.Parent.state.Observable)
  else require("../state/Observable")
local Levels = if script then require(script.Parent.Levels) else require("./Levels")

local AnzanSession = setmetatable({}, { __index = Observable })
AnzanSession.__index = AnzanSession

-- deps: { levels?, rng, clock? = {now->ms}, timer? = {set(fn,ms)->handle, clear(handle)} }
function AnzanSession.new(deps)
  local self = setmetatable(Observable.new(), AnzanSession)
  self.levels = deps.levels or Levels.ANZAN_LEVELS
  self.rng = deps.rng
  self.clock = deps.clock or { now = function() return 0 end }
  self.timer = deps.timer or { set = function() return 0 end, clear = function() end }
  self:_reset()
  return self
end

function AnzanSession:_reset()
  self.level = nil
  self.intervalMs = 0 -- the pace the NEXT round will use
  self.roundMsPinned = 0 -- the pace the round in flight is actually using
  self.round = nil -- { terms, sum }
  self.phase = "idle" -- idle | flash | blank | answer
  self.index = -1
  self.streak = 0
  self.t0 = 0
  self._id = nil
end

function AnzanSession:isActive(): boolean
  return self.phase ~= "idle"
end

function AnzanSession:isAccepting(): boolean
  return self.phase == "answer"
end

function AnzanSession:_cancel()
  if self._id ~= nil then
    self.timer.clear(self._id)
    self._id = nil
  end
end

function AnzanSession:_after(ms, fn)
  self:_cancel()
  self._id = self.timer.set(function()
    self._id = nil
    fn()
  end, ms)
end

function AnzanSession:start(levelId, intervalMs)
  local level = Levels.levelById(levelId)
  if not level then
    for _, l in self.levels do
      if l.id == levelId then
        level = l
        break
      end
    end
  end
  if not level then
    return
  end
  self:_cancel()
  self.level = level
  self.intervalMs = intervalMs or level.baseMs
  self.streak = 0
  self:notify({
    type = "started", levelId = level.id, title = level.title, teach = level.teach,
    terms = level.terms, digits = level.digits, intervalMs = self.intervalMs,
    roundMs = Levels.roundMs(level, self.intervalMs), floor = level.floor, streak = 0,
  })
  self:newRound()
end

-- Change the pace between rounds; mid-round it takes effect on the NEXT one.
function AnzanSession:setSpeed(intervalMs)
  if not self.level or not intervalMs then
    return
  end
  self.intervalMs = intervalMs
  self:notify({ type = "speed", intervalMs = intervalMs, roundMs = Levels.roundMs(self.level, intervalMs) })
end

function AnzanSession:newRound()
  if not self.level then
    return
  end
  self:_cancel()
  -- Pin the pace for the whole round HERE (see header).
  self.roundMsPinned = self.intervalMs
  self.round = Levels.genRound(self.level, self.rng)
  self.index = -1
  self:_step()
end

-- One tick of the schedule: light the next number, or blank, or ask.
function AnzanSession:_step()
  local litMs = math.max(40, math.round(self.roundMsPinned * Levels.LIT_SHARE))
  local gapMs = math.max(20, self.roundMsPinned - litMs)

  if self.phase == "flash" then
    self.phase = "blank"
    self:notify({ type = "blank", index = self.index, total = #self.round.terms })
    self:_after(gapMs, function()
      self:_step()
    end)
    return
  end

  self.index += 1
  if self.index < #self.round.terms then
    self.phase = "flash"
    self:notify({
      type = "flash", value = self.round.terms[self.index + 1], -- 1-based storage, 0-based index
      index = self.index, total = #self.round.terms,
    })
    self:_after(litMs, function()
      self:_step()
    end)
    return
  end

  self.phase = "answer"
  self.t0 = self.clock.now()
  self:notify({ type = "answer", total = #self.round.terms })
end

-- Accepts a string or number; anything unparseable counts as WRONG rather
-- than being swallowed — a fumbled keystroke breaks the streak like a wrong
-- sum would.
function AnzanSession:submit(input)
  if self.phase ~= "answer" then
    return nil
  end
  local given
  if type(input) == "number" then
    given = input
  else
    given = tonumber((string.gsub(tostring(input), "[%s,]", "")))
  end
  if given ~= nil and given % 1 ~= 0 then
    given = nil
  end
  local ok = given ~= nil and given == self.round.sum
  local elapsedMs = math.floor(self.clock.now() - self.t0 + 0.5)

  self.streak = if ok then self.streak + 1 else 0
  local justPassed = ok and self.streak == self.level.floor
  local paceMs = self.roundMsPinned -- the pace this round was actually shown at

  self.phase = "idle"
  local evt = {
    type = "result", ok = ok, given = given,
    sum = self.round.sum, terms = table.clone(self.round.terms),
    elapsedMs = elapsedMs, intervalMs = paceMs, streak = self.streak,
    levelId = self.level.id, floor = self.level.floor, justPassed = justPassed,
  }
  self:notify(evt)
  return evt
end

function AnzanSession:stop()
  self:_cancel()
  local was = self.level
  self:_reset()
  if was then
    self:notify({ type = "stopped" })
  end
end

return AnzanSession
