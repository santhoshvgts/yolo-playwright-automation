const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { LoginPage, defaultLoginData } = require('../pages/common/LoginPage');
const { ORGS } = require('../test-data/UserData');
const { STORAGE_STATE, ORG_FILE } = require('./auth');
const { TIMEOUTS } = require('./timeouts');
const { cleanOutputs, formatBytes } = require('../utils/cleanOutputs');

/**
 * Log in once per run, switch into every test org (ORG_NAMES) once, and save the session plus
 * each org's id: { orgIds: { "<org name>": "<32-hex id>" } }.
 *
 * Every test then opens <invoice>/<its worker's org id> straight away (~2 s) instead of
 * landing → login → org switch (~14 s). If the saved session stops working mid-run,
 * LoginPage.openApp falls back to the full login on its own.
 *
 * Reused when younger than SESSION_MAX_AGE_MS (default 30 min) and it holds every org, so short
 * local runs skip even this one login. FORCE_LOGIN=true always logs in.
 */
const SESSION_MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_MS) || 30 * 60 * 1000;

function freshStateExists() {
  if (process.env.FORCE_LOGIN === 'true') return false;
  try {
    const age = Date.now() - fs.statSync(STORAGE_STATE).mtimeMs;
    const { orgIds = {} } = JSON.parse(fs.readFileSync(ORG_FILE, 'utf8'));
    return age < SESSION_MAX_AGE_MS && ORGS.every((o) => orgIds[o]);
  } catch {
    return false; // not there yet
  }
}

// Old test output (debug folders, old run logs) is removed before the tests start.
// CLEAN_BEFORE_RUN=false skips it; CLEAN_KEEP_LOGS sets how many run logs stay (default 20).
// Files changed in the last 10 minutes stay, in case another run is going on at the same time.
function cleanOldOutput() {
  if (process.env.CLEAN_BEFORE_RUN === 'false') return;
  try {
    const keepLogs = Number(process.env.CLEAN_KEEP_LOGS) || 20;
    const { items, bytes } = cleanOutputs({ keepLogs, minAgeMs: 10 * 60 * 1000 });
    if (items.length) console.log(`[clean] removed ${items.length} old output item(s), ${formatBytes(bytes)}`);
  } catch (e) {
    console.log(`[clean] skipped: ${e.message}`);
  }
}

module.exports = async () => {
  cleanOldOutput();
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
    const orgIds = {};
    for (const org of ORGS) {
      const data = { ...defaultLoginData(), organization: org, searchByNameOrGST: org };
      if (!Object.keys(orgIds).length) await login.openApp('invoice', data);
      await login.selectOrg(data);
      await login.invoiceNav.waitFor({ state: 'visible', timeout: 60_000 });
      const orgId = (page.url().match(/\/([0-9a-f]{32})(?:[/?#]|$)/) || [])[1];
      if (!orgId) throw new Error(`[auth] no org id in the URL after switching to "${org}": ${page.url()}`);
      if (Object.values(orgIds).includes(orgId)) throw new Error(`[auth] "${org}" opened the same org as another name (${orgId})`);
      orgIds[org] = orgId;
      console.log(`[auth] ${org} → ${orgId}`);
    }

    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
    fs.writeFileSync(ORG_FILE, JSON.stringify({ orgIds }, null, 2));
    console.log(`[auth] logged in, session saved to ${path.relative(process.cwd(), STORAGE_STATE)} (${ORGS.length} org${ORGS.length > 1 ? 's' : ''})`);
  } finally {
    await context.close();
    await browser.close();
  }
};
