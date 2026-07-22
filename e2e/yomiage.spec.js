// Read-aloud (読上算) in a real browser. The unit suite already walks a round
// against a fake voice, so what is proved here is what a DOM-free test cannot
// see: that the page really does detect a browser with no speech voice and fall
// back to captions rather than freezing, that the board is cleared on the
// opening cue, that handing in the board's value marks the round, and that a
// round survives the round trip into the Today streak.
//
// Headless Chromium ships NO speech voice, which is exactly the silent-mode
// path — so this suite tests the fallback for free, and deterministically.
import { test, expect } from '@playwright/test';

const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

// Start the slowest rung at the shortest gap, so a whole round is a few seconds.
async function openWarm(page, gapMs = 400) {
  await page.goto('yomiage.html');
  await page.evaluate(ms => localStorage.setItem('npv-yomiage-gap:warm', String(ms)), gapMs);
  await page.goto('yomiage.html');
  // Watch the captions: every call lands there in silent mode.
  await page.evaluate(() => {
    window.__calls = [];
    const el = document.getElementById('ymCaption');
    // Every mutation, undeduped: two consecutive "plus five" calls are two
    // terms, and collapsing them would lose one.
    const push = () => { const t = el.textContent.trim(); if (t) window.__calls.push(t); };
    new MutationObserver(push).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.locator('button[data-level="warm"]').click();
}

// The calls, back as numbers. Only the first term is bare — every later one is
// announced with its sign word, which is the caller's job and not the number's.
function termsOf(calls) {
  return calls.map(c => {
    const m = /^(plus |minus )?([a-z-]+)$/.exec(c);
    if (!m || !(m[2] in ONES)) return null;
    return ONES[m[2]] * (m[1] === 'minus ' ? -1 : 1);
  }).filter(v => v !== null);
}

async function heardTerms(page) {
  await expect(page.locator('#ymSubmit')).toBeEnabled({ timeout: 20000 });
  return termsOf(await page.evaluate(() => window.__calls));
}

async function handIn(page, value) {
  await page.fill('#numInput', String(value));
  await page.click('#setBtn');
  await expect(page.locator('#ymAnswer')).toHaveText(String(value));
  await page.click('#ymSubmit');
}

test('the ladder renders and starting a rung opens the stage with its teaching line', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('yomiage.html');

  await expect(page.locator('#ymLevels button')).toHaveCount(6);
  await expect(page.locator('#ymStage')).toBeHidden();

  await page.locator('button[data-level="warm"]').click();
  await expect(page.locator('#ymStage')).toBeVisible();
  await expect(page.locator('button[data-level="warm"]')).toHaveClass(/active/);
  await expect(page.locator('#ymTeach')).toContainText('Set each one as you hear it');
  expect(errors).toEqual([]);
});

test('a browser with no voice says so and shows the words instead of freezing', async ({ page }) => {
  await openWarm(page);
  // The fallback announced itself…
  await expect(page.locator('#ymSilent')).toBeVisible();
  await expect(page.locator('#ymCaptions')).toBeChecked();
  await expect(page.locator('#ymCaption')).toBeVisible();
  // …and the round actually advances, which is the part that would hang.
  await expect(page.locator('#ymProgress')).toHaveText('1 / 3', { timeout: 15000 });
  await expect(page.locator('#ymSubmit')).toBeEnabled({ timeout: 20000 });
});

test('the caller opens, calls each term once, and asks for the total', async ({ page }) => {
  await openWarm(page);
  await expect(page.locator('#ymSubmit')).toBeEnabled({ timeout: 20000 });
  const calls = await page.evaluate(() => window.__calls);
  expect(calls[0]).toBe('Ready');
  expect(calls[calls.length - 1]).toBe('How much?');
  expect(termsOf(calls)).toHaveLength(3);
});

test('the opening cue clears the board for you', async ({ page }) => {
  await page.goto('yomiage.html');
  // Leave a total on the board, then start: "Ready" must wipe it.
  await page.fill('#numInput', '4321');
  await page.click('#setBtn');
  await expect(page.locator('#ymAnswer')).toHaveText('4321');
  await page.locator('button[data-level="warm"]').click();
  await expect(page.locator('#ymAnswer')).toHaveText('0', { timeout: 10000 });
});

test('handing in the board marks the round and banks the pace it was called at', async ({ page }) => {
  await openWarm(page);
  const terms = await heardTerms(page);
  await handIn(page, terms.reduce((a, b) => a + b, 0));

  await expect(page.locator('#ymFeedback')).toHaveClass(/ok/);
  await expect(page.locator('#ymScore')).toContainText('streak 1 / 5');
  await expect(page.locator('#ymNext')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('npv-yomiage')));
  expect(saved.warm.rounds).toHaveLength(1);
  expect(saved.warm.rounds[0]).toMatchObject({ ms: 400, ok: true });
  expect(saved.warm.fastest).toBe(null); // one round is not a carried rung

  // The day axis was marked, so Today counts it.
  await page.goto('index.html');
  await expect(page.locator('.td-streak')).toContainText('1-day streak');
});

test('a wrong total hands the column back — the only feedback dictation can give', async ({ page }) => {
  await openWarm(page);
  const terms = await heardTerms(page);
  await handIn(page, terms.reduce((a, b) => a + b, 0) + 1);

  await expect(page.locator('#ymFeedback')).toHaveClass(/bad/);
  await expect(page.locator('#ymFeedback')).toContainText('the column was');
  await expect(page.locator('.ym-terms')).toContainText(String(terms[0]));
  await expect(page.locator('#ymScore')).toContainText('streak 0 / 5');
});

test('stopping mid-round closes the stage and calls nothing further', async ({ page }) => {
  await openWarm(page, 2000);
  await expect(page.locator('#ymCue')).toBeVisible();
  await page.click('#ymStop');
  await expect(page.locator('#ymStage')).toBeHidden();

  const before = await page.evaluate(() => window.__calls.length);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__calls.length)).toBe(before);
});

test('a deep link highlights the rung without starting the caller', async ({ page }) => {
  await page.goto('yomiage.html?level=ten2');
  await expect(page.locator('button[data-level="ten2"]')).toHaveClass(/active/);
  await expect(page.locator('#ymStage')).toBeHidden();
});
