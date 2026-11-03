/**
 * Environments the suite can run against. Pick one with TEST_ENV (in .env or on the command line):
 *
 *   TEST_ENV=uat  npx playwright test     (default; "test" is the same as "uat")
 *   TEST_ENV=prod npx playwright test     (also needs ALLOW_PROD=true, see below)
 *
 * Each environment lists the host of every app. One app can still be pointed elsewhere for a run with
 * INVOICE_URL / FIELDFORCE_URL / INVENTORY_URL (BASE_URL is the old name for INVOICE_URL).
 *
 * Saved sessions (config/auth.js) and Rundata files (utils/runtimeDataStore.js) are kept per
 * environment, so a UAT session or UAT item names are never used on prod.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const ENVIRONMENTS = {
  uat: {
    invoice:    'https://invoice.test.vgts.xyz',
    fieldforce: 'https://fieldforce.test.vgts.xyz',
    inventory:  'https://inventory.test.vgts.xyz',
  },
  prod: {
    // TODO: put the production hosts here; until then they come from PROD_*_URL in .env
    invoice:    process.env.PROD_INVOICE_URL    || '',
    fieldforce: process.env.PROD_FIELDFORCE_URL || '',
    inventory:  process.env.PROD_INVENTORY_URL  || '',
  },
};

const ALIASES = { test: 'uat', production: 'prod' };

const raw = (process.env.TEST_ENV || 'uat').trim().toLowerCase();
const ENV_NAME = ALIASES[raw] || raw;
if (!ENVIRONMENTS[ENV_NAME]) {
  throw new Error(`TEST_ENV="${process.env.TEST_ENV}" is unknown. Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`);
}

// The suite creates, edits and deletes invoices, payments, items and price lists — never on prod by accident
if (ENV_NAME === 'prod' && process.env.ALLOW_PROD !== 'true') {
  throw new Error('TEST_ENV=prod: the tests create and delete real data. Set ALLOW_PROD=true to run against production.');
}

const trim = (url) => url.replace(/\/+$/, '');
const env = ENVIRONMENTS[ENV_NAME];
const APP_URLS = {
  invoice:    trim(process.env.INVOICE_URL    || process.env.BASE_URL || env.invoice),
  fieldforce: trim(process.env.FIELDFORCE_URL || env.fieldforce),
  inventory:  trim(process.env.INVENTORY_URL  || env.inventory),
};
for (const [app, url] of Object.entries(APP_URLS)) {
  if (!url) throw new Error(`TEST_ENV=${ENV_NAME}: no ${app} URL. Add it to config/environments.js or set ${ENV_NAME.toUpperCase()}_${app.toUpperCase()}_URL in .env.`);
}

module.exports = { ENV_NAME, ENVIRONMENTS, APP_URLS };
