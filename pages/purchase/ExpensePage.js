'use strict';

const { expect } = require('@playwright/test');
const { PurchaseInvoiceFlowPage } = require('./PurchaseInvoiceFlowPage');
const { money } = require('../../utils/stockMath');

const FORM_URL = /expense\/expense-bill\/(add|edit)/;
const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const VALID_GSTIN = () => `33${Array.from({ length: 5 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}${Math.floor(1000 + Math.random() * 8999)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}1Z${Math.floor(Math.random() * 9)}`;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Purchase → Expense (`/purchase?purchase=5`). List: Date, Expense No., Reference, Vendor Name, Paid Through,
 * Amount, Status; search "Search by Bill No. or Name", Start / End date; footer "Total Count: N ₹total".
 * New Expense → `/expense/expense-bill/add`: #expense_no (ro, EXP-AUTO/NNNN), #payment_account (Paid Through:
 * Cash, Undeposited Funds, Petty Cash, Bank …), #reference_number, #expense_date (Month D, YYYY), #vendor,
 * #vendor_registration_type (GST Treatment: Registered / Unregistered Business), #source, #destination
 * (default Tamil Nadu), #client (Customer), tax mode select (Exclusive tax | Inclusive tax).
 * Rows: #expense_account_row-<n>, #category_row-<n>, #expense_type_row-<n> (Goods | Service),
 * #notes_row-<n> (max 500), #tax_row-<n> (GST5/12/18/28/0), #amount_row-<n>; "Add New Row", "Total Rows: N".
 * Summary: Sub Total, tax lines, Total Tax Amount, Expense Total ( ₹ ). Buttons: Cancel, Save as Draft, Save.
 * Blank save: "Payment Account is Required", "Please Select Vendor Account" (GST Treatment), "Source is Required".
 */
class ExpensePage extends PurchaseInvoiceFlowPage {

  constructor(page) {
    super(page);
    this.expenseTab = this.page.getByRole('tab', { name: 'Expense' });
    this.newExpenseBtn = this.page.getByRole('button', { name: /New Expense/ });
    this.expenseNo = this.page.locator('#expense_no');
    this.expenseDate = this.page.locator('#expense_date');
    this.expRef = this.page.locator('#reference_number');
    this.addRowBtn = this.page.getByRole('button', { name: 'Add New Row' });
    this.expSaveBtn = this.page.getByRole('button', { name: 'Save', exact: true });
    this.expDraftBtn = this.page.getByRole('button', { name: 'Save as Draft' });
    this.expCancelBtn = this.page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.taxModeSel = this.page.locator('.ant-select').filter({ hasText: /^(Exclusive|Inclusive) tax$/ }).first();
    // Row ids differ between the new form (amount_row-<n>) and the edit form — match by the amount input
    this.rows = this.page.locator('table tbody tr').filter({ has: this.page.locator('input[placeholder="0"]') });
    this.expDrawer = this.page.locator('.ant-drawer-content').filter({ visible: true }).last();
    this.footerText = this.page.getByText(/Total Count:\s*\d+/).first();
  }

  gstinInput() {
    return this.page.locator('input[id*="gst" i]:not(#vendor_registration_type), input[placeholder*="GST" i]').filter({ visible: true }).first();
  }

  hdr(id) { return this.page.locator(`.ant-select:has(#${id})`).first(); }
  rowSel(i, prefix) { return this.rows.nth(i).locator(`.ant-select:has(input[id^="${prefix}"])`).first(); }
  rowAmount(i) { return this.rows.nth(i).locator('input[placeholder="0"]').first(); }
  rowNotes(i) { return this.rows.nth(i).locator('textarea').first(); }

