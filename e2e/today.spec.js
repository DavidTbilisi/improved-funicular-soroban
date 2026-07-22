// The Today page: the front door that reads every store at once. The unit
// suite proves the day maths, the profile and the plan ladder; what only a
// browser can prove is the wiring — that the seeded keys reach the header, that
// a plan link actually lands on the right level with that level STARTED, that a
// tick survives a reload, and that export → clear → import round-trips a real
// save through real localStorage.
import { test, expect } from '@playwright/test';

// A learner mid-ladder: a live 3-day streak, a fumble pattern on the 3↔7 ten-pair,
// the big-friend + level part-way, and a village worth ranking.
const TODAY = new Date().toISOString().slice(0, 10);
const dayBack = n => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

const seed = () => ({
  'npv-days': JSON.stringify({ v: 1, seeded: true, days: [dayBack(2), dayBack(1), TODAY] }),
  'npv-tutorial-progress': JSON.stringify({
    v: 2, unlocked: 6,
    best: { read: 6, direct: 8, 'small-add': 8, 'small-sub': 8, 'big-add': 3 },
  }),
  'npv-practice-history': JSON.stringify({
    'big-add': { solves: [{ t: `${dayBack(1)}T10:00`, ms: 5200, clean: false, support: 0 }], best: 3 },
  }),
  'npv-fault-log': JSON.stringify({ pairs: { 'big:3-7': 9 }, resets: 1 }),
  'npv-game-save': JSON.stringify({
    v: 1, sp: 240, day: 30, festival: 0, res: { food: 200, wood: 90, coin: 150 },
    grid: [{ id: 'hut', level: 2 }, { id: 'farm', level: 2 }, { id: 'shrine', level: 3 }],
    stats: { solves: 40, clean: 22, spEarned: 600, bestStreak: 6, festivals: 1, founded: true },
  }),
});

// localStorage is per-origin, so it has to be written from a page on the origin
// before the page under test reads it — the pattern the other specs use.
async function seeded(page) {
  await page.goto('index.html');
  await page.evaluate(blob => {
    localStorage.clear();
    for (const [k, v] of Object.entries(blob)) localStorage.setItem(k, v);
  }, seed());
  await page.reload();
}

test('the header reads the streak, the rank and the village purse', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await seeded(page);

  await expect(page.locator('#todayHead')).toContainText('3-day streak');
  await expect(page.locator('#todayHead')).toContainText('240 sp');
  await expect(page.locator('.td-rank')).toContainText(/Camp|Hamlet|Village|Town|Township|City/);
  expect(errors).toEqual([]);
});

test('the plan lists concrete tasks, each with a reason and a time estimate', async ({ page }) => {
  await seeded(page);
  const tasks = page.locator('.today-task');
  await expect(tasks).toHaveCount(3);

  // The fumble pattern outranks everything: the 3↔7 pair sends you to big-friend +.
  const first = tasks.first();
  await expect(first.locator('.tt-title')).toContainText('Big friend + (carry)');
  await expect(first.locator('.tt-why')).toContainText('3 ↔ 7');
  await expect(first.locator('.tt-mins')).toContainText(/~\d+ min/);

  for (let i = 0; i < 3; i++) {
    await expect(tasks.nth(i).locator('.tt-why')).not.toBeEmpty();
    await expect(tasks.nth(i).locator('.tt-mins')).toContainText(/~\d+ min/);
  }
  await expect(page.locator('#todayTotal')).toContainText(/about \d+ min in total/);
});

test('a plan link lands on the target page with that level already started', async ({ page }) => {
  await seeded(page);
  await page.locator('.today-task').first().locator('.tt-title').click();

  await expect(page).toHaveURL(/practice\.html\?level=big-add$/);
  // Deep-linking must do more than select the tab — the level is running.
  await expect(page.locator('#tutLevels button[data-idx="4"]')).toHaveClass(/active/);
  await expect(page.locator('#tutPrompt')).not.toBeEmpty();
});

