const { expect } = require('@playwright/test');
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
    this.closeButton = this.page.getByRole('button', { name: 'Close' });
    this.profileImage = this.page.getByRole('img', { name: 'profile' });
    this.logoutLink = this.page.getByText('Log out');
 this.categoryCombobox = this.page.getByRole('combobox', { name: 'Select Category\u00a0 (Optional)' });
    this.productNameInput = this.page.getByRole('textbox', { name: 'Product Name' });
    this.productDescriptionInput = this.page.getByRole('textbox', { name: 'Product Description\u00a0 (' });
    this.saveChangesButtons = this.page.getByRole('button', { name: 'Save Changes' });
    this.editButtons = this.page.getByRole('button', { name: 'Edit' });
    this.pcsCheckbox = this.page.getByTitle('pcs');
    this.salePricePerUnitInput = this.page.getByRole('textbox', { name: 'Sale Price Per Unit' });
    this.gst18Text = this.page.getByText('GST18');
    this.gst12Text = this.page.getByText('GST12');
    this.salesTab = this.page.locator('form').getByText('Sales', { exact: true });
    this.backSaveChangesEditDiv = this.page.locator('div').filter({ hasText: 'BackSave ChangesEdit' });
    this.costOfGoodsSoldTab = this.page.locator('form').getByText('Cost of Goods Sold');
    this.inventoryAssetTab = this.page.locator('form').getByText('Inventory Asset');
    this.finishedGoodsText = this.page.getByText('Finished Goods').nth(1);
    this.switch = this.page.getByRole('switch');
    this.closeButton = this.page.getByRole('button', { name: 'Close' });
    this.nequeDiv = this.page.locator('div').filter({ hasText: /^neque$/ }).first();

    // Strategies for dynamic locators (none needed here — all locators are role/label-based and stable)
    this._categoryComboboxStrategies = [];
    this._productNameInputStrategies = [];
    this._productDescriptionInputStrategies = [];
    this._salePricePerUnitInputStrategies = [];
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


  /**
   * Row in the Items table for a given product name. Matches the name cell
   * only, so a price/HSN containing the same text cannot false-positive.
   */
  productRow(productName) {
    return this.page
      .locator('tr.ant-table-row')
      .filter({ has: this.page.locator('.Product_Name_Class', { hasText: productName }) });
  }

  /**
   * Validate the product just created is listed in the Items table.
   * Data is read back from Rundata/testData.json -> productItemCreateData,
   * written by fillAndSubmitProduct() after save.
   */
  async verifyProductInTable() {
    const saved = getSection('productItemCreateData');

    if (!saved.productName) {
      throw new Error('productItemCreateData.productName missing in Rundata/testData.json — product was never saved');
    }

    const row = this.productRow(saved.productName);
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();

    // Cells: [name, stock status, HSN, GST rate, price]
    await expect(row.locator('td').nth(2)).toHaveText('01011010');
    await expect(row.locator('td').nth(3)).toHaveText('18%');
    await expect(row.locator('td').nth(4)).toContainText(`₹${saved.salePricePerPcs}`);

    return row;
  }

  async verifyAndCloseProduct() {
    await this.itemTabs.click();
    await this.assetTab.click();
    await this.itemsTab.click();

    const row = await this.verifyProductInTable();

    await row.click();
    await this.closeButton.click();
  }

  async logout() {
    await this.profileImage.click();
    await this.logoutLink.click();
  }

 async fillProductBasicInfo(data) {
    await this.productNameInput.fill(data.productName2);
    await this.productDescriptionInput.fill(data.productDescription2);
  }

  async fillSalePrice(data) {
    await this.salePricePerUnitInput.fill(data.salePricePerUnit);
  }

  async selectTaxes() {
    await this.gst18Text.click();
    await this.gst12Text.click();
  }

  async selectAccountingTabs() {
    await this.salesTab.click();
    await this.backSaveChangesEditDiv.nth(1).click();
    await this.costOfGoodsSoldTab.click();
    await this.backSaveChangesEditDiv.nth(1).click();
   await this.inventoryAssetTab.click();
    await this.finishedGoodsText.nth(1).click();
  }

  async toggleSwitch() {
    await this.switch.click();
    await this.switch.click();
  }

  async clickSaveChanges(index = 0) {
    await this.saveChangesButtons.click();
  }

  async clickEdit(index = 0) {
    await this.editButtons.nth(index).click();
  }

  async clickClose() {
    await this.closeButton.click();
  }

  /**
   * Edit every tab of a product whose detail view is already open.
   * `createProduct()` below is the same flow, plus the click that opens it.
   */
  async editAllTabs(data) {
    // Step 2: Edit → Basic Info tab
    await this.clickEdit(0);
    await this.fillProductBasicInfo(data);
    await this.clickSaveChanges(0);

    // Step 3: Edit → Sale Price tab
    await this.clickEdit(1);
    await this.pcsCheckbox.click();
    await this.fillSalePrice(data);
    await this.clickSaveChanges(1);

    // Step 4: Edit → Tax tab
    await this.clickEdit(2);
    await this.selectTaxes();
    await this.clickSaveChanges(2);

    // Step 5: Edit → Accounting tab
    await this.clickEdit(3);
    await this.selectAccountingTabs();
    await this.clickSaveChanges(3);

    // Step 6: Toggle switch twice (likely toggling inventory tracking)
    await this.toggleSwitch();

    // Step 7: Close modal/dialog
    await this.clickClose();

    // Persist the edited values under their own key — productItemCreateData
    // holds what the create flow wrote and must stay intact.
    saveSection('productItemEditData', {
      productName: data.productName2,
      productDescription: data.productDescription2,
      salePricePerUnit: data.salePricePerUnit
    });
  }

  async createProduct(data) {
    // Step 1: Click neque div (likely triggers some UI to appear)
    await this.nequeDiv.click();
    await this.editAllTabs(data);
  }

  /**
   * Validate an edited product is listed in the Items table under its new name.
   */
  async verifyEditedProductInTable() {
    const saved = getSection('productItemEditData');

    if (!saved.productName) {
      throw new Error('productItemEditData.productName missing in Rundata/testData.json — edit was never saved');
    }

    const row = this.productRow(saved.productName);
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();

    return row;
  }


}

module.exports = { Product_item_Create };