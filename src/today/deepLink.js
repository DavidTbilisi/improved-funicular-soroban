// ============================================================================
// Deep links — the one contract between the Today plan and the pages it sends
// you to. A plan task is only useful if the link lands on the RIGHT level or
// deck already started, not on the page's default.
//
//   practice.html?level=big-sub    drills.html?deck=fingerTimes
//   anzan.html?level=five2         exam.html?grade=kyu8
//   trainer.html?mode=mul-1x1      game.html
//
// Kept here, DOM-free and on both sides of the wire, so the writer (plan.js)
// and the readers (pages/practice.js, drills.js, trainer.js) cannot drift — a
// unit test in test/todayPlan.test.js round-trips every task the ladder emits.
// The page passes `location.search` in; this module never touches `location`.
// ============================================================================

// Which query param names the target on each page. A page absent from this map
// takes no target (the village has no sub-selection — a contract is a contract).
export const TARGET_PARAM = Object.freeze({
  practice: 'level',
  drills: 'deck',
  trainer: 'mode',
  anzan: 'level',
  exam: 'grade',
});

export const PAGE_HREF = Object.freeze({
  today: 'index.html',
  explore: 'explore.html',
  practice: 'practice.html',
  trainer: 'trainer.html',
  drills: 'drills.html',
  anzan: 'anzan.html',
  exam: 'exam.html',
  vault: 'vault.html',
  game: 'game.html',
  reference: 'reference.html',
});

export function hrefFor(page, targetId) {
  const href = PAGE_HREF[page];
  if (!href) return null;
  const param = TARGET_PARAM[page];
  return param && targetId ? `${href}?${param}=${encodeURIComponent(targetId)}` : href;
}

// '?level=big-sub' → 'big-sub'. Returns null when absent or when the page takes
// no target, so a caller can always write `if (want) …`.
export function targetFromSearch(search, page) {
  const param = TARGET_PARAM[page];
  if (!param || typeof search !== 'string') return null;
  try {
    return new URLSearchParams(search).get(param) || null;
  } catch {
    return null;
  }
}