  /** Open the select and click the option whose text is `text` (typed first when `type`). */
  async choose(sel, text, { type = false } = {}) {
    await sel.locator('.ant-select-selector').click();
    if (type) await this.page.keyboard.type(text);
    const opt = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: new RegExp(`^\\s*${esc(text)}`) }).first();
    await opt.waitFor({ timeout: 10_000 });
    await opt.click();
    await this.settle(400, `${text} picked`);
  }

  async _searchList(text) {
    // By URL: a drawer left open (e.g. after a cancelled delete) would block the menu
    const url = this.page.url();
    if (/\.xyz\/[0-9a-f]{20,}/.test(url)) await this.page.goto(`${url.replace(/(\.xyz\/[0-9a-f]+).*/, '$1')}/purchase?purchase=5`);
    else { await this.purchaseTab.click(); await this.expenseTab.click(); }
    await this.settle(2000, 'expense list');
    await this.fillInto(this.listSearch, text);
    await this.settle(2500, 'expense search');
  }

  async totalCount() { return parseInt((await this.footerText.innerText()).match(/Total Count:\s*(\d+)/)[1], 10); }

  /** Footer "Total Count: N ₹x": { count, total }. */
  async footer() {
    const t = (await this.footerText.innerText()).replace(/\s+/g, ' ');
    const m = t.match(/Total Count:\s*(\d+)\s*₹?\s*(-?[\d,]+(?:\.\d+)?)?/);
    return { count: parseInt(m[1], 10), total: m[2] ? money(m[2]) : NaN };
  }

  /** { date, no, ref, vendor, paidThrough, amount, status } of an expense in the list. */
  async expenseRow(no) {
    await this._searchList(no);
    const row = this.invoiceRow(no).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    const i = c.indexOf(no);
    return { date: c[i - 1], no, ref: c[i + 1], vendor: c[i + 2], paidThrough: c[i + 3], amount: money(c[i + 4]), status: c[i + 5], cells: c };
  }

  async expenseExists(no) {
    await this._searchList(no);
    return (await this.invoiceRow(no).count()) > 0;
  }

  async openNewExpense() {
    await this._searchList('');
    await this.newExpenseBtn.click();
    await expect(this.page).toHaveURL(FORM_URL);
    await expect(this.expenseNo).not.toHaveValue('');
    await this.settle(2000, 'expense form');
    return this.expenseNo.inputValue();
  }

  /**
   * Fill the header: { paidThrough ('Petty Cash'), gst ('Unregistered Business'), gstin, source ('Tamil Nadu'),
   * destination, vendor, customer, ref, date, taxMode ('Exclusive tax' | 'Inclusive tax') }.
   */
  async fillHeader(h = {}) {
    const { paidThrough = 'Petty Cash', gst = 'Unregistered Business', source = 'Tamil Nadu' } = h;
    if (paidThrough) await this.choose(this.hdr('payment_account'), paidThrough, { type: true });
    if (h.vendor) await this.choose(this.hdr('vendor'), h.vendor, { type: true });
    if (gst) await this.choose(this.hdr('vendor_registration_type'), gst);
    if (h.gstin !== undefined || gst === 'Registered Business') {
      // Registered Business shows a GST number input (tax is disabled for Unregistered Business)
      const g = this.gstinInput();
      if (await g.count()) await this.fillInto(g, h.gstin ?? VALID_GSTIN());
    }
    if (source) await this.choose(this.hdr('source'), source, { type: true });
    if (h.destination) await this.choose(this.hdr('destination'), h.destination, { type: true });
    if (h.customer) await this.choose(this.hdr('client'), h.customer, { type: true });
    if (h.ref !== undefined) await this.fillInto(this.expRef, h.ref);
    if (h.date) await this.setExpenseDate(h.date);
    if (h.taxMode) await this.choose(this.taxModeSel, h.taxMode);
  }

  async setExpenseDate(date) {
    await this.expenseDate.click();
    await this.expenseDate.press('Control+A');
    await this.page.keyboard.type(date);
    await this.page.keyboard.press('Enter');
    await this.settle(500, 'expense date');
    return this.expenseDate.inputValue();
  }

  /** Fill row i: { account ('Office Supplies'), type, desc, tax ('GST18' | null), amount }. Adds rows as needed. */
  async fillRow(i, r) {
    while ((await this.rows.count()) <= i) { await this.addRowBtn.click(); await this.settle(500, 'row added'); }
    if (r.account !== null) await this.choose(this.rowSel(i, 'expense_account'), r.account || 'Office Supplies', { type: true });
    if (r.type !== null && (r.type || r.account !== null)) await this.choose(this.rowSel(i, 'expense_type'), r.type || 'Goods');
    if (r.desc !== undefined) await this.rowNotes(i).fill(r.desc);
    if (r.tax) await this.choose(this.rowSel(i, 'tax'), r.tax);
    if (r.amount !== undefined) {
      await this.typeValue(this.rowAmount(i), String(r.amount));
      await this.rowAmount(i).press('Tab');
      await this.settle(600, 'row amount');
    }
  }

  async removeRow(i) {
    const btn = this.rows.nth(i).locator('td').last().locator('button').first();
    await btn.locator('span[role="img"], svg, img').first().click().catch(() => btn.click());
    const yes = this.page.locator('.ant-popover, .ant-popconfirm, .ant-modal-content').filter({ visible: true }).getByRole('button', { name: /^(Yes|OK|Delete)$/ }).last();
    if (await yes.isVisible().catch(() => false)) await yes.click();
    await this.settle(600, 'row removed');
  }

  async totalRows() { return parseInt((await this.page.getByText(/Total Rows:\s*\d+/).first().innerText()).match(/\d+/)[0], 10); }

  /** Summary: { sub, cgst, sgst, igst, tax, total, text }. */
  async readExpenseSummary() {
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const after = (re) => { const m = text.match(re); return m ? money(m[1]) : 0; };
    return {
      sub: after(/Sub Total\s*₹?\s*(-?[\d,]+(?:\.\d+)?)/),
      cgst: after(/CGST[^₹\d]*?(?:\[[^\]]*\])?\s*₹?\s*(-?[\d,]+\.\d+)/),
      sgst: after(/SGST[^₹\d]*?(?:\[[^\]]*\])?\s*₹?\s*(-?[\d,]+\.\d+)/),
      igst: after(/IGST[^₹\d]*?(?:\[[^\]]*\])?\s*₹?\s*(-?[\d,]+\.\d+)/),
      tax: after(/Total Tax Amount\s*₹?\s*(-?[\d,]+(?:\.\d+)?)/),
      total: after(/Expense Total \( ₹ \)\s*(-?[\d,]+(?:\.\d+)?)/),
      text,
    };
  }

  /** Save (or draft) — { saved, message, no }. */
  async trySaveExpense({ draft = false } = {}) {
    const no = await this.expenseNo.inputValue().catch(() => '');
    await (draft ? this.expDraftBtn : this.expSaveBtn).click();
    // An error toast can vanish before the 30 s wait ends — collect messages while waiting
    const seen = new Set();
    const t0 = Date.now();
    let saved = false;
    while (Date.now() - t0 < 30_000) {
      for (const m of await this.validationMessage.allInnerTexts().catch(() => [])) seen.add(m.trim());
      if (!FORM_URL.test(this.page.url())) { saved = true; break; }
      await this.page.waitForTimeout(500);
    }
    const message = [...seen].filter(Boolean).join(' | ');
    if (saved) await this.settle(2500, 'expense saved');
    console.log(`Expense ${no} ${saved ? 'saved' : 'refused'}${draft ? ' (draft)' : ''}: "${message}"`);
    return { saved, message, no };
  }

  async saveExpense(opts) {
    const r = await this.trySaveExpense(opts);
    if (!r.saved) throw new Error(`Expense ${r.no} not saved: ${r.message || 'no message'}`);
    return r.no;
  }

  /** New expense: header h, rows [..]; returns { no, summary }. */
  async createExpense(h = {}, rows = [{ amount: 1000 }], { draft = false } = {}) {
    await this.openNewExpense();
    await this.fillHeader(h);
    for (const [i, r] of rows.entries()) await this.fillRow(i, r);
    const summary = await this.readExpenseSummary();
    const no = await this.saveExpense({ draft });
    return { no: await this.confirmExpenseNumber(no, summary.total), summary };
  }

  /** Shared org: keep `no` when its amount matches, else the next higher number with that amount. */
  async confirmExpenseNumber(no, total) {
    await this._searchList('');
    const rows = await this.readListRows();
    const num = (s) => parseInt((String(s).match(/(\d+)$/) || [0, 0])[1], 10);
    const at = rows.find((r) => r.includes(no));
    if (!at || Math.abs(money(at[5]) - total) < 0.02) return no;
    const c = rows.filter((r) => Math.abs(money(r[5]) - total) < 0.02).map((r) => r[1]).filter((x) => num(x) > num(no)).sort((a, b) => num(a) - num(b));
    return c[0] || no;
  }

  async discardExpense() {
    await this.expCancelBtn.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL);
    await this.settle(1500, 'back on the list');
  }

  /** Open an expense's view drawer. */
  async openExpense(no) {
    await this._searchList(no);
    await this.invoiceRow(no).first().getByText(no, { exact: true }).click();
    await expect(this.expDrawer).toBeVisible();
    await this.settle(2000, 'expense view');
  }

  /** View: { text, journal: [{account, debit, credit}], buttons }. */
  async readExpenseView(no) {
    await this.openExpense(no);
    const d = this.expDrawer;
    const text = (await d.innerText()).replace(/\s+/g, ' ');
    const journal = (await d.locator('table').evaluateAll((ts) => ts
      .filter((t) => [...t.querySelectorAll('th')].some((h) => /DEBIT/i.test(h.innerText)))
      .flatMap((t) => [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.trim())))))
      .filter((c) => c.length >= 3).map((c) => ({ account: c[0], debit: money(c[1]) || 0, credit: money(c[2]) || 0 }));
    const buttons = await d.locator('button').evaluateAll((es) => es.map((e) => e.innerText.trim()).filter(Boolean));
    return { text, journal, buttons };
  }

  async editExpense(no) {
    await this.openExpense(no);
    await this.expDrawer.getByRole('button', { name: 'Edit' }).click();
    await expect(this.page).toHaveURL(FORM_URL);
    await this.settle(3000, 'expense edit form');
  }

  /** Delete from the view (⋮ menu or Delete button). confirm=false answers No. Returns true when gone. */
  async deleteExpense(no, { confirm = true } = {}) {
    await this.openExpense(no);
    const del = this.expDrawer.getByRole('button', { name: 'Delete', exact: true });
    if (await del.count()) await del.click();
    else { await this.expDrawer.locator('svg.ant-dropdown-trigger, .ant-dropdown-trigger').first().click(); await this.moreMenuDelete.click(); }
    await this.settle(800, 'delete prompt');
    const answer = this.page.locator('.ant-popover, .ant-modal-content, .ant-popconfirm').filter({ visible: true })
      .getByRole('button', { name: confirm ? /^(Yes|OK|Delete|Confirm)$/ : /^(No|Cancel)$/ }).last();
    if (await answer.isVisible().catch(() => false)) await answer.click();
    await this.settle(3000, 'delete result');
    await this.page.keyboard.press('Escape');
    await this.page.keyboard.press('Escape');
    const close = this.expDrawer.getByRole('button', { name: 'Close' });
    if (await close.isVisible().catch(() => false)) await close.click();
    await this.settle(800, 'view closed');
    return !(await this.expenseExists(no));
  }
}

module.exports = { ExpensePage };
