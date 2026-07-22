// The app installs on a phone now, so it has to be usable on one. These run
// against an emulated Pixel with a coarse pointer — the two things that turn on
// the touch pad and the single-row nav — and check the things that only a real
// viewport can answer: that nothing overflows sideways, that the pad is there,
// and that tapping it moves beads exactly as the keyboard does.
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['Pixel 7'] });

const PAGES = [
  'index.html', 'explore.html', 'practice.html', 'trainer.html', 'drills.html',
  'anzan.html', 'yomiage.html', 'exam.html', 'vault.html', 'game.html', 'reference.html',
];

test('no page scrolls sideways on a phone', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('the nav is one scrolling row, and it lands on the page you are on', async ({ page }) => {
  await page.goto('vault.html');
  const nav = page.locator('.topnav');
  // One row: the bar is no taller than a single link plus its padding.
  const [navBox, linkBox] = await Promise.all([
    nav.boundingBox(),
    page.locator('.topnav a').first().boundingBox(),
  ]);
  expect(navBox.height).toBeLessThan(linkBox.height * 2);
  // …and the active tab was scrolled into view rather than left off-screen.
  const active = page.locator('.topnav a.active');
  const [aBox, nBox] = await Promise.all([active.boundingBox(), nav.boundingBox()]);
  expect(aBox.x).toBeGreaterThanOrEqual(nBox.x - 1);
  expect(aBox.x + aBox.width).toBeLessThanOrEqual(nBox.x + nBox.width + 1);
});

test('the board pages carry a touch pad, and a tap is a keypress', async ({ page }) => {
  await page.goto('explore.html');
  const pad = page.locator('#touchPad');
  await expect(pad).toBeVisible();

  await page.locator('#clearBtn').click();
  await expect(page.locator('#numValue')).toHaveText('0');

  // The die cross: the rose is 5, the centre is 1 — the same digits the keys
  // spell, on the same cells.
  await pad.locator('.tp-hand.add .tp-right').tap();
  await pad.locator('.tp-hand.add .tp-center').tap();
  await expect(page.locator('#numValue')).toHaveText('6');

  // A compound taps in one go, because a finger cannot chord.
  await pad.locator('.tp-hand.sub .tp-comp', { hasText: '6' }).tap();
  await expect(page.locator('#numValue')).toHaveText('0');

  // The carry lands on the next rod up.
  await pad.locator('.tp-hand.add .tp-ten').tap();
  await expect(page.locator('#numValue')).toHaveText('10');
});

test('the pad moves the focused rod, and says which one it is on', async ({ page }) => {
  await page.goto('explore.html');
  await page.locator('#clearBtn').click();
  await expect(page.locator('#tpFocus')).toHaveText('place 1');

  await page.locator('.tp-rod', { hasText: '◀' }).tap();
  await expect(page.locator('#tpFocus')).toHaveText('place 10');
  await page.locator('#touchPad .tp-hand.add .tp-center').tap();
  await expect(page.locator('#numValue')).toHaveText('10');

  await page.locator('.tp-reset').tap();
  await expect(page.locator('#numValue')).toHaveText('0');
});

test('an illegal tap is refused with the trade to compose, exactly like a key', async ({ page }) => {
  await page.goto('explore.html');
  await page.locator('#numInput').fill('4');
  await page.locator('#setBtn').click();
  await expect(page.locator('#numValue')).toHaveText('4');

  // +3 on a 4 does not fit: the same rejection the keyboard gives.
  await page.locator('#touchPad .tp-hand.add .tp-top').tap();
  await expect(page.locator('#coach')).toContainText('needs a five trade');
  await expect(page.locator('#numValue')).toHaveText('4');
});

test('the cockpit gives up its one-screen rule rather than hide half of itself', async ({ page }) => {
  await page.goto('game.html');
  await page.waitForTimeout(600);

  // Sideways, never. Downwards, on a phone, yes: a 412px viewport cannot hold
  // the village, the side panel and the strip at once, and `overflow: hidden`
  // on a layout that does not fit only makes the rest unreachable.
  const m = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    canScroll: getComputedStyle(document.body).overflowY !== 'hidden',
  }));
  expect(m.x).toBeLessThanOrEqual(1);
  expect(m.canScroll).toBe(true);

  // Everything below the fold is reachable, including the build shelf.
  await page.locator('#gamePalette').scrollIntoViewIfNeeded();
  await expect(page.locator('#gamePalette')).toBeVisible();

  // And the village keeps the screen to itself: no touch pad competing for it.
  await expect(page.locator('#touchPad')).toHaveCount(0);
});

test('a contract in focus mode fills the phone screen', async ({ page }) => {
  await page.goto('game.html');
  await page.waitForTimeout(800);
  await page.locator('.game-contract').first().tap();
  await expect(page.locator('body')).toHaveClass(/ck-focused/);

  // The popup is fixed to the viewport, so the board is on screen whatever the
  // page was scrolled to when the contract was taken.
  const board = page.locator('.ck-board');
  const box = await board.boundingBox();
  const vp = page.viewportSize();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.width).toBeLessThanOrEqual(vp.width + 1);
});
