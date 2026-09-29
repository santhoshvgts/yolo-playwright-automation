const { expect } = require('@playwright/test');
const { SelfHealingBasePage } = require('./self-healing-base-page');
const { TIMEOUTS } = require('../config/timeouts');

const DEFAULT_BASE_URL = 'https://invoice.test.vgts.xyz/';


class LoginFlow extends SelfHealingBasePage {
  constructor(page, baseUrl = DEFAULT_BASE_URL) {
    super(page);

    this.baseUrl = baseUrl;

    // Login locators (stable role-based)
    this.loginButton = this.page.getByRole('button', { name: 'Log In' });
    this.emailField = this.page.getByRole('textbox', { name: 'Email Id' });
    this.passwordField = this.page.getByRole('textbox', { name: 'Password' });
    this.showPasswordCheckbox = this.page.getByRole('checkbox', { name: 'Show Password' });
    this.loginButtonFinal = this.page.getByRole('button', { name: 'Log in' });

    // Organisation selection locators
    this.orgHeading = this.page.getByRole('heading', { name: 'Select an organisation' });
    this.orgSearchField = this.page.getByRole('textbox', { name: 'Search by name or GST…' });
    this.orgResult = this.page.getByRole('button', { name: 'Automation Testing Org PVT' });
    this.switchButton = this.page.getByRole('button', { name: 'Switch' });

    // Landing page shows this instead of "Log In" once a session is present.
    this.goToDashboardButton = this.page.getByRole('button', { name: /Go to Dashboard/i });

    // Logout locators
    this.profileImage = this.page.getByRole('img', { name: 'profile' });
    this.logoutLink = this.page.getByText('Log out');
  }

  /** Enter credentials and submit the login form. */
  async login(data) {
    await this.page.goto(this.baseUrl);
    await this.loginButton.click();
    await this.emailField.fill(data.emailId);
    await this.passwordField.fill(data.password);
    await this.showPasswordCheckbox.check();
    await this.loginButtonFinal.click();
  }

  /** Search for the org and switch into it. Assumes the org screen is shown. */
  async selectOrg(data) {
    await this.orgSearchField.fill(data.searchByNameOrGST);
    await this.orgResult.click();
    await this.switchButton.click();
  }

  /** Full flow: log in, verify the org screen, then switch into the test org. */
  async loginAndSelectOrg(data) {
    await this.login(data);

    // Verify org selection screen appears (precondition check). A cold login
    // sits on a loading spinner for a while, so this gets the full expect
    // budget from config/timeouts.js rather than a short hard-coded wait.
    await expect(this.orgHeading).toBeVisible({ timeout: TIMEOUTS.expect });

    await this.selectOrg(data);
  }

  /**
   * Get into the app without assuming which landing state we're in.
   *
   * With a session loaded from storageState the landing page shows "Go to
   * Dashboard" and there is no "Log In" button — clicking through it is enough.
   * Without one, fall back to the full credential flow. Specs that already know
   * an in-app URL should just page.goto() it; this is for entering via the root.
   */
  async ensureLoggedIn(data) {
    await this.page.goto(this.baseUrl);

    if (await this.goToDashboardButton.isVisible().catch(() => false)) {
      await this.goToDashboardButton.click();
      await this.page.waitForLoadState('networkidle');
      return;
    }

    await this.loginAndSelectOrg(data);
  }

  async logout() {
    await this.profileImage.click();
    await this.logoutLink.click();
  }
}

module.exports = { LoginFlow, DEFAULT_BASE_URL };
