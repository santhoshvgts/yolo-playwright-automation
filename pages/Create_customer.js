const { SelfHealingBasePage } = require('./self-healing-base-page');

class Create_customer extends SelfHealingBasePage {
  constructor(page) {
    super(page);

    // Login locators (stable role-based)
    this.loginButton = page.getByRole('button', { name: 'Log In' });
    this.emailInput = page.getByRole('textbox', { name: 'Email Id' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.showPasswordCheckbox = page.getByRole('checkbox', { name: 'Show Password' });
    this.loginButton2 = page.getByRole('button', { name: 'Log in' });

    // Search & switch business locators
    this.searchBox = page.getByRole('textbox', { name: 'Search by name or GST…' });
    this.companyResult = page.getByRole('button', { name: 'MOBILE PRODUCTION PVT LTD' });
    this.switchButton = page.getByRole('button', { name: 'Switch' });

    // Navigation to create customer
    this.customerTab = page.getByText('Customer', { exact: true });
    this.createCustomerButton = page.getByRole('button', { name: 'Customer' });
    this.businessCustomerLink = page.getByText('Business Customer');

    // Create customer form locators
    this.orgNameInput = page.getByRole('textbox', { name: 'Organisation Name' });
    this.businessTypeSelect = page.getByRole('combobox', { name: 'Business Type' });
    this.businessTypeOption_Retailer = page.getByText('Retailer', { exact: true });
    this.businessCategorySelect = page.getByRole('combobox', { name: 'Business Category' });
    this.businessCategoryOption_Cosmetics = page.getByText('Cosmetics');

    // Business Tags (dynamic selector fallback needed)
    this.businessTagSelect = page.locator('.ant-select-selection-overflow');
    this._businessTagSelectStrategies = [
      { locator: () => page.locator('.ant-select-selection-overflow') },
      { locator: () => page.getByRole('combobox', { name: /Business Tag/i }) },
      { locator: () => page.locator('div[role="combobox"]') },
      { locator: () => page.locator('.ant-select').nth(1) }
    ];

    this.businessTagOption2 = page.getByText('Business Tag 2 Hello');
    this.businessTagOption1 = page.getByText('Business Tag 1 Hello');

    // Modal close/save button (dynamic)
    this.modalCloseSaveButton = page.locator('div').filter({ hasText: /CloseSaveBusiness/i }).nth(1);
    this._modalCloseSaveButtonStrategies = [
      { locator: () => page.locator('div').filter({ hasText: /CloseSaveBusiness/i }).nth(1) },
      { locator: () => page.getByRole('button', { name: /Save/i }).first() },
      { locator: () => page.locator('button[type="submit"]').nth(1) }
    ];

    // Other form fields
    this.openingBalanceInput = page.locator('#opening_balance');
    this.orgPhoneInput = page.getByRole('textbox', { name: /Organisation Phone Number/i });
    this.orgEmailInput = page.getByRole('textbox', { name: /Email Id.*Optional/i });
    this.gstStatusSelect = page.getByRole('combobox', { name: 'GST Status' });
    this.gstRegisteredOption = page.getByRole('dialog').getByTitle('Registered');
    this.gstUnregisteredOption = page.getByText('UnRegistered');

    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  async fillLoginForm(data) {
    await this.loginButton.click();
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);
    await this.showPasswordCheckbox.check();
    await this.loginButton2.click();
  }

  async switchToBusiness() {
    await this.searchBox.fill('mobile');
    await this.companyResult.click();
    await this.switchButton.click();
  }

  async navigateToCreateCustomer() {
    await this.customerTab.click();
    await this.createCustomerButton.click();
    await this.businessCustomerLink.click();
  }

  async fillCreateCustomerForm(data) {
    await this.orgNameInput.fill(data.orgName);

    // Business Type
    await this.businessTypeSelect.click();
    await this.businessTypeOption_Retailer.click();

    // Business Category
    await this.businessCategorySelect.click();
    await this.businessCategoryOption_Cosmetics.click();

    // Business Tags (healing required)
    await this.healingClick(this.businessTagSelect, this._businessTagSelectStrategies);
    await this.businessTagOption2.click();
    await this.businessTagOption1.click();

    // Close/Save modal (healing required)
    await this.healingClick(this.modalCloseSaveButton, this._modalCloseSaveButtonStrategies);

    // Opening balance
    await this.openingBalanceInput.fill(data.openingBalance);

    // Phone & Email
    await this.orgPhoneInput.fill(data.phone);
    await this.orgEmailInput.fill(data.emailOptional);

    // GST Status (handle double-click on Registered → UnRegistered)
    await this.gstStatusSelect.click();
    await this.gstUnregisteredOption.click();

    // Save
    await this.saveButton.click();
  }
}

module.exports = { Create_customer };