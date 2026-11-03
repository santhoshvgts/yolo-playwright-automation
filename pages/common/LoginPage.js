'use strict';

const { expect } = require('@playwright/test');
const { BasePage } = require('../base/base-page');
const { TIMEOUTS } = require('../../config/timeouts');

// Login waits with safe defaults, so this works with any project's config/timeouts.js
// (some have no `landing` key, or a 30s `expect` that is too short for a cold login).
const WAIT = {
  landing:    TIMEOUTS.landing ?? 15_000,                 // landing page shows Log In / Go to Dashboard
  org:        Math.max(TIMEOUTS.expect ?? 0, 60_000),     // org screen after a cold login, org switch
  navigation: TIMEOUTS.navigation ?? 60_000,
};
const { adminData, appUrls, masterData } = require('../../test-data/UserData');
const fs = require('fs');
const { ORG_FILE, STORAGE_STATE } = require('../../config/auth');

const DEFAULT_BASE_URL = appUrls.invoice;

/**
 * Org row on the org screen with exactly this name. Rows read "<name>" then "GST · …", and test orgs
 * share prefixes ("… PVT LTD" / "… PVT LTD 1"), so a plain text match would hit several.
 */
const exactOrgRow = (page, name) => {
  const n = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByRole('button').filter({ hasText: new RegExp(`^\\s*${n}\\s*(GST\\b|$)`) });
};

/** This worker's test org id, saved by config/global-setup.js next to the session ('' when there is none). */
const savedOrgId = () => {
  try { return JSON.parse(fs.readFileSync(ORG_FILE, 'utf8')).orgIds[masterData.organization] || ''; } catch { return ''; }
};

/** Which app (invoice | fieldforce | inventory) a URL belongs to ('' for none). */
const appOf = (url) => {
  try {
    const host = new URL(url).host;
    return Object.keys(appUrls).find((app) => new URL(appUrls[app]).host === host) || '';
  } catch { return ''; }
};

/** Default login data: credentials from .env, org from masterData. */
const defaultLoginData = () => {
  const user = adminData();
  return {
    emailId:           user.email,
    password:          user.password,
    organization:      masterData.organization,
    searchByNameOrGST: masterData.orgSearch || masterData.organization,
  };
};

/**
 * Current SSO login flow shared by the invoice / fieldforce / inventory apps:
 * landing "Log In" → accounts form (Email Id / Password / Show Password) → "Log in"
 * → "Select an organisation" screen → search → pick org → "Switch".
 * With a live session the landing page shows "Go to Dashboard" instead.
 * UI only — no API interception or cookie handling.
 */
class LoginPage extends BasePage {

  constructor(page, baseUrl = DEFAULT_BASE_URL) {
    super(page);

    this.baseUrl = baseUrl;

    // Login locators (stable role-based)
    this.loginButton          = this.page.getByRole('button', { name: 'Log In', exact: true });
    this.emailField           = this.page.getByRole('textbox', { name: 'Email Id' });
    this.passwordField        = this.page.getByRole('textbox', { name: 'Password' });
    this.showPasswordCheckbox = this.page.getByRole('checkbox', { name: 'Show Password' });
    this.loginButtonFinal     = this.page.getByRole('button', { name: 'Log in', exact: true });

    // Organisation selection locators
    this.orgHeading     = this.page.getByRole('heading', { name: 'Select an organisation' });
    this.orgSearchField = this.page.getByRole('textbox', { name: 'Search by name or GST…' });
    this.orgResult      = (name) => exactOrgRow(this.page, name);
    this.switchButton   = this.page.getByRole('button', { name: 'Switch' });
    // Header org indicator: <img alt="organisation"> + sibling with "<Org name>\n<GST>"
    this.headerOrg      = this.page.getByRole('img', { name: 'organisation' }).first().locator('xpath=../..');   // grandparent holds "<Org name>\n<GST>"

    // Landing page shows this instead of "Log In" once a session is present.
    this.goToDashboardButton = this.page.getByRole('button', { name: /Go to Dashboard/i });

    // Invoice app top menu — shown once the app has opened inside an org
    this.invoiceNav = this.page.locator('//a[text()="Sales"]');

    // Logout locators
    this.profileImage = this.page.getByRole('img', { name: 'profile' });
    this.logoutLink   = this.page.getByText('Log out');
  }

