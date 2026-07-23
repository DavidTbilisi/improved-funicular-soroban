// The point decks in a real session. The unit suite proves the placement rule
// and that every generated question places to the value the arithmetic gives;
// what a browser adds is that the drill actually grades the placement — that
// typing the bare digits back is WRONG, which is the whole point of the deck.
import { test, expect } from '@playwright/test';

async function startDeck(page, id) {
  await page.goto(`drills.html?deck=${id}`);
  await expect(page.locator('#drillPrompt')).toContainText(id === 'pointMul' ? '×' : '÷');
}

// The product of two written decimals, computed EXACTLY. Number(a)*Number(b)
// is binary floating point and lands on 4.340000000000001 often enough to fail
// a test about placement for a reason that has nothing to do with placement.
const decimals = s => (s.split('.')[1] || '').length;
function exactMul(a, b) {
  const dp = decimals(a) + decimals(b);
  const s = (Number(a) * Number(b)).toFixed(dp);
  return dp ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
function exactDiv(a, b) {
  const dp = 10;
  return Number((Number(a) / Number(b)).toFixed(dp)).toString();
}

// The question hands over the digits; the answer is those digits placed.
async function questionOf(page) {
  return page.evaluate(() => ({
    prompt: document.getElementById('drillPrompt').textContent.trim(),
    digits: (document.getElementById('drillSub').textContent.match(/\d+/) || [])[0],
  }));
}

test('the two point decks are on the drills page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('drills.html');
  await expect(page.locator('button[data-deck="pointMul"]')).toContainText('Point: ×');
  await expect(page.locator('button[data-deck="pointDiv"]')).toContainText('Point: ÷');
  expect(errors).toEqual([]);
});

// A correct rep is marked and then wiped ~650ms later when the drill deals the
// next item, so two awaited assertions against the live element race that
// clear: the first can pass and the second read an emptied node. Record every
// value the feedback takes instead, and assert against the whole record.
async function watchFeedback(page) {
  await page.evaluate(() => {
    const el = document.getElementById('drillFeedback');
    window.__fb = [];
    new MutationObserver(() => window.__fb.push(el.textContent))
      .observe(el, { childList: true, subtree: true, characterData: true });
  });
  return async () => (await page.evaluate(() => window.__fb)).join('\n');
}

test('the drill gives you the digits and grades the placement', async ({ page }) => {
  await startDeck(page, 'pointMul');
  const feedback = await watchFeedback(page);
  const { prompt, digits } = await questionOf(page);
  const [a, , b] = prompt.split(/\s+/);
  const answer = exactMul(a, b);

  await page.fill('#drillInput', answer);
  await page.press('#drillInput', 'Enter');
  await expect.poll(feedback).toContain('✓');
  // The rule is revealed about the question that was just asked.
  expect(await feedback()).toContain('rod');
  expect(digits).toBeTruthy();
});

test('typing the bare digits back is wrong — that is the whole deck', async ({ page }) => {
  await startDeck(page, 'pointDiv');
  let q = await questionOf(page);
  // Find a question where the placement actually moves the point.
  for (let i = 0; i < 12; i++) {
    const [a, , b] = q.prompt.split(/\s+/);
    if (exactDiv(a, b) !== q.digits) break;
    await page.fill('#drillInput', exactDiv(a, b));
    await page.press('#drillInput', 'Enter');
    q = await questionOf(page);
  }
  const [a, , b] = q.prompt.split(/\s+/);
  test.skip(exactDiv(a, b) === q.digits, 'dealt only no-shift questions');

  await page.fill('#drillInput', q.digits);
  await page.press('#drillInput', 'Enter');
  await expect(page.locator('#drillFeedback')).toContainText('✗');
});

test('the teaching plate shows the point on the rods', async ({ page }) => {
  await page.goto('drills.html');
  await expect(page.locator('#figPoint')).toContainText('rods right of the point');
  await expect(page.locator('#figPoint')).toContainText('Where the point goes');
});
