'use strict';

const { expect } = require('@playwright/test');
const { SalesInvoicePaymentPage } = require('./SalesInvoicePaymentPage');
const { money } = require('../../utils/stockMath');

const amount = (t) => (/^\s*-?\s*$/.test(String(t)) ? 0 : money(t));

/**
 * Invoice app → Sales → Customer → <customer>: header balances (Due / Advance / Closing Balance /
 * Pending Cheque), Transaction Statement, Sales Invoice and Payment Report tabs, View Details.
 * Builds on SalesInvoicePaymentPage (invoices, payments, receipts).
 */
class CustomerTransactionPage extends SalesInvoicePaymentPage {

  constructor(page) {
    super(page);
    this.customerTab = this.loc('//span[text()="Customer"]');
    this.customerLink = (name) => this.loc(`//div[text()="${name}"]`);
    this.viewDetailsBtn = this.page.getByRole('button', { name: 'View Details' });
    this.customerTabButton = (name) => this.page.getByRole('tab', { name, exact: true });
    this.visibleRows = this.page.locator('table tbody tr.ant-table-row').filter({ visible: true });
    this.visibleHead = this.page.locator('table thead th').filter({ visible: true });
  }

  /** Sales → Customer → <name>, waiting for its balances to load. */
  async openCustomer(name) {
    await this.salesTab.click();
    await this.customerTab.click();
    await this.settle(1500, 'customer list loads');
    // The balances API is not re-requested when the app already has this customer loaded — don't insist on it
    const info = this.page.waitForResponse((r) => r.url().includes('/client/client-info/') && r.ok(), { timeout: 15_000 }).catch(() => null);
    await this.customerLink(name).first().click();
    await info;
    await expect(this.viewDetailsBtn).toBeVisible();
    await this.settle(2500, 'customer page renders');
  }

  /** { due, advance, closing, pendingCheque } from the customer header. */
  async readHeader() {
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const grab = (label) => {
      const m = text.match(new RegExp(`${label}:\\s*₹\\s*(-?[\\d,]+(?:\\.\\d+)?)`));
      return m ? money(m[1]) : NaN;
    };
    return { due: grab('Due'), advance: grab('Advance'), closing: grab('Closing Balance'), pendingCheque: grab('Pending Cheque') };
  }

  async openCustomerTab(name) {
    await this.customerTabButton(name).click();
    await this.settle(2500, `${name} tab loads`);
  }

  /** Open customer tab `tab` and click the row holding `no` (pages forward from page 1). */
  async clickTabRow(tab, no) {
    await this.openCustomerTab(tab);
    const first = this.page.locator('li.ant-pagination-item-1').filter({ visible: true }).first();
    if (await first.count()) { await first.click(); await this.settle(1200, 'first page'); }
    for (let i = 0; i < 200; i++) {
      const row = this.visibleRows.filter({ hasText: no }).first();
      if (await row.count()) { await row.click(); await this.settle(1500, 'row opens'); return; }
      const next = this.page.locator('li.ant-pagination-next').filter({ visible: true }).first();
      if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true') break;
      await next.click();
      await this.settle(1500, 'next page');
    }
    throw new Error(`${no} not found on the customer's ${tab} tab`);
  }

  /** Every row of the visible table, all pages: arrays of cell texts. */
  async _readAllVisibleRows() {
    const rows = [];
    for (let i = 0; i < 200; i++) {
      rows.push(...(await this.visibleRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())))));
      const next = this.page.locator('li.ant-pagination-next').filter({ visible: true }).first();
      if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true' || (await next.getAttribute('class')).includes('disabled')) break;
      await next.click();
      await this.settle(1500, 'next page');
    }
    return rows;
  }

  /** Transaction Statement rows: [{ date, no, detail, amount, payment, balance }]. */
  async readStatement() {
    await this.openCustomerTab('Transaction Statement');
    return (await this._readAllVisibleRows()).map((c) => ({
      date: c[0], no: c[1], detail: c[2], amount: amount(c[3]), payment: amount(c[4]), balance: amount(c[5]),
    }));
  }

  /** Customer's Sales Invoice tab: [{ date, billNo, status, bill, due }]. */
  async readCustomerInvoices() {
    await this.openCustomerTab('Sales Invoice');
    return (await this._readAllVisibleRows()).map((c) => ({ date: c[0], billNo: c[1], status: c[2], bill: money(c[3]), due: money(c[4]) }));
  }

  /** Customer's Payment Report tab: [{ date, receiptNo, mode, received, excess }]. */
  async readPaymentReport() {
    await this.openCustomerTab('Payment Report');
    return (await this._readAllVisibleRows()).map((c) => ({ date: c[0], receiptNo: c[1], mode: c[2], received: money(c[3]), excess: money(c[4]) }));
  }

  /** Click a Transaction No in the statement (any page) — opens its preview. */
  async openFromStatement(no) {
    await this.openCustomerTab('Transaction Statement');
    for (let i = 0; i < 200; i++) {
      const row = this.visibleRows.filter({ has: this.page.locator('td', { hasText: new RegExp(`^${no.replace(/[/]/g, '\\/')}$`) }) });
      if (await row.count()) {
        await row.first().locator('td').nth(1).locator('div').last().click();
        await this.settle(2500, 'preview opens');
        return;
      }
      const next = this.page.locator('li.ant-pagination-next').filter({ visible: true }).first();
      if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true') break;
      await next.click();
      await this.settle(1500, 'next page');
    }
    throw new Error(`${no} not found in the Transaction Statement`);
  }
}

/** 'D Month, YYYY' with a 2-digit day (statement Date column, e.g. "05 October, 2026"). */
function statementDate(d) {
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  return `${String(d.getDate()).padStart(2, '0')} ${month}, ${d.getFullYear()}`;
}

module.exports = { CustomerTransactionPage, statementDate };
