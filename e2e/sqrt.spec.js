// 開平法 in the browser. The unit suite proves the algorithm for every perfect
// square up to 400²; what only a browser shows is that the walkthrough actually
// drives the shared board — that the radicand is seeded onto the rods, that
// each step's expected value is reachable, and that the root is standing on the
// root rods when it is over.
import { test, expect } from '@playwright/test';

async function startRoot(page, mode = 'sqrt-2') {
  await page.goto('trainer.html');
  await page.locator(`#rtModes button[data-id="${mode}"]`).click();
  await expect(page.locator('#rtPrompt')).toContainText('√');
}

test('the root modes are on the ladder, after multiply and divide', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('trainer.html');

  const labels = await page.locator('#rtModes button').allTextContents();
  expect(labels.length).toBe(8);
  expect(labels[labels.length - 2]).toContain('√ 2-digit root');
  expect(labels[labels.length - 1]).toContain('√ 3-digit root');
  expect(errors).toEqual([]);
});

test('taking a root seeds the radicand and names the pairing', async ({ page }) => {
  await startRoot(page);
  const prompt = await page.locator('#rtPrompt').textContent();
  const n = Number(prompt.replace(/[^\d]/g, ''));
  expect(Number.isInteger(Math.sqrt(n))).toBe(true);        // always a perfect square

  // The radicand is on the board, and the setup line shows the digit pairing.
  await expect(page.locator('#numValue')).toHaveText(n.toLocaleString('en-US'));
  await expect(page.locator('#rtSetup')).toContainText('pair its digits');
  await expect(page.locator('#rtSetup')).toContainText('|');
  // The first step is the trial digit, stated as the method states it.
  await expect(page.locator('#rtInstr')).toContainText('d² ≤');
});

test('walking every step lands the root on the root rods', async ({ page }) => {
  await startRoot(page);
  const n = Number((await page.locator('#rtPrompt').textContent()).replace(/[^\d]/g, ''));
  const root = Math.sqrt(n);

  // "Do this step" plays each move; the trainer only advances when the board
  // reads the value that step demands, so finishing IS the verification.
  for (let i = 0; i < 12; i++) {
    if (await page.locator('#rtFeedback').textContent().then(t => /Solved|✓/.test(t))) break;
    await page.locator('#rtDoStep').click();
    await page.waitForTimeout(120);
  }

  await expect(page.locator('#rtFeedback')).toContainText(String(root));
  // The board now holds nothing but the root, standing on its own rods.
  const board = Number((await page.locator('#numValue').textContent()).replace(/[^\d]/g, ''));
  expect(board % root).toBe(0);
  expect(Number.isInteger(Math.log10(board / root))).toBe(true);
});

test('the layout figure brackets the radicand and the root', async ({ page }) => {
  await startRoot(page);
  const svg = await page.locator('#rtLayoutFig').innerHTML();
  expect(svg).toContain('root');
  expect(svg).toContain('Rod layout for √');
});

test('the three-pair mode brings a pair down and doubles the root', async ({ page }) => {
  await startRoot(page, 'sqrt-3');
  await page.locator('#rtDoStep').click();
  await page.waitForTimeout(150);
  await page.locator('#rtDoStep').click();
  await page.waitForTimeout(150);
  // Past the first pair the instruction switches to the doubling rule.
  await expect(page.locator('#rtInstr')).toContainText('Double the root so far');
});
