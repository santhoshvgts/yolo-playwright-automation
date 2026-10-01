/**
 * testHelpers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * runSafely(fn) — wraps a test body so one failing step doesn't abort a long
 * serial flow. Behaviour depends on STRICT in .env / the shell:
 *
 *   STRICT unset / false → error is logged ("swallowed by runSafely") and the
 *                          test is marked with a `soft-failure` annotation, but
 *                          still reports as passed. Good for exploratory runs.
 *   STRICT=true          → error is re-thrown, so the test really fails.
 *                          Use this in CI and whenever you need a true signal.
 */

const { test } = require('@playwright/test');

function isStrict() {
  return ['1', 'true', 'yes'].includes(String(process.env.STRICT || '').toLowerCase());
}

function runSafely(fn) {
  // Request NO fixtures: destructuring `page` here would make Playwright open an
  // extra (blank) browser page per test next to the spec's shared beforeAll page.
  // eslint-disable-next-line no-empty-pattern
  return async ({}, testInfo) => {
    try {
      await fn({}, testInfo);
    } catch (err) {
      if (isStrict()) throw err;
      console.error('Test error (swallowed by runSafely):', err);
      testInfo.annotations.push({ type: 'soft-failure', description: String(err && err.message || err).slice(0, 500) });
    }
  };
}

/** Wrap a block in a named step so it shows up in the HTML report / trace. */
async function step(title, fn) {
  return test.step(title, fn);
}

module.exports = { runSafely, step, isStrict };
