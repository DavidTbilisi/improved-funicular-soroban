// The board is the app's one irreplaceable object, and until now it was a
// silent pile of <div>s: unreadable by a screen reader, unusable by anyone who
// cannot see it. These check what only a browser can — that the rods carry
// their own description, that the description follows the beads, that the live
// regions exist, and that a reduced-motion request is honoured.
import { test, expect } from '@playwright/test';

const PAGES = [
  'index.html', 'explore.html', 'practice.html', 'trainer.html', 'drills.html',
  'anzan.html', 'yomiage.html', 'exam.html', 'vault.html', 'reference.html',
];

test('every rod says what it is holding, and keeps saying it', async ({ page }) => {
  await page.goto('explore.html');
  await page.locator('#numInput').fill('123.45');
  await page.locator('#setBtn').click();

  const ones = page.locator('.rod-frame[data-kind="int"][data-idx="0"]');
  await expect(ones).toHaveAttribute('aria-label', 'ones rod, 3, 3 earth beads up');
  await expect(page.locator('.rod-frame[data-kind="int"][data-idx="2"]'))
    .toHaveAttribute('aria-label', 'hundreds rod, 1, 1 earth bead up');
  // The heaven bead is named as such — it is what a finger finds.
  await expect(page.locator('.rod-frame[data-kind="frac"][data-idx="1"]'))
    .toHaveAttribute('aria-label', 'hundredths rod, 5, heaven bead down');

  // …and it follows the beads, not the render that drew them.
  await page.locator('#clearBtn').click();
  await expect(ones).toHaveAttribute('aria-label', 'ones rod, 0, clear');
});

test('the chrome under each rod is hidden from the reader, not repeated to it', async ({ page }) => {
  await page.goto('explore.html');
  for (const cls of ['.rod-value', '.rod-cube', '.rod-peg', '.rod-letter', '.rod-word', '.rod-place']) {
    await expect(page.locator(`${cls}`).first()).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(page.locator('#soroban')).toHaveAttribute('aria-label', 'Soroban board');
});

test('V says the board, and so does the button', async ({ page }) => {
  await page.goto('explore.html');
  await page.locator('#numInput').fill('407');
  await page.locator('#setBtn').click();
  await page.locator('#numValue').click();      // move focus off the input

  await page.keyboard.press('v');
  await expect(page.locator('#coach')).toContainText('Board reads four hundred seven');
  await expect(page.locator('#coach')).toContainText('hundreds 4, ones 7');
  await expect(page.locator('#coach')).toContainText('focus ones, 7, heaven bead down and 2 earth beads up');

  await page.locator('#clearBtn').click();
  await page.locator('#sayBtn').click();
  await expect(page.locator('#coach')).toContainText('Board reads zero. every rod clear');
});

test('the readout and the coach are live regions, so changes are announced', async ({ page }) => {
  await page.goto('explore.html');
  await expect(page.locator('#numValue')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#numValue')).toHaveAttribute('role', 'status');
  await expect(page.locator('#coach')).toHaveAttribute('aria-live', 'polite');
});

test('every page has one heading and a navigation landmark', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.locator('h1'), path).toHaveCount(1);
    await expect(page.locator('nav.topnav'), path).toHaveCount(1);
  }
});

test('no control is nameless', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const nameless = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea')]
      .filter(el => el.offsetParent !== null)
      .filter(el => !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.title
        && !el.getAttribute('placeholder') && !(el.labels && el.labels.length))
      .map(el => el.tagName + '#' + (el.id || el.className)));
    expect(nameless, path).toEqual([]);
  }
});

test('a request for reduced motion is honoured', async ({ page }) => {
  // emulateMedia rather than the `reducedMotion` fixture: the fixture did not
  // reach the page in this setup, and a test that silently checks nothing is
  // worse than no test.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('anzan.html');
  await page.locator('button[data-level="warm"]').click();

  const worst = await page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      for (const v of `${cs.transitionDuration},${cs.animationDuration}`.split(',')) {
        max = Math.max(max, parseFloat(v) || 0);
      }
    }
    return max;
  });
  expect(worst).toBeLessThan(0.01);
});

test('without that request, the app still animates', async ({ page }) => {
  // The guard above is a media query, not a deletion: everyone else keeps the
  // bead slide and the lantern hover.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('explore.html');
  const moving = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.topnav a')).transitionDuration) || 0);
  expect(moving).toBeGreaterThan(0.05);
});
