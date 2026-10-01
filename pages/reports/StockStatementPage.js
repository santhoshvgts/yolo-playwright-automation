'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { requireSection } = require('../../utils/flowStore');
const { expectClose } = require('../../utils/stockMath');

/**
 * Fieldforce app → Reports → Stock Statement.
 * Columns: S. No | Item Name | Units | Overall Opening Stock | Opening Stock | Purchase |
 * GRN | Material Inward | Adjustment | Transfer | Total Stock | Sales | Overall Total Sales |
 * Credit Note | Closing Stock (pcs) | Overall Closing Stock (largest UOM, e.g. "310.658 box").
 */
class StockStatementPage extends AppBasePage {

  constructor(page) {
    super(page);

    // Navigation
    // BRITTLE: reportsMenu — structural CSS on antd menu (link folds into "…" below ~1400px wide)
    this.reportsMenu = this.page.locator('[link="reports"] > .ant-menu-title-content > div > a');
    this.stockStatementMenu = this.loc('//div[text()="Stock Statement"]');

    // Report
    this.searchInput  = this.page.getByRole('textbox', { name: 'Search by Name...' });
    this.headerCells  = this.page.locator('.ant-table thead th');
    // Virtualised antd table: rows/cells are <div class="ant-table-row|ant-table-cell">, not <tr>/<td>
    this.rows         = this.page.locator('.ant-table-row');
    this.itemRow      = (itemName) => this.rows.filter({ hasText: itemName });
  }

  async _openStockStatement() {
    await this.openApp('fieldforce');
    await this.selectOrg();   // switches via /org-select when fieldforce opened in another org
    await this.reportsMenu.click();
    await this.stockStatementMenu.click();
    await expect(this.searchInput).toBeVisible();
    // Wait for the report's first data load: typing before it lands gets wiped
    // when the unfiltered result arrives (the search then shows an empty table).
    await expect(this.rows.first()).toBeVisible({ timeout: 30000 });
  }

  /** 1-based column index of a header, matched exactly (so "Closing Stock" ≠ "Overall Closing Stock"). */
  async _columnIndex(title) {
    const titles = (await this.headerCells.allInnerTexts()).map((t) => t.trim());
    const i = titles.indexOf(title);
    if (i === -1) throw new Error(`Stock Statement column "${title}" not found. Columns: ${titles.join(' | ')}`);
    return i + 1;
  }

  /**
   * TC: "Closing Stock" (pcs) for the item == saved total pcs.
   * data: { section, totalKey, tolerance?, allowZero? } e.g. { section: 'purchaseFlowData', totalKey: 'newtotalqty' }
   * allowZero: when the expected total is 0 the row may be absent (or show 0).
   */
  async verifyClosingStock(data) {
    const saved = requireSection(data.section, ['itemName']);
    const expectedTotal = Number(saved[data.totalKey] || 0);
    console.log('Opening Stock Statement...');
    await this._openStockStatement();
    // The report searches on key events — fill() sets the value without filtering
    await this.typeInto(this.searchInput, saved.itemName);

    const row = this.itemRow(saved.itemName);
    if (data.allowZero && expectedTotal === 0) {
      await this.settle(3000, 'report filter refresh');
      if ((await row.count()) === 0) {
        console.log('✅ Closing stock is 0 (row not listed)');
        return;
      }
    }

    await expect(row).toHaveCount(1);
    const col = await this._columnIndex('Closing Stock');
    const text = (await row.locator(':scope > .ant-table-cell').nth(col - 1).innerText()).trim();
    const closingStock = parseFloat((text.match(/-?\d+(?:\.\d+)?/) || ['0'])[0]);
    console.log(`Closing Stock: ${closingStock} pcs, expected: ${expectedTotal} pcs`);
    expectClose(closingStock, expectedTotal, data.tolerance ?? 0.01, 'Closing stock');
  }
}

module.exports = { StockStatementPage };
