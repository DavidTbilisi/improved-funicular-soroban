// The kyu exam in a real browser. The unit suite already walks a whole paper
// against a fake clock, so what is worth proving here is what a DOM-free test
// cannot see: that the picker really is hidden while a paper is being sat (a
// CSS rule off body.ex-sitting), that the BOARD is what gets handed in, that
// nothing is marked until the paper is down, and that a sat paper survives the
// round trip through localStorage into the ladder and the Today page.
import { test, expect } from '@playwright/test';

// Work out the answer to whatever question is on screen, the way the paper
// prints it — the app never puts the answer in the DOM, so this reads the
// question and does the arithmetic itself.
async function answerOf(page) {
  return page.evaluate(() => {
    const col = document.querySelector('#examQuestion .ex-col');
    if (col) {
      return [...col.querySelectorAll('li')].reduce((sum, li) => {
        const sign = li.querySelector('.ex-sign').textContent.trim();
        const n = Number(li.querySelector('.ex-term').textContent.replace(/\s/g, ''));
        return sum + (sign === '−' ? -n : n);
      }, 0);
    }
    const el = document.querySelector('#examQuestion .ex-sum');
    const op = el.querySelector('.ex-op').textContent.trim();
    const [a, b] = el.textContent.split(op).map(t => Number(t.replace(/\s/g, '')));
    return op === '×' ? a * b : a / b;
  });
}

// Put a value on the board and hand it in — the page's own path, not a stub.
async function handIn(page, value) {
  await page.fill('#numInput', String(value));
  await page.click('#setBtn');
  await expect(page.locator('#examAnswer')).toHaveText(String(value));
  await page.click('#examSubmit');
}

async function sitPaper(page, { wrongFirst = false } = {}) {
  for (let n = 0; n < 40; n++) {
    if (await page.locator('#examSheet').isVisible()) return;
    const want = await answerOf(page);
    await handIn(page, wrongFirst && n === 0 ? want + 1 : want);
  }
}

test('the picker lists every grade and starting one opens the paper', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));
  await page.goto('exam.html');

  await expect(page.locator('#examGrades button')).toHaveCount(14);
  await expect(page.locator('#examStage')).toBeHidden();
  // 10級 is the one on offer first.
  await expect(page.locator('#examGrades button[data-id="kyu10"]')).toHaveClass(/next/);

  await page.locator('#examGrades button[data-id="kyu10"]').click();
  await expect(page.locator('#examStage')).toBeVisible();
  await expect(page.locator('#examTitle')).toContainText('10級');
  // The column: five terms, exactly as the section declares.
  await expect(page.locator('#examQuestion .ex-col li')).toHaveCount(5);
  await expect(page.locator('#examCounter')).toHaveText('1 / 5');
  // An exam in progress must not offer you a different exam.
  await expect(page.locator('#examGrades')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the board is the answer sheet, and it is cleared for the next question', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="kyu10"]').click();

  await handIn(page, 1234);
  await expect(page.locator('#examCounter')).toHaveText('2 / 5');
  await expect(page.locator('#examAnswer')).toHaveText('0');
  await expect(page.locator('#numValue')).toHaveText('0');
});

test('nothing is marked until the paper is down', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="kyu10"]').click();

  const want = await answerOf(page);
  await handIn(page, want);
  // No verdict of any kind while the paper is still being sat.
  await expect(page.locator('#examSheet')).toBeHidden();
  await expect(page.locator('#examPaper')).toBeVisible();

  await sitPaper(page);
  await expect(page.locator('#examSheet')).toBeVisible();
  await expect(page.locator('#examSheet')).toContainText('合格');
});

test('a passed paper is banked, ticks the ladder, and reaches Today', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="kyu10"]').click();
  await sitPaper(page);

  await expect(page.locator('.ex-verdict')).toHaveClass(/pass/);
  // The grade is held, the picker says so, and the next grade is on offer.
  await expect(page.locator('#examGrades button[data-id="kyu10"]')).toHaveClass(/passed/);
  await expect(page.locator('#examGrades button[data-id="kyu9"]')).toHaveClass(/next/);
  await expect(page.locator('#examHistory li').first()).toContainText('合格');
  await expect(page.locator('#figExam')).toContainText('✓ 10級');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('npv-exam')));
  expect(saved.attempts).toHaveLength(1);
  expect(saved.attempts[0].passed).toBe(true);

  // The day axis was marked, so Today shows the grade on its spine.
  await page.goto('index.html');
  await expect(page.locator('.td-kyu')).toContainText('10級');
});

test('one wrong answer in five is 80 and still passes the section', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="kyu10"]').click();
  await sitPaper(page, { wrongFirst: true });

  await expect(page.locator('.ex-sec').first()).toContainText('80/100');
  await expect(page.locator('.ex-marks li').first()).toHaveClass(/bad/);
  await expect(page.locator('.ex-verdict')).toHaveClass(/pass/);
});

test('leaving mid-paper records nothing', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="kyu10"]').click();
  await handIn(page, 1);
  await page.click('#examAbandon');

  await expect(page.locator('#examStage')).toBeHidden();
  await expect(page.locator('#examGrades')).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('npv-exam'));
  expect(saved === null || JSON.parse(saved).attempts.length === 0).toBe(true);
});

test('a deep link highlights the grade without starting the clock', async ({ page }) => {
  await page.goto('exam.html?grade=kyu8');
  await expect(page.locator('#examGrades button[data-id="kyu8"]')).toHaveClass(/next/);
  await expect(page.locator('#examStage')).toBeHidden();
});

// --- past 1級 ---------------------------------------------------------------
// Walking a whole dan paper is twenty questions; these tests hand in whatever
// the board says and watch the SECTIONS, which is what the dan grades add.
async function skipTo(page, sectionIndex, perSection = 4) {
  for (let i = 0; i < sectionIndex * perSection; i++) {
    await page.locator('#examSubmit').click();
  }
}

test('a dan paper adds the square-root section, printed as a root', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="shodan"]').click();
  await expect(page.locator('#examTitle')).toContainText('初段');
  await expect(page.locator('#examSection')).toContainText('開平');

  await skipTo(page, 3);                       // past 見取算, 掛算, 割算
  await expect(page.locator('#examDesc')).toContainText('perfect square');
  await expect(page.locator('#examQuestion')).toContainText('√');
});

test('the mental section fades the board out, and gives it back afterwards', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="shodan"]').click();

  // Not before: the board is fully there for the written sections.
  await expect(page.locator('#soroban')).not.toHaveClass(/sup-2/);

  await skipTo(page, 4);                       // into 暗算
  await expect(page.locator('#examDesc')).toContainText('no board');
  await expect(page.locator('#examMental')).toBeVisible();
  await expect(page.locator('#examMental')).toContainText('faded out');
  // The Mental stage of the mnemonic-mental track — the rods are imagined.
  await expect(page.locator('#soroban')).toHaveClass(/sup-2/);

  // …and the paper hands the board back when it is over.
  await skipTo(page, 1);
  await expect(page.locator('#examSheet')).toBeVisible();
  await expect(page.locator('#soroban')).not.toHaveClass(/sup-2/);
});

test('leaving a dan paper mid-mental restores the board too', async ({ page }) => {
  await page.goto('exam.html');
  await page.locator('#examGrades button[data-id="shodan"]').click();
  await skipTo(page, 4);
  await expect(page.locator('#soroban')).toHaveClass(/sup-2/);
  await page.click('#examAbandon');
  await expect(page.locator('#soroban')).not.toHaveClass(/sup-2/);
});
