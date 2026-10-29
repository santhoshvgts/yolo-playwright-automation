const base = require('@playwright/test');
const { TIMEOUTS } = require('../config/timeouts');

/**
 * Shared test fixture.
 *
 * Specs import `test`/`expect` from here instead of '@playwright/test'. Every
 * page then carries the default timeouts from config/timeouts.js, so no spec
 * or page object needs to pass `{ timeout: ... }` or wait for elements by hand
 * — Playwright auto-waits up to the default on every locator action and assert.
 *
 *   const { test, expect } = require('../fixtures/base-test');
 */
const test = base.test.extend({
  page: async ({ page }, use) => {
    page.setDefaultTimeout(TIMEOUTS.action);
    page.setDefaultNavigationTimeout(TIMEOUTS.navigation);
    await use(page);
  },
});

/**
 * App defect confirmed by QA (YOLO_Bug_List, QA Status = bug). Call it first
 * thing in a test that only checks the defect: the test is expected to fail,
 * and once the app is fixed Playwright reports "expected to fail, but passed"
 * so the marker gets removed.
 *
 *   knownBug('BUG-SI-07', '"Change" customer opens no picker');
 */
function knownBug(id, summary) {
  test.info().annotations.push({ type: 'bug', description: `${id} - ${summary}` });
  test.fail();
}

/**
 * Same as knownBug, for a test that checks several cases where only one check
 * hits the defect: the other checks keep running. The wrapped check is
 * expected to fail; if it passes the defect is fixed and the test fails so the
 * wrapper gets removed.
 *
 *   await bugCheck('BUG-PI-01', 'no select-all checkbox', async () => {
 *     await expect(headerCheckbox).toBeVisible({ timeout: 5000 });
 *   });
 */
async function bugCheck(id, summary, check) {
  try {
    await check();
  } catch (e) {
    test.info().annotations.push({ type: 'bug', description: `${id} (open) - ${summary}` });
    console.log(`${id} still open: ${summary}`);
    return;
  }
  throw new Error(`${id} looks fixed (${summary}): remove the bugCheck wrapper`);
}

module.exports = { test, expect: base.expect, TIMEOUTS, knownBug, bugCheck };
