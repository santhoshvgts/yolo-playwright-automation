/**
 * Central URL config.
 *
 * Single place for every environment address. Nothing else should hard-code a
 * host — specs and page objects take what they need from here.
 *
 * The hosts per environment live in config/environments.js; pick one with TEST_ENV:
 *   TEST_ENV=uat npx playwright test
 *
 * `base` also feeds `use.baseURL` in playwright.config.js, so a relative
 * `page.goto('/some/path')` resolves against it.
 */

const { APP_URLS, ENV_NAME } = require('./environments');

const BASE = APP_URLS.invoice;

// Org the suite runs against. Its id is part of every in-app path. With several test orgs (ORG_NAMES) each
// worker has its own: config/global-setup.js saves name → id to ORG_FILE, so read this worker's org from there.
const workerOrgId = () => {
  try {
    const { masterData } = require('../test-data/UserData');
    const { ORG_FILE } = require('./auth');
    return JSON.parse(require('fs').readFileSync(ORG_FILE, 'utf8')).orgIds[masterData.organization] || '';
  } catch { return ''; }
};
// The hard-coded id is the first UAT test org — it means nothing on another environment
const ORG_ID = process.env.ORG_ID || workerOrgId() || (ENV_NAME === 'uat' ? '2d9d0527d0d94b1ab010cc24eca9a5ab' : '');

// Paths, relative to BASE — usable directly with page.goto() thanks to baseURL.
const PATHS = {
  home: '/',
  // Landing on `home` while a session is loaded shows the marketing page with a
  // "Go to Dashboard" button, not the app — go straight to an in-app path instead.
  dashboard: `/${ORG_ID}`,
  products: `/${ORG_ID}/sales?sales=1`,
};

// Same set, absolute. Use these where a full URL is required.
const URLS = {
  base: `${BASE}/`,
  home: `${BASE}${PATHS.home}`,
  dashboard: `${BASE}${PATHS.dashboard}`,
  products: `${BASE}${PATHS.products}`,
};

module.exports = { BASE, ENV_NAME, APP_URLS, ORG_ID, PATHS, URLS };
