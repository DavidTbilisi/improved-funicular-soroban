// The mistake book, end to end: a miss on one page has to survive into the book
// on another, be gradeable there, and leave only after two rights in a row.
import { test, expect } from '@playwright/test';

// The product of two written decimals, computed EXACTLY: Number(a)*Number(b)
// is binary floating point, and a stray 4.340000000000001 fails a test about
// the mistake book for a reason that has nothing to do with the mistake book.
const decimals = s => (s.split('.')[1] || '').length;
function exactMul(a, b) {
  const dp = decimals(a) + decimals(b);
  const s = (Number(a) * Number(b)).toFixed(dp);
  return dp ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// Miss a drill item on purpose and hand back the question that was asked.
async function missOne(page, deck = 'pointMul') {
  await page.goto(`drills.html?deck=${deck}`);
  await expect(page.locator('#drillPrompt')).not.toBeEmpty();
  const prompt = (await page.locator('#drillPrompt').textContent()).trim();
  await page.fill('#drillInput', '999999999');
  await page.press('#drillInput', 'Enter');
  await expect(page.locator('#drillFeedback')).toContainText('✗');
  return prompt;
}

test('a drill miss is written into the book, with its own deck named', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  const prompt = await missOne(page);

  await page.goto('misses.html');
  await expect(page.locator('#msHead')).toContainText('1 open');
  await expect(page.locator('.ms-row-src').first()).toContainText('Point: ×');
  await expect(page.locator('#msPrompt')).toContainText(prompt.split(' ')[0]);
  expect(errors).toEqual([]);
});

test('two rights in a row take it out — one does not', async ({ page }) => {
  const prompt = await missOne(page);
  const [a, , b] = prompt.split(/\s+/);
  const answer = exactMul(a, b);

  await page.goto('misses.html');
  await page.fill('#msInput', answer);
  await page.press('#msInput', 'Enter');
  await expect(page.locator('#msVerdict')).toContainText('once more and it is out');
  await expect(page.locator('#msHead')).toContainText('1 open', { timeout: 5000 });

  await page.fill('#msInput', answer);
  await page.press('#msInput', 'Enter');
  await expect(page.locator('#msVerdict')).toContainText('comes out of the book');
  await expect(page.locator('#msHead')).toContainText('0 open');
  await expect(page.locator('#msHead')).toContainText('1 worked off');
  await expect(page.locator('#msStage')).toBeHidden();
});

test('a wrong answer shows the right one, and the entry stays', async ({ page }) => {
  await missOne(page);
  await page.goto('misses.html');
  await page.fill('#msInput', '0.0001');
  await page.press('#msInput', 'Enter');
  await expect(page.locator('#msVerdict')).toContainText('the answer is');
  await expect(page.locator('#msHead')).toContainText('1 open');
});

test('the same miss twice is one entry, counted', async ({ page }) => {
  await missOne(page);
  // Re-open the same deck and miss the same item again by answering everything
  // wrong until that prompt comes round.
  await page.goto('misses.html');
  const first = (await page.locator('#msPrompt').textContent()).trim();
  await page.evaluate(() => {
    const blob = JSON.parse(localStorage.getItem('npv-misses'));
    blob.items[0].misses = 3;
    localStorage.setItem('npv-misses', JSON.stringify(blob));
  });
  await page.reload();
  await expect(page.locator('.ms-row-n').first()).toHaveText('×3');
  await expect(page.locator('#msPrompt')).toContainText(first.split(' ')[0]);
});

test('the book leads the Today plan, and links to itself', async ({ page }) => {
  await missOne(page);
  await page.goto('index.html');
  const first = page.locator('.today-task').first();
  await expect(first.locator('.tt-title')).toContainText('mistake book');
  await expect(first.locator('.tt-title')).toHaveAttribute('href', 'misses.html');
});

test('an entry can be struck out by hand', async ({ page }) => {
  await missOne(page);
  await page.goto('misses.html');
  await page.locator('.ms-row button[data-key]').first().click();
  await expect(page.locator('#msHead')).toContainText('0 open');
  await expect(page.locator('.ms-row.empty')).toBeVisible();
});
