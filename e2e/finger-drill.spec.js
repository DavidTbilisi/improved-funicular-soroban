// Drives the Finger × deck through a full session: teaching plates on load,
// start the deck, a correct rep, a missed rep (reveal narrates the hands AND
// redraws the method plate; the missed fact is re-dealt two items later), then
// stop — and check the results figures (trend + forecast line, bests, facts
// heatmap) refresh from the saved session. Covers the drill loop and the
// drills-page figure wiring end-to-end, which the DOM-free unit suite exercises
// only in pieces (the 'started'/'stopped' re-render subscription and the
// revealFigFor injection live in the page module and have no unit test).
import { test, expect } from '@playwright/test';

const readProblem = async page => {
  const prompt = await page.locator('#drillPrompt').textContent();
  const m = prompt.match(/^(\d+) × (\d+)$/);
  expect(m).not.toBeNull();
  const [a, b] = [Number(m[1]), Number(m[2])];
  for (const n of [a, b]) {
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(9);
  }
  return { prompt, product: a * b };
};

const answer = async (page, value) => {
  await page.locator('#drillInput').fill(String(value));
  await page.locator('#drillInput').press('Enter');
};

test('finger × deck: plates, correct + missed reps, requeue, figures refresh on stop', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err));

  await page.goto('drills.html');

  // Figs. 1–3 teaching plates are mounted; results figures start empty (fresh profile).
  await expect(page.locator('#figFinger')).toContainText('7 × 8 = 50 + 6 = 56');
  await expect(page.locator('#figNineFold')).toContainText('9 × 3 = 27');
  await expect(page.locator('#figChisanbop')).toContainText('chisanbop');
  await expect(page.locator('#figBests .fig-empty')).toBeVisible();
  await expect(page.locator('#figFacts .fig-empty')).toBeVisible();

  await page.getByRole('button', { name: 'Finger ×' }).click();
  // Starting a deck retargets the session-trend figure to it.
  await expect(page.locator('#figSessions')).toContainText('Finger ×');

  // Rep 1: the true product. Correct either way; under/over the 2.5s floor
  // depends on machine speed.
  const rep1 = await readProblem(page);
  await answer(page, rep1.product);
  await expect(page.locator('#drillFeedback')).toContainText('✓');
  await expect(page.locator('#drillFeedback')).toContainText('raised');
  await expect(page.locator('#drillFeedback svg')).toHaveCount(0); // no plate on a pass
  await expect(page.locator('#drillStats')).toContainText('accuracy 100%');

  // Rep 2: a wrong product → miss; the reveal narrates the hands and redraws
  // the method as the actual plate.
  await expect(page.locator('#drillFeedback')).toBeEmpty(); // next item dealt
  const rep2 = await readProblem(page);
  await answer(page, rep2.product + 1);
  await expect(page.locator('#drillFeedback')).toContainText('✗ miss');
  await expect(page.locator('#drillFeedback')).toContainText('folded');
  await expect(page.locator('#drillFeedback .drill-fig svg')).toBeVisible();
  await expect(page.locator('#drillStats')).toContainText('accuracy 50%');

  // The bag re-deals the missed fact two items later: reps 3 and 4 differ from
  // it (bag dealing also guarantees no repeats within a round), rep 5 is the
  // miss coming back.
  for (const expected of [null, null, rep2.prompt]) {
    await expect(page.locator('#drillFeedback')).toBeEmpty();
    const rep = await readProblem(page);
    if (expected === null) expect(rep.prompt).not.toBe(rep2.prompt);
    else expect(rep.prompt).toBe(expected);
    await answer(page, rep.product);
    await expect(page.locator('#drillFeedback')).toContainText('✓');
  }

  // Stop persists the session and refreshes the results figures: the trend
  // (with its automaticity-forecast one-liner), the bests, and the facts
  // heatmap — five facts now have lifetime records.
  await page.locator('#drillStop').click();
  await expect(page.locator('#figSessions')).toContainText('last 1 saved');
  await expect(page.locator('#figSessions svg')).toBeVisible();
  await expect(page.locator('#figSessions .drill-forecast')).toContainText('forecast automaticity');
  await expect(page.locator('#figBests svg')).toBeVisible();
  await expect(page.locator('#figFacts table.multab')).toBeVisible();
  await expect(page.locator('#figFacts')).toContainText('%');

  expect(pageErrors).toEqual([]);
});
