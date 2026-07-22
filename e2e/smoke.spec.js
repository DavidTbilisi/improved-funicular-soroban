// Loads every page and checks it boots cleanly: correct title, no thrown
// errors, no failed module fetches. Catches build-breaking regressions
// (bad import paths, syntax errors) that the DOM-free unit suite can't see.
import { test, expect } from '@playwright/test';

const PAGES = [
  ['index.html', 'Today — Place-Value Peg Soroban'],
  ['explore.html', 'Place-Value Peg Soroban — explore the board'],
  ['practice.html', 'Guided practice — Place-Value Peg Soroban'],
  ['trainer.html', 'Rod methods — Place-Value Peg Soroban'],
  ['drills.html', 'Codec drills — Place-Value Peg Soroban'],
  ['anzan.html', 'Flash anzan — Place-Value Peg Soroban'],
  ['yomiage.html', 'Read-aloud — Place-Value Peg Soroban'],
  ['exam.html', 'Kyu exam — Place-Value Peg Soroban'],
  ['vault.html', 'Vault — Place-Value Peg Soroban'],
  ['game.html', 'Soroban Village — Place-Value Peg Soroban'],
  ['reference.html', 'Reference — Place-Value Peg Soroban'],
];

for (const [path, title] of PAGES) {
  test(`${path} loads without errors`, async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err));

    const response = await page.goto(path);
    expect(response.ok()).toBe(true);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('body')).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
}
