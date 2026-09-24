const fs = require('fs');
const path = require('path');
const { chromium, expect } = require('@playwright/test');
const { LoginFlow } = require('../pages/LoginFlow');
const { URLS } = require('./urls');
const { generateProduct_item_CreateData } = require('../test-data/Product_item_Create-data');
const { STORAGE_STATE } = require('./auth');
const { TIMEOUTS } = require('./timeouts');

// How long a saved session stays good. Inside this window a re-run skips the
// login entirely and reuses the file on disk.
const SESSION_MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 30 * 60 * 1000;

function freshStateExists() {
  if (process.env.FORCE_LOGIN === 'true') return false;
  try {
    const age = Date.now() - fs.statSync(STORAGE_STATE).mtimeMs;
    return age < SESSION_MAX_AGE_MS;
  } catch {
    return false; // not there yet
  }
}

/**
 * One-time login for the whole run.
 *
 * Runs before any test, whatever you pass on the command line — a single spec
 * file, --project, --grep or UI mode all still get a session. The result is
 * written to STORAGE_STATE and picked up by `use.storageState`, so no test
 * logs in itself.
 */
module.exports = async () => {
  if (freshStateExists()) {
    console.log(`[auth] reusing session ${path.relative(process.cwd(), STORAGE_STATE)}`);
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUTS.action);
  page.setDefaultNavigationTimeout(TIMEOUTS.navigation);

  try {
    const login = new LoginFlow(page, URLS.base);
    await login.loginAndSelectOrg(generateProduct_item_CreateData());

    // Session is only usable once the org switch has actually landed.
    await expect(login.orgHeading).toBeHidden();
    await page.waitForLoadState('networkidle');

    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
    console.log(`[auth] logged in, session saved to ${path.relative(process.cwd(), STORAGE_STATE)}`);
  } finally {
    await context.close();
    await browser.close();
  }
};
