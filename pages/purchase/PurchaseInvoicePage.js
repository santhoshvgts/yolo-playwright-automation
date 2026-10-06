'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { ItemPage } = require('../inventory/ItemPage');
const { saveSection, requireSection } = require('../../utils/flowStore');
const { money, expectClose } = require('../../utils/stockMath');

/**
 * Invoice app → Purchase: create / edit / delete a Purchase Invoice (PI) and check
 * the effect on item stock (Inventory tab) and on the vendor's Due / Advance /
 * Closing Balance / Transaction Statement plus the PI journal.
 *
 * Runtime store: `data.section` (purchaseFlowData) — reads itemName + conversions
 * written by ItemPage.createItemWithOpeningStock; writes initialtotalqty, newtotalqty,
 * editTotalqty, updatedTotalqty, finalTotalqty, billNo.
 */
class PurchaseInvoicePage extends AppBasePage {

  constructor(page) {
    super(page);
    this.itemPage = new ItemPage(page);

    // ── Navigation ──────────────────────────────────────────────────────────
    this.purchaseTab = this.loc('//a[text()="Purchase"]');
    this.vendorTab = this.loc('//div[text()="Vendor"]');
    this.vendorProfile = (name) => this.loc(`//div[text()="${name}"]`);
    // Vendor list loads alphabetically in batches — search so the vendor is rendered
    this.vendorListSearch = this.page.getByRole('textbox', { name: 'Search' });

    // ── PI list ─────────────────────────────────────────────────────────────
    this.newPurchaseInvoiceBtn = this.loc("//span[text()='New Purchase Invoice']");
    // BRITTLE: first PI row by position + full class string (newest PI is assumed to be row 1)
    this.firstInvoiceRow = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]');
    // BRITTLE: bill no / bill amount / due amount — first row, positional td
    this.firstRowBillNo = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[3]');
    this.firstRowBillAmount = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[6]');
    this.firstRowDueAmount = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[7]');
    this.invoiceTableRows = this.page.locator('table tbody tr');

    // ── PI detail: actions ──────────────────────────────────────────────────
    this.editBtn = this.loc("//span[text()='Edit']");
    this.threeDotsMenu = this.page.locator('svg.ant-dropdown-trigger');
    this.deleteMenuItem = this.loc("//div[text()='Delete']");
    this.deleteConfirmYes = this.loc("//span[text()='Yes']");

    // ── PI detail: journal ──────────────────────────────────────────────────
    this.journalTable = this.loc('//div[@class="ant-collapse-content ant-collapse-content-active"]');
    // BRITTLE: debit / credit totals — nth-child + inline style attribute selector
    this.journalDebit = this.page.locator(':nth-child(2) > [style="display: flex; font-size: 16px; font-weight: 700; line-height: 24px; letter-spacing: 0.15px;"] > div');
    this.journalCredit = this.page.locator(':nth-child(3) > [style="display: flex; font-size: 16px; font-weight: 700; line-height: 24px; letter-spacing: 0.15px;"] > div');

    // ── PI form: vendor + header ────────────────────────────────────────────
    // Option in the dropdown that is OPEN right now. Closed antd dropdowns stay in
    // the DOM, so an unscoped //div[text()=…] can hit an earlier row's hidden list.
    this.openDropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    this.openOption   = (title) => this.openDropdown.locator(`.ant-select-item-option[title="${title}"]`);

    // Vendor select: the search <input> sits on top of the placeholder text, so
    // type into the input (clickSelect) — never click/fill the placeholder <span>.
    this.vendorSelect      = this.page.locator('.ant-select').filter({ has: this.page.getByText('Search & Select Vendor', { exact: true }) });
    this.vendorSearchInput = this.vendorSelect.locator('input');
    this.vendorOption      = (name) => this.openDropdown.locator(`xpath=.//div[text()='${name}']`);
    this.vendorProceedBtn  = this.page.getByRole('button', { name: 'Next' });
    this.placeOfSupply       = this.page.locator('#place_of_supply');
    this.placeOfSupplyOption = this.openOption('Tamil Nadu');