  /** Enter credentials and submit the login form. */
  async login(data = defaultLoginData()) {
    if (!data.emailId || !data.password) throw new Error('ADMIN_EMAIL / ADMIN_PASSWORD missing — fill them in playwright/.env');
    console.log('Logging in...');
    await this.page.goto(this.baseUrl);
    await this.loginButton.click();
    await this.emailField.fill(data.emailId);
    await this.passwordField.fill(data.password);
    await this.showPasswordCheckbox.check();
    await this.loginButtonFinal.click();
  }

  /** Org name shown in the header next to the "organisation" icon ('' if no header yet). */
  async currentOrgName() {
    const header = this.headerOrg;
    const shown = await header.waitFor({ state: 'visible', timeout: WAIT.landing }).then(() => true, () => false);
    return shown ? (await header.innerText()).trim() : '';
  }

  /**
   * Make sure the app is inside the test org. The org is remembered PER APP, so
   * fieldforce / inventory can open straight into some other org with no org
   * screen at all. Order: org screen showing → pick there; header already shows
   * the org → done; otherwise open <app>/org-select and switch.
   * Returns true when it switched org (callers then wait for the data to reload).
   */
  async selectOrg(data = defaultLoginData()) {
    const orgId = savedOrgId();
    if (orgId && this.page.url().includes(orgId) && !(await this.orgHeading.isVisible().catch(() => false))) {
      // Already inside the saved test org (the header check below cannot read the invoice app's header)
      return false;
    }
    // This worker's own org: open it by id. All three apps take the same <app>/<orgId> URL, so this skips the
    // org screen search (slow, and under parallel load it sometimes returns nothing) and the header name check
    // (the header cuts names to "Automation Testing Org PVT LTD...", which every test org starts with).
    const app = appOf(this.page.url());
    if (orgId && app && data.organization === masterData.organization) {
      this.baseUrl = appUrls[app];
      if (await this.openSavedOrg(app)) return true;
    }
    if (!(await this.orgHeading.isVisible().catch(() => false))) {
      const current = await this.currentOrgName();
      if (current.split('\n')[0].trim().toLowerCase() === data.organization.trim().toLowerCase()) {
        console.log(`Organisation already "${data.organization}" — no switch needed`);
        return false;
      }
      console.log(`App is in "${current.split('\n')[0] || 'unknown org'}" — opening org-select`);
      // The org screen keeps loading assets after it renders; the heading wait below is the real check
      await this.page.goto(new URL('/org-select', this.page.url()).href, { waitUntil: 'domcontentloaded' });
      await expect(this.orgHeading).toBeVisible({ timeout: WAIT.org });
    }
    console.log(`Selecting organisation "${data.organization}"...`);
    const orgRow = this.orgResult(data.organization);
    // Under load the org search sometimes returns nothing the first time — search again
    await expect(async () => {
      await this.orgSearchField.fill('');
      await this.orgSearchField.fill(data.searchByNameOrGST);
      await expect(orgRow).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });

    // The active org's row is rendered disabled: we are already in it (e.g. the
    // screen is still closing after a Switch) — just wait for the screen to go.
    if (await orgRow.isDisabled()) {
      console.log('Organisation already active — waiting for the org screen to close');
    } else {
      await orgRow.click();
      await this.switchButton.click();
    }
    // Switch navigates away from /org-select; don't continue until it has.
    await expect(this.orgHeading).toBeHidden({ timeout: WAIT.org });
    return true;
  }

  /** Full flow: log in, verify the org screen, then switch into the test org. */
  async loginAndSelectOrg(data = defaultLoginData()) {
    await this.login(data);

    // Precondition: org selection screen. A cold login sits on a loading spinner
    // for a while, so this gets the full expect budget from config/timeouts.js.
    await expect(this.orgHeading).toBeVisible({ timeout: WAIT.org });

    await this.selectOrg(data);
  }

  /**
   * Get into the app without assuming which landing state we're in:
   * "Go to Dashboard" (session present) → click through; "Log In" → full credential flow.
   */
  async ensureLoggedIn(data = defaultLoginData()) {
    await this.page.goto(this.baseUrl);

    const state = await Promise.race([
      this.goToDashboardButton.waitFor({ state: 'visible', timeout: WAIT.landing }).then(() => 'dashboard'),
      this.loginButton.waitFor({ state: 'visible', timeout: WAIT.landing }).then(() => 'login'),
    ]).catch(() => 'in-app');   // neither shown → the app opened straight into a session

    if (state === 'dashboard') {
      console.log('Session present — Go to Dashboard');
      await this.goToDashboardButton.click();
      await expect(this.goToDashboardButton).toBeHidden({ timeout: WAIT.org });
      await this.selectOrg(data);   // no-op unless the org screen shows
      return;
    }
    if (state === 'login') {
      await this.loginAndSelectOrg(data);
      return;
    }
    await this.selectOrg(data);
  }