test('a tick survives a reload, and rolls over on a new day', async ({ page }) => {
  await seeded(page);
  const first = page.locator('.today-task').first();
  await expect(first).not.toHaveClass(/done/);

  // The box is the tick affordance; a click on the title is a navigation.
  await first.locator('.tt-box').click();
  await expect(first).toHaveClass(/done/);
  await expect(page.locator('#todayHead')).toContainText('1/3 done today');

  await page.reload();
  await expect(page.locator('.today-task').first()).toHaveClass(/done/);

  // Backdate the sheet: a new day must clear it.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('npv-today'));
    d.day = '2020-01-01';
    localStorage.setItem('npv-today', JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator('.today-task').first()).not.toHaveClass(/done/);
});

test('work done on another page comes back auto-ticked', async ({ page }) => {
  await seeded(page);
  // Land a solve on the level the plan is pointing at.
  await page.goto('practice.html?level=big-add');
  await expect(page.locator('#tutPrompt')).not.toBeEmpty();
  await page.evaluate(() => {
    // Reach the target value directly — this is the store the session watches.
    const log = JSON.parse(localStorage.getItem('npv-practice-history')) || {};
    const d = log['big-add'] || { solves: [], best: 3 };
    d.solves.push({ t: `${new Date().toISOString().slice(0, 16)}`, ms: 4000, clean: true, support: 0 });
    log['big-add'] = d;
    localStorage.setItem('npv-practice-history', JSON.stringify(log));
  });

  await page.goto('index.html');
  const first = page.locator('.today-task').first();
  await expect(first.locator('.tt-title')).toContainText('Big friend + (carry)');
  await expect(first).toHaveClass(/done/, { timeout: 5000 });
});

test('the day ribbon and the ladder figure both render', async ({ page }) => {
  await seeded(page);
  await expect(page.locator('#figStreak svg')).toBeVisible();
  await expect(page.locator('#figStreak')).toContainText('3-day streak');
  await expect(page.locator('#figLadder svg')).toBeVisible();
});

test('export downloads a save file naming every stored key', async ({ page }) => {
  await seeded(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#todayExport').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^soroban-save-\d{4}-\d{2}-\d{2}\.json$/);

  const stream = await download.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const file = JSON.parse(Buffer.concat(chunks).toString());

  expect(file.app).toBe('npv-soroban');
  expect(file.v).toBe(1);
  for (const k of Object.keys(seed())) expect(Object.keys(file.keys)).toContain(k);
  expect(file.keys['npv-game-save'].sp).toBe(240);
});

test('a cleared browser is restored from a pasted save', async ({ page }) => {
  await seeded(page);
  const file = await page.evaluate(async () => {
    const m = await import('/src/today/transfer.js');
    return JSON.stringify(m.exportSave(localStorage));
  });

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#todayHead')).toContainText('no streak yet');

  // The import path banks a safety copy first — accept and discard that download.
  page.on('download', d => d.delete().catch(() => {}));
  await page.locator('#todayImport').fill(file);
  await page.locator('#todayImportBtn').click();
  await expect(page.locator('#todayStatus')).toHaveClass(/ok/);

  // The page reloads itself after a successful import.
  await expect(page.locator('#todayHead')).toContainText('3-day streak', { timeout: 8000 });
  await expect(page.locator('#todayHead')).toContainText('240 sp');
});

test('a malformed save is refused without touching what is stored', async ({ page }) => {
  await seeded(page);
  await page.locator('#todayImport').fill('{ not json');
  await page.locator('#todayImportBtn').click();
  await expect(page.locator('#todayStatus')).toHaveClass(/bad/);

  await page.locator('#todayImport').fill(JSON.stringify({ app: 'other', v: 1, keys: {} }));
  await page.locator('#todayImportBtn').click();
  await expect(page.locator('#todayStatus')).toContainText('Not a npv-soroban save file');

  await expect(page.locator('#todayHead')).toContainText('3-day streak');
});

test('a first-run browser gets an onboarding plan, not an empty page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('#todayHead')).toContainText('no streak yet');
  await expect(page.locator('.today-task')).toHaveCount(3);
  await expect(page.locator('.today-task').first().locator('.tt-title')).toContainText('Read & set');
  await expect(page.locator('.today-task').last().locator('.tt-title')).toContainText('Soroban Village');
  await expect(page.locator('#todayMsg')).toContainText('streak starts today');
  expect(errors).toEqual([]);
});
