--!nonstrict
-- ============================================================================
-- Cube-face grammar — digit -> die-face percept. Port of src/domain/faces.js
-- (the codec-only helpers are omitted; the board uses the die grid).
-- ============================================================================
local Pegs = if script then require(script.Parent.Pegs) else require("./Pegs")
local CUBE_FACES = Pegs.CUBE_FACES

local Faces = {}

-- The face objects that spell a digit: {} for 0, one earth face for 1-4,
-- the rose for 5, and rose + earth face for 6-9.
function Faces.cubeFacesForDigit(d: number)
  if d == 0 then
    return {}
  end
  if d <= 5 then
    return { CUBE_FACES[d] }
  end
  return { CUBE_FACES[5], CUBE_FACES[d - 5] }
end

function Faces.cubeEmojis(d: number): string
  local parts = {}
  for _, f in Faces.cubeFacesForDigit(d) do
    table.insert(parts, f.emoji)
  end
  return table.concat(parts)
end

function Faces.cubeName(d: number): string
  local f = Faces.cubeFacesForDigit(d)
  if #f == 0 then
    return "bare column"
  end
  local words = {}
  for _, x in f do
    table.insert(words, x.word)
  end
  return table.concat(words, " + ")
end

-- The die-face layout (observer inside the cube): opposite faces sum to 7.
Faces.CUBE_LAYOUT = table.freeze({
  table.freeze({ pos = "top", value = 3 }),
  table.freeze({ pos = "left", value = 2 }),
  table.freeze({ pos = "center", value = 1 }),
  table.freeze({ pos = "right", value = 5 }),
  table.freeze({ pos = "bottom", value = 4 }),
})

-- The face VALUES a digit lights up: {} for 0, earth face for 1-4, rose (5) for
-- 5, rose + earth for 6-9.
function Faces.cubeFaceValues(d: number)
  if d == 0 then
    return {}
  end
  if d <= 5 then
    return { d }
  end
  return { 5, d - 5 }
end

-- Position -> value, inverted from CUBE_LAYOUT (the single source for the grid).
local FACE_VALUE = {}
for _, f in Faces.CUBE_LAYOUT do
  FACE_VALUE[f.pos] = f.value
end

-- The inverse of cubeFaceValues: which digit a set of lit die cells spells.
-- A digit is at most one earth cell (center 1 / left 2 / top 3 / bottom 4) plus
-- the rose (right 5), so 6-9 = right + earth. The center has no arrow of its
-- own, so top+bottom together stands in for it (the chord keyboard's way to
-- reach the middle cell). Returns 0 for the empty set and nil for anything that
-- isn't a real die face (e.g. two earth cells at once). Port of digitFromFaces.
function Faces.digitFromFaces(positions)
  local set = {}
  for _, p in positions do
    set[p] = true
  end
  if set.top and set.bottom then
    set.top, set.bottom = nil, nil
    set.center = true
  end
  local earth = nil
  for p in set do
    if p ~= "right" then
      if earth ~= nil or FACE_VALUE[p] == nil then
        return nil
      end
      earth = FACE_VALUE[p]
    end
  end
  return (if set.right then 5 else 0) + (earth or 0)
end

return Faces
