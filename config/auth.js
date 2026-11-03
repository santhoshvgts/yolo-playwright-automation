const path = require('path');

/**
 * Where the one-time login session is parked.
 *
 * config/global-setup.js logs in once per run and writes the cookies here, plus
 * the test org's id to ORG_FILE. The `chromium` project loads the session via
 * `use.storageState`, and LoginPage.openApp('invoice') opens <app>/<orgId>
 * directly, so tests start logged in and inside the org.
 *
 * Path is gitignored (/playwright/.auth/) — it holds a live session token.
 * UAT keeps playwright/.auth/; every other environment (TEST_ENV) gets its own sub-folder,
 * so a session or org id from one environment is never used on another.
 */
const { ENV_NAME } = require('./environments');

const AUTH_DIR = path.join(__dirname, '..', 'playwright', '.auth', ...(ENV_NAME === 'uat' ? [] : [ENV_NAME]));
const STORAGE_STATE = path.join(AUTH_DIR, 'user.json');
const ORG_FILE = path.join(AUTH_DIR, 'org.json');

module.exports = { STORAGE_STATE, ORG_FILE };