    // ── PI form: item lines (new PI rows are quantity1 / quantity3 / quantity5) ──
    // The empty "Add item…" auto-complete row is always the last one
    this.itemSearch = this.page.locator('.ant-select-auto-complete').last();
    this.itemOptionContent = '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content';
    this.line1Qty       = this.page.locator('#quantity1');
    this.line2Qty       = this.page.locator('#quantity3');
    this.line2UomDropdown = this.page.locator('#unit3');
    this.line2UomBox    = this.openOption('box');
    this.line3Qty       = this.page.locator('#quantity5');
    this.line3UomDropdown = this.page.locator('#unit5');
    this.line3UomBundle = this.openOption('bundle');
    this.line1Discount = this.page.locator('#discount1');
    this.line2Discount = this.page.locator('#discount3');
    this.line3Discount = this.page.locator('#discount5');
    // The flow item has no purchase price, so PI lines default to rate 0 — the
    // amount flow (TC14) must enter rates itself or the invoice has no item value.
    this.line1Rate = this.page.locator('#rate1');
    this.line2Rate = this.page.locator('#rate3');
    this.line3Rate = this.page.locator('#rate5');

    // ── PI form: edit mode (saved rows are re-indexed to 0 / 1 / 2) ──────────
    this.editLine1Qty      = this.page.locator('#quantity0');
    this.editLine2Qty      = this.page.locator('#quantity1');
    this.editLine3Qty      = this.page.locator('#quantity2');
    this.editLine1Discount = this.page.locator('#discount0');
    this.editLine2Discount = this.page.locator('#discount1');
    this.editLine3Discount = this.page.locator('#discount2');
    this.editLine1Rate     = this.page.locator('#rate0');
    this.editLine2Rate     = this.page.locator('#rate1');
    this.editLine3Rate     = this.page.locator('#rate2');
    this.editUomField = 'span.ant-select-selection-item';
    this.editUomQty   = 'input[id^="quantity"]';

    // ── PI form: summary ────────────────────────────────────────────────────
    this.discountTypeDropdown = this.page.locator('#discount_type');
    this.discountTypeAmount   = this.openOption('Amount');
    this.discountPrice        = this.page.locator('#discount_price');
    this.shippingCost         = this.page.locator('#shipping_cost');
    // TDS tax select (its rc_select_N id shifts with the number of rows) — found by placeholder
    this.tdsDropdown = this.page.locator('.ant-select').filter({ has: this.page.locator('.ant-select-selection-placeholder', { hasText: 'Select a tax' }) }).locator('input');
    this.tdsDividend = this.openOption('Dividend');
    // Adjustment type select — the one showing the default "Subtract"
    this.adjustmentTypeDropdown = this.page.locator('.ant-select').filter({ has: this.page.locator('.ant-select-selection-item[title="Subtract"]') }).locator('input');
    this.adjustmentAddition = this.openOption('Addition');
    this.adjustmentInput    = this.page.locator('#adjustment');
    this.purchaseTotal      = this.page.locator('#purchase_total');
    // BRITTLE: generic antd primary button
    this.saveBtn = this.page.locator('.ant-btn-primary > span');

    // ── Vendor profile ──────────────────────────────────────────────────────
    // BRITTLE: CSS-module hashed class (_1j9hs_54) + nth-child
    this.vendorDue = this.page.locator('._vendor_info_header_content_value_1j9hs_54 > :nth-child(2) > div');
    // BRITTLE: long inline style-attribute selector
    this.vendorAdvance = this.page.locator('[style="display: flex; font-size: 14px; font-weight: 500; line-height: 20px; letter-spacing: 0.1px; color: rgb(16, 75, 252); text-decoration: none;"] > .cursor-pointer');
    // BRITTLE: CSS-module hashed class (_1j9hs_54) + nth-child
    this.vendorClosingBalance = this.page.locator('._vendor_info_header_content_value_1j9hs_54 > :nth-child(8) > div');
    // BRITTLE: last cell of last row of the transaction statement
    this.statementClosingBalance = this.loc("//tbody[@class='ant-table-tbody']/tr[last()]/td[last()]");