  /** Open one of the apps (invoice | fieldforce | inventory) and make sure we're inside it. */
  async openApp(app, data = defaultLoginData()) {
    const url = appUrls[app];
    if (!url) throw new Error(`Unknown app "${app}" (expected invoice | fieldforce | inventory)`);
    console.log(`Opening ${app} app...`);
    this.baseUrl = url;
    if (await this.openSavedOrg(app)) return;
    // Each login ends the account's other sessions, so every other worker's running test fails. Under load the
    // app sometimes shows the login screen for a session the server still accepts: retry the saved session
    // (or one another test has already renewed) a couple of times before logging in.
    for (let attempt = 1; attempt <= 2 && savedOrgId(); attempt++) {
      await this.adoptSavedSession();
      if (await this.openSavedOrg(app)) return;
      await this.page.waitForTimeout(5_000 * attempt);
    }
    await this.ensureLoggedIn(data);
    const host = new URL(url).host.replace(/\./g, '\\.');
    await expect(this.page).toHaveURL(new RegExp(host), { timeout: WAIT.navigation });
    if (savedOrgId()) await this.saveSession();
  }

  /** Load STORAGE_STATE's cookies into this context when they differ from ours (another test logged in since). */
  async adoptSavedSession() {
    try {
      const { cookies = [] } = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8'));
      const mine = new Set((await this.page.context().cookies()).map((c) => `${c.name}=${c.value}`));
      if (cookies.every((c) => mine.has(`${c.name}=${c.value}`))) return false;
      await this.page.context().addCookies(cookies);
      console.log('Saved session: trying the session another test saved');
      return true;
    } catch { return false; }
  }

  /**
   * The saved session was dropped (the server ends it when the account logs in elsewhere): hand the new one to
   * the tests after this one — every test of every worker loads STORAGE_STATE — instead of each logging in again.
   */
  async saveSession() {
    const tmp = `${STORAGE_STATE}.${process.pid}.tmp`;
    try {
      await this.page.context().storageState({ path: tmp });
      fs.renameSync(tmp, STORAGE_STATE);   // whole-file swap: a test starting now never reads half a file
      console.log('Saved the new session for the next tests');
    } catch (e) {
      console.log(`Could not save the new session: ${e.message.slice(0, 80)}`);
    }
  }

  /**
   * Saved session (config/global-setup.js): open <app>/<orgId> of this worker's org straight away —
   * ~2 s instead of ~14 s for landing → login → org switch. The org id is the same in every app.
   * Returns false when there is no saved org or the session is no longer valid (caller logs in).
   */
  async openSavedOrg(app = 'invoice') {
    const orgId = savedOrgId();
    if (!orgId) return false;
    // Invoice: its top menu. Fieldforce / inventory: the header org name, filled once the org has loaded.
    const ready = app === 'invoice' ? this.invoiceNav : this.headerOrg.filter({ hasText: /\S/ });
    const landed = (timeout) => Promise.race([
      ready.waitFor({ state: 'visible', timeout }).then(() => 'app'),
      this.loginButton.waitFor({ state: 'visible', timeout }).then(() => 'login'),
      this.goToDashboardButton.waitFor({ state: 'visible', timeout }).then(() => 'dashboard'),
      this.orgHeading.waitFor({ state: 'visible', timeout }).then(() => 'org screen'),
    ]).catch(() => 'nothing shown');
    await this.page.goto(`${this.baseUrl}/${orgId}`);
    let state = await landed(WAIT.landing);
    if (state === 'nothing shown') {
      // Server slow under parallel load: one more, longer try beats a full login (whose org search is slower still)
      console.log('Saved session: app slow to open — reloading');
      await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      state = await landed(WAIT.navigation);
    }
    if (state === 'app' && this.page.url().includes(orgId)) {
      console.log('Saved session — opened the test org directly');
      return true;
    }
    console.log(`Saved session not usable (${state})`);
    return false;
  }

  async logout() {
    await this.profileImage.click();
    await this.logoutLink.click();
  }
}

// `LoginFlow` kept as an alias so code written against that name works unchanged.
module.exports = { LoginPage, LoginFlow: LoginPage, DEFAULT_BASE_URL, defaultLoginData, exactOrgRow };
