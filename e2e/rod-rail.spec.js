// The rod rail: the focused rod lifted out like a calendar month tab, with a
// brass panel below. A DOM-free unit test can't see the lift or the panel text,
// so this drives the real page: the ones rod is lifted at load, moving focus
// moves the lift, and the panel reads the focused rod's place + shift + digit.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('practice.html');
});

test('the rail lifts the focused rod and follows focus', async ({ page }) => {
  const lifted = page.locator('#tutRail .rr-slot.on');

  // Focus starts on the ones rod (exponent 0).
  await expect(lifted).toHaveCount(1);
  await expect(lifted).toHaveAttribute('data-exp', '0');

  // ← moves focus one place up (to the tens rod, exponent 1).
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#tutRail .rr-slot.on')).toHaveAttribute('data-exp', '1');

  // → moves back down to the ones rod.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tutRail .rr-slot.on')).toHaveAttribute('data-exp', '0');
});

test('the panel shows the focused rod digit as a die face (icons only)', async ({ page }) => {
  const grid = page.locator('#tutRail .rr-panel .die-face');

  // Default board is 15.98 → the ones rod holds 5 = rose only, in the right cell.
  await expect(grid.locator('.cg-right.on')).toBeVisible();
  await expect(grid.locator('.cg-cell.on')).toHaveCount(1);

  // Move up two places → hundreds, which is empty (0) → no lit faces.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(grid.locator('.cg-cell.on')).toHaveCount(0);

  // There is no text in the rail — the panel is icons only.
  await expect(page.locator('#tutRail .rr-panel')).not.toContainText(/[a-z0-9]/i);
});
