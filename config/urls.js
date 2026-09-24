/**
 * Central URL config.
 *
 * Single place for every environment address. Nothing else should hard-code a
 * host — specs and page objects take what they need from here.
 *
 * Point the suite at another environment without editing code:
 *   BASE_URL=https://invoice.stage.vgts.xyz npx playwright test
 *
 * `base` also feeds `use.baseURL` in playwright.config.js, so a relative
 * `page.goto('/some/path')` resolves against it.
 */

const BASE = (process.env.BASE_URL || 'https://invoice.test.vgts.xyz').replace(/\/+$/, '');

// Org the suite runs against. Its id is part of every in-app path.
const ORG_ID = process.env.ORG_ID || '2d9d0527d0d94b1ab010cc24eca9a5ab';

// Paths, relative to BASE — usable directly with page.goto() thanks to baseURL.
const PATHS = {
  home: '/',
  products: `/${ORG_ID}/sales?sales=1`,
};

// Same set, absolute. Use these where a full URL is required.
const URLS = {
  base: `${BASE}/`,
  home: `${BASE}${PATHS.home}`,
  products: `${BASE}${PATHS.products}`,
};

module.exports = { BASE, ORG_ID, PATHS, URLS };
