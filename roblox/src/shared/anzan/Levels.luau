--!nonstrict
-- ============================================================================
-- Flash anzan — the ladder. Port of src/anzan/levels.js.
--
-- Anzan (暗算) is the soroban's endgame: the beads move on an imagined board.
-- FLASH anzan is its competition form — numbers appear one at a time, each
-- erased before the next arrives. Difficulty is three axes — how MANY, how
-- WIDE, how FAST — laddered over the first two with speed as a live control.
-- Levels are never locked (the rod trainer's rule).
--
-- PORT ADDITION: each rung carries `baseSp` and the payout functions, styled
-- after Challenges.payout — anzan IS soroban work, so it pays sp in the
-- village economy (but never advances the day; see GameSession.anzanResult).
-- ============================================================================
local Levels = {}

-- Flash interval, slowest → fastest, ms per number. The top of the ladder is
-- roughly competition pace: 10 three-digit numbers at 200 ms is two seconds
-- total. PORT ADDITION: three learner paces above the web's 2000 ms ceiling —
-- a first 3-digit round deserves four seconds a number. Slower than a rung's
-- baseMs never pays a pace bonus, so patience costs nothing and farms nothing.
Levels.SPEEDS = table.freeze({ 4000, 3200, 2600, 2000, 1600, 1300, 1000, 800, 650, 500, 400, 300, 250, 200 })

-- Share of each interval the number is actually lit; the rest is blank. The
-- gap is load-bearing: without it two equal consecutive numbers read as one.
Levels.LIT_SHARE = 0.68

Levels.ANZAN_LEVELS = table.freeze({
  table.freeze({
    id = "warm", title = "Warm-up · 3 × 1 digit", terms = 3, digits = 1, baseMs = 1600, floor = 5, baseSp = 6,
    teach = "Three single digits. Everything happens on the ones rod — direct moves and the five-complement. Watch the rod, not the numeral.",
  }),
  table.freeze({
    id = "five1", title = "5 × 1 digit", terms = 5, digits = 1, baseMs = 1300, floor = 5, baseSp = 9,
    teach = "Five digits now, so the ones rod overflows and you carry into the tens. Big friend with nothing to look at.",
  }),
  table.freeze({
    id = "ten1", title = "10 × 1 digit", terms = 10, digits = 1, baseMs = 1000, floor = 5, baseSp = 12,
    teach = "Ten in a row. What is being trained is holding the board while the next number lands on it.",
  }),
  table.freeze({
    id = "three2", title = "3 × 2 digits", terms = 3, digits = 2, baseMs = 1600, floor = 5, baseSp = 12,
    teach = "Two rods at once. Read each number as a pair of rods and set both in one gesture.",
  }),
  table.freeze({
    id = "five2", title = "5 × 2 digits", terms = 5, digits = 2, baseMs = 1300, floor = 5, baseSp = 16,
    teach = "Five two-digit numbers. Carries now propagate across rods.",
  }),
  table.freeze({
    id = "ten2", title = "10 × 2 digits", terms = 10, digits = 2, baseMs = 1000, floor = 5, baseSp = 22,
    teach = "The standard club exercise. If you lose the board, keep the rods you still hold.",
  }),
  table.freeze({
    id = "three3", title = "3 × 3 digits", terms = 3, digits = 3, baseMs = 1600, floor = 4, baseSp = 20,
    teach = "Three rods. The hundreds rod barely moves — spend your attention on the ones.",
  }),
  table.freeze({
    id = "five3", title = "5 × 3 digits", terms = 5, digits = 3, baseMs = 1300, floor = 4, baseSp = 28,
    teach = "Five three-digit numbers — where compound trades appear: a carry whose payback is itself blocked.",
  }),
  table.freeze({
    id = "ten3", title = "10 × 3 digits", terms = 10, digits = 3, baseMs = 1000, floor = 3, baseSp = 40,
    teach = "Competition shape. No time to name a single digit — only to move rods.",
  }),
})

function Levels.levelById(id)
  for _, l in Levels.ANZAN_LEVELS do
    if l.id == id then
      return l
    end
  end
  return nil
end

-- Nearest speed in SPEEDS, then step by dir rungs (−1 slower, +1 faster).
function Levels.speedStep(ms: number, dir: number): number
  local i, best = 1, math.huge
  for k, s in Levels.SPEEDS do
    local d = math.abs(s - ms)
    if d < best then
      best = d
      i = k
    end
  end
  return Levels.SPEEDS[math.max(1, math.min(#Levels.SPEEDS, i + (dir or 0)))]
end

-- Every term has exactly `digits` digits — the width IS the difficulty, so a
-- narrow term would be a free one (the classic rule).
function Levels.genRound(level, rng)
  local lo = if level.digits == 1 then 1 else 10 ^ (level.digits - 1)
  local span = 10 ^ level.digits - lo
  local terms, sum = {}, 0
  for _ = 1, level.terms do
    local t = lo + rng:int(span)
    table.insert(terms, t)
    sum += t
  end
  return { terms = terms, sum = sum }
end

function Levels.roundMs(level, intervalMs: number): number
  return level.terms * intervalMs
end

-- --- payout (port addition) --------------------------------------------------
-- Styled after Challenges.payoutParts/payout: base by rung, a pace bonus that
-- ramps linearly from 0 at the rung's baseMs to ceil(base/2) at the 200 ms
-- competition floor, and the same capped streak bonus. `streak` is the streak
-- BEFORE this round, as with contracts.
function Levels.payoutParts(level, intervalMs: number, streak: number)
  streak = streak or 0
  local base = level.baseSp
  local paceBonus = 0
  if intervalMs < level.baseMs then
    paceBonus = math.ceil(base / 2 * (level.baseMs - intervalMs) / (level.baseMs - 200))
  end
  return {
    base = base,
    paceBonus = paceBonus,
    streakBonus = math.min(streak, 10) * math.ceil(base / 20),
  }
end

function Levels.payout(level, intervalMs: number, bonus: number, streak: number): number
  local p = Levels.payoutParts(level, intervalMs, streak)
  return math.floor((p.base + p.paceBonus + p.streakBonus) * (1 + (bonus or 0)))
end

return table.freeze(Levels)
