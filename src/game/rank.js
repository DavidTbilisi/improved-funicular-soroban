// ============================================================================
// Village rank — a pure, always-climbing "how big is my village" number derived
// PURELY from the village blob (nothing stored, like goals.js). Building levels
// are endless (economy.js), but nothing made that climb legible; the rank turns
// total building levels + sp minted into one ascending title so the grind shows
// on the HUD. It NEVER caps: past the named tiers the top name keeps ascending
// with a numeral. Rank reflects the CURRENT village, so a raze lowers it — but
// any rank achievement already earned stays earned (achievementTracker.js).
//
//   score      = Σ building levels + ⌊spEarned / SP_PER_POINT⌋
//   threshold(n)= n·(n+2)      — score to be AT rank n (rungs get wider)
//   villageRank → { n, title, cur, next, score }  (cur/next drive a bar)
// ============================================================================
export const SP_PER_POINT = 50;

const RANK_NAMES = Object.freeze([
  'Camp', 'Hamlet', 'Village', 'Town', 'Township',
  'City', 'Borough', 'Metropolis', 'Capital', 'Megalopolis',
]);

// Endless titles: the named tiers, then the top name + an ascending numeral.
export function rankTitle(n) {
  if (n < RANK_NAMES.length) return RANK_NAMES[n];
  return `${RANK_NAMES[RANK_NAMES.length - 1]} ${n - RANK_NAMES.length + 2}`;
}

export function totalLevels(village) {
  let sum = 0;
  for (const cell of village.grid || []) if (cell) sum += cell.level;
  return sum;
}

export function villageRank(village) {
  const spEarned = (village.stats && village.stats.spEarned) || 0;
  const score = totalLevels(village) + Math.floor(spEarned / SP_PER_POINT);
  // Largest n with n·(n+2) ≤ score, by exact integer stepping (no float error):
  let n = Math.max(0, Math.floor(Math.sqrt(score + 1)) - 1);
  while ((n + 1) * (n + 3) <= score) n++;
  while (n > 0 && n * (n + 2) > score) n--;
  const base = n * (n + 2);
  return { n, title: rankTitle(n), cur: score - base, next: 2 * n + 3, score };
}
