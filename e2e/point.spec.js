// The point decks in a real session. The unit suite proves the placement rule
// and that every generated question places to the value the arithmetic gives;
// what a browser adds is that the drill actually grades the placement — that
// typing the bare digits back is WRONG, which is the whole point of the deck.
import { test, expect } from '@playwright/test';

async function startDeck(page, id) {
  await page.goto(`drills.html?deck=${id}`);
  await expect(page.locator('#drillPrompt')).toContainText(id === 'pointMul' ? '×' : '÷');
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

test('the drill gives you the digits and grades the placement', async ({ page }) => {
  await startDeck(page, 'pointMul');
  const { prompt, digits } = await questionOf(page);
  const [a, , b] = prompt.split(/\s+/);
  const answer = (Number(a) * Number(b)).toString();

  await page.fill('#drillInput', answer);
  await page.press('#drillInput', 'Enter');
  await expect(page.locator('#drillFeedback')).toContainText('✓');
  // The rule is revealed about the question that was just asked.
  await expect(page.locator('#drillFeedback')).toContainText('rod');
  expect(digits).toBeTruthy();
});

test('typing the bare digits back is wrong — that is the whole deck', async ({ page }) => {
  await startDeck(page, 'pointDiv');
  let q = await questionOf(page);
  // Find a question where the placement actually moves the point.
  for (let i = 0; i < 12; i++) {
    const [a, , b] = q.prompt.split(/\s+/);
    if (String(Number(a) / Number(b)) !== q.digits) break;
    await page.fill('#drillInput', String(Number(a) / Number(b)));
    await page.press('#drillInput', 'Enter');
    q = await questionOf(page);
  }
  const [a, , b] = q.prompt.split(/\s+/);
  test.skip(String(Number(a) / Number(b)) === q.digits, 'dealt only no-shift questions');

  await page.fill('#drillInput', q.digits);
  await page.press('#drillInput', 'Enter');
  await expect(page.locator('#drillFeedback')).toContainText('✗');
});

test('the teaching plate shows the point on the rods', async ({ page }) => {
  await page.goto('drills.html');
  await expect(page.locator('#figPoint')).toContainText('rods right of the point');
  await expect(page.locator('#figPoint')).toContainText('Where the point goes');
});
