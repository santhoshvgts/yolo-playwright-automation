'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { saveSection, requireSection, clearSection, getSection } = require('../../utils/flowStore');
const { parseStock } = require('../../utils/stockMath');

/**
 * Invoice app → Inventory → Products: product (item) creation in the Item drawer,
 * the Items table, and the item stock cell.
 * Used by both the purchase and sales flows; `data.section` names the runtime-store
 * section the flow reads/writes (e.g. 'purchaseFlowData').
 */
class ItemPage extends AppBasePage {

  constructor(page) {
    super(page);

    // The product form opens in an ant drawer — scope in-form locators to it so
    // clicks never land on the masked page behind it.
    this.productDrawer = this.page.locator('.ant-drawer-content').last();

    // Navigation
    this.inventoryLink = this.page.getByRole('link', { name: 'Inventory' });
    this.productsLink  = this.page.getByText('Products');
    this.itemButton    = this.page.getByRole('button', { name: 'Item' });
    this.inventoryTab  = this.page.locator('#tab_inventory');   // used by the stock read

    // Product drawer — basics
    this.addProductImage         = this.page.getByRole('button', { name: 'Add Product Image' });
    this.avatarInput             = this.page.locator('input[name="avatar"]');
    this.productNameField        = this.page.getByRole('textbox', { name: 'Product Name' });
    this.categoryField           = this.page.getByRole('combobox', { name: 'Select Category  (Optional)' });
    this.addDescriptionButton    = this.page.getByRole('button', { name: 'Add Description' });
    this.productDescriptionField = this.page.getByRole('textbox', { name: 'Product Description  (' });

    // HSN
    this.hsnField        = this.page.getByRole('spinbutton', { name: 'HSN Code  (Optional)' });
    this.hsnSearchButton = this.page.getByRole('button', { name: 'Search' });
    this.hsnResult       = (code) => this.page.locator('div').filter({ hasText: new RegExp(`^${code}$`) }).first();

    // Price + alternate UOMs
    this.salePriceField            = this.page.getByRole('textbox', { name: 'Sale Price Per pcs' });
    this.addAlternateUOM           = this.page.getByRole('button', { name: 'Add Alternate UOM\'s' });
    this.addUOM                    = this.page.getByRole('button', { name: 'Add UOM' });
    this.alternateUOM1             = this.page.locator('#unit_array_0_alter_unit');
    this.alternateUOM2             = this.page.locator('#unit_array_1_alter_unit');
    this.alternateQuantityField1   = this.page.getByRole('textbox', { name: 'Quantity' });
    this.alternateQuantityField2   = this.page.locator('#unit_array_1_quantity');
    this.alternateSalesPriceField1 = this.page.getByRole('textbox', { name: 'Sales Price' });
    this.uomOption                 = (unit) => this.page.getByText(unit, { exact: true });

    // Tax
    this.taxPreferenceField = this.page.getByRole('combobox', { name: 'Tax Preference' });
    this.taxableOption      = this.page.getByText('Taxable', { exact: true });
    this.gstRateField       = this.page.getByRole('combobox', { name: 'Gst Rate' });
    this.gstOption          = (rate) => this.page.getByText(rate);
    this.salesTabInModal    = this.page.getByRole('dialog').getByText('Sales', { exact: true });

    // Save
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true });

    // Items table
    this.itemTabs    = this.page.getByText('ItemsAssetServiceCategory');
    this.assetTab    = this.page.getByRole('tab', { name: 'Asset' });
    this.itemsTab    = this.page.getByRole('tab', { name: 'Items' });
    this.closeButton = this.page.getByRole('button', { name: 'Close' });

    // Inventory list (stock read)
    this.searchInput = this.page.locator('input[placeholder="Search"]');
    // BRITTLE: first row's 2nd cell (stock status) by position
    this.firstRowStock = this.loc('(//td[@class="ant-table-cell"])[2]');
  }

  async _openInvoiceApp() {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(2000, 'org switch reloads data');
  }

  /**
   * TC: create an item (product) with image, description, HSN, sale price,
   * alternate UOMs box + bundle and GST18; verify it is listed in the Items table.
   * Saves itemName + conversions to `data.section` for the stock flows, and the
   * product fields to `flowItemCreateData`.
   */
  async createItemWithOpeningStock(data) {
    console.log('Opening Inventory → Products → Item...');
    await this._openInvoiceApp();
    await this.inventoryLink.click();
    await this.productsLink.click();
    await this.itemButton.click();

    console.log('Uploading image + basics...');
    await this.addProductImage.click();
    await this.avatarInput.setInputFiles(data.fieldFile);
    await this.productNameField.fill(data.productName);

    // Category: scope the search box to the open drawer — an unscoped `.first()`
    // matches a select on the page behind the drawer, where ant's mask eats the click.
    await this.clickSelect(this.categoryField);
    await this.productDrawer.locator('.ant-select-selection-search').first().click();

    console.log('Description + HSN...');
    await this.addDescriptionButton.click();
    await this.productDescriptionField.fill(data.productDescription);
    await this.hsnField.click();
    await this.hsnSearchButton.click();
    await this.hsnResult(data.hsnCode).click();

    console.log('Sale price + alternate UOMs...');
    await this.salePriceField.fill(data.salePricePerPcs);
    await this.addAlternateUOM.click();
    await this.settle(1000, 'alternate UOM row appears');
    await this.alternateUOM1.fill(data.altUnit1);
    await this.uomOption(data.altUnit1).click();
    await this.alternateQuantityField1.fill(data.quantity);
    await this.alternateSalesPriceField1.fill(data.salePricePerPcs);
    const boxconversion = await this.readNumber(this.alternateQuantityField1);

    await this.addUOM.click();
    await this.settle(1000, 'second alternate UOM row appears');
    await this.alternateUOM2.fill(data.altUnit2);
    await this.uomOption(data.altUnit2).click();
    await this.alternateQuantityField2.fill(data.quantity);
    const bundleconversion = await this.readNumber(this.alternateQuantityField2);
    console.log(`Box conversion: ${boxconversion}, Bundle conversion: ${bundleconversion}`);

    console.log('Tax...');
    await this.clickSelect(this.taxPreferenceField);
    await this.taxableOption.click();
    await this.clickSelect(this.gstRateField);
    await this.gstOption(data.gstRate).click();
    await this.salesTabInModal.click();

    console.log('Saving product...');
    await this.saveButton.click();

    saveSection('flowItemCreateData', {
      productName: data.productName,
      productDescription: data.productDescription,
      salePricePerPcs: data.salePricePerPcs,
    });

    await this.verifyAndCloseProduct(data);
    console.log(`Item created: ${data.productName}`);

    // A new item starts a new flow: drop the previous run's values, then save
    clearSection(data.section);
    saveSection(data.section, { itemName: data.productName, boxconversion, bundleconversion });
    return { itemName: data.productName, boxconversion, bundleconversion };
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

  /** Validate the product just created is listed in the Items table (reads flowItemCreateData). */
  async verifyProductInTable(data = {}) {
    const saved = getSection('flowItemCreateData');
    if (!saved.productName) {
      throw new Error('flowItemCreateData.productName missing in Rundata/testData.json — product was never saved');
    }

    const row = this.productRow(saved.productName);
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();

    // Cells: [name, stock status, HSN, GST rate, price]
    await expect(row.locator('td').nth(2)).toHaveText(data.hsnCode || '01011010');
    await expect(row.locator('td').nth(3)).toHaveText(data.gstPercent || '18%');
    await expect(row.locator('td').nth(4)).toContainText(`₹${saved.salePricePerPcs}`);
    return row;
  }

  async verifyAndCloseProduct(data) {
    await this.itemTabs.click();
    await this.assetTab.click();
    await this.itemsTab.click();

    const row = await this.verifyProductInTable(data);
    await row.click();
    await this.closeButton.click();
  }

  /**
   * Read the stock cell for an item on the Inventory list (must already be on the invoice app).
   * Returns { box, bundle, pcs, total, outOfStock } in pieces.
   */
  async readItemStock(itemName, boxconversion, bundleconversion) {
    await this.inventoryTab.click();
    await this.fillInto(this.searchInput, itemName);
    await this.settle(3000, 'search results refresh');
    const text = await this.readText(this.firstRowStock, 10000);
    const stock = parseStock(text, boxconversion, bundleconversion);
    console.log(`Stock "${text}" → box ${stock.box}, bundle ${stock.bundle}, pcs ${stock.pcs}, total ${stock.total}`);
    return stock;
  }

  /** Open the invoice app and read the current stock of the flow's item. */
  async openAndReadItemStock(data) {
    const saved = requireSection(data.section, ['itemName', 'boxconversion', 'bundleconversion']);
    await this._openInvoiceApp();
    return this.readItemStock(saved.itemName, saved.boxconversion, saved.bundleconversion);
  }
}

module.exports = { ItemPage };
