const path = require('path');

/**
 * Where the one-time login session is parked.
 *
 * The `setup` project (tests/auth.setup.js) logs in once per run and writes
 * cookies + localStorage here. Every other project loads it via
 * `use.storageState`, so tests start already logged in and inside the org.
 *
 * Path is gitignored (/playwright/.auth/) — it holds a live session token.
 */
const STORAGE_STATE = path.join(__dirname, '..', 'playwright', '.auth', 'user.json');

module.exports = { STORAGE_STATE };
