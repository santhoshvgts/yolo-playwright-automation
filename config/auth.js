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
 */
const STORAGE_STATE = path.join(__dirname, '..', 'playwright', '.auth', 'user.json');
const ORG_FILE = path.join(__dirname, '..', 'playwright', '.auth', 'org.json');

module.exports = { STORAGE_STATE, ORG_FILE };
