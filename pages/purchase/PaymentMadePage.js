'use strict';

const { expect } = require('@playwright/test');
const { PurchaseInvoiceFlowPage } = require('./PurchaseInvoiceFlowPage');
const { SalesInvoicePaymentPage } = require('../sales/SalesInvoicePaymentPage');
const { masterData } = require('../../test-data/UserData');
const { money } = require('../../utils/stockMath');

const FORM_URL = /payment\/payment-bill\/(add|edit)/;
const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';

/**
 * Purchase → Payment Made (`/purchase?purchase=2`). List: Date, Bill No (PAY-AUTO/NNNN), Vendor Name,
 * Mode of Payment, Amount; search "Search by Bill No. or Name", Start / End date, footer "Total Count: N".
 * New Payment Made → vendor ("Search & Select Vendor", Next disabled until picked) →
 * `/payment/payment-bill/add/<vendorId>/info`. The form is the SAME component as the sales bulk receipt:
 * #bill_no (ro), #date (Month D, YYYY), #receiveAmount, #paymentmode (no default), "Pay Full Amount",
 * #account (no default), #reference_number, #notes, Due Invoices (S.No, Bill Date, Description, Amount,
 * Balance, Payment), summary #amount_paid / #full_amount / #excess_amount (amount in the placeholder).
 * Typing the paid amount asks "Would you like this amount to be reflected in the Payment field?"
 * (OK = distribute oldest first, Cancel = all excess). View drawer: Close, Print, Edit, Delete; vendor,
 * PAY no, Payment Date, Paid Amount, S.No / Description / Amount / Paid, summary and journal.
 */
class PaymentMadePage extends PurchaseInvoiceFlowPage {

