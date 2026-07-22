// Regression test for the achievements feature: the HUD carries a Village Rank
// chip, the trophy button opens a browsable panel, and neither the extra chip
// nor the panel breaks the one-screen no-scroll cockpit.
import { test, expect } from '@playwright/test';

test('the rank chip shows and the achievements panel opens without scrolling', async ({ page }) => {
  await page.goto('game.html');

  // The always-climbing Village Rank card lives in the sidebar from first load.
  await expect(page.locator('#gameRank')).toContainText('Rank');
  await expect(page.locator('#gameRank .rank-bar')).toBeVisible();

  // The trophy button opens the panel; a fresh village shows the tally + rows.
  await page.locator('#achieveBtn').click();
  const card = page.locator('#achieveCard');
  await expect(card).toBeVisible();
  await expect(page.locator('#achieveList')).toContainText('unlocked');
  await expect(page.locator('.ach-row').first()).toBeVisible();

  // Escape closes it (mirrors the help overlay).
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();

  // The cockpit fills the screen and must never scroll — not even with the
  // extra chip and the fixed-position panel/toast added.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
});

test('solving a contract fires the unlock toast and persists the badge', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('game.html');

  // Take the simplest tier — direct single-digit add/subtract on the ones rod.
  await page.locator('.game-contract', { hasText: 'Errand' }).click();
  await expect(page.locator('body')).toHaveClass(/ck-focused/);

  // Read "… a ± b" and drive the die-cross keyboard to add/subtract b. Digits
  // 1–5 are one cell; 6–9 chord the 5-cell (right) with a 1–4 cell.
  const prompt = await page.locator('#gamePrompt').innerText();
  const m = prompt.match(/(\d+)\s*([+−-])\s*(\d+)/);
  expect(m, `could not parse prompt: ${prompt}`).not.toBeNull();
  const b = Number(m[3]);
  const sub = m[2] !== '+';
  const ADD = { center: 'KeyK', left: 'KeyJ', top: 'KeyI', bottom: 'Comma', right: 'KeyL' };
  const SUB = { center: 'KeyD', left: 'KeyS', top: 'KeyE', bottom: 'KeyC', right: 'KeyF' };
  const ONE = { 1: 'center', 2: 'left', 3: 'top', 4: 'bottom', 5: 'right' };
  const cells = b <= 5 ? [ONE[b]] : ['right', ONE[b - 5]];
  const keys = cells.map(c => (sub ? SUB : ADD)[c]);
  for (const k of keys) await page.keyboard.down(k);      // held together → a chord
  for (const k of [...keys].reverse()) await page.keyboard.up(k);

  // The first solve unlocks "First contract" → the toast pops.
  const toast = page.locator('#gameToast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Achievement unlocked');
  await expect(toast).toContainText('First contract');

  // And it is written to its own store (survives a raze, unlike the village).
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('npv-achievements')));
  expect(saved.unlocked['first-solve']).toBeTruthy();
  expect(saved.counters.solves).toBe(1);

  // The unlock juice (canvas trophy burst + chime) must not throw. (Headless
  // WebGL emits a benign "Framebuffer Unsupported" GL message on any canvas
  // render — flashPayout/pulseDay do too — which is environmental, not a fault.)
  const real = errors.filter(e => !/framebuffer/i.test(e));
  expect(real, real.join('\n')).toEqual([]);
});
