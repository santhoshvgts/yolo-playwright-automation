'use strict';

const { AppBasePage } = require('../base/app-base-page');
const { requireSection } = require('../../utils/flowStore');
const { expectClose } = require('../../utils/stockMath');
const { masterData } = require('../../test-data/UserData');

/**
 * Invoice app → Sales → New Sales Invoice: typing an over-large quantity shows
 * "<n> pcs left" — the available stock in pieces. Nothing is saved.
 */
class SalesStockAlertPage extends AppBasePage {

  constructor(page) {
    super(page);

    this.salesTab          = this.page.locator('#tab_sales');
    this.newSalesInvoiceBtn = this.page.locator('#btn_new_sales_invoice > span');
    this.customerSelect    = this.page.locator('#si_select_cus');
    this.customerOption    = (name) => this.loc(`//div[text()='${name}']`);
    this.customerNextBtn   = this.page.locator('#si_select_cus_next');
    // The empty "Add item…" auto-complete row (no hashed antd class — it changes per build)
    this.itemSelect = this.page.locator('.ant-select-auto-complete').last();
    // First option of the dropdown that is open now (closed dropdowns stay in the DOM)
    this.firstItemOption = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content').first();
    this.quantityInput   = this.page.locator('#quantity1');
    this.pcsLeftText     = this.loc("//div[contains(text(), 'pcs left')]");
  }

  /** Returns the "pcs left" number shown for the item. */
  async readPcsLeft(itemName, customerName = masterData.customerName) {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(6000, 'org switch reloads data');
    console.log('Opening new Sales Invoice...');
    await this.salesTab.click();
    await this.newSalesInvoiceBtn.click();
    await this.typeInto(this.customerSelect, customerName);
    await this.customerOption(customerName).click();
    await this.customerNextBtn.click();

    console.log('Entering over-large quantity to trigger the stock alert...');
    await this.typeInto(this.itemSelect, itemName);
    await this.settle(2000, 'item search results');
    await this.firstItemOption.click();
    await this.typeInto(this.quantityInput, '100000000000');
    await this.settle(2000, 'stock alert render');
    const text = await this.readText(this.pcsLeftText);
    const pcsLeft = parseFloat(text.match(/(\d+(?:\.\d+)?)\s*pcs\s*left/i)[1]);
    console.log(`Alert pcs left: ${pcsLeft}`);
    return pcsLeft;
  }

  /** TC: "pcs left" alert == saved total. data: { section, totalKey } */
  async verifyStockAlert(data) {
    const saved = requireSection(data.section, ['itemName']);
    const pcsLeft = await this.readPcsLeft(saved.itemName);
    expectClose(pcsLeft, Number(saved[data.totalKey] || 0), data.tolerance ?? 0.01, 'Sales stock alert');
  }
}

module.exports = { SalesStockAlertPage };