    // ── Pagination (transaction statement) ─────────────────────────────────
    this.pagination            = this.page.locator('body').locator('ul.ant-pagination');
    this.paginationNumberedItems = this.page.locator(
      'ul.ant-pagination li[title]:not([title="Previous Page"]):not([title="Next Page"]):not([title="..."])'
    );
    this.paginationPage        = (title) => this.page.locator(`ul.ant-pagination li[title="${title}"]`);
    this.paginationActive      = this.page.locator('ul.ant-pagination li.ant-pagination-item-active');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ══════════════════════════════════════════════════════════════════════════

  async _openInvoiceApp(settleMs) {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(settleMs, 'org switch reloads data');
  }

  /** Force-click (antd inputs hidden under a selector overlay). */
  async _forceClick(locator) {
    await locator.click({ force: true });
  }

  async _textOf(locator, timeout) {
    return this.readText(locator, timeout);
  }

  async _amountOf(locator) {
    return money(await this._textOf(locator));
  }

  /** Purchase → New Purchase Invoice → vendor → proceed. */
  async _startNewPurchaseInvoice(vendorName) {
    console.log('Starting a new Purchase Invoice...');
    await this.purchaseTab.click();
    await this.newPurchaseInvoiceBtn.click();
    await this.typeInto(this.vendorSearchInput, vendorName);
    await this.vendorOption(vendorName).click();   // auto-waits for the search results
    await expect(this.vendorProceedBtn).toBeEnabled();
    await this.vendorProceedBtn.click();
    await this.settle(4000, 'PI form loads');
  }

  /** Line 1 = pcs, line 2 = box, line 3 = bundle, all for the same item. */
  async _addItemLines(itemName, { pcs, box, bundle }) {
    console.log('Adding item lines (pcs / box / bundle)...');
    const pickItem = async () => {
      await this.typeInto(this.itemSearch, itemName);
      await this.settle(2000, 'item search results');
      await this.containing(this.itemOptionContent, itemName).click();
    };
    await pickItem();
    await this.fillInto(this.line1Qty, pcs);

    await pickItem();
    await this.fillInto(this.line2Qty, box);
    await this._forceClick(this.line2UomDropdown);
    await this.line2UomBox.click();

    await pickItem();
    await this.fillInto(this.line3Qty, bundle);
    await this._forceClick(this.line3UomDropdown);
    await this.line3UomBundle.click();
  }

  async _save() {
    await this.saveBtn.click();
  }

  /** Purchase → newest PI (row 1). */
  async _openLatestInvoice() {
    await this.firstInvoiceRow.click();
    await this.settle(4000, 'PI detail loads');
  }

  async _deleteOpenInvoice() {
    console.log('Deleting the Purchase Invoice...');
    await this.threeDotsMenu.click();
    await this.deleteMenuItem.click();
    await this.deleteConfirmYes.click();
  }

  /** Stock of the item in pcs; logs the same breakdown the old spec did. */
  async _readStock(saved, label) {
    const stock = await this.itemPage.readItemStock(saved.itemName, saved.boxconversion, saved.bundleconversion);
    if (!stock.outOfStock) {
      console.log(`${label} Box Quantity: ${stock.box}`);
      console.log(`${label} Bundle Quantity: ${stock.bundle}`);
      console.log(`${label} Pcs Quantity: ${stock.pcs}`);
      console.log(`${label} Total Quantity: ${stock.total}`);
    }
    return stock;
  }

  /** Journal of the open PI: visible, no "Unknown Account", debit ≈ credit. */
  async _verifyJournalBalanced(label) {
    console.log(`Verifying journal (${label})...`);
    await this.journalTable.scrollIntoViewIfNeeded();
    await expect(this.journalTable).toBeVisible();
    await expect(this.journalTable.filter({ hasText: 'Unknown Account' })).toHaveCount(0);
    const debit  = await this._amountOf(this.journalDebit);
    const credit = await this._amountOf(this.journalCredit);
    console.log(`${label} Debit Amount: ${debit}`);
    console.log(`${label} Credit Amount: ${credit}`);
    expectClose(debit, credit, 0.021, `${label} journal debit vs credit`);
  }

