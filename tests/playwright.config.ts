import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: './test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    screenshot: 'on',
    trace: 'on-first-retry',
    headless: true,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
});
