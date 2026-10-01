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

const DEFAULT_BASE_URL = appUrls.invoice;

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
    this.orgResult      = (name) => this.page.getByRole('button', { name });
    this.switchButton   = this.page.getByRole('button', { name: 'Switch' });
    // Header org indicator: <img alt="organisation"> + sibling with "<Org name>\n<GST>"
    this.headerOrg      = this.page.getByRole('img', { name: 'organisation' }).first().locator('xpath=../..');   // grandparent holds "<Org name>\n<GST>"

    // Landing page shows this instead of "Log In" once a session is present.
    this.goToDashboardButton = this.page.getByRole('button', { name: /Go to Dashboard/i });

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
   */
  async selectOrg(data = defaultLoginData()) {
    if (!(await this.orgHeading.isVisible().catch(() => false))) {
      const current = await this.currentOrgName();
      if (current.toLowerCase().includes(data.organization.toLowerCase())) {
        console.log(`Organisation already "${data.organization}" — no switch needed`);
        return;
      }
      console.log(`App is in "${current.split('\n')[0] || 'unknown org'}" — opening org-select`);
      await this.page.goto(new URL('/org-select', this.page.url()).href);
      await expect(this.orgHeading).toBeVisible({ timeout: WAIT.org });
    }
    console.log(`Selecting organisation "${data.organization}"...`);
    await this.orgSearchField.fill(data.searchByNameOrGST);
    const orgRow = this.orgResult(data.organization);
    await expect(orgRow).toBeVisible();

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
    await this.ensureLoggedIn(data);
    const host = new URL(url).host.replace(/\./g, '\\.');
    await expect(this.page).toHaveURL(new RegExp(host), { timeout: WAIT.navigation });
  }

  async logout() {
    await this.profileImage.click();
    await this.logoutLink.click();
  }
}

// `LoginFlow` kept as an alias so code written against that name works unchanged.
module.exports = { LoginPage, LoginFlow: LoginPage, DEFAULT_BASE_URL, defaultLoginData };
