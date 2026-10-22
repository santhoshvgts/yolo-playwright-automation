'use strict';

const { expect } = require('@playwright/test');
const { SalesInvoiceEditPage } = require('./SalesInvoiceEditPage');
const { SalesInvoicePage } = require('./SalesInvoicePage');
const { money } = require('../../utils/stockMath');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';

/**
 * Invoice app → Sales: payments against a Sales Invoice — the "Record Payment" modal from the
 * invoice preview, the preview's payments table, the Payment Received list / receipt drawer
 * and the receipt edit form. Builds on SalesInvoiceEditPage (invoices, list, preview).
 */
class SalesInvoicePaymentPage extends SalesInvoiceEditPage {

  constructor(page) {
    super(page);
    this.salesInvoicePage = new SalesInvoicePage(page);

    // Record Payment modal
    this.receivePaymentBtn = this.loc('//span[text()="Receive Payment"]');
    this.paymentModal = this.page.locator('.ant-modal-content, .ant-drawer-content').filter({ hasText: 'Record Payment' }).last();
    this.payDate = this.paymentModal.locator('#date');
    this.payAccount = this.paymentModal.locator('.ant-select').filter({ has: this.page.locator('#account') });
    this.payAmount = this.paymentModal.locator('#receiveAmount');
    this.payMode = this.paymentModal.locator('.ant-select').filter({ has: this.page.locator('#paymentMode') });
    this.payFull = this.paymentModal.locator('label').filter({ hasText: 'Pay full amount' }).locator('input[type="checkbox"]');
    this.payChequeNo = this.paymentModal.locator('#cheque_no');
    this.payNote = this.paymentModal.locator('#Notes');
    this.paySave = this.paymentModal.getByRole('button', { name: 'Save Receipt' });
    this.payCancel = this.paymentModal.getByRole('button', { name: 'Cancel' });
    this.dropdownOption = (text) => this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`)
      .filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();

    // Preview: payments table
    this.previewPaymentRows = this.page.locator('table').filter({ has: this.page.locator('th', { hasText: 'Payment#' }) }).locator('tbody tr');
    this.paymentDeleteConfirm = this.page.getByRole('tooltip', { name: /delete the payment/i }).last().getByRole('button', { name: 'Delete' });

    // Payment Received list / receipt drawer / edit form
    this.paymentReceivedTab = this.page.getByRole('tab', { name: 'Payment Received' });
    this.receiptDrawer = this.page.locator('.ant-drawer-content').filter({ hasText: 'Amount Received' }).last();
    this.receiptEditMode = this.page.locator('.ant-select').filter({ has: this.page.locator('#paymentmode') });
    this.newReceiptBtn = this.loc('//span[text()="New Payment Received "]');
    this.receiptNextBtn = this.loc('//span[text()="Next"]');
    this.receiptNo = this.page.locator('#bill_no');
    this.receiptDate = this.page.locator('#date');
    this.receiptAccount = this.page.locator('.ant-select').filter({ has: this.page.locator('#account') });
    this.receiptRef = this.page.locator('#reference_number');
    this.receiptNotes = this.page.locator('#notes');
    this.summaryReceived = this.page.locator('#amount_paid');
    this.summaryUsed = this.page.locator('#full_amount');
    this.summaryExcess = this.page.locator('#excess_amount');
  }

  // ── Record Payment modal ───────────────────────────────────────────────────

  async openRecordPayment(billNo) {
    await this.openInvoice(billNo);
    await this.receivePaymentBtn.click();
    await expect(this.paymentModal).toBeVisible();
    await this.settle(1000, 'payment modal renders');
  }

  /** Header values of the open modal: { bill, due, pendingCheque, billNo, date, mode, text }. */
  async readPaymentModal() {
    const text = (await this.paymentModal.innerText()).replace(/\s+/g, ' ');
    const after = (label) => {
      const m = text.match(new RegExp(`${label}\\s*(₹\\s*-?[\\d,]+(?:\\.\\d+)?)`));
      return m ? money(m[1]) : NaN;
    };
    const billNoMatch = text.match(/Bill No:\s*(\S*)/);
    return {
      text,
      bill: after('Bill Amount'),
      due: after('Due Amount'),
      pendingCheque: after('Pending Cheque'),
      billNo: billNoMatch && !/^Payment$/.test(billNoMatch[1]) ? billNoMatch[1] : '',
      date: await this.payDate.inputValue(),
      mode: await this.selectedText(this.payMode),
    };
  }

  async paymentModeOptions() {
    await this.payMode.locator('.ant-select-selector').click();
    await expect(this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).first()).toBeVisible();
    const options = (await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return options;
  }

  /**
   * Fill the open modal. p: { account = 'Petty Cash', amount, full, mode, date ('15 Oct 2026'), chequeNo, note }.
   * Omitted fields are left as they are.
   */
  async fillPayment(p = {}) {
    const { account = 'Petty Cash', amount, full, mode, date, chequeNo, note } = p;
    if (date) {
      await this.payDate.click();
      await this.payDate.press('ControlOrMeta+A');
      await this.page.keyboard.type(date);
      await this.page.keyboard.press('Enter');
    }
    if (account) {
      // Type to filter — the account list is long and renders lazily
      await this.payAccount.locator('.ant-select-selector').click();
      await this.page.keyboard.type(account);
      await this.dropdownOption(account).click();
    }
    if (mode && (await this.selectedText(this.payMode)) !== mode) {
      await this.payMode.locator('.ant-select-selector').click();
      await this.dropdownOption(mode).click();
      await this._fillModeReference(this.paymentModal);
    }
    if (full) await this.payFull.check();
    if (amount !== undefined) await this.typeValue(this.payAmount, amount);
    if (chequeNo) await this.fillInto(this.payChequeNo, chequeNo);
    if (note) await this.fillInto(this.payNote, note);
  }

  /** Save the modal; it must close. */
  async savePayment() {
    await this.paySave.click();
    await expect(this.paymentModal, 'payment saved (modal closed)').toBeHidden({ timeout: 20_000 });
    await this.settle(3000, 'payment posts');
  }

  /** Save must be refused: modal stays open with validation messages. Returns them. */
  async savePaymentExpectRefused() {
    await this.paySave.click();
    await expect(this.validationMessage.first()).toBeVisible();
    await expect(this.paymentModal).toBeVisible();
    return (await this.validationMessage.allInnerTexts()).join(' | ');
  }

  /** Record a payment against the invoice (opens it, fills, saves, closes the preview). */
  async recordPayment(billNo, p) {
    await this.openRecordPayment(billNo);
    await this.fillPayment(p);
    await this.savePayment();
    await this.closePreview().catch(() => {});
  }

  // ── preview payments ───────────────────────────────────────────────────────

  /** Payments listed on the invoice preview: [{ date, number, mode, amount }]. */
  async readInvoicePayments(billNo) {
    await this.openInvoice(billNo);
    const rows = [];
    for (const cells of await this.previewPaymentRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())))) {
      if (cells.length >= 4 && /RCPT/i.test(cells.join(' '))) {
        const number = cells.find((c) => /RCPT/i.test(c));
        rows.push({ date: cells[0], number, mode: cells[cells.indexOf(number) + 1], amount: money(cells[cells.indexOf(number) + 2]) });
      }
    }
    await this.closePreview().catch(() => {});
    return rows;
  }

  /** Delete (unlink) the invoice's payment `index` from the preview. */
  async deleteInvoicePayment(billNo, index = 0) {
    await this.openInvoice(billNo);
    await this.previewPaymentRows.nth(index).locator('.anticon-delete').click();
    await this.paymentDeleteConfirm.click();
    await this.settle(4000, 'payment removed, due recalculates');
    await this.closePreview().catch(() => {});
  }

  // ── customer balances ──────────────────────────────────────────────────────

  /** Customer advance from the customer profile header. */
  async readCustomerAdvance(customerName) {
    await this.salesTab.click();
    await this.salesInvoicePage._openCustomerProfile(customerName);
    return this.salesInvoicePage._readCustomerAdvance();
  }

  // ── Payment Received list / receipt ────────────────────────────────────────

  async openReceipt(receiptNo) {
    await this.salesTab.click();
    await this.paymentReceivedTab.click();
    await this.fillInto(this.listSearch, receiptNo);
    await this.settle(2500, 'receipt search');
    await this.invoiceRow(receiptNo).first().click();
    await expect(this.receiptDrawer).toBeVisible();
    await this.settle(1500, 'receipt drawer renders');
  }

  /** { receiptNo, customer, mode, received, excess } from the Payment Received list. */
  async receiptListRow(receiptNo) {
    await this.salesTab.click();
    await this.paymentReceivedTab.click();
    await this.fillInto(this.listSearch, receiptNo);
    await this.settle(2500, 'receipt search');
    const row = this.invoiceRow(receiptNo).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    return { date: c[0], receiptNo: c[1], customer: c[2], mode: c[3], received: money(c[4]), excess: money(c[5]) };
  }

  /** Open the receipt's edit form. */
  async editReceipt(receiptNo) {
    await this.openReceipt(receiptNo);
    await this.receiptDrawer.getByRole('button', { name: 'Edit' }).click();
    await expect(this.page).toHaveURL(/sales-payment-bill\/edit/);
    await expect(this.receiveAmtField()).toBeVisible();
    await this.settle(2500, 'receipt edit form loads');
  }

  receiveAmtField() {
    return this.page.locator('#receiveAmount');
  }

  // ── New Receipt (bulk payment) ─────────────────────────────────────────────

  /** Payment Received → New Payment Received → customer → Next. Returns the receipt no. */
  async openNewReceipt(customerName) {
    await this.salesTab.click();
    await this.paymentReceivedTab.click();
    await this.newReceiptBtn.click();
    await this.pickCustomer(customerName);
    await this.receiptNextBtn.click();
    await expect(this.page).toHaveURL(/sales-payment-bill\/add/);
    await expect(this.receiptNo).not.toHaveValue('');
    await this.settle(2500, 'due invoices load');
    return this.receiptNo.inputValue();
  }

  /** Header + summary of the receipt form. */
  async readReceiptForm() {
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const after = (label) => {
      const m = text.match(new RegExp(`${label}\\s*(₹\\s*-?[\\d,]+(?:\\.\\d+)?)`, 'i'));
      return m ? money(m[1]) : NaN;
    };
    return {
      text,
      due: after('Due amount'),
      pendingCheque: after('Pending Cheque'),
      receiptNo: await this.receiptNo.inputValue(),
      date: await this.receiptDate.inputValue(),
      received: await this._summaryValue(this.summaryReceived),
      used: await this._summaryValue(this.summaryUsed),
      excess: await this._summaryValue(this.summaryExcess),
    };
  }

  /** Summary boxes show their amount as the placeholder ("₹ 500.75"), the value stays empty. */
  async _summaryValue(input) {
    const shown = (await input.inputValue()) || (await input.getAttribute('placeholder')) || '0';
    return money(shown) || 0;
  }

  /** Type the received amount; answer the "reflect in the Payment field?" popup (OK / Cancel / leave). */
  async setReceivedAmount(value, answer = 'OK') {
    await this.typeValue(this.receiveAmtField(), value);
    const pop = this.page.getByRole('tooltip', { name: /reflected in the Payment field/ });
    const shown = await pop.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
    if (shown && answer) {
      await pop.getByRole('button', { name: answer }).click();
      await this.settle(800, 'popup answered');
    }
    return shown;
  }

  /** Payment input of the Due Invoices row for `billNo`. */
  receiptRowPayment(billNo) {
    return this.page.locator('table tbody tr').filter({ hasText: billNo }).locator('input').last();
  }

  /** { amount, balance, payment } of the Due Invoices row for `billNo` (null when not listed). */
  async receiptRow(billNo) {
    const row = this.page.locator('table tbody tr').filter({ hasText: billNo }).first();
    if (!(await row.count())) return null;
    const cells = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    const at = cells.findIndex((c) => c.includes(billNo));
    return { amount: money(cells[at + 1]), balance: money(cells[at + 2]), payment: parseFloat((await this.receiptRowPayment(billNo).inputValue()) || '0') };
  }

  async setReceiptRowPayment(billNo, value) {
    return this.typeValue(this.receiptRowPayment(billNo), value);
  }

  /** Set the receipt's payment mode on the new / edit receipt form. */
  async setReceiptPaymentMode(mode, chequeNo) {
    return this.setReceiptMode(mode, chequeNo);
  }

  /** Save a new receipt; must leave the form. */
  async saveNewReceipt() {
    await this.page.getByRole('button', { name: 'Save Receipt' }).click();
    await expect(this.page, 'receipt saved (left the form)').not.toHaveURL(/sales-payment-bill\/add/, { timeout: 60_000 });
    await this.settle(3000, 'receipt posts');
  }

  /** Save must be refused: form stays with a validation message. Returns the messages. */
  async saveReceiptExpectRefused() {
    await this.page.getByRole('button', { name: 'Save Receipt' }).click();
    await expect(this.validationMessage.first()).toBeVisible();
    await this.settle(1500, 'give a wrong save time to navigate');
    await expect(this.page).toHaveURL(/sales-payment-bill\/(add|edit)/);
    return (await this.validationMessage.allInnerTexts()).join(' | ');
  }

  /** Receipt numbers on every page of the Payment Received list. */
  async allReceiptNumbers() {
    await this.salesTab.click();
    await this.paymentReceivedTab.click();
    await this.fillInto(this.listSearch, '');
    await this.settle(2500, 'list loads');
    const all = [];
    for (let i = 0; i < 200; i++) {
      all.push(...(await this.listRows.evaluateAll((trs) => trs.map((tr) => tr.cells[1]?.innerText.trim()).filter(Boolean))));
      const next = this.listNextPage.first();
      if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true' || (await next.getAttribute('class')).includes('disabled')) break;
      await next.click();
      await this.settle(2000, 'next page');
    }
    return all;
  }

  /** Journal rows of the open receipt drawer: [{ account, debit, credit }]. */
  async readReceiptJournal(receiptNo) {
    await this.openReceipt(receiptNo);
    const rows = await this.receiptDrawer.locator('table').filter({ has: this.page.locator('th', { hasText: 'DEBIT' }) }).locator('tbody tr')
      .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
    await this.closePreview().catch(() => {});
    return rows.map((c) => ({ account: c[0], debit: money(c[1]), credit: money(c[2]) }));
  }

  /** In the receipt edit form: set the payment mode (and cheque no when Cheque). */
  async setReceiptMode(mode, chequeNo) {
    await this.receiptEditMode.locator('.ant-select-selector').click();
    await this.dropdownOption(mode).click();
    if (chequeNo) await this.fillInto(this.page.locator('#cheque_no'), chequeNo);
    await this._fillModeReference(this.page);
  }

  /** UPI asks for a "Transaction Id", Bank Transfer for a "Transfer Id" — fill one when shown and empty. */
  async _fillModeReference(scope) {
    await this.settle(500, 'mode-specific fields render');
    const txn = scope.getByRole('textbox', { name: /^(Transaction|Transfer) Id$/ });
    if (await txn.isVisible().catch(() => false) && !(await txn.inputValue())) {
      await this.fillInto(txn, `${Date.now()}`.slice(-10));
    }
  }

  /** Changing the received amount asks "Would you like this amount to be reflected in the Payment field?" — OK. */
  async confirmReflectAmount() {
    const ok = this.page.getByRole('tooltip', { name: /reflected in the Payment field/ }).getByRole('button', { name: 'OK' });
    if (await ok.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
      await ok.click();
      await this.settle(800, 'amount applied to the invoices');
    }
  }

  /** Type a date ('DD Mon YYYY') into the receipt form's date field; returns the value shown. */
  async setReceiptDate(date) {
    await this.receiptDate.click();
    await this.receiptDate.press('ControlOrMeta+A');
    await this.page.keyboard.type(date);
    await this.page.keyboard.press('Enter');
    await this.settle(600, 'receipt date applies');
    return this.receiptDate.inputValue();
  }

  /** Save Receipt on the edit form that may be refused: { saved, message }. */
  async trySaveReceiptEdit() {
    await this.confirmReflectAmount();
    await this.page.getByRole('button', { name: 'Save Receipt' }).click();
    const saved = await expect(this.page).not.toHaveURL(/sales-payment-bill\/edit/, { timeout: 30_000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (saved) await this.settle(3000, 'receipt saved');
    console.log(`Receipt edit ${saved ? 'saved' : 'refused'}: "${message}"`);
    return { saved, message };
  }

  async saveReceiptEdit() {
    await this.confirmReflectAmount();
    await this.page.getByRole('button', { name: 'Save Receipt' }).click();
    // The receipt save can spin for a long time (button shows "loading") — allow up to a minute
    await expect(this.page, 'receipt saved (left the edit form)').not.toHaveURL(/sales-payment-bill\/edit/, { timeout: 60_000 });
    await this.settle(3000, 'receipt saved');
  }
}

/** 'DD Mon YYYY' (payment modal date, e.g. "15 Oct 2026"). */
function paymentDate(d) {
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${String(d.getDate()).padStart(2, '0')} ${mon} ${d.getFullYear()}`;
}

module.exports = { SalesInvoicePaymentPage, paymentDate };
