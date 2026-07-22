// The Vault in a real browser. The unit suite covers verification, scheduling
// and healing; what only a browser proves is the wiring — that storing a number
// really encodes it, that a recall verdict names the right locus, that the
// SEALED guarantee actually holds in localStorage, and that a due number
// reaches the Today plan.
import { test, expect } from '@playwright/test';

const PI30 = '1415926535 8979323846 2643383279';
const PI30_FLAT = PI30.replace(/ /g, '');

async function store(page, { label, code, sealed = false, radix = '10' }) {
  await page.locator('#vaultLabel').fill(label);
  await page.locator('#vaultCode').fill(code);
  if (radix !== '10') await page.locator('#vaultRadix').selectOption(radix);
  if (sealed) await page.locator('#vaultMode').check();
  await page.locator('#vaultAddForm button[type="submit"]').click();
}

test.beforeEach(async ({ page }) => { await page.goto('vault.html'); });

test('an empty vault says so and stores nothing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await expect(page.locator('.vault-row.empty')).toBeVisible();
  await expect(page.locator('#vaultHead')).toContainText('0 stored');
  await expect(page.locator('#figVault')).toContainText('Nothing stored yet');
  expect(errors).toEqual([]);
});

test('storing a number encodes it and opens the recall stage at once', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });

  await expect(page.locator('#vaultStatus')).toContainText('3 loci');
  await expect(page.locator('#vaultHead')).toContainText('1 stored');
  await expect(page.locator('#vaultHead')).toContainText('30 digits held');
  // A new entry is due immediately — recall belongs in the session that made it.
  await expect(page.locator('#vaultHead')).toContainText('1 due today');
  await expect(page.locator('#vaultStage')).toBeVisible();
  await expect(page.locator('#vaultStageMeta')).toContainText('30 digits · 3 loci');
});

test('a separator-laden entry is normalised, not rejected', async ({ page }) => {
  await store(page, { label: 'card-ish', code: '4111-1111 1111.1111' });
  await expect(page.locator('.vault-row').first()).toContainText('16 digits');
});

test('an invalid code is refused with a reason and nothing is stored', async ({ page }) => {
  await store(page, { label: 'bad', code: '12x34' });
  await expect(page.locator('#vaultStatus')).toHaveClass(/bad/);
  await expect(page.locator('#vaultStatus')).toContainText('0–9 only');
  await expect(page.locator('.vault-row.empty')).toBeVisible();
});

test('an exact recall passes; a wrong locus is named and marked', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });

  await page.locator('#vaultRecall').fill(PI30_FLAT);
  await page.locator('#vaultRecallForm button[type="submit"]').click();
  await expect(page.locator('#vaultVerdict')).toHaveClass(/ok/);
  await expect(page.locator('#vaultVerdict')).toContainText('Exactly right');
  await expect(page.locator('.vt-loci i.bad')).toHaveCount(0);

  // Re-open and get locus 2 wrong.
  await page.locator('#vaultSkip').click();
  await page.locator('.vault-row button[data-act="study"]').click();
  await page.locator('#vaultRecall').fill('1415926535' + '8979323847' + '2643383279');
  await page.locator('#vaultRecallForm button[type="submit"]').click();

  await expect(page.locator('#vaultVerdict')).toHaveClass(/bad/);
  await expect(page.locator('#vaultVerdict')).toContainText('Locus 2 is wrong');
  await expect(page.locator('.vt-loci i.bad')).toHaveCount(1);
  await expect(page.locator('.vt-loci i.bad')).toHaveText('2');
});

// The guarantee the sealed mode exists to make.
test('a sealed entry never puts its digits in storage, and offers no reveal', async ({ page }) => {
  await store(page, { label: 'shed padlock', code: '481516', sealed: true });

  await expect(page.locator('#vaultStatus')).toContainText('the digits were not kept');
  await expect(page.locator('#vaultStageMeta')).toContainText('sealed');
  await expect(page.locator('#vaultReveal')).toBeHidden();

  const raw = await page.evaluate(() => localStorage.getItem('npv-vault'));
  expect(raw).not.toContain('481516');
  expect(raw).toContain('shed padlock');

  // It still verifies, and says what its evidence is worth.
  await page.locator('#vaultRecall').fill('481516');
  await page.locator('#vaultRecallForm button[type="submit"]').click();
  await expect(page.locator('#vaultVerdict')).toHaveClass(/ok/);
  await expect(page.locator('#vaultVerdict')).toContainText('not proof');
  await expect(page.locator('#vaultReveal')).toBeHidden();
});

test('a full entry can show its scenes', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });
  await page.locator('#vaultRecall').fill(PI30_FLAT);
  await page.locator('#vaultRecallForm button[type="submit"]').click();

  await expect(page.locator('#vaultScenes')).toBeHidden();
  await page.locator('#vaultReveal').click();
  await expect(page.locator('#vaultScenes')).toBeVisible();
  await expect(page.locator('#vaultScenes .locus')).toHaveCount(3);
  await expect(page.locator('#vaultScenes .seal-chip').first()).toBeVisible();
});

test('grading reschedules the entry and marks the day', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });
  await page.locator('#vaultRecall').fill(PI30_FLAT);
  await page.locator('#vaultRecallForm button[type="submit"]').click();
  await page.locator('#vaultGot').click();

  await expect(page.locator('#vaultStatus')).toContainText('next review in 1 day');
  await expect(page.locator('#vaultHead')).toContainText('0 due today');
  await expect(page.locator('.vt-status')).toHaveText('+1d');
  await expect(page.locator('#vaultStage')).toBeHidden();

  const days = await page.evaluate(() => JSON.parse(localStorage.getItem('npv-days')).days);
  expect(days).toHaveLength(1);
});

test('a miss pulls the entry back to tomorrow rather than pushing it out', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });
  await page.locator('#vaultRecall').fill('0000000000' + '8979323846' + '2643383279');
  await page.locator('#vaultRecallForm button[type="submit"]').click();
  await page.locator('#vaultMissed').click();
  await expect(page.locator('#vaultStatus')).toContainText('next review in 1 day');
});

test('hex entries store and verify in hex', async ({ page }) => {
  await store(page, { label: 'wifi key', code: 'DE AD BE EF', radix: '16' });
  await expect(page.locator('.vault-row').first()).toContainText('8 hex');
  await page.locator('#vaultRecall').fill('deadbeef');
  await page.locator('#vaultRecallForm button[type="submit"]').click();
  await expect(page.locator('#vaultVerdict')).toHaveClass(/ok/);
});

test('the retention figure charts what is stored', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });
  await page.locator('#vaultSkip').click();
  await expect(page.locator('#figVault svg')).toBeVisible();
  await expect(page.locator('#figVault')).toContainText('1 due · 1 stored');
});

test('a due number leads the Today plan', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });
  await page.goto('index.html');

  const first = page.locator('.today-task').first();
  await expect(first.locator('.tt-title')).toContainText('Recall a stored number');
  await expect(first.locator('.tt-why')).toContainText('due today — π to 30');
  await first.locator('.tt-title').click();
  await expect(page).toHaveURL(/vault\.html$/);
});

test('the vault travels in an exported save', async ({ page }) => {
  await store(page, { label: 'π to 30', code: PI30 });
  const file = await page.evaluate(async () => {
    const m = await import('/src/today/transfer.js');
    return m.exportSave(localStorage);
  });
  expect(Object.keys(file.keys)).toContain('npv-vault');
  expect(file.keys['npv-vault'].entries[0].label).toBe('π to 30');
});
