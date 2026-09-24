/**
 * Central timeout config.
 *
 * Single place to tune every wait in the suite. Nothing else should hard-code
 * a millisecond value — page objects and specs just call the action and let
 * these defaults do the waiting.
 *
 * Applied in two places:
 *   - playwright.config.js  -> test / expect / action / navigation timeouts
 *   - fixtures/base-test.js -> page.setDefaultTimeout for every locator wait
 *
 * Override per run without editing code:
 *   TEST_TIMEOUT=300000 ACTION_TIMEOUT=45000 npx playwright test
 */

const ms = (envVar, fallback) => Number(process.env[envVar]) || fallback;

const TIMEOUTS = {
  /** Whole test body budget. */
  test: ms('TEST_TIMEOUT', 300_000),          // 5 min

  /** Every `expect(locator).toBeVisible()` etc. */
  expect: ms('EXPECT_TIMEOUT', 30_000),       // 30 s

  /** Every click/fill/check and every locator wait (setDefaultTimeout). */
  action: ms('ACTION_TIMEOUT', 30_000),       // 30 s

  /** page.goto / waitForURL / waitForNavigation. */
  navigation: ms('NAVIGATION_TIMEOUT', 60_000), // 60 s

  /** waitForLoadState('domcontentloaded' | 'networkidle'). */
  loadState: ms('LOADSTATE_TIMEOUT', 30_000), // 30 s

  /** Per-strategy probe inside the self-healing locator — keep this short so
   *  a dead strategy fails fast and the next fallback gets its turn. */
  healProbe: ms('HEAL_PROBE_TIMEOUT', 5_000), // 5 s
};

module.exports = { TIMEOUTS };
