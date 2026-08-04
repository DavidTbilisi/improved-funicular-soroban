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

return Faces
