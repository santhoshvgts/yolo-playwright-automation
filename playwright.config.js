// @ts-check
import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';
import { TIMEOUTS } from './config/timeouts.js';
import { URLS } from './config/urls.js';

// Resolves relative to CWD — always run `npx playwright test` from the project root.
dotenv.config({ quiet: true });

// Detects UI mode — works via env var OR auto-detects Playwright's internal flag
const isUI = process.env.PLAYWRIGHT_UI_MODE === 'true'
          || !!process.env.PW_TEST_HTML_REPORT_OPEN
          || process.argv.includes('--ui')
          || process.argv.includes('--ui-host');

export default defineConfig({
  // ── Login ───────────────────────────────────────────────────────
  // No globalSetup and no storageState — every test logs in for itself in its
  // own beforeEach, against a clean browser context. config/global-setup.js and
  // config/auth.js are left in the repo unwired if you ever want session reuse
  // back; wire them up again with `globalSetup` here plus `use.storageState`.

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
  // All values live in config/timeouts.js — tune them there, or per run via
  // TEST_TIMEOUT / EXPECT_TIMEOUT / ACTION_TIMEOUT / NAVIGATION_TIMEOUT.
  timeout: TIMEOUTS.test,
  expect: {
    timeout: TIMEOUTS.expect,
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
    // From config/urls.js — lets specs call page.goto('/some/path').
    baseURL: URLS.base,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: TIMEOUTS.navigation,
    actionTimeout: TIMEOUTS.action,
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
