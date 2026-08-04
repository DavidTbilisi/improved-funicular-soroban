--!nonstrict
-- Minimal headless assert harness for the pure-logic specs. Runs under the
-- `luau` CLI (string requires). NOT part of the Roblox game tree — the Rojo
-- project ignores *.spec.luau, and this folder is not mapped.
local H = {}
H.passed = 0
H.failed = 0
H.failures = {}
H.suite = "?"

function H.describe(name)
  H.suite = name
end

local function fail(msg)
  H.failed += 1
  table.insert(H.failures, string.format("  [%s] %s", H.suite, msg))
end

function H.eq(actual, expected, msg)
  if actual ~= expected then
    fail(string.format("%s — expected %s, got %s", msg or "eq", tostring(expected), tostring(actual)))
  else
    H.passed += 1
  end
end

function H.ok(cond, msg)
  if not cond then
    fail(string.format("%s — expected truthy", msg or "ok"))
  else
    H.passed += 1
  end
end

-- Deep-ish equality for flat arrays/records of primitives.
function H.same(actual, expected, msg)
  local function eq(a, b)
    if type(a) ~= "table" or type(b) ~= "table" then
      return a == b
    end
    for k, v in pairs(a) do
      if not eq(v, b[k]) then
        return false
      end
    end
    for k in pairs(b) do
      if a[k] == nil then
        return false
      end
    end
    return true
  end
  if not eq(actual, expected) then
    fail(string.format("%s — tables differ", msg or "same"))
  else
    H.passed += 1
  end
end

function H.report(label)
  print(string.format("\n%s: %d passed, %d failed", label or "results", H.passed, H.failed))
  for _, f in H.failures do
    print(f)
  end
  if H.failed > 0 then
    error(string.format("%d assertion(s) failed", H.failed), 0)
  end
end

return H
