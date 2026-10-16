'use strict';

const { expect } = require('@playwright/test');
const { SalesInvoicePaymentPage } = require('../sales/SalesInvoicePaymentPage');
const { money } = require('../../utils/stockMath');

const OPEN_MENU = '.ant-dropdown:not(.ant-dropdown-hidden)';

/**
 * Finance → Cheque Tracker (`/finance/cheque-tracker`). Tabs "Cheque In Hand (N)", "Deposited (N)", "Cleared (N)",
 * "Cancelled (N)", "Returned (N)". Columns: [checkbox], Cheque Number, Cheque Date, Amount, Customer Name,
 * Receipt ID, Receipt Date, (Deposited Date), Sales Person, (Cleared / Cancelled / "Retruned" Date, Late Fee Charge,
 * Paid Amount), Remarks, (Collect Amount), Action. Toolbar: Search, Start / End date (#date_filter_cheque_tracker),
 * Export, "Move to" (In Hand: Deposited / Cleared / Cancelled / Returned) — Cleared tab has "Revert" instead.
 * Row ⋮: Upload Attachment, Move To. Cheques come from a Cheque payment on an invoice (Record Payment drawer).
 */
class ChequeTrackerPage extends SalesInvoicePaymentPage {

  constructor(page) {
    super(page);
    this.ctSearch = this.page.getByPlaceholder('Search').filter({ visible: true }).first();
    this.ctRows = this.page.locator('table tbody tr.ant-table-row').filter({ visible: true });
    this.moveToBtn = this.page.getByRole('button', { name: /Move to/i }).filter({ visible: true }).first();
    this.revertBtn = this.page.getByRole('button', { name: 'Revert' }).filter({ visible: true }).first();
    this.exportBtn = this.page.getByRole('button', { name: 'Export' }).filter({ visible: true }).first();
    this.ctTab = (tab) => this.page.getByRole('tab', { name: new RegExp(`^${tab}`) });
    this.ctToast = this.page.locator('.ant-message, .ant-notification').filter({ visible: true });
  }

  base() { return this.page.url().replace(/(\.xyz\/[0-9a-f]+).*/, '$1'); }

  async backToApp() {
    await this.page.goto(this.base());
    await this.settle(3000, 'app shell');
  }

  async openTracker(tab = 'Cheque In Hand') {
    await this.page.goto(`${this.base()}/finance/cheque-tracker`);
    await expect(this.ctTab('Cheque In Hand')).toBeVisible();
    await this.settle(2000, 'cheque tracker');
    if (tab !== 'Cheque In Hand') { await this.ctTab(tab).click(); await this.settle(2500, `${tab} tab`); }
  }

  async tabCount(tab) {
    return parseInt(((await this.ctTab(tab).innerText()).match(/\((\d+)\)/) || [0, 'NaN'])[1], 10);
  }

  async counts() {
    const out = {};
    for (const t of ['Cheque In Hand', 'Deposited', 'Cleared', 'Cancelled', 'Returned']) out[t] = await this.tabCount(t);
    return out;
  }

  /** Rows of the current tab as objects keyed by the column headers. */
  async readCtRows() {
    const heads = (await this.page.locator('table thead th').filter({ visible: true }).allInnerTexts()).map((h) => h.trim());
    const rows = await this.ctRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
    return rows.map((c) => Object.fromEntries(heads.map((h, i) => [h || `#${i}`, c[i]])));
  }

  async searchCt(text) {
    await this.fillInto(this.ctSearch, text);
    await this.settle(2500, 'cheque search');
    return this.readCtRows();
  }

  /** The row of `chequeNo` on `tab` (null when absent). */
  async chequeRow(chequeNo, tab = 'Cheque In Hand') {
    await this.openTracker(tab);
    const rows = await this.searchCt(chequeNo);
    return rows.find((r) => r['Cheque Number'] === String(chequeNo)) || null;
  }

  /** Which tab holds the cheque now. */
  async tabOf(chequeNo) {
    for (const t of ['Cheque In Hand', 'Deposited', 'Cleared', 'Cancelled', 'Returned']) if (await this.chequeRow(chequeNo, t)) return t;
    return null;
  }

  rowLoc(chequeNo) {
    return this.ctRows.filter({ has: this.page.locator('td', { hasText: new RegExp(`^${chequeNo}$`) }) }).first();
  }

  async _confirm() {
    await this.settle(800, 'confirmation');
    // Returned / Cancelled ask for a reason ("Please enter the reason")
    const reason = this.page.locator('.ant-modal-content, .ant-popover').filter({ visible: true }).locator('textarea, input[type="text"]').filter({ visible: true }).first();
    if (await reason.isVisible().catch(() => false) && !(await reason.inputValue())) await reason.fill('Automation test reason');
    const btn = this.page.locator('.ant-modal-content, .ant-popover').filter({ visible: true })
      .getByRole('button', { name: /^(Yes|OK|Ok|Confirm|Submit|Move|Save|Update|Revert)$/ }).last();
    if (await btn.isVisible().catch(() => false)) await btn.click();
    await this.settle(2500, 'status change');
  }

