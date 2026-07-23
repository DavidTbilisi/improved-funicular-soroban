// 運指 in a browser. The unit suite proves the rule and the fusion; what a
// browser adds is that the fingering actually reaches the learner — on the
// coach line of every move the board takes, in the practice hint, and as two
// decks that grade it — and that a missed motion count answers with the plate.
import { test, expect } from '@playwright/test';

test('every coach line on the board names the finger', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('explore.html');
  const coach = page.locator('#coach');

  // A direct move: one earth bead toward the bar is the thumb's only job.
  await page.keyboard.press('k');                     // +1 on the ones rod
  await expect(coach).toContainText('thumb');

  // Its mirror is the index finger — the thumb never pulls.
  await page.keyboard.press('d');                     // −1
  await expect(coach).toContainText('index');

  // The heaven bead is the index finger's in both directions.
  await page.keyboard.press('l');                     // +5 → rod shows 5
  await expect(coach).toContainText('index');

  // A blocked digit is refused with the trade to key by hand — and with what
  // the hand does with it. Here 9 + 1 carries a ten and pays it back.
  await page.keyboard.press(',');                     // +4 → rod shows 9
  await page.keyboard.press('k');                     // +1: blocked, needs the carry
  await expect(coach).toContainText('needs a carry trade');
  await expect(coach).toContainText('thumb + index together');
  expect(errors).toEqual([]);
});

test('the practice hint gives the keys and then the hand', async ({ page }) => {
  // The small-friend level is where a hint has something to say about the
  // fingers, so open the ladder that far first.
  await page.addInitScript(() => localStorage.setItem('npv-tutorial-progress',
    JSON.stringify({ unlocked: 4, best: {}, v: 2 })));
  await page.goto('practice.html?level=small-add');
  await expect(page.locator('#tutStage')).toHaveClass(/on/);
  await page.click('#tutHint');
  const hint = page.locator('#tutFeedback');
  await expect(hint).toContainText('small friend');
  // Whatever question was dealt, the hint ends with what the hand does: +5 and
  // −n travel the same way, so this level's trade is one index sweep.
  await expect(hint).toContainText('index sweeps both');
});

test('the fingering plate is on the drills page, rule and all', async ({ page }) => {
  await page.goto('drills.html');
  const fig = page.locator('#figFingering');
  await expect(fig).toContainText('The fingering — 運指');
  await expect(fig).toContainText('the index finger does everything else');
  await expect(fig.locator('svg')).toHaveAttribute('aria-label', /hand motion/);
});

test('the bead deck grades thumb against index', async ({ page }) => {
  await page.goto('drills.html?deck=fingerBead');
  const prompt = page.locator('#drillPrompt');
  await expect(prompt).toBeVisible();

  for (let i = 0; i < 4; i++) {
    const step = (await prompt.textContent()).trim().replace('−', '-');
    // The rule, restated here on purpose: a test that imported it could not
    // catch the module changing its mind.
    const thumb = /^\+([1-4]|10)$/.test(step);
    await page.fill('#drillInput', thumb ? 'thumb' : 'index');
    await page.press('#drillInput', 'Enter');
    await expect(page.locator('#drillFeedback')).toContainText('✓');
    // Wait for the next item before typing again — the drill auto-advances,
    // and typing into the gap answers a question that is already marked.
    await expect(page.locator('#drillFeedback')).toHaveText('');
  }
  // …and the short form is accepted, since it is what a hand-drill wants typed.
  const step = (await prompt.textContent()).trim().replace('−', '-');
  await page.fill('#drillInput', /^\+([1-4]|10)$/.test(step) ? 't' : 'i');
  await page.press('#drillInput', 'Enter');
  await expect(page.locator('#drillFeedback')).toContainText('✓');
});

test('a missed motion count is answered with the plate that walks it', async ({ page }) => {
  await page.goto('drills.html?deck=fingerMotions');
  await expect(page.locator('#drillPrompt')).toContainText(/[+−]/);
  // The drill wipes its feedback when it deals the next item, so assertions
  // made one after another against the live node race that clear under load.
  // Record every value the node takes and assert against the record.
  await page.evaluate(() => {
    const el = document.getElementById('drillFeedback');
    window.__fb = [];
    new MutationObserver(() => window.__fb.push(el.innerHTML))
      .observe(el, { childList: true, subtree: true, characterData: true });
  });
  const seen = async () => (await page.evaluate(() => window.__fb)).join('\n');

  // 9 is never the number of motions a rod move takes — a guaranteed miss.
  await page.fill('#drillInput', '9');
  await page.press('#drillInput', 'Enter');
  await expect.poll(seen).toContain('✗');
  const record = await seen();
  expect(record).toContain('motion');
  expect(record).toContain('<svg');          // the plate that walks the fingering
});

test('a missed fingering question goes into the mistake book', async ({ page }) => {
  await page.goto('drills.html?deck=fingerBead');
  await expect(page.locator('#drillPrompt')).toBeVisible();
  await page.fill('#drillInput', 'elbow');
  await page.press('#drillInput', 'Enter');
  await expect(page.locator('#drillFeedback')).toContainText('✗');

  await page.goto('misses.html');
  await expect(page.locator('#msList')).toContainText('Which finger?');
});
