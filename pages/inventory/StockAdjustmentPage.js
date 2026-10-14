'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { requireSection } = require('../../utils/flowStore');
const { expectClose } = require('../../utils/stockMath');

/**
 * Invoice app → Inventory → Stock → Stock Adjustment → "Adjustment" (new).
 * (Moved here from the old standalone inventory app.)
 * Picking an item fills its row with UOM (base unit, plain text) and
 * "Current Qty" = available stock in base pieces. Nothing is saved.
 */
class StockAdjustmentPage extends AppBasePage {

  constructor(page) {
    super(page);

    // Navigation
    this.inventoryLink      = this.page.getByRole('link', { name: 'Inventory' });
    this.stockSubTab        = this.page.locator('div').filter({ hasText: /^Stock$/ }).first();
    this.stockAdjustmentTab = this.page.getByRole('tab', { name: 'Stock Adjustment' });
    this.newAdjustmentBtn   = this.page.getByRole('button', { name: 'Adjustment', exact: true });

    // Form header
    this.warehouseDropdown = this.page.locator('#warehouse');
    this.reasonDropdown    = this.page.locator('#reason');
    this.billDateInput     = this.page.getByRole('textbox', { name: 'Bill Date' });
    // Option in the dropdown that is open now (closed antd dropdowns stay in the DOM)
    this.openOption        = (title) => this.page.locator(`.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option[title="${title}"]`);

    // Item grid
    // Only the empty row still shows the placeholder — .last() is the one to type into
    this.itemSearchInput = this.page.locator('.ant-select').filter({ hasText: 'Search item by entering' }).locator('input').last();
    this.addItemLink     = this.page.getByText('Add Item', { exact: true });
    this.itemOption      = (name) => this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: name }).first();
    this.itemRow         = (name) => this.page.locator('tr.editable-row').filter({ hasText: name });
    // Row inputs are keyed by a generated row id: currentQty<rowKey> / adjustment<rowKey> / updatedQty<rowKey>
    this.currentQty      = (name) => this.itemRow(name).locator('input[id^="currentQty"]');
    this.adjustmentQty   = (name) => this.itemRow(name).locator('input[id^="adjustment"]');
    this.updatedQty      = (name) => this.itemRow(name).locator('input[id^="updatedQty"]');

    this.saveBtn = this.page.getByRole('button', { name: 'Save', exact: true });
    this.toast   = this.page.locator('.ant-message');
  }

  /** reopen: false when the caller is already inside the invoice app (skips a fresh login round-trip). */
  async _openNewAdjustment(reason = 'Damaged goods', { reopen = true } = {}) {
    if (reopen) {
      await this.openApp('invoice');
      await this.selectOrg();
    }
    console.log('Opening Inventory → Stock → New Stock Adjustment...');
    // A late landing redirect (→ Sales) can land right after the Inventory click; click again until Stock shows.
    await expect(async () => {
      await this.inventoryLink.click();
      await expect(this.stockSubTab).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 45_000 });
    await this.stockSubTab.click();
    await this.stockAdjustmentTab.click();
    await this.newAdjustmentBtn.click();
    await expect(this.page).toHaveURL(/\/create\/stock-adjustment/);
    await this.clickSelect(this.warehouseDropdown);
    await this.openOption('Default').click();
    await this.clickSelect(this.reasonDropdown);
    await this.openOption(reason).click();
  }

  /**
   * Save a stock adjustment that changes each item's stock by `qty` base units
   * (positive adds, negative removes). Used to give a test item an exact opening stock.
   * entries: [{ itemName, qty }]; opts.billDate e.g. 'December 1, 2025' (default: today).
   */
  async adjustStock(entries, { billDate, reason = 'Stock Adjustment', reopen = true } = {}) {
    await this._openNewAdjustment(reason, { reopen });
    if (billDate) {
      await this.billDateInput.click();
      await this.billDateInput.press('Control+A');
      await this.page.keyboard.type(billDate);
      await this.page.keyboard.press('Enter');
    }
    for (const [i, { itemName, qty }] of entries.entries()) {
      if (i > 0) await this.addItemLink.click();
      await this.typeInto(this.itemSearchInput, itemName);
      await this.itemOption(itemName).click();
      await expect(this.currentQty(itemName)).not.toHaveValue('');
      const current = parseFloat(await this.currentQty(itemName).inputValue());
      await this.fillInto(this.adjustmentQty(itemName), qty);
      await expect(this.updatedQty(itemName)).not.toHaveValue(String(current));
      console.log(`Stock adjustment: ${itemName} ${current} ${Number(qty) >= 0 ? '+' : ''}${qty}`);
    }
    await this.saveBtn.click();
    await expect(this.toast.filter({ hasText: 'Adjustment Created Successfully' })).toBeVisible();
  }

  /** Returns the item's available stock in base pieces ("Current Qty"). */
  async readCurrentQty(itemName) {
    await this._openNewAdjustment();
    await this.typeInto(this.itemSearchInput, itemName);
    await this.itemOption(itemName).click();
    await expect(this.currentQty(itemName)).not.toHaveValue('');
    const qty = parseFloat(await this.currentQty(itemName).inputValue());
    console.log(`Stock Adjustment Current Qty: ${qty} pcs`);
    return qty;
  }

  /** TC: Stock Adjustment "Current Qty" (pcs) == saved total pcs. data: { section, totalKey, tolerance? } */
  async verifyAdjustmentQuantities(data) {
    const saved = requireSection(data.section, ['itemName']);
    const expected = Number(saved[data.totalKey] || 0);
    const qty = await this.readCurrentQty(saved.itemName);
    console.log(`Adjustment total: ${qty}, expected: ${expected}`);
    expectClose(qty, expected, data.tolerance ?? 0.01, 'Stock adjustment current qty');
  }
}

module.exports = { StockAdjustmentPage };
