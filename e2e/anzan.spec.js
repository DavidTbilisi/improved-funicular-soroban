// Flash anzan in a real browser. The unit suite already walks the schedule tick
// by tick against a fake timer, so what is worth proving here is everything a
// DOM-free test cannot see: that numbers actually appear and are actually
// erased on a real clock, that the stage really does blank its chrome while a
// round runs (a CSS rule, invisible to node:test), and that a round survives
// the round trip through localStorage into the Today plan.
import { test, expect } from '@playwright/test';

// The slowest rung and pace, so the assertions are not racing the animation.
const SLOW = 2000;

async function openWarm(page, { intervalMs = SLOW } = {}) {
  await page.goto('anzan.html');
  await page.evaluate(ms => localStorage.setItem('npv-anzan-speed:warm', String(ms)), intervalMs);
  await page.goto('anzan.html');
  await page.locator('button[data-level="warm"]').click();
}

// Read the terms off the screen as they flash, then hand back their sum.
async function readRound(page, terms = 3) {
  const seen = [];
  const number = page.locator('#azNumber');
  for (let i = 0; i < terms; i++) {
    await expect(page.locator('#azProgress')).toHaveText(`${i + 1} / ${terms}`, { timeout: 15000 });
    const v = (await number.textContent()).trim();
    if (/^\d+$/.test(v)) seen.push(Number(v));
  }
  await expect(page.locator('#azInput')).toBeEnabled({ timeout: 15000 });
  return { seen, sum: seen.reduce((a, b) => a + b, 0) };
}

test('the level ladder renders every rung and starting one shows its teaching line', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('anzan.html');

  await expect(page.locator('#azLevels button')).toHaveCount(9);
  await expect(page.locator('#azStage')).toBeHidden();

  await page.locator('button[data-level="warm"]').click();
  await expect(page.locator('#azStage')).toBeVisible();
  await expect(page.locator('button[data-level="warm"]')).toHaveClass(/active/);
  await expect(page.locator('#azTeach')).toContainText('ones rod');
  expect(errors).toEqual([]);
});

test('numbers really flash and are really erased', async ({ page }) => {
  await openWarm(page);
  const number = page.locator('#azNumber');

  // A digit appears...
  await expect(number).toHaveText(/^\d+$/, { timeout: 10000 });
  // ...and is blanked before the next one, which is what makes two equal
  // consecutive terms countable at all.
  await expect(number).toHaveClass(/blank/, { timeout: 10000 });
});

