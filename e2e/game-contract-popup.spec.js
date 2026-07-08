// Regression test for a focus-mode layout bug: the contract title and beads
// readout grow in .ck-focused and don't shrink, which squeezed the payout
// column (.ck-strip-mid) toward 0px width and made its wrapped text render
// one word per line. See styles.css around ".ck-focused .ck-strip-row".
import { test, expect } from '@playwright/test';

test('a live contract popup keeps a readable payout column', async ({ page }) => {
  await page.goto('game.html');

  // The Magnate tier ("add / subtract in the millions") produces the
  // longest prompts/payout text — the tier that exposed the bug.
  await page.locator('.game-contract', { hasText: 'Magnate' }).click();

  const body = page.locator('body');
  await expect(body).toHaveClass(/ck-focused/);
  await expect(page.locator('#gameStage')).toHaveClass(/on/);

  // The prompt takes its own full-width row instead of squeezing its
  // flexible sibling.
  const promptBox = await page.locator('#gamePrompt').boundingBox();
  const midBox = await page.locator('.ck-strip-mid').boundingBox();
  expect(midBox.width).toBeGreaterThan(150);
  expect(promptBox.width).toBeGreaterThan(midBox.width);

  // Wrapped sub/payout text should still read as a couple of short lines,
  // not a tall single-word-per-line column (the crushed-width symptom).
  expect(midBox.height).toBeLessThan(80);

  await expect(page.locator('#gameSub')).toContainText(/beads start at/);
  await expect(page.locator('#gamePay')).not.toBeEmpty();
});
