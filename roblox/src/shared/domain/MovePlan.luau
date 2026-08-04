--!nonstrict
-- ============================================================================
-- Move planner — flattens any digit add/subtract into the exact chain of
-- single-key bead moves. Port of src/domain/movePlan.js.
--   planAdd(6, 7) -> { rule = "big", steps = {"+10","-5","+2"},
--                      story = { {op="+7",rule="big",into="+10 -3"}, ... } }
-- ============================================================================
local Soroban = if script then require(script.Parent.Soroban) else require("./Soroban")

local MovePlan = {}

-- Keyboard for each primitive move — mirrors the die-cross layout.
MovePlan.MOVE_KEYS = table.freeze({
  ["+1"] = "K", ["+2"] = "J", ["+3"] = "I", ["+4"] = ",", ["+5"] = "L", ["+10"] = "U",
  ["-1"] = "D", ["-2"] = "S", ["-3"] = "E", ["-4"] = "C", ["-5"] = "F", ["-10"] = "R",
})

local function tokens(move: string)
  local out = {}
  for tok in string.gmatch(move, "%S+") do
    table.insert(out, tok)
  end
  return out
end
MovePlan.tokens = tokens

-- Add digit d (1..9) onto rod digit c (0..9), fully flattened.
function MovePlan.planAdd(c: number, d: number)
  local cl = Soroban.classifyAdd(c, d)
  local story = { { op = "+" .. d, rule = cl.rule, into = cl.move } }
  if cl.rule ~= "big" then
    return { rule = cl.rule, steps = tokens(cl.move), story = story }
  end
  local p = 10 - d
  local pay = Soroban.classifySub(c, p)
  if pay.rule ~= "direct" then
    table.insert(story, { op = "-" .. p, rule = pay.rule, into = pay.move })
  end
  local steps = { "+10" }
  for _, t in tokens(pay.move) do
    table.insert(steps, t)
  end
  return { rule = "big", steps = steps, story = story }
end

-- Subtract digit d (1..9) from rod digit c (0..9), fully flattened.
function MovePlan.planSub(c: number, d: number)
  local cl = Soroban.classifySub(c, d)
  local story = { { op = "-" .. d, rule = cl.rule, into = cl.move } }
  if cl.rule ~= "big" then
    return { rule = cl.rule, steps = tokens(cl.move), story = story }
  end
  local q = 10 - d
  local pay = Soroban.classifyAdd(c, q)
  if pay.rule ~= "direct" then
    table.insert(story, { op = "+" .. q, rule = pay.rule, into = pay.move })
  end
  local steps = { "-10" }
  for _, t in tokens(pay.move) do
    table.insert(steps, t)
  end
  return { rule = "big", steps = steps, story = story }
end

-- Display helpers (typographic minus for reading; ASCII minus stays in data).
function MovePlan.stepsText(steps): string
  return (string.gsub(table.concat(steps, " "), "-", "\u{2212}"))
end

function MovePlan.keysText(steps): string?
  local out = {}
  for _, s in steps do
    local k = MovePlan.MOVE_KEYS[s]
    if not k then
      return nil
    end
    table.insert(out, k)
  end
  return table.concat(out, " then ")
end

return MovePlan