  /** Tick the cheques on the open tab (after a search for each) and Move to `target`; returns toast / error text. */
  async moveTo(target, chequeNos) {
    const nos = [].concat(chequeNos);
    await this.fillInto(this.ctSearch, nos.length === 1 ? String(nos[0]) : '');
    await this.settle(2500, 'search');
    for (const no of nos) await this.rowLoc(no).locator('input[type="checkbox"]').check();
    await this.moveToBtn.click();
    await this.page.locator(`${OPEN_MENU} li`).filter({ visible: true }).filter({ hasText: new RegExp(`^\\s*${target}\\s*$`) }).first().click();
    await this._confirm();
    const msg = (await this.ctToast.allInnerTexts().catch(() => [])).join(' | ');
    console.log(`Move ${nos.join(', ')} → ${target}: "${msg}"`);
    return msg;
  }

  /** Move one cheque through its ⋮ menu. */
  async rowMoveTo(chequeNo, target) {
    await this.fillInto(this.ctSearch, String(chequeNo));
    await this.settle(2500, 'search');
    await this.rowLoc(chequeNo).locator('td').last().locator('svg, button, span').first().click();
    await this.page.locator(`${OPEN_MENU} li`).filter({ hasText: /Move To/ }).first().hover();
    await this.settle(800, 'submenu');
    await this.page.locator('.ant-dropdown-menu-submenu-popup:not(.ant-dropdown-menu-submenu-hidden) li, ' + `${OPEN_MENU} li`)
      .filter({ visible: true }).filter({ hasText: new RegExp(`^\\s*${target}\\s*$`) }).first().click();
    await this._confirm();
  }

  async revert(chequeNos) {
    const nos = [].concat(chequeNos);
    await this.fillInto(this.ctSearch, nos.length === 1 ? String(nos[0]) : '');
    await this.settle(2500, 'search');
    for (const no of nos) await this.rowLoc(no).locator('input[type="checkbox"]').check();
    await this.revertBtn.click();
    await this._confirm();
  }

  /** Returned tab: Collect Amount for the cheque → { saved, message, text }. */
  async collectAmount(chequeNo, { amount, account = 'Petty Cash' } = {}) {
    await this.fillInto(this.ctSearch, String(chequeNo));
    await this.settle(2500, 'search');
    await this.rowLoc(chequeNo).getByRole('button', { name: /Collect/i }).first().click();
    const m = this.page.locator('.ant-modal-content, .ant-drawer-content').filter({ visible: true }).last();
    await expect(m).toBeVisible();
    const text = (await m.innerText()).replace(/\s+/g, ' ');
    if (amount !== undefined) await this.typeValue(m.locator('input[id*="amount" i], input[type="text"]').filter({ visible: true }).first(), String(amount));
    if (account) {
      await m.locator('.ant-select:has(#account), .ant-select').filter({ visible: true }).first().locator('.ant-select-selector').click();
      await this.page.keyboard.type(account);
      await this.dropdownOption(account).click();
    }
    await m.getByRole('button', { name: /^(Save|Collect|Submit|Ok|OK)/ }).first().click();
    const saved = await expect(m).toBeHidden({ timeout: 10_000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (!saved) await this.page.keyboard.press('Escape');
    console.log(`Collect ${amount} on ${chequeNo}: ${saved ? 'saved' : `refused "${message}"`}`);
    return { saved, message, text };
  }

  /** New sales invoice (₹ total) paid by cheque `chequeNo`; returns { billNo, total, chequeNo }. */
  async invoiceWithCheque(item, { qty = 1, amount, chequeNo = `${Date.now()}`.slice(-6), chequeDate, customerName } = {}) {
    const m = { lines: [{ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0 }], taxMode: 'Excluding Tax' };
    const { billNo } = await this.createPricedInvoice(m, customerName ? { customerName } : {});
    const total = this.computeTotals(m).total;
    await this.openRecordPayment(billNo);
    await this.fillPayment({ amount: amount ?? total, mode: 'Cheque', chequeNo });
    if (chequeDate) {
      const d = this.paymentModal.locator('#cheque_date');
      await d.click();
      await d.press('Control+A');
      await this.page.keyboard.type(chequeDate);
      await this.page.keyboard.press('Enter');
    }
    await this.savePayment();
    await this.closePreview().catch(() => {});
    console.log(`${billNo} (₹${total}) paid by cheque ${chequeNo}`);
    return { billNo, total, chequeNo, customer: customerName };
  }

  amountOf(row) { return money(row.Amount); }
}

module.exports = { ChequeTrackerPage };
