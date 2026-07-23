// The offline shell, proved the only way it can be: install the service worker,
// cut the network, and reload. Everything else about this feature (that the
// precache list covers the real import graph) is a unit test; that a page then
// actually BOOTS with no network is not something node can answer.
import { test, expect } from '@playwright/test';

// Wait until a controller is installed and in charge of this page.
async function shellReady(page) {
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
}

test('the shell installs, and the app opens with the network cut', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e));

  await page.goto('index.html');
  await shellReady(page);
  // Give the install a moment to finish writing the precache.
  await page.waitForFunction(async () => {
    const c = await caches.open('npv-shell-v1');
    return (await c.keys()).length > 50;
  }, null, { timeout: 30000 });

  await context.setOffline(true);
  await page.reload();

  // The front door renders from cache: nav, plan, figures, all of it.
  await expect(page.locator('#todayHead')).toBeVisible();
  await expect(page.locator('.topnav a')).toHaveCount(12);
  await expect(page.locator('#figStreak')).toContainText('practised');
  expect(errors).toEqual([]);

  await context.setOffline(false);
});

test('a page you have never opened still works offline — the whole app is cached', async ({ page, context }) => {
  await page.goto('index.html');
  await shellReady(page);
  await page.waitForFunction(async () => {
    const c = await caches.open('npv-shell-v1');
    return (await c.keys()).length > 50;
  }, null, { timeout: 30000 });

  await context.setOffline(true);
  // Guided practice was never visited in this session; its modules come from
  // the precache, not from a previous visit.
  await page.goto('practice.html');
  await expect(page).toHaveTitle('Guided practice — Place-Value Peg Soroban');
  await expect(page.locator('#soroban')).toBeVisible();

  // …and a deep link with a query string resolves to the same cached document.
  await page.goto('practice.html?level=big-add');
  await expect(page.locator('#soroban')).toBeVisible();
  await context.setOffline(false);
});

test('the nav says the app now works offline, once', async ({ page }) => {
  await page.goto('index.html');
  // The chip appears on the first install (there was no controller at load).
  await expect(page.locator('#navShell')).toContainText('works offline', { timeout: 20000 });
});

test('an installed app has a manifest and an icon the browser can fetch', async ({ page, request }) => {
  await page.goto('index.html');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');

  const manifest = await (await request.get('manifest.webmanifest')).json();
  expect(manifest.name).toContain('Soroban');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('image/png');
  }
});
