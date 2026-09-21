const { SelfHealingBasePage } = require('./self-healing-base-page');
const { saveSection, getSection } = require('../utils/runtimeDataStore');

class Product_item_Create extends SelfHealingBasePage {
  constructor(page) {
    super(page);

    // Login locators (stable role-based)
    this.loginButton = this.page.getByRole('button', { name: 'Log In' });
    this.emailField = this.page.getByRole('textbox', { name: 'Email Id' });
    this.passwordField = this.page.getByRole('textbox', { name: 'Password' });
    this.showPasswordCheckbox = this.page.getByRole('checkbox', { name: 'Show Password' });
    this.loginButtonFinal = this.page.getByRole('button', { name: 'Log in' });
    this.orgHeading = this.page.getByRole('heading', { name: 'Select an organisation' });
    this.orgSearchField = this.page.getByRole('textbox', { name: 'Search by name or GST…' });
    this.orgResult = this.page.getByRole('button', { name: 'Automation Testing Org PVT' });
    this.switchButton = this.page.getByRole('button', { name: 'Switch' });

    // Inventory/Product locators
    this.inventoryLink = this.page.getByRole('link', { name: 'Inventory' });
    this.productsLink = this.page.getByText('Products');
    this.itemButton = this.page.getByRole('button', { name: 'Item' });
    this.addProductImage = this.page.getByRole('button', { name: 'Add Product Image' });
    this.closeSaveModal = this.page.locator('div').filter({ hasText: 'CloseSaveAdd New ProductBasic' }).nth(1);
    this.avatarInput = this.page.locator('input[name="avatar"]');
    this.productNameField = this.page.getByRole('textbox', { name: 'Product Name' });
    this.categoryField = this.page.getByRole('combobox', { name: 'Select Category  (Optional)' });
    this.categorySearch = this.page.locator('.ant-select-selection-search').first();
    this.addDescriptionButton = this.page.getByRole('button', { name: 'Add Description' });
    this.productDescriptionField = this.page.getByRole('textbox', { name: 'Product Description  (' });
    this.hsnField = this.page.getByRole('spinbutton', { name: 'HSN Code  (Optional)' });
    this.hsnSearchButton = this.page.getByRole('button', { name: 'Search' });
    this.hsnResult = this.page.locator('div').filter({ hasText: /^01011010$/ }).first();
    this.salePriceField = this.page.getByRole('textbox', { name: 'Sale Price Per pcs' });
    this.taxPreferenceField = this.page.getByRole('combobox', { name: 'Tax Preference' });
    this.taxableOption = this.page.getByText('Taxable', { exact: true });
    this.gstRateField = this.page.getByRole('combobox', { name: 'Gst Rate' });
    this.gst18Option = this.page.getByText('GST18');
    this.salesTabInModal = this.page.getByRole('dialog').getByText('Sales', { exact: true });
    this.gstDropdownOption = this.page.locator('.ant-select-dropdown.css-mncuj7.ant-select-dropdown-placement-topLeft > div > .rc-virtual-list > .rc-virtual-list-holder > div > .rc-virtual-list-holder-inner > .ant-select-item.ant-select-item-option.ant-select-item-option-active > .ant-select-item-option-content');
    this.saveButton = this.page.getByRole('button', { name: 'Save' });
    this.itemTabs = this.page.getByText('ItemsAssetServiceCategory');
    this.assetTab = this.page.getByRole('tab', { name: 'Asset' });
    this.itemsTab = this.page.getByRole('tab', { name: 'Items' });
    this.productNameResult = this.page.getByText('Sonyu');
    this.closeButton = this.page.getByRole('button', { name: 'Close' });
    this.profileImage = this.page.getByRole('img', { name: 'profile' });
    this.logoutLink = this.page.getByText('Log out');

    // Dynamic locators for category/GST dropdowns (fallback strategies)
    this._categoryStrategies = [
      { locator: () => this.categoryField },
      { locator: () => this.page.getByRole('combobox', { name: 'Select Category  (Optional)' }) },
      { locator: () => this.page.locator('input[placeholder="Select Category"]') },
      { locator: () => this.page.locator('.ant-select').first() }
    ];

    this._gstRateStrategies = [
      { locator: () => this.gstRateField },
      { locator: () => this.page.getByRole('combobox', { name: 'Gst Rate' }) },
      { locator: () => this.page.locator('input[placeholder="Select GST Rate"]') },
      { locator: () => this.page.locator('.ant-select').nth(2) }
    ];
  }

  async fillAndSubmitProduct(data) {
    // Navigate to product creation
    await this.inventoryLink.click();
    await this.productsLink.click();
    await this.itemButton.click();

    // Upload image
    await this.addProductImage.click();
 
    await this.avatarInput.setInputFiles(data.fieldFile);

    // Fill product details
    await this.productNameField.fill(data.productName);

    // Category (use healing wrapper for dynamic dropdown)
    await this.healingClick(this.categoryField, this._categoryStrategies);
    await this.page.locator('.ant-select-selection-search').first().click();

    // Description
    await this.addDescriptionButton.click();
    await this.productDescriptionField.fill(data.productDescription);

    // HSN Code
    await this.hsnField.click();
    await this.hsnSearchButton.click();
    await this.hsnResult.click();

    // Sale Price
    await this.salePriceField.fill(data.salePricePerPcs);

    // Tax Preference
    await this.healingClick(this.taxPreferenceField, [
      { locator: () => this.taxPreferenceField },
      { locator: () => this.page.getByRole('combobox', { name: 'Tax Preference' }) }
    ]);
    await this.taxableOption.click();

    // GST Rate (healing wrapper)
    await this.healingClick(this.gstRateField, this._gstRateStrategies);
    await this.gst18Option.click();

    // Sales tab in modal (dropdown)
    await this.salesTabInModal.click();
 

    // Save product
    await this.saveButton.click();

    // Capture created record ID/reference if needed (none visible in recording, skip)
    saveSection('productItemCreateData', {
      productName: data.productName,
      productDescription: data.productDescription,
      salePricePerPcs: data.salePricePerPcs
    });
  }

  async verifyAndCloseProduct() {
    await this.itemTabs.click();
    await this.assetTab.click();
    await this.itemsTab.click();


    
    await this.productNameResult.click();
    await this.closeButton.click();
  }

  async logout() {
    await this.profileImage.click();
    await this.logoutLink.click();
  }
}

module.exports = { Product_item_Create };