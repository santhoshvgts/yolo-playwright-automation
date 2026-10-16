'use strict';

const { expect } = require('@playwright/test');
const { SalesOrderPage } = require('./SalesOrderPage');
const { masterData } = require('../../test-data/UserData');
const { money } = require('../../utils/stockMath');

const FORM_URL = /credit-notes-bill\//;
const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Invoice app → Sales → Credit Notes. The credit note form is the same component as the Sales
 * Invoice / Sales Order form (same field ids, lines, summary) plus Invoice No (#invoice, optional)
 * and Reason (#notes). Linking an invoice does NOT copy its lines; on save the credit note is
 * auto-applied to the linked invoice (up to the invoice due) and the rest stays as Remaining
 * Amount, which can be applied to other invoices from the preview (Apply to Invoices).
 */
class CreditNotePage extends SalesOrderPage {

  constructor(page) {
    super(page);
    this.creditNotesTab = this.page.getByRole('tab', { name: 'Credit Notes' });
    this.newCreditNoteBtn = this.page.getByRole('button', { name: /New Credit Notes/ });
    this.invoiceSelect = this.antSelect('#invoice');
    this.reasonInput = this.page.locator('#notes');
    // Create form: "Save and Send" (#new_si_save_and_send); edit form: "Save"
    this.saveBtn = this.page.locator('#new_si_save_and_send')
      .or(this.page.getByRole('button', { name: 'Save', exact: true })).first();
    this.applyBtn = this.page.getByRole('button', { name: 'Apply to Invoices' });
    this.applyModal = this.page.locator('.ant-modal-content').filter({ hasText: 'Apply Excess Amount' }).last();
  }

  /** Sales → Credit Notes → New → customer → Next. opts: { customerName, billDate, invoiceNo }. Returns the CN no. */
  async startInvoice({ customerName = masterData.customerName, billDate, invoiceNo } = {}) {
    await this.salesTab.click();
    await this.creditNotesTab.click();
    await this.newCreditNoteBtn.click();
    await this.pickCustomer(customerName);
    await this.customerProceedBtn.click();
    await expect(this.billNoInput).not.toHaveValue('');
    await this.settle(2000, 'credit note form loads');
    if (!(await this.selectedText(this.placeOfSupplySelect))) await this.setPlaceOfSupply('Tamil Nadu');
    if (billDate) await this.setBillDate(billDate);
    if (invoiceNo) await this.linkInvoice(invoiceNo);
    const no = await this.billNoInput.inputValue();
    console.log(`New Credit Note ${no}`);
    return no;
  }

  /** Invoice No dropdown options (optionally filtered by typing `text`). */
  async invoiceOptions(text = '') {
    await this.invoiceSelect.locator('.ant-select-selector').click();
    if (text) await this.page.keyboard.type(text);
    await this.settle(1500, 'invoice options load');
    const opts = (await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option-content`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return opts;
  }

  async linkInvoice(invoiceNo) {
    await this.invoiceSelect.locator('.ant-select-selector').click();
    await this.page.keyboard.type(invoiceNo);
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(invoiceNo)}\\s*$`) }).first().click();
    await this.settle(1000, 'invoice linked');
  }

  /** Clear the Invoice No (unlink). */
  async unlinkInvoice() {
    const root = this.invoiceSelect;
    await root.hover();
    const clear = root.locator('.ant-select-clear');
    await expect(clear, 'Invoice No can be cleared').toBeVisible({ timeout: 5000 });
    await clear.click();
    await this.settle(800, 'invoice unlinked');
  }

  async linkedInvoice() {
    return this.selectedText(this.invoiceSelect);
  }

  /** { reason, refNo, invoice, warehouse, billDate } of the open form. */
  async readCreditHeader() {
    return {
      reason: await this.reasonInput.inputValue(),
      refNo: await this.orderRefNo.inputValue(),
      invoice: await this.linkedInvoice(),
      warehouse: await this.selectedText(this.warehouseSelect),
      billDate: await this.billDateInput.inputValue(),
    };
  }

  /**
   * Create + save a credit note from an invoice model. opts: { customerName, invoiceNo, billDate,
   * reason, refNo, draft }. Returns { no, total } (total from the model).
   */
  async createCreditNote(model, opts = {}) {
    const no = await this.startInvoice(opts);
    if (opts.reason) await this.typeValue(this.reasonInput, opts.reason);
    if (opts.refNo) await this.typeValue(this.orderRefNo, opts.refNo);
    await this.fillInvoice(model, opts);
    await this.expectTotals(model, `${no} before save`);
    if (opts.draft) await this.saveAsDraft(); else await this.save();
    const total = this.computeTotals(model).total;
    const saved = await this.confirmSavedNumber(no, opts.customerName, total);
    console.log(`Created ${saved} — total ${total}`);
    return { no: saved, total };
  }

  async save() {
    await this.saveBtn.click();
    try {
      await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 20_000 });
    } catch {
      const msgs = await this.validationMessage.allInnerTexts().catch(() => []);
      throw new Error(`Credit Note was not saved — form still open. Messages: ${msgs.join(' | ') || 'none'}`);
    }
    await this.settle(2500, 'credit note saved');
  }

  async saveExpectRefused() {
    await this.saveBtn.click();
    await expect(this.validationMessage.first()).toBeVisible();
    const message = (await this.validationMessage.allInnerTexts()).join(' | ');
    await this.settle(1500, 'give a wrong save time to navigate');
    await expect(this.page).toHaveURL(FORM_URL);
    console.log(`Credit note save refused: "${message}"`);
    return message;
  }

  /** Save that may or may not go through: { saved, message }. A refused save leaves the form open. */
  async trySave() {
    await this.saveBtn.click();
    const saved = await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 8000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (saved) await this.settle(2500, 'credit note saved');
    console.log(`Credit note save ${saved ? 'accepted' : 'refused'}: "${message}"`);
    return { saved, message };
  }

  async saveAsDraft() {
    await this.saveDraftBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 20_000 });
    await this.settle(2000, 'draft saved');
  }

  async discardForm() {
    await this.formCancelBtn.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL);
  }

  async _searchList(no) {
    await this.salesTab.click();
    await this.creditNotesTab.click();
    await this.fillInto(this.listSearch, no);
    await this.settle(2500, 'credit note search');
  }

  /** { date, no, customer, invoice, status, amount, remaining } from the Credit Notes list. */
  async listRow(no) {
    await this._searchList(no);
    const row = this.invoiceRow(no).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    const i = c.indexOf(no);
    return { date: c[i - 1], no, customer: c[i + 1], invoice: c[i + 2], status: c[i + 3], amount: money(c[i + 4]), remaining: money(c[i + 5]) };
  }

  /** Preview text of the credit note (opens it; leaves it open). */
  async previewText(no) {
    await this.openInvoice(no);
    return (await this.previewDrawer.innerText()).replace(/\s+/g, ' ');
  }

  async deleteCreditNote(no) {
    await this.deleteOrder(no);
  }

  /** Delete click + Yes; returns { message, deleted }. */
  async tryDeleteCreditNote(no) {
    await this.openInvoice(no);
    await this.previewDrawer.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.settle(800, 'delete prompt');
    const prompt = (await this.page.locator('.ant-modal-content, .ant-popover').filter({ visible: true }).allInnerTexts()).join(' | ');
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await this.settle(2500, 'delete result');
    const message = (await this.toast.allInnerTexts().catch(() => [])).join(' | ');
    await this.page.keyboard.press('Escape');
    if (await this.previewCloseBtn.first().isVisible().catch(() => false)) await this.closePreview();
    await this._searchList(no);
    const deleted = (await this.invoiceRow(no).count()) === 0;
    return { prompt, message, deleted };
  }

  // ── Apply to Invoices ──────────────────────────────────────────────────────

  async openApply(no) {
    await this.openInvoice(no);
    await this.applyBtn.click();
    await expect(this.applyModal).toBeVisible();
    await this.settle(2000, 'apply list loads');
  }

  /** All invoice numbers listed in the Apply modal (every page). */
  async applyInvoiceNumbers() {
    const nos = [];
    for (let i = 0; i < 50; i++) {
      nos.push(...(await this.applyModal.locator('tbody tr.ant-table-row').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())))).map((c) => c[2]));
      if (!(await this._applyNextPage())) break;
    }
    await this._applyFirstPage();
    return nos;
  }

  async _applyNextPage() {
    const next = this.applyModal.locator('li.ant-pagination-next');
    if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true' || (await next.getAttribute('class')).includes('disabled')) return false;
    await next.click();
    await this.settle(800, 'next page');
    return true;
  }

  async _applyFirstPage() {
    const first = this.applyModal.locator('li.ant-pagination-item-1');
    if (await first.count()) { await first.click(); await this.settle(500, 'first page'); }
  }

  /** Apply-modal row of an invoice (pages forward until found). */
  async _applyRow(invoiceNo) {
    await this._applyFirstPage();
    for (let i = 0; i < 50; i++) {
      const row = this.applyModal.locator('tbody tr.ant-table-row').filter({ has: this.page.locator('td', { hasText: new RegExp(`^${escapeRegex(invoiceNo)}$`) }) });
      if (await row.count()) return row.first();
      if (!(await this._applyNextPage())) break;
    }
    throw new Error(`${invoiceNo} not listed in Apply to Invoices`);
  }

  /** { amount, balance } of an invoice in the Apply modal. */
  async applyRowAmounts(invoiceNo) {
    const c = (await (await this._applyRow(invoiceNo)).locator('td').allInnerTexts()).map((t) => t.trim());
    return { amount: money(c[3]), balance: money(c[4]) };
  }

  /** Type the Amount Used for an invoice; returns the value shown. */
  async setApplyAmount(invoiceNo, amount) {
    const input = (await this._applyRow(invoiceNo)).locator('input').first();
    return this.typeValue(input, amount);
  }

  /** { used, remaining } footer of the Apply modal. */
  async readApplyTotals() {
    const val = (label) => this.applyModal.getByText(label, { exact: true }).locator('xpath=following::input[1]').inputValue();
    return { used: money(await val('Amount used for Payments')), remaining: money(await val('Remaining Amount')) };
  }

  async saveApply() {
    await this.applyModal.getByRole('button', { name: 'Save' }).click();
    await expect(this.applyModal, 'apply saved').toBeHidden({ timeout: 20_000 });
    await this.settle(2500, 'application posts');
    await this.page.keyboard.press('Escape');
  }

  /** Save in the Apply modal must be refused (modal stays open). Returns the message shown. */
  async saveApplyExpectRefused() {
    await this.applyModal.getByRole('button', { name: 'Save' }).click();
    await this.settle(2000, 'apply validation');
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    await expect(this.applyModal, 'apply refused — modal still open').toBeVisible();
    return message;
  }

  async cancelApply() {
    await this.applyModal.getByRole('button', { name: 'Cancel' }).click();
    await this.settle(800, 'apply closed');
    await this.page.keyboard.press('Escape');
  }

  // ── other lists ────────────────────────────────────────────────────────────

  /** Sales Invoice numbers on the first page of the Sales Invoice list that are NOT for `customer`. */
  async otherCustomerInvoices(customer) {
    await this.salesTab.click();
    await this.page.getByRole('tab', { name: 'Sales Invoice' }).click();
    await this.fillInto(this.listSearch, '');
    await this.settle(2500, 'invoice list');
    const rows = await this.visibleRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
    return rows.filter((c) => !c.some((t) => t.toLowerCase() === customer.toLowerCase()))
      .map((c) => c.find((t) => /^SINV/.test(t))).filter(Boolean);
  }

  /** Customer page → Credit Notes tab: [{ cells, text }] rows. */
  async readCustomerCreditNotes() {
    await this.openCustomerTab('Credit Notes');
    return (await this._readAllVisibleRows()).map((cells) => ({ cells, text: cells.join(' | ') }));
  }
}

module.exports = { CreditNotePage };
