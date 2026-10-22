'use strict';

const { expect } = require('@playwright/test');
const { SalesInvoiceEditPage } = require('../sales/SalesInvoiceEditPage');
const { SalesInvoicePaymentPage } = require('../sales/SalesInvoicePaymentPage');
const { masterData } = require('../../test-data/UserData');
const { money } = require('../../utils/stockMath');

const FORM_URL = /purchase-bill\/add/;
const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';

/**
 * Purchase → Purchase Invoice. The purchase form is the same component as the Sales Invoice form
 * (lines, GST / CESS, tax mode, pricing summary, TDS, adjustment) with its own header ids
 * (#bill_no, #due_term, #reference_number, #notes, #terms) and a vendor step instead of a customer
 * step, so this reuses SalesInvoiceEditPage and only swaps navigation, header locators, save and list.
 * List: Date, Bill No, Vendor Name, Status, Bill Amount, Due Amount (same layout as the sales list).
 */
class PurchaseInvoiceFlowPage extends SalesInvoiceEditPage {

  constructor(page) {
    super(page);
    this.purchaseTab = this.loc('//a[text()="Purchase"]');
    this.salesTab = this.purchaseTab;   // list helpers of the parent click "salesTab" first
    this.purchaseInvoiceTab = this.page.getByRole('tab', { name: 'Purchase Invoice' });
    this.newInvoiceBtn = this.page.getByRole('button', { name: /New Purchase Invoice/ });
    this.vendorSelect = this.page.locator('.ant-select').filter({ has: this.page.getByText('Search & Select Vendor', { exact: true }) });
    this.vendorNextBtn = this.page.getByRole('button', { name: 'Next' });
    this.billNoInput = this.page.locator('#bill_no');
    this.dueTermSelect = this.antSelect('#due_term');
    this.refNoInput = this.page.locator('#reference_number');
    this.notesInput = this.page.locator('#notes');
    this.termsInput = this.page.locator('#terms');
    this.salesTotal = this.page.locator('#purchase_total');
    this.saveDraftBtn = this.page.getByRole('button', { name: /^Save as Draft$/i });
    // New form: "Save and Send"; edit form: "Save"
    this.saveBtn = this.page.getByRole('button', { name: 'Save and Send' })
      .or(this.page.getByRole('button', { name: 'Save', exact: true })).first();
    this.formCancelBtn = this.page.getByRole('button', { name: 'Cancel' }).first();
    this.previewDrawer = this.page.locator('.ant-drawer-content').filter({ visible: true }).last();
    this.makePaymentBtn = this.page.getByRole('button', { name: 'Make Payment' });
    this.listSearch = this.page.getByPlaceholder(/search/i).filter({ visible: true }).first();
    // Make Payment opens the same "Record Payment" drawer as the sales invoice
    this.payForm = new SalesInvoicePaymentPage(page);
    // The purchase line's remove (×) button has no item_close_ id
    this.lineRemoveBtn = (row) => row.locator('td').first().locator('button').first();
    // Adjustment type select has a generated id — find it by its value (Subtract / Addition)
    this.adjustmentTypeSelect = this.page.locator('.ant-select').filter({ has: this.page.locator('.ant-select-selection-item[title="Subtract"], .ant-select-selection-item[title="Addition"]') }).last();
    // Tax mode select (Excluding / Including Tax) has a generated id — find it by its value
    this.taxModeSelect = this.page.locator('.ant-select').filter({ has: this.page.locator('.ant-select-selection-item[title="Excluding Tax"], .ant-select-selection-item[title="Including Tax"]') }).first();
    // List date filter: no sales ids here — use the placeholders
    this.listDateStart = this.page.getByPlaceholder('Start date').filter({ visible: true }).first();
    this.listDateEnd = this.page.getByPlaceholder('End date').filter({ visible: true }).first();
    // Purchase line GST / CESS selects have generated ids — take them by position (after UOM)
    this.lineSelect = (row, idPrefix) => row.locator('.ant-select:not(.ant-select-auto-complete)')
      .filter({ hasNot: this.page.locator('input[id^="unit"]') }).nth(idPrefix === 'cess' ? 1 : 0);
  }

