import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  // Playwright's 30 s default is too tight for this repo's heaviest page:
  // game.html boots a 1.2 MB vendored Phaser and a WebGL context, and four
  // parallel workers can be doing that at once. A generous ceiling doesn't mask
  // anything — a genuinely broken test still fails, just later — whereas
  // retries would hide real flakiness in the app itself.
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:8139',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8139',
    reuseExistingServer: !process.env.CI,
  },
});
