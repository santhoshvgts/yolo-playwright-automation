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

module.exports = { test, expect: base.expect, TIMEOUTS };