  /** Purchase → New Purchase Invoice → vendor → Next. opts: { vendorName, billDate }. Returns the bill no. */
  async startInvoice({ vendorName = masterData.vendorName, customerName, billDate } = {}) {
    const vendor = customerName || vendorName;
    await this.purchaseTab.click();
    await this.purchaseInvoiceTab.click();
    await this.newInvoiceBtn.click();
    await this.vendorSelect.click();
    await this.page.keyboard.type(vendor);
    await this.settle(1500, 'vendor search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: vendor }).first().click();
    await this.vendorNextBtn.click();
    await expect(this.billNoInput).not.toHaveValue('');
    await this.settle(2000, 'purchase form loads');
    if (!(await this.selectedText(this.placeOfSupplySelect))) await this.setPlaceOfSupply('Tamil Nadu');
    if (billDate) {
      await this.setBillDate(billDate);
      // App defect: changing the bill date empties Due Date ("Due Date is Required") — re-pick the term
      if (!(await this.dueDateInput.inputValue())) {
        await this.setDueTerm('15 days');
        await this.setDueTerm('7 days');
      }
    }
    const no = await this.billNoInput.inputValue();
    console.log(`New Purchase Invoice ${no}`);
    return no;
  }

  /** Like the sales fillInvoice, but a purchase line gets no GST by default — always pick it. */
  async fillInvoice(model, { tds } = {}) {
    const start = await this.lineCount();
    for (const [i, l] of model.lines.entries()) {
      await this.addLine(l.item, l.qty);
      const at = start + i;
      if (l.gst !== undefined && l.gst !== null) await this.setLineGst(at, `GST${l.gst}`);
      if (Number(l.cess || 0)) await this.setLineCess(at, `CESS${l.cess}`);
      const shown = (await this.readLine(at)).rate;
      if (l.rate !== undefined && Number(l.rate) !== shown) await this.setLineRate(at, l.rate);
      if (Number(l.discount || 0)) await this.setLineDiscount(at, l.discount, l.discountMode || '%');
    }
    if (model.taxMode && model.taxMode !== 'Excluding Tax') await this.setTaxMode(model.taxMode);
    if (model.summaryDiscount) await this.setSummaryDiscount(model.summaryDiscount.type, model.summaryDiscount.value);
    if (model.shipping) await this.setShipping(model.shipping);
    if (tds) model.tdsRate = await this.setTds(tds);
    if (model.adjustment) await this.setAdjustment(model.adjustment.type, model.adjustment.value);
  }

  /** Create + save from a model; opts: { vendorName, billDate, tds, draft }. Returns { billNo, total }. */
  async createPricedInvoice(model, opts = {}) {
    const vendor = opts.vendorName || opts.customerName || masterData.vendorName;
    return super.createPricedInvoice(model, { ...opts, customerName: vendor });
  }

  /** App defect: a past bill date can leave Due Date empty even after re-picking the term — use the bill date. */
  async _ensureDueDate() {
    if (!(await this.dueDateInput.count()) || (await this.dueDateInput.inputValue())) return;
    const billDate = await this.billDateInput.inputValue();
    await this.dueDateInput.click();
    await this.dueDateInput.press('ControlOrMeta+A');
    await this.page.keyboard.type(billDate);
    await this.page.keyboard.press('Enter');
    await this.settle(600, 'due date set');
    console.log(`Due Date was empty — set to the bill date ${billDate}`);
  }

  async save() {
    await this._ensureDueDate();
    await this.saveBtn.click();
    try {
      await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 20_000 });
    } catch {
      const msgs = await this.validationMessage.allInnerTexts().catch(() => []);
      throw new Error(`Purchase Invoice was not saved — form still open. Messages: ${msgs.join(' | ') || 'none'}`);
    }
    await this.settle(2500, 'purchase invoice saved');
  }

  /** Save that may be refused: { saved, message }. */
  async trySave() {
    await this.saveBtn.click();
    const saved = await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 8000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (saved) await this.settle(2500, 'purchase invoice saved');
    console.log(`Purchase save ${saved ? 'accepted' : 'refused'}: "${message}"`);
    return { saved, message };
  }

  async saveExpectRefused() {
    await this.saveBtn.click();
    await expect(this.validationMessage.first()).toBeVisible();
    const message = (await this.validationMessage.allInnerTexts()).join(' | ');
    await this.settle(1500, 'give a wrong save time to navigate');
    await expect(this.page).toHaveURL(FORM_URL);
    return message;
  }

  async saveAsDraft() {
    await this._ensureDueDate();
    await this.saveDraftBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 20_000 });
    await this.settle(2000, 'draft saved');
  }

  async discardForm() {
    await this.formCancelBtn.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL);
  }

  async _searchList(billNo) {
    await this.purchaseTab.click();
    await this.purchaseInvoiceTab.click();
    await this.fillInto(this.listSearch, billNo);
    await this.settle(2500, 'purchase list search');
  }

  /** Visible list rows (current page): arrays of cell texts. */
  async readListRows() {
    return this.page.locator('table tbody tr.ant-table-row').filter({ visible: true })
      .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
  }

  /** Search the list (text as typed) and return the rows. */
  async searchList(text) {
    await this._searchList(text);
    return this.readListRows();
  }

  /** Preview text of the bill (opens it, leaves it open). */
  async previewText(billNo) {
    await this.openInvoice(billNo);
    return (await this.previewDrawer.innerText()).replace(/\s+/g, ' ');
  }

  /** Make Payment from the preview and fill the drawer. p: { amount, account ('Petty Cash'), mode, full }. */
  async makePayment(billNo, p = {}) {
    await this.openInvoice(billNo);
    await this.makePaymentBtn.click();
    await expect(this.payForm.paymentModal).toBeVisible();
    await this.settle(1500, 'payment form');
    const text = (await this.payForm.paymentModal.innerText()).replace(/\s+/g, ' ');
    await this.payForm.fillPayment(p);
    return { modal: this.payForm.paymentModal, text };
  }

  /** Save the open payment drawer: { saved, message }. */
  async savePaymentForm() {
    await this.payForm.paySave.click();
    const saved = await expect(this.payForm.paymentModal).toBeHidden({ timeout: 30_000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (saved) await this.settle(3000, 'payment posts');
    else await this.payForm.payCancel.click().catch(() => {});
    await this.closePreview().catch(() => {});
    return { saved, message };
  }

  async payInvoice(billNo, amount) {
    await this.makePayment(billNo, { amount });
    const r = await this.savePaymentForm();
    if (!r.saved) throw new Error(`Payment of ${amount} on ${billNo} not saved: ${r.message}`);
  }

  /** Vendor header { due, advance, closing } on the vendor page. */
  async vendorHeader(vendorName = masterData.vendorName) {
    await this.purchaseTab.click();
    await this.page.locator('//div[text()="Vendor"]').first().click();
    await this.settle(1500, 'vendor list');
    await this.page.getByRole('textbox', { name: 'Search' }).first().fill(vendorName);
    await this.settle(2000, 'vendor search');
    await this.page.locator(`//div[text()="${vendorName}"]`).first().click();
    await this.settle(3500, 'vendor page');
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const grab = (label) => { const m = text.match(new RegExp(`${label}:\\s*₹\\s*(-?[\\d,]+(?:\\.\\d+)?)`)); return m ? money(m[1]) : NaN; };
    return { due: grab('Due'), advance: grab('Advance'), closing: grab('Closing Balance'), text };
  }
}

module.exports = { PurchaseInvoiceFlowPage };
