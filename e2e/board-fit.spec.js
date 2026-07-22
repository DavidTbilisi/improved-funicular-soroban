// The full 23-rod board is wider than any reading column, so boardShell fits it
// to its panel with `zoom`. A DOM-free unit test can't see the fit; this drives
// the real pages and asserts the board never forces a horizontal scrollbar in
// its `.soroban-wrap`. Regression for the off-by-the-wrap's-padding fit that
// left the board a few px too wide (fitting to clientWidth, which counts the
// wrap's own horizontal padding as usable room).
import { test, expect } from '@playwright/test';

// Board-driven pages whose soroban is visible at load (the game page hides its
// board until a contract, so it's covered by its own one-screen fitBoard).
const PAGES = ['explore.html', 'practice.html', 'trainer.html'];

// Widths that all force a fit (the natural board is ~1350px): a roomy desktop
// and a narrow window that exercises the resize-driven refit.
const WIDTHS = [1280, 900];

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} @ ${width}px: board fits its wrap without horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const wrap = page.locator('.soroban-wrap');
      await expect(wrap).toBeVisible();

      // The zoomed board must not overflow its wrap's content box. Allow 1px
      // for sub-pixel rounding; the bug overflowed by the wrap's ~4px padding.
      const overflow = await wrap.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);

      // And the page itself must not gain a horizontal scrollbar from the board.
      const docOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(docOverflow).toBeLessThanOrEqual(1);
    });
  }
}
