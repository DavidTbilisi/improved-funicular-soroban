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

test('the mental-readiness prognosis reads the solve history and re-renders on a support switch', async ({ page }) => {
  // Seed an improving Beads history for the first level, then reload so the page reads it.
  await page.evaluate(() => {
    const solves = [];
    for (let i = 0; i < 12; i++) solves.push({ t: '2026-07-10T09:00', ms: i >= 4 ? 2000 : 3200, clean: i >= 4, support: 0 });
    localStorage.setItem('npv-practice-history', JSON.stringify({ read: { solves, best: 5 } }));
  });
  await page.reload();
  await page.locator('#tutLevels button[data-idx="0"]').click(); // a current level to forecast

  const fig = page.locator('#figProg');
  await expect(fig.locator('svg')).toBeVisible();
  for (const s of ['Beads', 'Percept', 'Mental']) await expect(fig.getByText(s, { exact: true })).toBeVisible();
  await expect(fig.getByText('you are here')).toBeVisible();
  await expect(page.locator('#stProg')).toContainText('to reach Mental'); // the live one-liner

  // Switching support re-renders the forecast: at Percept there are no Percept-tagged solves yet.
  await page.getByRole('button', { name: 'Percept' }).click();
  await expect(page.locator('#stProg')).toContainText('No Percept solves');
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

// The prognosis → anzan bridge. The runway used to end at "Mental", a station
// with nothing beyond it; once the forecast says the beads can go, it has to
// name where that skill gets spent. Unit tests cover which rung is chosen —
// what only a browser shows is that the link appears, is gated, and lands.
const readySolves = (support, n = 12) =>
  Array.from({ length: n }, () => ({ t: '2026-07-20T09:00', ms: 1500, clean: true, support }));

async function seedReady(page, { support, level = 'read' }) {
  await page.goto('practice.html');
  await page.evaluate(({ support, level, solves }) => {
    localStorage.setItem('npv-practice-history', JSON.stringify({ [level]: { solves, best: 6 } }));
    localStorage.setItem('npv-support', String(support));
  }, { support, level, solves: readySolves(support) });
  await page.goto(`practice.html?level=${level}`);
}

test('at Beads the runway names no anzan rung, however ready the solves are', async ({ page }) => {
  await seedReady(page, { support: 0 });
  await expect(page.locator('#figProg svg')).toBeVisible();
  await expect(page.locator('#stAnzan')).toBeHidden();
  await expect(page.locator('#figProg')).not.toContainText('Flash anzan');
});

test('once the beads may go, the prognosis names a rung and links to it', async ({ page }) => {
  await seedReady(page, { support: 1 });

  const link = page.locator('#stAnzan a');
  await expect(page.locator('#stAnzan')).toBeVisible();
  await expect(link).toContainText('Warm-up · 3 × 1 digit');
  await expect(page.locator('#figProg')).toContainText('Flash anzan');

  await link.click();
  await expect(page).toHaveURL(/anzan\.html\?level=warm$/);
  await expect(page.locator('button[data-level="warm"]')).toHaveClass(/active/);
});

test('a rung already carried is skipped for the next one', async ({ page }) => {
  await seedReady(page, { support: 2 });
  await page.evaluate(() => localStorage.setItem('npv-anzan', JSON.stringify({
    warm: { rounds: [{ t: '2026-07-20T10:00', ms: 650, ok: true }], best: 5, fastest: 650 },
  })));
  await page.reload();
  await expect(page.locator('#stAnzan a')).toContainText('5 × 1 digit');
  await expect(page.locator('#stAnzan')).toContainText('next rung');
});

test('the named rung follows the level in hand', async ({ page }) => {
  // 'multi' maps to a 2-digit rung, not the bottom of the ladder.
  await page.goto('practice.html');
  await page.evaluate(solves => {
    localStorage.setItem('npv-tutorial-progress', JSON.stringify({ v: 2, unlocked: 11, best: {} }));
    localStorage.setItem('npv-practice-history', JSON.stringify({ multi: { solves, best: 6 } }));
    localStorage.setItem('npv-support', '2');
  }, readySolves(2));
  await page.goto('practice.html?level=multi');
  await expect(page.locator('#stAnzan a')).toContainText('3 × 2 digits');
});
