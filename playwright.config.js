// @ts-check
import dotenv from 'dotenv';
import { defineConfig } from '@playwright/test';
import { TIMEOUTS } from './config/timeouts.js';
import { URLS } from './config/urls.js';
import { STORAGE_STATE } from './config/auth.js';

// Resolves relative to CWD — always run `npx playwright test` from the project root.
dotenv.config({ quiet: true });

// Detects UI mode — works via env var OR auto-detects Playwright's internal flag
const isUI = process.env.PLAYWRIGHT_UI_MODE === 'true'
          || !!process.env.PW_TEST_HTML_REPORT_OPEN
          || process.argv.includes('--ui')
          || process.argv.includes('--ui-host');

// tests/*.spec.js (Product_item_Create, Vendor_Create, Pricing_general_Create) log in through the UI
const ROOT_LOGIN_SPECS = /tests\/[^/]+\.spec\.js$/;

// Shared Chromium settings for both projects
const CHROMIUM = {
  browserName: 'chromium',
  // Fixed size: with viewport null the page shrinks to the window, and on smaller screens (e.g. a Mac)
  // dropdowns near the bottom open outside the viewport and cannot be clicked
  viewport: { width: 1920, height: 1080 },
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
};

export default defineConfig({
  // ── Login ───────────────────────────────────────────────────────
  // config/global-setup.js logs in once per run and saves the session + org id
  // (config/auth.js). The `chromium` project loads it, so openApp('invoice')
  // opens the test org directly (~2 s instead of ~14 s per test). The root
  // login specs (tests/*.spec.js) run in `chromium-login` with no session.
  // FORCE_LOGIN=true makes the setup log in again.
  globalSetup: './config/global-setup.js',

  // ── Test Discovery ──────────────────────────────────────────────
  testDir: './tests',
  testMatch: '**/*.spec.{js,ts}',

  // ── Execution Control ────────────────────────────────────────────
  // workers: 1 — Rundata/*.json (runtimeDataStore) is a plain file-based
  // store with no locking; raise workers only after adding locking too.
  fullyParallel: true,
  workers: 1,
  maxFailures: 0,
  // A failing test costs (retries + 1) full runs — keep this low
  retries: process.env.CI ? 2 : 1,

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
    // Recording only on the retry: a first-run failure still gets a screenshot, and the retry a video + trace
    video: 'on-first-retry',
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
      testIgnore: ['**/Mobile/**', ROOT_LOGIN_SPECS],
      use: { ...CHROMIUM, storageState: STORAGE_STATE },
    },
    {
      // Specs that walk the login screen themselves — clean context, no saved session
      name: 'chromium-login',
      testMatch: ROOT_LOGIN_SPECS,
      use: CHROMIUM,
    },
  ],
});
