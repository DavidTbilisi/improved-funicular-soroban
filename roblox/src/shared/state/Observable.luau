--!nonstrict
-- ============================================================================
-- Observable — the Subject half of the Observer pattern. Port of
-- src/state/observable.js. AbacusStore, GameSession and AchievementTracker
-- extend it via metatable inheritance (see those modules).
-- ============================================================================
local Observable = {}
Observable.__index = Observable

function Observable.new()
  return setmetatable({ _observers = {} }, Observable)
end

-- subscribe(fn) -> unsubscribe(). fn receives the payload passed to notify().
function Observable:subscribe(fn)
  self._observers[fn] = true
  return function()
    self._observers[fn] = nil
  end
end

function Observable:notify(payload)
  -- Snapshot first so a handler that unsubscribes mid-iteration is safe.
  local fns = {}
  for fn in pairs(self._observers) do
    table.insert(fns, fn)
  end
  for _, fn in fns do
    fn(payload)
  end
end

return Observable