  /** PI list row 1: bill amount must equal due amount and ≈ the PI total. */
  async _verifyLatestBillAmount(piAmount, label) {
    const billAmt = await this._amountOf(this.firstRowBillAmount);
    const dueAmt  = await this._amountOf(this.firstRowDueAmount);
    console.log(`${label} Bill Amount: ${billAmt}`);
    console.log(`${label} Due Amount: ${dueAmt}`);
    expect(billAmt).toBe(dueAmt);
    expectClose(dueAmt, piAmount, 0.011, `${label} Due vs PI amount`);
  }

  /** Purchase → Vendor tab → search → open the vendor's profile. */
  async _openVendorProfile(vendorName) {
    await this.vendorTab.click();
    await this.typeInto(this.vendorListSearch, vendorName);
    await this.vendorProfile(vendorName).click();   // auto-waits for the filtered list
    // The header shows "Due ₹0 / Closing Balance ₹0" placeholders until the profile
    // data lands (statement spinner visible) — reading earlier gives false zeros.
    await expect(this.page.locator('.ant-spin-spinning')).toHaveCount(0, { timeout: 30000 });
  }

  /** Vendor → vendor profile → { due, advance, closing }. */
  async _readVendorBalances(vendorName, settleMs, label) {
    await this._openVendorProfile(vendorName);
    await this.settle(settleMs, 'vendor profile balances load');
    const due = await this._amountOf(this.vendorDue);
    console.log(`${label} Due captured: ${due}`);
    const advance = await this._amountOf(this.vendorAdvance);
    console.log(`${label} Advance captured: ${advance}`);
    const closing = await this._amountOf(this.vendorClosingBalance);
    console.log(`${label} Closing Balance captured: ${closing}`);
    return { due, advance, closing };
  }

  /** "Pagination Check and Click Last Page" on the vendor transaction statement. */
  async _clickLastPageIfPaginated() {
    if ((await this.pagination.count()) > 0) {
      console.log('Pagination exists, clicking last page...');
      const lastPage = await this.paginationNumberedItems.last().getAttribute('title');
      await this.paginationPage(lastPage).click();
      await expect(this.paginationActive).toHaveAttribute('title', lastPage);
    } else {
      console.log('Pagination not available, skipping step');
    }
  }

