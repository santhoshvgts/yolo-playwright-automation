'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { ItemPage } = require('../inventory/ItemPage');
const { StockAdjustmentPage } = require('../inventory/StockAdjustmentPage');
const { masterData } = require('../../test-data/UserData');
const { parseStockByUnits, money, expectClose } = require('../../utils/stockMath');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Invoice app → Sales: Sales Invoice stock / UOM scenarios.
 *
 * Unlike SalesInvoicePage (one shared flow item, fixed pcs/box/bundle rows), every test here
 * builds its own items with exact UOM conversions and an exact opening stock (Stock
 * Adjustment), then works with any number of invoice lines in any UOM. Invoices are found
 * by bill number through the list search, never by row position — back-dated invoices do
 * not sort to the top.
 *
 * An "item" is what setupItem returns: { itemName, baseUnit, price, conversions }, where
 * conversions maps each UOM to base units per UOM (base unit → 1). Stock is always in base units.
 */
class SalesInvoiceStockPage extends AppBasePage {

  constructor(page) {
    super(page);
    this.itemPage = new ItemPage(page);
    this.stockAdjustment = new StockAdjustmentPage(page);

    // Navigation
    this.salesTab = this.loc('//a[text()="Sales"]');

    // Sales invoice list
    this.listSearch = this.page.locator('#search_sales_bill');
    // Row whose Bill No cell is exactly billNo (a bare hasText would also match ".../00081")
    this.invoiceRow = (billNo) => this.page.locator('table tbody tr')
      .filter({ has: this.page.locator('td', { hasText: new RegExp(`^${escapeRegex(billNo)}$`) }) });

    // New invoice — customer step
    this.newInvoiceBtn = this.loc("//span[text()='New Sales Invoice ']");
    this.customerDropdown = this.page.locator('#si_select_cus');
    this.customerOption = (name) => this.loc(`//div[text()='${name}']`);
    // BRITTLE: proceed button — structural CSS, no text anchor
    this.customerProceedBtn = this.page.locator('.ant-form > .ant-btn > span');

    // Invoice form — header
    this.billNoInput = this.page.locator('#new_si_bill_no');
    this.billDateInput = this.page.locator('#bill_date');

    // Invoice form — item lines. Row ids are not stable (new: 1/3/5…, edit: 0/1/2…, rows
    // added in edit jump again), so lines are addressed by position among the item rows.
    // The empty "Add item…" row also has a quantity input — leave it out.
    this.lineRows = this.page.locator('tr')
      .filter({ has: this.page.locator('input[id^="quantity"]') })
      .filter({ hasNotText: 'Add item by entering' });
    this.lineQty = (row) => row.locator('input[id^="quantity"]');
    this.lineUomInput = (row) => row.locator('input[id^="unit"]');
    this.lineUomShown = (row) => row.locator('.ant-select').filter({ has: this.page.locator('input[id^="unit"]') }).locator('.ant-select-selection-item');
    this.lineRemoveBtn = (row) => row.locator('button[id^="item_close_"]');
    // "<n> <uom> left" hint under a line qty — only shown (red) when the line exceeds the stock
    this.lineHint = (row) => row.getByText(/ left$/);
    // The empty "Add item…" auto-complete row (new form always has one; edit form only after "Add Row")
    this.itemSearch = this.page.locator('.ant-select-auto-complete').last();
    this.itemSearchRows = this.page.locator('.ant-select-auto-complete');
    this.itemOption = (name) => this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option-content`).filter({ hasText: name }).first();
    this.addRowBtn = this.page.getByRole('button', { name: 'Add Row' });
    this.openOption = (title) => this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option[title="${title}"]`);
    this.openOptions = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`);
    this.salesTotal = this.page.locator('#sales_total');

    // Invoice form — save. New form: "Save and Send"; edit form: "Save".
    // BRITTLE: generic primary-button CSS
    this.saveBtn = this.page.locator('.ant-btn-primary > span').first();
    this.saveDraftBtn = this.page.getByRole('button', { name: 'Save As Draft' });
    this.formCancelBtn = this.page.getByRole('button', { name: 'Cancel' }).first();
    // Validation shown when a save is refused, e.g. "Please check the <item>"
    // (success toasts such as "… updated successfully" are not validation)
    this.validationMessage = this.page.locator('.ant-message-notice, .ant-form-item-explain-error').filter({ hasNotText: /success/i });

    // Invoice preview
    this.editBtn = this.loc("//span[text()='Edit']");
    this.cancelBtn = this.loc("//span[text()='Cancel']");
    this.moreMenu = this.page.locator('svg.ant-dropdown-trigger');
    this.moreMenuDelete = this.page.locator('.ant-dropdown:not(.ant-dropdown-hidden)').getByText('Delete', { exact: true });
    // A cancelled invoice opens in a plain dialog with Delete shown directly
    this.deleteBtn = this.loc("//*[normalize-space(text())='Delete']").filter({ visible: true });
    this.yesBtn = this.loc("//span[text()='Yes']");
    this.cancelComments = this.loc('//textarea[@id="comments"]');
    this.cancelSaveBtn = this.loc('//span[text()="Save"]');
    this.previewCloseBtn = this.loc('//span[text()="Close"]');
    this.toast = this.page.locator('.ant-message');

    // Journal (preview)
    this.journalHeader = this.page.locator('.ant-collapse-header').filter({ hasText: 'Journal' });
    this.journalRows = this.page.locator('.ant-collapse-content-active tbody tr');
  }

  // ── setup ──────────────────────────────────────────────────────────────────

  /** Open the invoice app inside the test org. */
  async open() {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(2000, 'org switch reloads data');
  }

  /** Create one item (see ItemPage.createItemWithUoms) and give it `stock` base units. */
  async setupItem(spec, opts = {}) {
    const [item] = await this.setupItems([spec], opts);
    return item;
  }

  /** Create items, then one Stock Adjustment that sets each spec's `stock`. opts.billDate dates it. */
  async setupItems(specs, opts = {}) {
    const items = [];
    for (const spec of specs) {
      items.push({ ...(await this.itemPage.createItemWithUoms(spec)), openingStock: Number(spec.stock || 0) });
    }
    const withStock = items.filter((i) => i.openingStock);
    if (withStock.length) {
      await this.stockAdjustment.adjustStock(withStock.map((i) => ({ itemName: i.itemName, qty: i.openingStock })), { reopen: false, ...opts });
    }
    for (const item of items) await this.expectStock(item, item.openingStock, 'opening stock');
    return items;
  }

  // ── stock ──────────────────────────────────────────────────────────────────

  /** Base units for `qty` of `uom` (default: the item's base unit). */
  toBase(item, qty, uom = item.baseUnit) {
    if (!(uom in item.conversions)) throw new Error(`${item.itemName} has no UOM "${uom}"`);
    return Number(qty) * item.conversions[uom];
  }

  /** Total base units of invoice lines [{ item, qty, uom }] for one item. */
  baseQtyOf(item, lines) {
    return lines.filter((l) => l.item === item).reduce((sum, l) => sum + this.toBase(item, l.qty, l.uom), 0);
  }

  /** Item stock in base units, read from the Inventory list. */
  async readStock(item) {
    const text = await this.itemPage.readItemStockText(item.itemName);
    const stock = parseStockByUnits(text, item.conversions);
    console.log(`Stock of ${item.itemName}: "${text}" → ${stock} ${item.baseUnit}`);
    return stock;
  }

  /** Inventory stock must reach `expected` base units (stock posts asynchronously, so poll). */
  async expectStock(item, expected, label = '') {
    const target = Math.round(expected * 100) / 100;
    console.log(`Expect ${label ? `${label}: ` : ''}${item.itemName} = ${target} ${item.baseUnit}`);
    await expect.poll(() => this.readStock(item), {
      message: `${label} stock of ${item.itemName}`,
      timeout: 60_000,
      intervals: [1000, 3000, 5000],
    }).toBeCloseTo(target, 2);
  }

  // ── invoice form ───────────────────────────────────────────────────────────

  /** Sales → New Sales Invoice → customer → proceed. Returns the bill number. opts.billDate e.g. 'December 21, 2025'. */
  async startInvoice({ customerName = masterData.customerName, billDate } = {}) {
    await this.salesTab.click();
    await this.newInvoiceBtn.click();
    await this.pickCustomer(customerName);
    await this.customerProceedBtn.click();
    await expect(this.billNoInput).not.toHaveValue('');
    if (billDate) await this.setBillDate(billDate);
    const billNo = await this.billNoInput.inputValue();
    console.log(`New Sales Invoice ${billNo}${billDate ? ` dated ${billDate}` : ''}`);
    return billNo;
  }

  async setBillDate(billDate) {
    await this.billDateInput.click();
    await this.billDateInput.press('Control+A');
    await this.page.keyboard.type(billDate);
    await this.page.keyboard.press('Enter');
    await expect(this.billDateInput).toHaveValue(billDate);
  }

  /** Append a line for `item`: qty in `uom` (default the item's base unit). Works in the new and the edit form. */
  async addLine(item, qty, uom = item.baseUnit) {
    if (!(await this.itemSearchRows.count())) await this.addRowBtn.click();
    const before = await this.lineRows.count();
    await this.typeInto(this.itemSearch, item.itemName);
    await this.itemOption(item.itemName).click();
    await expect(this.lineRows).toHaveCount(before + 1);
    await this.setLine(before, qty, uom);
  }

  /** Add lines [{ item, qty, uom }] in order. */
  async addLines(lines) {
    for (const l of lines) await this.addLine(l.item, l.qty, l.uom);
  }

  /** Set line `index` (0-based among item rows) to qty / uom. */
  async setLine(index, qty, uom) {
    const row = this.lineRows.nth(index);
    if (uom && (await this.lineUomShown(row).innerText()).trim() !== uom) {
      await this.lineUomInput(row).click({ force: true });
      await this.openOption(uom).click();
      await expect(this.lineUomShown(row)).toHaveText(uom);
    }
    await this.fillInto(this.lineQty(row), qty);
  }

  async removeLine(index) {
    const before = await this.lineRows.count();
    await this.lineRemoveBtn(this.lineRows.nth(index)).click();
    // Rows re-render after a removal; a second click before that lands on a stale row.
    await expect(this.lineRows).toHaveCount(before - 1);
    await this.settle(500, 'line removed, totals recalculate');
  }

  async lineQtyValue(index) {
    return this.lineQty(this.lineRows.nth(index)).inputValue();
  }

  /** UOM options the line's UOM dropdown offers. */
  async lineUomOptions(index) {
    await this.lineUomInput(this.lineRows.nth(index)).click({ force: true });
    await expect(this.openOptions.first()).toBeVisible();
    const options = (await this.openOptions.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    console.log(`Line ${index + 1} UOM options: ${options.join(', ')}`);
    return options;
  }

  /** Red "<n> <uom> left" hint of a line ('' when the line is within stock). */
  async lineStockHint(index) {
    await this.settle(1500, 'line stock hint renders');
    const hint = this.lineHint(this.lineRows.nth(index));
    return (await hint.count()) ? (await hint.first().innerText()).trim() : '';
  }

  async readInvoiceTotal() {
    await this.settle(1000, 'invoice total recalculates');
    return money(await this.readText(this.salesTotal));
  }

  /** Save (create or edit) and wait for the form to close. A refused save fails with the stock hints. */
  async save() {
    await this.saveBtn.click();
    try {
      await expect(this.page).not.toHaveURL(/\/sales-bill\/add/, { timeout: 20_000 });
    } catch {
      const msgs = await this.validationMessage.allInnerTexts().catch(() => []);
      const hints = await this.page.getByText(/ left$/).allInnerTexts().catch(() => []);
      throw new Error(`Sales Invoice was not saved — form still open. Messages: ${msgs.join(' | ') || 'none'}; line stock: ${hints.join(', ') || 'n/a'}`);
    }
    await this.settle(2000, 'invoice save posts stock');
  }

  /** Save must be refused: form stays open and a validation message shows. Returns the message. */
  async saveExpectRefused() {
    await this.saveBtn.click();
    await expect(this.validationMessage.first()).toBeVisible();
    const message = (await this.validationMessage.allInnerTexts()).join(' | ');
    await this.settle(1500, 'give a wrong save time to navigate');
    await expect(this.page).toHaveURL(/\/sales-bill\/add/);
    console.log(`Save refused: "${message}"`);
    return message;
  }

  async saveAsDraft() {
    await this.saveDraftBtn.click();
    await expect(this.page).not.toHaveURL(/\/sales-bill\/add/, { timeout: 20_000 });
    await this.settle(2000, 'draft saved');
  }

  /** Leave the form without saving. */
  async discardForm() {
    await this.formCancelBtn.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(/\/sales-bill\/add/);
  }

  /** Create + save one invoice with `lines`; returns { billNo, total }. */
  async createInvoice(lines, opts = {}) {
    const billNo = await this.startInvoice(opts);
    await this.addLines(lines);
    const total = await this.readInvoiceTotal();
    await this.save();
    return { billNo, total };
  }

  // ── list + preview ─────────────────────────────────────────────────────────

  async _searchList(billNo) {
    await this.salesTab.click();
    await this.fillInto(this.listSearch, billNo);
    await this.settle(2500, 'list search results');
  }

  /** Status cell of the invoice in the Sales list, e.g. "Draft". */
  async invoiceStatus(billNo) {
    await this._searchList(billNo);
    const cells = this.invoiceRow(billNo).first().locator('td');
    return (await this.readText(cells.nth(4))).trim();
  }

  async openInvoice(billNo) {
    await this._searchList(billNo);
    await this.invoiceRow(billNo).first().click();
    await expect(this.editBtn.or(this.deleteBtn).first()).toBeVisible();
    await this.settle(2000, 'invoice preview renders');
  }

  async closePreview() {
    await this.previewCloseBtn.first().click();
    await this.settle(1000, 'preview closes');
  }

  async editInvoice(billNo) {
    await this.openInvoice(billNo);
    await this.editBtn.click();
    await expect(this.lineRows.first()).toBeVisible();
    await this.settle(3000, 'edit form loads');
  }

  async cancelInvoice(billNo, comments = 'Cancelled by automation') {
    console.log(`Cancelling ${billNo}...`);
    await this.openInvoice(billNo);
    await this.cancelBtn.click();
    await this.yesBtn.click();
    await this.typeInto(this.cancelComments, comments);
    await this.cancelSaveBtn.click();
    await this.settle(4000, 'cancel saved');
    await this.closePreview();
  }

  /** Delete from the preview (⋮ menu on a live/draft invoice, plain button on a cancelled one); row must be gone. */
  async deleteInvoice(billNo) {
    console.log(`Deleting ${billNo}...`);
    await this.openInvoice(billNo);
    if (await this.deleteBtn.count()) {
      await this.deleteBtn.first().click();
    } else {
      await this.moreMenu.first().click();
      await this.moreMenuDelete.click();
    }
    await this.yesBtn.click();
    await expect(this.toast.filter({ hasText: 'Successfully deleted' })).toBeVisible();
    await this._searchList(billNo);
    await expect(this.invoiceRow(billNo)).toHaveCount(0);
  }

  /** Customer picker (customer step): type to search — the list only loads the first 10 customers. */
  async pickCustomer(name) {
    await this.clickSelect(this.customerDropdown);
    await this.page.keyboard.type(name);
    await this.settle(1500, 'customer search');
    await this.customerOption(name).first().click();
  }

  /** Delete attempt that may be refused: returns { message, deleted }. */
  async tryDeleteInvoice(billNo) {
    await this.openInvoice(billNo);
    if (await this.deleteBtn.count()) {
      await this.deleteBtn.first().click();
    } else {
      await this.moreMenu.first().click();
      await this.moreMenuDelete.click();
    }
    await this.settle(800, 'delete prompt');
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await this.settle(2500, 'delete result');
    const message = (await this.toast.allInnerTexts().catch(() => [])).join(' | ');
    await this.page.keyboard.press('Escape');
    if (await this.previewCloseBtn.first().isVisible().catch(() => false)) await this.closePreview();
    await this._searchList(billNo);
    return { message, deleted: (await this.invoiceRow(billNo).count()) === 0 };
  }

  // ── journal ────────────────────────────────────────────────────────────────

  /** Journal of the invoice: { rows: [{ account, debit, credit }], debit, credit } ('' rows when there is none). */
  async readJournal(billNo) {
    await this.openInvoice(billNo);
    if (!(await this.journalHeader.count())) {
      await this.closePreview();
      return { rows: [], debit: 0, credit: 0 };
    }
    await this.journalHeader.scrollIntoViewIfNeeded();
    await expect(this.journalRows.first()).toBeVisible();
    const rows = [];
    for (const cells of await this.journalRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((td) => td.innerText.trim())))) {
      rows.push({ account: cells[0], debit: money(cells[1]), credit: money(cells[2]) });
    }
    await this.closePreview();
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    console.log(`Journal ${billNo}: ${rows.map((r) => `${r.account} Dr ${r.debit} Cr ${r.credit}`).join('; ')}`);
    return { rows, debit, credit };
  }

  /**
   * Journal must post the invoice correctly: Accounts Receivable Dr = invoice total, Sales Cr =
   * Σ line value (qty × price per base unit), output GST Cr = 18% of Sales, COGS Dr = Inventory
   * Asset Cr, debits = credits, no "Unknown Account".
   */
  verifyJournal(journal, { total, lines }) {
    const sales = lines.reduce((s, l) => s + this.toBase(l.item, l.qty, l.uom) * l.item.price, 0);
    const sum = (pred, side) => journal.rows.filter((r) => pred(r.account)).reduce((s, r) => s + r[side], 0);
    const tol = 0.02 * Math.max(lines.length, 1);

    expect(journal.rows.length, 'journal rows').toBeGreaterThan(0);
    expect(journal.rows.map((r) => r.account)).not.toContain('Unknown Account');
    for (const account of ['Accounts Receivable', 'Sales', 'Cost of Goods Sold', 'Inventory Asset']) {
      expect(journal.rows.map((r) => r.account), `journal has ${account}`).toContain(account);
    }
    expectClose(sum((a) => a === 'Accounts Receivable', 'debit'), total, tol, 'Accounts Receivable Dr vs invoice total');
    expectClose(sum((a) => a === 'Sales', 'credit'), sales, tol, 'Sales Cr vs line value');
    expectClose(sum((a) => /^Output /.test(a), 'credit'), sales * 0.18, tol, 'Output GST Cr vs 18% of sales');
    expectClose(sum((a) => a === 'Cost of Goods Sold', 'debit'), sum((a) => a === 'Inventory Asset', 'credit'), tol, 'COGS Dr vs Inventory Asset Cr');
    expectClose(journal.debit, journal.credit, tol, 'journal debit vs credit');
  }
}

module.exports = { SalesInvoiceStockPage };
