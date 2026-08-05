--!nonstrict
-- ============================================================================
-- Achievement id -> Roblox badge id. Create badges on the Creator Dashboard
-- (the experience → Engagement → Badges), then map them here — only mapped
-- ids are awarded, and the SERVER re-validates the achievement against the
-- healed village before calling BadgeService, so the client can't mint one.
-- 0 / absent = no platform badge for that achievement (the in-game unlock
-- still works). BadgeService only awards in the published experience.
-- ============================================================================
return table.freeze({
  -- ["first-solve"] = 0,
  -- ["founded"] = 0,
})