  constructor(page) {
    super(page);
    this.paymentMadeTab = this.page.getByRole('tab', { name: 'Payment Made' });
    this.newPaymentBtn = this.page.getByRole('button', { name: /New Payment Made/ });
    this.paymentDrawer = this.page.locator('.ant-drawer-content').filter({ hasText: 'Amount used for payments' }).filter({ visible: true }).last();
    this.savePaymentBtn = this.page.getByRole('button', { name: 'Save Payment' });
    this.formCancel = this.page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.payFullBox = this.page.locator('input.ant-checkbox-input, input[type="checkbox"]').first();   // checkbox sits beside the text, not in a label
    this.payFullLabel = this.page.getByText('Pay Full Amount', { exact: true });
    this.totalCountText = this.page.getByText(/Total Count:\s*\d+/).first();
    // Receipt-form locators used by the borrowed SalesInvoicePaymentPage methods
    this.receiptNo = this.page.locator('#bill_no');
    this.receiptDate = this.page.locator('#date');
    this.receiptRef = this.page.locator('#reference_number');
    this.receiptNotes = this.page.locator('#notes');
    this.receiptAccount = this.antSelect('#account');
    this.receiptEditMode = this.antSelect('#paymentmode');
    this.summaryReceived = this.page.locator('#amount_paid');
    this.summaryUsed = this.page.locator('#full_amount');
    this.summaryExcess = this.page.locator('#excess_amount');
    this.dropdownOption = (text) => this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`)
      .filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
  }

  async _openTab() {
    await this.purchaseTab.click();
    await this.paymentMadeTab.click();
    await this.settle(2000, 'payment made list');
  }

  async _searchPayments(text) {
    await this._openTab();
    await this.fillInto(this.listSearch, text);
    await this.settle(2500, 'payment search');
  }

  /** Rows of the Payment Made list as cell texts (current filter). */
  async searchPayments(text) {
    await this._searchPayments(text);
    return this.readListRows();
  }

  async totalCount() {
    return parseInt((await this.totalCountText.innerText()).match(/\d+/)[0], 10);
  }

  /** { date, no, vendor, mode, amount } of a payment in the list. */
  async paymentListRow(no) {
    await this._searchPayments(no);
    const row = this.invoiceRow(no).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    const i = c.indexOf(no);
    return { date: c[i - 1], no, vendor: c[i + 1], mode: c[i + 2], amount: money(c[i + 3]), cells: c };
  }

  /** Rows of every page of the Payment Made list for `text`. */
  async allPayments(text) {
    await this._searchPayments(text);
    const rows = [];
    for (let i = 0; i < 100; i++) {
      rows.push(...(await this.readListRows()));
      const next = this.page.locator('li.ant-pagination-next').filter({ visible: true }).first();
      if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true') break;
      await next.click();
      await this.settle(1500, 'next page');
    }
    return rows;
  }

  async paymentExists(no) {
    await this._searchPayments(no);
    return (await this.invoiceRow(no).count()) > 0;
  }

  /** New Payment Made → vendor → Next. Returns the PAY number shown. */
  async openNewPayment(vendorName = masterData.vendorName) {
    await this._openTab();
    await this.newPaymentBtn.click();
    await this.vendorSelect.click();
    await this.page.keyboard.type(vendorName);
    await this.settle(1500, 'vendor search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: vendorName }).first().click();
    await this.vendorNextBtn.click();
    await expect(this.page).toHaveURL(/payment-bill\/add\/\d+/);
    await expect(this.receiptNo).not.toHaveValue('');
    await this.settle(3000, 'due invoices load');
    return this.receiptNo.inputValue();
  }

  async setAccount(name = 'Petty Cash') {
    await this.receiptAccount.locator('.ant-select-selector').click();
    await this.page.keyboard.type(name);
    await this.settle(1000, 'account search');
    await this.dropdownOption(name).click();
  }

  /** Fill the header: { amount, answer ('OK' | 'Cancel'), mode ('Cash'), account ('Petty Cash'), ref, notes, rows: {billNo: amt} }. */
  async fillPaymentForm({ amount, answer = 'Cancel', mode = 'Cash', account = 'Petty Cash', ref, notes, rows = {} } = {}) {
    if (amount !== undefined) await this.setReceivedAmount(String(amount), answer);
    for (const [billNo, v] of Object.entries(rows)) await this.setReceiptRowPayment(billNo, String(v));
    if (mode) await this.setReceiptMode(mode);
    if (account) await this.setAccount(account);
    if (ref !== undefined) await this.fillInto(this.receiptRef, ref);
    if (notes !== undefined) await this.fillInto(this.receiptNotes, notes);
  }

  /** Save Payment: { saved, message, no } (no = the PAY number of the form). */
  async trySavePayment() {
    const no = await this.receiptNo.inputValue().catch(() => '');
    await this.savePaymentBtn.click();
    const saved = await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 60_000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (saved) await this.settle(3000, 'payment posts');
    console.log(`Payment ${no} ${saved ? 'saved' : 'refused'}: "${message}"`);
    return { saved, message, no };
  }

  async savePayment() {
    const r = await this.trySavePayment();
    if (!r.saved) throw new Error(`Payment ${r.no} not saved: ${r.message || 'no message'}`);
    return r.no;
  }

  /** Save must be refused quickly; returns the messages shown. */
  async savePaymentExpectRefused() {
    await this.savePaymentBtn.click();
    await this.settle(4000, 'give a wrong save time to navigate');
    await expect(this.page, 'payment save refused (form still open)').toHaveURL(FORM_URL);
    return (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
  }

  /** Whole flow: new payment for the vendor, fill, save. Returns the saved PAY number. */
  async createPayment(p = {}, vendorName = masterData.vendorName) {
    await this.openNewPayment(vendorName);
    await this.fillPaymentForm(p);
    const no = await this.savePayment();
    return this.confirmPaymentNumber(no, vendorName, p.amount);
  }

  /** Other users share the org: the pre-save number can be taken. Keep it if it is ours, else find ours. */
  async confirmPaymentNumber(no, vendorName, amount) {
    const rows = await this.searchPayments(vendorName);
    const mine = (r) => r.includes(vendorName) && (amount === undefined || Math.abs(money(r[r.length - 1]) - Number(amount)) < 0.01);
    const at = rows.find((r) => r.includes(no));
    if (!at || mine(at)) return no;
    const num = (s) => parseInt((s.match(/(\d+)$/) || [0, 0])[1], 10);
    const cands = rows.filter(mine).map((r) => r.find((c) => /PAY/.test(c))).filter((c) => num(c) > num(no)).sort((a, b) => num(a) - num(b));
    if (cands[0]) console.log(`Payment renumbered ${no} → ${cands[0]}`);
    return cands[0] || no;
  }

  async discardPaymentForm() {
    await this.formCancel.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL);
    await this.settle(1500, 'back on the list');
  }

  /** Open a payment's view drawer from the list. */
  async openPayment(no) {
    await this._searchPayments(no);
    await this.invoiceRow(no).first().getByText(no, { exact: true }).click();
    await expect(this.paymentDrawer).toBeVisible();
    await this.settle(1500, 'payment view renders');
  }

  /** View drawer: { text, paid, used, excess, rows: [{desc, amount, paid}], journal: [{account, debit, credit}] }. */
  async readPaymentView(no) {
    await this.openPayment(no);
    const d = this.paymentDrawer;
    const text = (await d.innerText()).replace(/\s+/g, ' ');
    const after = (label) => { const m = text.match(new RegExp(`${label}\\s*₹\\s*(-?[\\d,]+(?:\\.\\d+)?)`)); return m ? money(m[1]) : NaN; };
    const tables = await d.locator('table').evaluateAll((ts) => ts.map((t) => ({
      head: [...t.querySelectorAll('th')].map((h) => h.innerText.trim().toUpperCase()),
      rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())),
    })));
    const inv = tables.find((t) => t.head.includes('PAID')) || { rows: [] };
    // The journal is split in several tables (Payment Made, Payment for <bill>, Advance Payment …)
    const jr = { rows: tables.filter((t) => t.head.includes('DEBIT')).flatMap((t) => t.rows) };
    return {
      text,
      paid: after('Amount Paid'),
      used: after('Amount used for payments'),
      excess: after('Excess Amount'),
      rows: inv.rows.filter((c) => c.length >= 4).map((c) => ({ desc: c[1], amount: money(c[2]), paid: money(c[3]) })),
      journal: jr.rows.filter((c) => c.length >= 3).map((c) => ({ account: c[0], debit: money(c[1]) || 0, credit: money(c[2]) || 0 })),
    };
  }

  async closePaymentView() {
    await this.paymentDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(this.paymentDrawer).toBeHidden();
  }

  /** View → Edit → payment edit form. */
  async editPayment(no) {
    await this.openPayment(no);
    await this.paymentDrawer.getByRole('button', { name: 'Edit' }).click();
    await expect(this.page).toHaveURL(FORM_URL);
    await expect(this.receiveAmtField()).toBeVisible();
    await this.settle(3000, 'payment edit form loads');
  }

  /** View → Delete → confirm. Returns true when the payment is gone from the list. */
  async deletePayment(no) {
    await this.openPayment(no);
    await this.paymentDrawer.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirm = this.page.locator('.ant-popover, .ant-modal-content, .ant-popconfirm').filter({ visible: true })
      .getByRole('button', { name: /^(Yes|OK|Delete|Confirm)$/ }).last();
    if (await confirm.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) await confirm.click();
    await this.settle(4000, 'payment deleted');
    await this.page.keyboard.press('Escape');
    return !(await this.paymentExists(no));
  }

  /** Purchase invoice list row { status, due } for a bill. */
  async billRow(billNo) {
    return this.listRow(billNo);
  }
}

// Receipt-form helpers shared with the sales bulk receipt (same component).
for (const m of ['receiveAmtField', 'readReceiptForm', '_summaryValue', 'setReceivedAmount', 'receiptRowPayment', 'receiptRow',
  'setReceiptRowPayment', 'setReceiptMode', '_fillModeReference', 'confirmReflectAmount', 'setReceiptDate']) {
  PaymentMadePage.prototype[m] = SalesInvoicePaymentPage.prototype[m];
}

module.exports = { PaymentMadePage };