  /** Last page of the statement → closing balance in the last row. */
  async _readStatementClosingBalance(label) {
    await this._clickLastPageIfPaginated();
    await this.settle(2000, 'statement page renders');
    const tscb = await this._amountOf(this.statementClosingBalance);
    console.log(`${label} TSCB captured: ${tscb}`);
    return tscb;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Test cases
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Stock up the flow's item with a plain PI (no verification). The item is created
   * without opening stock, so a sales flow needs this before it can invoice the item.
   * data: { section, vendorName, pcs, box, bundle }
   */
  async addStockViaPurchaseInvoice(data) {
    const saved = requireSection(data.section, ['itemName']);
    await this._openInvoiceApp(2000);
    await this._startNewPurchaseInvoice(data.vendorName);
    await this._addItemLines(saved.itemName, data);
    await this.settle(2000, 'line amounts recalculate');
    await this._save();
    await this.settle(5000, 'PI save + stock posting');
    console.log(`Stocked up ${saved.itemName}: ${data.pcs} pcs, ${data.box} box, ${data.bundle} bundle`);
  }

  /** TC: read opening stock, create a PI (pcs/box/bundle), stock == initial + added. */
  async createPurchaseInvoiceAndVerifyStock(data) {
    const saved = requireSection(data.section, ['itemName', 'boxconversion', 'bundleconversion']);
    await this._openInvoiceApp(2000);

    console.log('Step 1: capturing the existing Box / Bundle / Pcs stock...');
    const initial = await this.itemPage.readItemStock(saved.itemName, saved.boxconversion, saved.bundleconversion);
    const initialtotalqty = initial.total;
    console.log(`Initial Total Quantity: ${initialtotalqty}`);

    console.log('Step 2: creating the Purchase Invoice...');
    await this._startNewPurchaseInvoice(data.vendorName);
    await this._addItemLines(saved.itemName, { pcs: data.crPcs, box: data.crBox, bundle: data.crBundle });
    await this.settle(2000, 'line amounts recalculate');
    const addpcs    = await this.readNumber(this.line1Qty);
    const addbox    = await this.readNumber(this.line2Qty);
    const addbundle = await this.readNumber(this.line3Qty);
    console.log(`Added Pcs: ${addpcs}, Box: ${addbox}, Bundle: ${addbundle}`);
    await this._save();
    await this.settle(5000, 'PI save + stock posting');
    const addtotalqty = addpcs + (addbox * saved.boxconversion) + (addbundle * saved.bundleconversion);
    console.log(`Added Total Quantity: ${addtotalqty}`);

    console.log('Step 3: re-checking inventory...');
    const current = await this._readStock(saved, 'New');
    if (!current.outOfStock) {
      const newtotalqty = current.total;
      expectClose(newtotalqty, initialtotalqty + addtotalqty, 0.01, 'New total qty');
      saveSection(data.section, { newtotalqty, initialtotalqty });
    }
  }

  /** TC: edit the latest PI quantities, stock == initial + edited total. */
  async editPurchaseInvoiceAndVerifyStock(data) {
    await this._openInvoiceApp(6000);
    const saved = requireSection(data.section, ['itemName', 'boxconversion', 'bundleconversion', 'initialtotalqty']);

    console.log('Opening the latest Purchase Invoice for edit...');
    await this.purchaseTab.click();
    await this._openLatestInvoice();
    await this.editBtn.click();
    await this.settle(6000, 'edit form loads');

    console.log('Editing quantities...');
    await this.fillInto(this.editLine1Qty, data.edPcs);
    await this.fillInto(this.editLine2Qty, data.edBox);
    await this.fillInto(this.editLine3Qty, data.edBundle);
    await this.page.mouse.click(0, 0);
    await this.settle(2000, 'line amounts recalculate');

    const uomQty = (unit) =>
      this.page.locator('tr').filter({ has: this.containing(this.editUomField, unit) }).locator(this.editUomQty).first();
    const editPcs    = parseFloat(await uomQty('pcs').inputValue());
    const editBox    = parseFloat(await uomQty('box').inputValue());
    const editBundle = parseFloat(await uomQty('bundle').inputValue());
    console.log(`Edited Pcs: ${editPcs}, Box: ${editBox}, Bundle: ${editBundle}`);
    await this._save();
    await this.settle(4000, 'PI update + stock posting');
    const editTotalqty = editPcs + (editBox * saved.boxconversion) + (editBundle * saved.bundleconversion);
    console.log(`Edited Total Quantity: ${editTotalqty}`);

    console.log('Re-checking inventory...');
    const current = await this._readStock(saved, 'Updated');
    const updatedTotalqty = current.total;
    if (!current.outOfStock) {
      expectClose(updatedTotalqty, Number(saved.initialtotalqty) + editTotalqty, 0.01, 'Updated total qty');
    }
    saveSection(data.section, { updatedTotalqty, editTotalqty });
  }

  /** TC: delete the latest PI, it leaves the list, stock returns to the initial stock. */
  async deletePurchaseInvoiceAndVerifyStock(data) {
    await this._openInvoiceApp(6000);

    console.log('Capturing the latest bill number...');
    await this.purchaseTab.click();
    const billNo = (await this._textOf(this.firstRowBillNo)).trim();
    console.log(`Captured Bill No: ${billNo}`);
    await this.settle(2000, 'PI list settles');
    await this._openLatestInvoice();
    await this._deleteOpenInvoice();
    await this.settle(2000, 'PI delete');

    const saved = requireSection(data.section,
      ['itemName', 'boxconversion', 'bundleconversion', 'initialtotalqty', 'editTotalqty', 'updatedTotalqty']);
    await expect(this.invoiceTableRows.filter({ hasText: billNo })).toHaveCount(0);
    await this.settle(4000, 'stock reversal posts');

    console.log('Inventory check after delete...');
    const current = await this._readStock(saved, 'Final');
    const finalTotalqty = current.total;
    if (!current.outOfStock) {
      expectClose(finalTotalqty, Number(saved.updatedTotalqty) - Number(saved.editTotalqty), 0.01, 'Final total qty vs updated-edit');
      expectClose(finalTotalqty, Number(saved.initialtotalqty), 0.01, 'Final total qty vs initial');
    }
    saveSection(data.section, { finalTotalqty, billNo });
  }

  /**
   * TC: create → edit → delete a PI with discounts / shipping / TDS / adjustment and check
   * vendor Due, Advance, Closing Balance, Transaction Statement closing balance and the journal.
   */
  async createEditDeletePurchaseInvoiceAndVerifyVendorBalances(data) {
    await this._openInvoiceApp(2000);
    const vendor = data.vendorName;

    // ── Step 1: existing vendor balances ──
    console.log('Step 1: capturing existing vendor balances...');
    await this.purchaseTab.click();
    await this._openVendorProfile(vendor);
    await this.settle(2000, 'vendor profile balances load');
    const existingDue = await this._amountOf(this.vendorDue);
    console.log(`Existing Due captured: ${existingDue}`);
    const existingAdvance = await this._amountOf(this.vendorAdvance);
    console.log(`Existing Advance captured: ${existingAdvance}`);
    await this._amountOf(this.vendorClosingBalance);
    // The old flow reads the cell but then derives the balance from due - advance
    const existingClosingBalance = existingDue - existingAdvance;
    console.log(`Existing Closing Balance captured: ${existingClosingBalance}`);

    // ── Step 2: create PI ──
    console.log('Step 2: creating the Purchase Invoice with discounts / shipping / TDS / adjustment...');
    const saved = requireSection(data.section, ['itemName']);
    await this._startNewPurchaseInvoice(vendor);
    await this._forceClick(this.placeOfSupply);
    await this.page.keyboard.type(data.placeOfSupply);
    await this.placeOfSupplyOption.click();
    await this._addItemLines(saved.itemName, { pcs: data.crPcs2, box: data.crBox2, bundle: data.crBundle2 });
    await this.fillInto(this.line1Rate, data.pcsRate);
    await this.fillInto(this.line2Rate, data.boxRate);
    await this.fillInto(this.line3Rate, data.bundleRate);
    await this.fillInto(this.line1Discount, data.pcsDiscount);
    await this.fillInto(this.line2Discount, data.boxDiscount);
    await this.fillInto(this.line3Discount, data.bundleDiscount);
    await this._forceClick(this.discountTypeDropdown);
    await this.discountTypeAmount.click();
    await this.fillInto(this.discountPrice, data.summaryDiscount);
    await this.typeInto(this.shippingCost, data.shippingCost);
    await this.clickSelect(this.tdsDropdown);
    await this.settle(1000, 'TDS options render');
    await this.tdsDividend.click();
    await this.clickSelect(this.adjustmentTypeDropdown);
    await this.adjustmentAddition.click();
    await this.typeInto(this.adjustmentInput, data.adjustment);
    await this.settle(2000, 'PI total recalculates');
    const piAmount = money(await this.readText(this.purchaseTotal));
    console.log(`Purchase Invoice Amount captured: ${piAmount}`);
    await this._save();
    await this.settle(4000, 'PI save');
    await this._verifyLatestBillAmount(piAmount, 'Created');
    await this.settle(2000, 'ledger posting');

    const current = await this._readVendorBalances(vendor, 2000, 'Current');
    expectClose(current.due, existingDue + piAmount, 0.011, 'Current Due');
    expect(current.advance).toBe(existingAdvance);
    expectClose(current.closing, (existingDue + piAmount) - current.advance, 0.011, 'Current Closing Balance');
    const currentTSCB = await this._readStatementClosingBalance('Current');
    expectClose(currentTSCB, current.closing, 0.011, 'Current TSCB vs closing balance');
    expectClose(currentTSCB, (existingDue + piAmount) - current.advance, 0.011, 'Current TSCB vs expected');
    await this.settle(1000, 'before edit');

    // ── Edit flow ──
    console.log('Edit flow: opening the created PI...');
    await this.purchaseTab.click();
    await this.settle(2000, 'PI list loads');
    await this._openLatestInvoice();
    await this._verifyJournalBalanced('Created');
    await this.editBtn.click();
    await this.settle(4000, 'edit form loads');
    await this.fillInto(this.editLine1Qty, data.edPcs2);
    await this.fillInto(this.editLine2Qty, data.edBox2);
    await this.fillInto(this.editLine3Qty, data.edBundle2);
    await this.fillInto(this.editLine1Rate, data.edPcsRate);
    await this.fillInto(this.editLine2Rate, data.edBoxRate);
    await this.fillInto(this.editLine3Rate, data.edBundleRate);
    await this.fillInto(this.editLine1Discount, data.edPcsDiscount);
    await this.fillInto(this.editLine2Discount, data.edBoxDiscount);
    await this.fillInto(this.editLine3Discount, data.edBundleDiscount);
    await this.fillInto(this.discountPrice, data.edSummaryDiscount);
    await this.fillInto(this.shippingCost, data.edShippingCost);
    await this.fillInto(this.adjustmentInput, data.edAdjustment);
    await this.settle(2000, 'PI total recalculates');
    const edpiAmount = money(await this.readText(this.purchaseTotal));
    console.log(`Edited Purchase Invoice Amount captured: ${edpiAmount}`);
    await this._save();
    await this.settle(4000, 'PI update');
    await this._verifyLatestBillAmount(edpiAmount, 'Edited');
    await this.settle(2000, 'ledger posting');

    const updated = await this._readVendorBalances(vendor, 2000, 'Updated');
    expectClose(updated.due, existingDue + edpiAmount, 0.011, 'Updated Due');
    expectClose(updated.advance, existingAdvance, 0.011, 'Updated Advance');
    expectClose(updated.closing, (existingDue + edpiAmount) - updated.advance, 0.011, 'Updated Closing Balance');
    const updatedTSCB = await this._readStatementClosingBalance('Updated');
    expectClose(updatedTSCB, updated.closing, 0.011, 'Updated TSCB vs closing balance');
    expectClose(updatedTSCB, (existingDue + edpiAmount) - updated.advance, 0.011, 'Updated TSCB vs expected');

    // ── Delete flow ──
    console.log('Delete flow: opening the edited PI...');
    await this.purchaseTab.click();
    await this.settle(2000, 'PI list loads');
    await this._openLatestInvoice();
    await this._verifyJournalBalanced('Edited');
    await this._deleteOpenInvoice();
    await this.settle(4000, 'PI delete + ledger reversal');

    const final = await this._readVendorBalances(vendor, 5000, 'Final');
    expectClose(final.due, existingDue, 0.011, 'Final Due vs existing');
    expectClose(final.due, updated.due - edpiAmount, 0.011, 'Final Due vs updated-edited');
    expect(final.advance).toBe(existingAdvance);
    expectClose(final.closing, existingClosingBalance, 0.01, 'Final Closing Balance vs existing');
    expectClose(final.closing, updated.due - edpiAmount - final.advance, 0.011, 'Final Closing Balance vs expected');
    const finalTSCB = await this._readStatementClosingBalance('Final');
    expect(finalTSCB).toBe(final.closing);
    expectClose(finalTSCB, updated.due - edpiAmount - final.advance, 0.011, 'Final TSCB vs expected');
    console.log('Vendor balances verified across create / edit / delete.');
  }
}

module.exports = { PurchaseInvoicePage };
