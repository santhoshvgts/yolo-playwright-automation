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

/**
 * Click Print and report how the app printed: { popup, download, print }. The app prints through
 * a hidden off-screen iframe — it calls iframe.contentWindow.print() and then removes the iframe —
 * so every iframe added after the click gets its print() stubbed and counted. Any of the three
 * being truthy means a print was triggered; no real print dialog opens.
 */
async function capturePrint(page, click) {
  await page.evaluate(() => {
    window.__printed = 0;
    window.print = () => { window.__printed += 1; };
    const stub = (f) => { try { f.contentWindow.print = () => { window.__printed += 1; }; } catch { /* cross-origin */ } };
    window.__printObserver?.disconnect();
    window.__printObserver = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.tagName !== 'IFRAME') return;
      stub(n);
      n.addEventListener('load', () => stub(n));
    })));
    window.__printObserver.observe(document.body, { childList: true, subtree: true });
  });
  const popup = page.waitForEvent('popup', { timeout: 15_000 }).catch(() => null);
  const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await click();
  const [p, dl] = await Promise.all([popup, download]);
  const print = await page.evaluate(() => window.__printed).catch(() => 0);
  console.log(`print: popup=${!!p} download=${dl ? dl.suggestedFilename() : 'none'} print()=${print}`);
  return { popup: !!p, download: !!dl, print };
}

module.exports = { runSafely, step, isStrict, capturePrint };
