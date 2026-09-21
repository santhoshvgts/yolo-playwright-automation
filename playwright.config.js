// @ts-check
import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';

// Resolves relative to CWD — always run `npx playwright test` from the project root.
dotenv.config({ quiet: true });

// Detects UI mode — works via env var OR auto-detects Playwright's internal flag
const isUI = process.env.PLAYWRIGHT_UI_MODE === 'true'
          || !!process.env.PW_TEST_HTML_REPORT_OPEN
          || process.argv.includes('--ui')
          || process.argv.includes('--ui-host');

export default defineConfig({
  // ── Test Discovery ──────────────────────────────────────────────
  testDir: './tests',
  testMatch: '**/*.spec.{js,ts}',

  // ── Execution Control ────────────────────────────────────────────
  // workers: 1 — Rundata/*.json (runtimeDataStore) is a plain file-based
  // store with no locking; raise workers only after adding locking too.
  fullyParallel: true,
  workers: 1,
  maxFailures: 0,
  retries: process.env.CI ? 5 : 3,

  // ── Timeouts ─────────────────────────────────────────────────────
  timeout: 120_0000,
  expect: {
    timeout: 15_0000,
  },

  // ── Reporters ────────────────────────────────────────────────────
  reporter: process.env.CI
    ? [
        ['github'],
        ['json', { outputFile: 'test-results/results.json' }],
        ['html', { outputFolder: 'test-results/html', open: 'never' }],
        ['list'],
      ]
    : [
        ['list'],
        ['html', { outputFolder: 'test-results/html', open: 'on-failure' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ],

  // ── Shared Browser Settings ──────────────────────────────────────
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    ignoreHTTPSErrors: true,
  },

  // ── Output Folder ────────────────────────────────────────────────
  outputDir: 'test-results/artifacts',

  // ── Projects ─────────────────────────────────────────────────────
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/Mobile/**'],
      use: {
        browserName: 'chromium',
        viewport: null,
        launchOptions: {
          slowMo: process.env.SLOWMO ? 500 : 0,
          args: [
            '--window-size=1920,1080',
            '--start-maximized',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-gpu',
          ],
        },
      },
    },
  ],
});
