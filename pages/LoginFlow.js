const { expect } = require('@playwright/test');
const { SelfHealingBasePage } = require('./self-healing-base-page');
const { URLS } = require('../config/urls');

const DEFAULT_BASE_URL = URLS.base;

/**
 * Shared login + organisation selection flow.
 *
 * Every test gets a fresh browser context, so nothing carries over between
 * tests — each test drives this flow itself.
 *
 *   const login = new LoginFlow(page);
 *   await login.loginAndSelectOrg(data);
 */
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

    // Verify org selection screen appears (precondition check)
    await expect(this.orgHeading).toBeVisible();

    await this.selectOrg(data);
  }

  async logout() {
    await this.profileImage.click();
    await this.logoutLink.click();
  }
}

module.exports = { LoginFlow, DEFAULT_BASE_URL };
