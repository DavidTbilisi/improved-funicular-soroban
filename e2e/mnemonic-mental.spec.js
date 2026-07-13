// The mnemonic-mental track: the support-fade ladder on the practice board.
// A DOM-free unit test can't see `visibility`, so this drives the real page and
// checks Beads → Percept → Mental hides the right rows, that Peek reveals the
// true board, that M cycles the fade, and that the choice persists across a load.
import { test, expect } from '@playwright/test';

// Each test runs in a fresh, isolated context, so localStorage starts empty
// (default = Beads) — and the reload in the persistence test keeps what it set.
test.beforeEach(async ({ page }) => {
  await page.goto('practice.html');
});

test('the fade ladder hides the right rows at each level', async ({ page }) => {
  const board = page.locator('#soroban');
  const frame = page.locator('#soroban .rod-frame').first();
  const cube = page.locator('#rod-int-cube-0');

  // Beads (default): everything is on.
  await expect(board).not.toHaveClass(/sup-[12]/);
  await expect(frame).toBeVisible();
  await expect(cube).toBeVisible();

  // Percept: beads hidden, the cube-face percept is still the read.
  await page.getByRole('button', { name: 'Percept' }).click();
  await expect(board).toHaveClass(/sup-1/);
  await expect(page.getByRole('button', { name: 'Percept' })).toHaveClass(/active/);
  await expect(frame).toBeHidden();
  await expect(cube).toBeVisible();

  // Mental: the cube goes too — imagined rods.
  await page.getByRole('button', { name: 'Mental' }).click();
  await expect(board).toHaveClass(/sup-2/);
  await expect(frame).toBeHidden();
  await expect(cube).toBeHidden();
});

test('Peek flashes the true board back from a faded mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Mental' }).click();
  await expect(page.locator('#rod-int-cube-0')).toBeHidden();

  await page.getByRole('button', { name: 'Peek' }).click();
  await expect(page.locator('#soroban')).toHaveClass(/peek/);
  await expect(page.locator('#soroban .rod-frame').first()).toBeVisible();
  await expect(page.locator('#rod-int-cube-0')).toBeVisible();
});

test('M cycles the fade and the choice persists across a reload', async ({ page }) => {
  const board = page.locator('#soroban');

  await page.getByRole('button', { name: 'Percept' }).click();
  await expect(board).toHaveClass(/sup-1/);

  await page.keyboard.press('m'); // Percept → Mental
  await expect(board).toHaveClass(/sup-2/);
  await page.keyboard.press('m'); // Mental → Beads
  await expect(board).not.toHaveClass(/sup-[12]/);
  await page.keyboard.press('m'); // Beads → Percept
  await expect(board).toHaveClass(/sup-1/);

  await page.reload();
  await expect(page.locator('#soroban')).toHaveClass(/sup-1/);
  await expect(page.getByRole('button', { name: 'Percept' })).toHaveClass(/active/);
});
