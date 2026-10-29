const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/common/LoginPage');
const { STORAGE_STATE, ORG_FILE } = require('./auth');
const { TIMEOUTS } = require('./timeouts');

/**
 * Log in once per run and save the session + the test org's id.
 *
 * Every test then opens <invoice>/<orgId> straight away (~2 s) instead of
 * landing → login → org switch (~14 s). If the saved session stops working
 * mid-run, LoginPage.openApp falls back to the full login on its own.
 *
 * Reused when younger than SESSION_MAX_AGE_MS (default 30 min) so short
 * local runs skip even this one login. FORCE_LOGIN=true always logs in.
 */
const SESSION_MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 30 * 60 * 1000;

function freshStateExists() {
  if (process.env.FORCE_LOGIN === 'true') return false;
  try {
    const age = Date.now() - fs.statSync(STORAGE_STATE).mtimeMs;
    return age < SESSION_MAX_AGE_MS && fs.existsSync(ORG_FILE);
  } catch {
    return false; // not there yet
  }
}

module.exports = async () => {
  if (freshStateExists()) {
    console.log(`[auth] reusing session ${path.relative(process.cwd(), STORAGE_STATE)}`);
    return;
  }
  // A stale org file would make openApp try the saved-session shortcut during this login
  fs.rmSync(ORG_FILE, { force: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUTS.action);
  page.setDefaultNavigationTimeout(TIMEOUTS.navigation);

  try {
    const login = new LoginPage(page);
    await login.openApp('invoice');
    await login.selectOrg();
    await login.invoiceNav.waitFor({ state: 'visible', timeout: 60_000 });

    const orgId = (page.url().match(/\/([0-9a-f]{32})(?:[/?#]|$)/) || [])[1];
    if (!orgId) throw new Error(`[auth] no org id in the URL after login: ${page.url()}`);

    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
    fs.writeFileSync(ORG_FILE, JSON.stringify({ orgId }, null, 2));
    console.log(`[auth] logged in, session saved to ${path.relative(process.cwd(), STORAGE_STATE)} (org ${orgId})`);
  } finally {
    await context.close();
    await browser.close();
  }
};
