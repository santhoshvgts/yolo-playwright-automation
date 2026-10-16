'use strict';

const { expect } = require('@playwright/test');
const { CustomerPage } = require('../sales/CustomerPage');
const { PaymentMadePage } = require('./PaymentMadePage');
const { money } = require('../../utils/stockMath');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const amount = (t) => (/^\s*-?\s*$/.test(t || '') ? 0 : money(t));

/**
 * Purchase → Vendor (`/purchase/vendor/<id>`). Left: vendor list (name + city, "Search"), "Vendor" button
 * → popover "Business Vendor" / "Individual Vendor" → the SAME form as the customer form (#name,
 * #business_type, #business_category, #business_tags, #opening_balance_type, #opening_balance, #phone,
 * #email, #registration_type, #gst_num, Add Address, Close / Save). Right: header Due / Advance (blue,
 * clickable) / Closing Balance, "Create" (Invoice | Payment), "View Details" (`…/vendor/<id>/info`, same
 * per-field Edit page as the customer details), tabs Transaction Statement (Date, Transaction Detail, Amount,
 * Payment, Balance Due), Purchase Invoice (Date, Bill No, Status, Bill Amount, Due Amount; Start / End date;
 * footer "Total Count: N ₹ bill ₹ due"), Payment Made (Date, Bill No, Mode of Payment, Amount; footer total).
 * Bills / payments are made through PaymentMadePage (`this.bills`).
 */
class VendorPage extends CustomerPage {

  constructor(page) {
    super(page);
    this.bills = new PaymentMadePage(page);
    this.purchaseTab = this.loc('//a[text()="Purchase"]');
    this.vendorTab = this.page.locator('//div[text()="Vendor"]').first();
    this.newVendorBtn = this.page.getByRole('button', { name: 'Vendor', exact: true });
    this.businessVendorOption = this.page.getByText('Business Vendor', { exact: true });
    this.vendorLink = (name) => this.page.locator(`//div[text()="${name}"]`).first();
    this.createBtn = this.page.getByRole('button', { name: /Create/ }).filter({ hasNot: this.page.locator('a') }).last();
    this.createItem = (name) => this.page.locator('.ant-dropdown:not(.ant-dropdown-hidden) li, .ant-dropdown-menu-item').filter({ visible: true }).filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first();
    this.advanceLink = this.page.locator('[data-adv="1"]');
  }

  async _vendorList() {
    await this.purchaseTab.click();
    await this.vendorTab.click();
    await this.settle(2000, 'vendor list');
  }

  /** Purchase → Vendor → "Vendor" → Business Vendor (form open). */
  async openNewVendor() {
    await this._vendorList();
    await this.newVendorBtn.click();
    await this.businessVendorOption.click();
    await expect(this.nameInput).toBeVisible();
    await this.settle(800, 'vendor form');
  }

  async openNewCustomer() { return this.openNewVendor(); }

  async saveCustomer() {
    await this.customerSaveBtn.click();
    await expect(this.toast.filter({ hasText: /created successfully/i }).first(), 'vendor created').toBeVisible({ timeout: 15_000 });
    await this.settle(2000, 'vendor saved');
  }

  async createVendor(v) { return this.createCustomer(v); }

  /** Vendor names in the list matching `text`. */
  async searchVendors(text) {
    await this._vendorList();
    await this.customerSearch.fill(text);
    await this.settle(2500, 'vendor search');
    return this.page.locator('div').filter({ hasText: new RegExp(`^${escapeRegex(text.trim())}`, 'i') })
      .evaluateAll((es) => [...new Set(es.filter((e) => !e.children.length).map((e) => e.innerText.trim()))]);
  }

  async searchCustomers(text) { return this.searchVendors(text); }

  /** Purchase → Vendor → search → click the vendor; waits for the header. */
  async openVendor(name) {
    await this._vendorList();
    await this.customerSearch.fill(name);
    await this.settle(2000, 'vendor search');
    await this.vendorLink(name).click();
    await expect(this.viewDetailsBtn).toBeVisible();
    await this.settle(3000, 'vendor page renders');
  }

  async openCustomer(name) { return this.openVendor(name); }

  async openDetails(name) {
    await this.openVendor(name);
    await this.viewDetailsBtn.click();
    await expect(this.page).toHaveURL(/vendor\/\d+\/(org-)?info/);
    await this.settle(2500, 'vendor details');
  }

  /** Header + tab state of the open vendor: { due, advance, closing }. */
  async vendorState(name) {
    if (name) await this.openVendor(name);
    return this.readHeader();
  }

  /** Transaction Statement (all pages): [{ date, detail, amount, payment, balance }]. */
  async readVendorStatement() {
    await this.openCustomerTab('Transaction Statement');
    return (await this._readAllVisibleRows()).map((c) => ({ date: c[0], detail: c[1], amount: amount(c[2]), payment: amount(c[3]), balance: amount(c[4]) }));
  }

  /** Purchase Invoice tab (all pages): [{ date, billNo, status, bill, due }]. */
  async readVendorInvoices() {
    await this.openCustomerTab('Purchase Invoice');
    return (await this._readAllVisibleRows()).map((c) => ({ date: c[0], billNo: c[1], status: c[2], bill: money(c[3]), due: money(c[4]) }));
  }

  /** Payment Made tab (all pages): [{ date, no, mode, amount }]. */
  async readVendorPayments() {
    await this.openCustomerTab('Payment Made');
    return (await this._readAllVisibleRows()).map((c) => ({ date: c[0], no: c[1], mode: c[2], amount: money(c[3]) }));
  }

  /** Footer of the visible tab: { count, amounts: [..] } ("Total Count: 94 ₹ 2,36,69,692.49 ₹ …"). */
  async tabFooter() {
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const m = text.match(/Total Count:\s*(\d+)((?:\s*₹\s*-?[\d,]+(?:\.\d+)?)*)/);
    if (!m) return { count: NaN, amounts: [] };
    return { count: parseInt(m[1], 10), amounts: (m[2].match(/-?[\d,]+(?:\.\d+)?/g) || []).map(money) };
  }

  /** Create → Invoice | Payment from the vendor page. */
  async createFromVendor(kind) {
    await this.createBtn.click();
    await this.createItem(kind).click({ force: true });
    await this.settle(3000, `${kind} form opens`);
  }

  /** Mark the clickable (blue) advance amount in the header so it can be clicked. */
  async _markAdvance() {
    await this.page.locator('div').filter({ hasText: /^₹\s*[\d,.]+$/ }).filter({ visible: true })
      .evaluateAll((es) => {
        const e = es.find((x) => getComputedStyle(x).cursor === 'pointer' && getComputedStyle(x).color === 'rgb(16, 75, 252)');
        if (e) e.setAttribute('data-adv', '1');
      });
    return (await this.advanceLink.count()) > 0;
  }

  /** Statement date / tab date filter on the visible tab. */
  async setTabDateRange(start, end) {
    const s = this.page.getByPlaceholder('Start date').filter({ visible: true }).first();
    const e = this.page.getByPlaceholder('End date').filter({ visible: true }).first();
    await s.click();
    await s.press('Control+A');
    await this.page.keyboard.type(start);
    await this.page.keyboard.press('Enter');
    await e.click();
    await e.press('Control+A');
    await this.page.keyboard.type(end);
    await this.page.keyboard.press('Enter');
    await this.settle(2500, 'tab filtered');
  }
}

module.exports = { VendorPage };
