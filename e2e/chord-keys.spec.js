// The die-cross keyboard: each hand's home cluster is the digit's die face
// (center 1, left 2, top 3, bottom 4, right 5), and holding cells together
// CHORDS the compound 6-9. A DOM-free unit test can't see the keydown debounce
// that groups a chord, so this drives the real page and reads the live number.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('practice.html');
  await page.mouse.click(5, 5); // move focus off any input; keys reach the board
});

const value = page => page.locator('#numValue');
const reset = async page => { await page.keyboard.press('q'); }; // clears to 0, focus on ones
// Hold every cell down, let the ~45ms debounce flush, then release — one chord.
const chord = async (page, keys) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(90);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
};

test('single die-cross keys add their cell value on the ones rod', async ({ page }) => {
  for (const [key, want] of [['k', '1'], ['j', '2'], ['i', '3'], [',', '4'], ['l', '5']]) {
    await reset(page);
    await page.keyboard.press(key);
    await expect(value(page)).toHaveText(want);
  }
});

test('chords place the compound digits 6-9 in one gesture', async ({ page }) => {
  for (const [keys, want] of [[['l', 'j'], '7'], [['l', 'i'], '8'], [['l', ','], '9'], [['l', 'k'], '6']]) {
    await reset(page);
    await chord(page, keys);
    await expect(value(page)).toHaveText(want);
  }
  // top+bottom stands in for the center → 1
  await reset(page);
  await chord(page, ['i', ',']);
  await expect(value(page)).toHaveText('1');
});

test('a chord that needs a trade is rejected strictly, with the complement hint', async ({ page }) => {
  await reset(page);
  await page.keyboard.press('i'); // ones rod = 3
  await expect(value(page)).toHaveText('3');

  await chord(page, ['l', 'j']); // +7 on 3 crosses ten → not direct
  await expect(value(page)).toHaveText('3'); // value unchanged — nothing landed
  await expect(page.locator('#coach')).toContainText('needs a carry trade');
  await expect(page.locator('#coach')).toContainText('U then'); // the +10 = U in the chain
});