test('the answer box is locked until the last number has gone', async ({ page }) => {
  await openWarm(page);
  await expect(page.locator('#azInput')).toBeDisabled();
  await expect(page.locator('#azProgress')).toHaveText('1 / 3', { timeout: 10000 });
  await expect(page.locator('#azInput')).toBeDisabled();

  await expect(page.locator('#azInput')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#azProgress')).toBeEmpty();
});

// A CSS rule, so node:test cannot see it — and it is the whole point of the page.
test('while a round runs, nothing but the number is on screen', async ({ page }) => {
  await openWarm(page);
  await expect(page.locator('#azStage')).toHaveClass(/az-running/, { timeout: 10000 });
  await expect(page.locator('#azTeach')).toBeHidden();
  await expect(page.locator('#azPace')).toBeHidden();
  await expect(page.locator('#azFeedback')).toBeHidden();

  // The chrome comes back the moment the round is over.
  await expect(page.locator('#azInput')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#azStage')).not.toHaveClass(/az-running/);
  await expect(page.locator('#azPace')).toBeVisible();
});

test('a correct sum scores and advances the streak', async ({ page }) => {
  await openWarm(page);
  const { seen, sum } = await readRound(page);
  expect(seen).toHaveLength(3);

  await page.locator('#azInput').fill(String(sum));
  await page.locator('#azInput').press('Enter');

  await expect(page.locator('#azFeedback')).toHaveClass(/ok/);
  await expect(page.locator('#azFeedback')).toContainText(seen.join(' + '));
  await expect(page.locator('#azScore')).toContainText('streak 1 / 5');
  await expect(page.locator('#azNext')).toBeVisible();
});

test('a wrong sum shows the terms back, so the miss is teachable', async ({ page }) => {
  await openWarm(page);
  const { seen, sum } = await readRound(page);

  await page.locator('#azInput').fill(String(sum + 1));
  await page.locator('#azInput').press('Enter');

  await expect(page.locator('#azFeedback')).toHaveClass(/bad/);
  await expect(page.locator('#azFeedback')).toContainText(`${seen.join(' + ')} = ${sum}`);
  await expect(page.locator('#azFeedback')).toContainText(String(sum + 1));
  await expect(page.locator('#azScore')).toContainText('streak 0 / 5');
});

test('the speed control steps the pace and persists the choice', async ({ page }) => {
  await page.goto('anzan.html');
  await page.locator('button[data-level="warm"]').click();
  await expect(page.locator('#azPace')).toContainText('1600 ms', { timeout: 10000 });

  await page.locator('#azSlower').click();
  await expect(page.locator('#azPace')).toContainText('2000 ms');
  await expect(page.locator('#azPace')).toContainText('6.0 s per round');

  // The choice is per rung and survives a reload.
  await page.reload();
  await page.locator('button[data-level="warm"]').click();
  await expect(page.locator('#azPace')).toContainText('2000 ms', { timeout: 10000 });
});

test('a round is logged, marks the day, and reaches the Today plan', async ({ page }) => {
  await openWarm(page);
  const { sum } = await readRound(page);
  await page.locator('#azInput').fill(String(sum));
  await page.locator('#azInput').press('Enter');
  await expect(page.locator('#azFeedback')).toHaveClass(/ok/);

  const stored = await page.evaluate(() => ({
    anzan: JSON.parse(localStorage.getItem('npv-anzan')),
    days: JSON.parse(localStorage.getItem('npv-days')),
  }));
  expect(stored.anzan.warm.rounds).toHaveLength(1);
  expect(stored.anzan.warm.rounds[0].ms).toBe(SLOW);
  expect(stored.anzan.warm.rounds[0].ok).toBe(true);
  expect(stored.days.days).toHaveLength(1);

  // Having done anzan qualifies the learner for the plan's anzan rung.
  await page.goto('index.html');
  const anzanTask = page.locator('.today-task').filter({ hasText: 'digit' });
  await expect(page.locator('#todayHead')).toContainText('1-day streak');
  await expect(anzanTask.first()).toBeVisible();
});

test('a deep link from the plan opens the named rung directly', async ({ page }) => {
  await page.goto('anzan.html?level=five2');
  await expect(page.locator('#azStage')).toBeVisible();
  await expect(page.locator('button[data-level="five2"]')).toHaveClass(/active/);
  await expect(page.locator('#azProgress')).toHaveText(/\/ 5$/, { timeout: 10000 });
});

test('the ladder figure renders and marks a carried rung', async ({ page }) => {
  await page.goto('anzan.html');
  await page.evaluate(() => localStorage.setItem('npv-anzan', JSON.stringify({
    warm: { rounds: [{ t: '2026-07-20T10:00', ms: 650, ok: true }], best: 5, fastest: 650 },
  })));
  await page.reload();

  await expect(page.locator('#figAnzan svg')).toBeVisible();
  await expect(page.locator('#figAnzan')).toContainText('faster →');
  await expect(page.locator('button[data-level="warm"]')).toHaveClass(/cleared/);
  await expect(page.locator('button[data-level="warm"] .az-pb')).toHaveText('650ms');
});

// The reverse bridge: a stalling rung points back at the board. The unit suite
// covers which level and pair are named; what a browser adds is that the line
// is GATED — it must stay away while a learner is doing fine, and while a round
// is running — and that its link lands on a started level.
async function seedRung(page, { rounds, faults = {} }) {
  await page.goto('anzan.html');
  await page.evaluate(({ rounds, faults }) => {
    localStorage.setItem('npv-anzan', JSON.stringify({
      five1: { rounds, best: 0, fastest: null },
    }));
    localStorage.setItem('npv-fault-log', JSON.stringify({ pairs: faults, resets: 0 }));
    localStorage.setItem('npv-tutorial-progress', JSON.stringify({ v: 2, unlocked: 11, best: {} }));
    localStorage.setItem('npv-anzan-speed:five1', '2000');
  }, { rounds, faults });
  await page.goto('anzan.html?level=five1');
}

const roundsOf = (n, okShare) => Array.from({ length: n }, (_, i) =>
  ({ t: '2026-07-20T10:00', ms: 1300, ok: i < Math.round(n * okShare) }));

// Deep-linking starts a round at once, so every assertion below waits for the
// round to settle first — otherwise `hidden` would be ambiguous between "not
// offered" and "blanked because a round is running", and the negative tests
// would pass for the wrong reason.
const settle = page => expect(page.locator('#azInput')).toBeEnabled({ timeout: 15000 });

test('a rung being answered well is never nagged', async ({ page }) => {
  await seedRung(page, { rounds: roundsOf(10, 0.9), faults: { 'big:3-7': 9 } });
  await settle(page);
  await expect(page.locator('#azStage')).not.toHaveClass(/az-running/);
  await expect(page.locator('#azDiagnose')).toBeHidden();
  await expect(page.locator('#azDiagnose')).toBeEmpty();
});

test('a barely-tried rung is not diagnosed either', async ({ page }) => {
  await seedRung(page, { rounds: roundsOf(2, 0), faults: { 'big:3-7': 9 } });
  await settle(page);
  await expect(page.locator('#azDiagnose')).toBeHidden();
});

test('a stalling rung names the board level and the pair behind it', async ({ page }) => {
  await seedRung(page, { rounds: roundsOf(10, 0.2), faults: { 'big:3-7': 9 } });
  await settle(page);

  const line = page.locator('#azDiagnose');
  await expect(line).toBeVisible();
  await expect(line).toContainText('Big friend + (carry)');
  await expect(line).toContainText('3 ↔ 7');
  await expect(line).toContainText('ten-trades');
  // It must claim a standing weakness, never a cause of the miss.
  await expect(line).not.toContainText('caused');

  await line.locator('a').click();
  await expect(page).toHaveURL(/practice\.html\?level=big-add$/);
  await expect(page.locator('#tutPrompt')).not.toBeEmpty();
});

test('with no fumble record it says so instead of inventing a pair', async ({ page }) => {
  await seedRung(page, { rounds: roundsOf(10, 0.2), faults: {} });
  await settle(page);
  await expect(page.locator('#azDiagnose')).toContainText('no fumble pattern on record');
  await expect(page.locator('#azDiagnose')).not.toContainText('↔');
});

test('a pair the rung does not drill is not pinned on it', async ({ page }) => {
  // five1 leans on ten-trades; a five-pair fumble is not what is going wrong.
  await seedRung(page, { rounds: roundsOf(10, 0.2), faults: { 'small:2-3': 9 } });
  await settle(page);
  await expect(page.locator('#azDiagnose')).toContainText('does not lean on');
  await expect(page.locator('#azDiagnose')).not.toContainText('↔');
});

test('the diagnosis is blanked while a round is running', async ({ page }) => {
  await seedRung(page, { rounds: roundsOf(10, 0.2), faults: { 'big:3-7': 9 } });

  // The deep link starts a round immediately: nothing but the number on screen.
  await expect(page.locator('#azStage')).toHaveClass(/az-running/, { timeout: 10000 });
  await expect(page.locator('#azDiagnose')).toBeHidden();

  // ...and it comes back once the round is over.
  await settle(page);
  await expect(page.locator('#azDiagnose')).toBeVisible();
});
