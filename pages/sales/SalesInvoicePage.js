'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { ItemPage } = require('../inventory/ItemPage');
const { saveSection, requireSection } = require('../../utils/flowStore');
const { money, expectClose } = require('../../utils/stockMath');

/**
 * Invoice app → Sales: create / edit / cancel / delete a Sales Invoice with pcs, box and
 * bundle lines of the flow's item, and verify
 *   - the item stock on the Inventory tab after each action, and
 *   - the customer Due / Advance / Closing Balance, Transaction Statement closing balance
 *     and the invoice Journal (amount flow).
 * `data.section` is the runtime-store section shared with the item + stock-view POMs
 * (normally 'salesFlowData').
 */
class SalesInvoicePage extends AppBasePage {

  constructor(page) {
    super(page);
    this.itemPage = new ItemPage(page);

    // Navigation
    this.salesTab    = this.loc('//a[text()="Sales"]');
    this.salesBillMenu = this.loc('//span[text()="Sales Bill"]');
    this.customerTab   = this.loc('//span[text()="Customer"]');
    this.customerProfile = (name) => this.loc(`//div[text()="${name}"]`);

    // Sales invoice list
    // BRITTLE: first list row by position — assumes newest invoice is on top
    this.firstInvoiceRow = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]');
    // BRITTLE: first row, positional columns (3 = bill no, 6 = bill amount, 7 = due amount)
    this.firstRowBillNo  = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[3]');
    this.firstRowBillAmt = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[6]');
    this.firstRowDueAmt  = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[7]');
    this.invoiceTableRows = this.page.locator('table tbody tr');

    // New invoice — customer step
    this.newInvoiceBtn = this.loc("//span[text()='New Sales Invoice ']");
    this.customerDropdown = this.page.locator('#si_select_cus');
    this.customerOption   = (name) => this.loc(`//div[text()='${name}']`);
    // BRITTLE: proceed button — structural CSS, no text anchor
    this.customerProceedBtn = this.page.locator('.ant-form > .ant-btn > span');

    // Invoice form — header
    this.placeOfSupply = this.page.locator('#place_of_supply');
    this.placeOfSupplyOption = (name) => this.loc(`//div[text()="${name}"]`);

    // Invoice form — item lines
    // The empty "Add item…" auto-complete row is always the last one
    this.itemSearch = this.page.locator('.ant-select-auto-complete').last();
    this.itemOption = (name) => this.containing('.ant-select-item-option-content', name);
    // Line inputs use the app's row ids: line 1 → quantity1 / unit1 / discount1, line 2 → *3, line 3 → *5
    this.qtyLine1 = this.loc('//input[@id="quantity1"]');
    this.qtyLine2 = this.loc('//input[@id="quantity3"]');
    this.qtyLine3 = this.loc('//input[@id="quantity5"]');
    this.uomLine2 = this.loc('//input[@id="unit3"]');
    this.uomLine3 = this.loc('//input[@id="unit5"]');
    this.uomBoxOption = this.loc("//div[text()='box']");
    // BRITTLE: 2nd "bundle" option (first one belongs to an earlier line's dropdown)
    this.uomBundleOption = this.loc("(//div[@title='bundle'])[2]");
    this.discountLine1 = this.page.locator('#discount1');
    this.discountLine2 = this.page.locator('#discount3');
    this.discountLine3 = this.page.locator('#discount5');

    // Edit form — item lines (rows re-indexed 0..2; qty found by the row's UOM)
    this.editUomField = 'span.ant-select-selection-item';
    this.editQtyInput = 'input[id^="quantity"]';
    this.editDiscountLine1 = this.page.locator('#discount0');
    this.editDiscountLine2 = this.page.locator('#discount1');
    this.editDiscountLine3 = this.page.locator('#discount2');

    // Invoice form — summary
    this.discountTypeDropdown = this.page.locator('#discount_type');
    this.option = (text) => this.loc(`//div[text()='${text}']`);
    this.discountPrice = this.page.locator('#discount_price');
    this.shippingCost  = this.page.locator('#shipping_cost');
    // BRITTLE: auto-generated antd id rc_select_11
    this.tdsDropdown = this.page.locator('#rc_select_11');
    this.tdsOption = (name) => this.loc(`//div[text()="${name}"]`);
    // Adjustment type select — the one showing the default "Subtract"
    this.adjustmentTypeDropdown = this.page.locator('.ant-select').filter({ has: this.page.locator('.ant-select-selection-item[title="Subtract"]') }).locator('input');
    this.adjustmentOption = (name) => this.loc(`//div[text()="${name}"]`);
    this.adjustmentInput = this.page.locator('#adjustment');
    this.salesTotal      = this.page.locator('#sales_total');
    // BRITTLE: generic primary-button CSS
    this.saveBtn = this.page.locator('.ant-btn-primary > span');
    // Only present while the invoice form is open — used to confirm the save went through
    this.saveDraftBtn = this.page.getByRole('button', { name: 'Save As Draft' });
    // "<n> <uom> left" hint under each line qty (red when the line exceeds stock)
    this.stockLeftHints = this.page.getByText(/ left$/);

    // Invoice preview drawer
    // A cancelled invoice opens in a plain dialog (no #billsDrawer) that shows the cancel reason
    this.cancelledPreview = this.page.getByRole('dialog').filter({ hasText: 'CANCELLED REASON' });
    this.editBtn       = this.loc("//span[text()='Edit']");
    this.cancelBtn     = this.loc("//span[text()='Cancel']");
    this.deleteBtn     = this.loc("//*[normalize-space(text())='Delete']");
    this.yesBtn        = this.loc("//span[text()='Yes']");
    this.cancelComments = this.loc('//textarea[@id="comments"]');
    this.cancelSaveBtn = this.loc('//span[text()="Save"]');
    this.previewCloseBtn = this.loc('//span[text()="Close"]');

    // Journal (preview drawer)
    this.journalTable = this.loc('//div[@class="ant-collapse-content ant-collapse-content-active"]');
    // BRITTLE: debit/credit totals — nth-child + full inline style attribute
    this.journalDebit  = this.page.locator(':nth-child(2) > [style="display: flex; font-size: 16px; font-weight: 700; line-height: 24px; letter-spacing: 0.15px;"] > div');
    this.journalCredit = this.page.locator(':nth-child(3) > [style="display: flex; font-size: 16px; font-weight: 700; line-height: 24px; letter-spacing: 0.15px;"] > div');

    // Customer profile — balances
    // BRITTLE: CSS-module hashed class (_14rpb_61) + nth-child
    this.customerDue = this.page.locator('._customer_info_header_content_value_14rpb_61 > :nth-child(2) > div');
    // BRITTLE: full inline style attribute
    this.customerAdvance = this.page.locator('[style="display: flex; font-size: 14px; font-weight: 500; line-height: 20px; letter-spacing: 0.1px; color: rgb(16, 75, 252); text-decoration: none;"] > .cursor-pointer');
    // BRITTLE: bare nth-child — matches every 8th child on the page (texts are joined, as in the original)
    this.customerClosingBalance = this.page.locator(':nth-child(8) > div');
    // Transaction statement — last row, last cell
    this.statementClosingBalance = this.loc("//tbody[@class='ant-table-tbody']/tr[last()]/td[last()]");

    // Pagination (transaction statement)
    this.pagination = this.page.locator('ul.ant-pagination');
    this.paginationPages = this.page.locator('ul.ant-pagination li[title]:not([title="Previous Page"]):not([title="Next Page"]):not([title="..."])');
    this.paginationPage = (title) => this.page.locator(`ul.ant-pagination li[title="${title}"]`);
    this.paginationActive = this.page.locator('ul.ant-pagination li.ant-pagination-item-active');
  }

  // ── private helpers ────────────────────────────────────────────────────────

  async _openInvoiceApp(settleMs) {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(settleMs, 'org switch reloads data');
  }

  /** Click with force (antd select inputs that sit under an overlay). */
  async _forceClick(locator) {
    await locator.first().click({ force: true });
  }

  async _readText(locator) {
    return this.readText(locator);
  }

  _savedItem(section) {
    return requireSection(section, ['itemName', 'boxconversion', 'bundleconversion']);
  }

  async _readStock(saved) {
    return this.itemPage.readItemStock(saved.itemName, saved.boxconversion, saved.bundleconversion);
  }

  /** Sales → New Sales Invoice → pick customer → proceed. */
  async _startNewInvoice(data) {
    await this.salesTab.click();
    await this.newInvoiceBtn.click();
    await this.clickSelect(this.customerDropdown);
    await this.customerOption(data.customerName).click();
    await this.customerProceedBtn.click();
    await this.settle(4000, 'invoice form init');
  }

  /** Line 1 = pcs, line 2 = box, line 3 = bundle, all for the same item. */
  async _addItemLines(itemName, data) {
    console.log('Adding pcs / box / bundle lines...');
    await this.typeInto(this.itemSearch, itemName);
    await this.settle(2000, 'item search results');
    await this.itemOption(itemName).click();
    await this.fillInto(this.qtyLine1, data.crPcs);

    await this.typeInto(this.itemSearch, itemName);
    await this.settle(2000, 'item search results');
    await this.itemOption(itemName).click();
    await this.fillInto(this.qtyLine2, data.crBox);
    await this._forceClick(this.uomLine2);
    await this.uomBoxOption.click();

    await this.typeInto(this.itemSearch, itemName);
    await this.settle(2000, 'item search results');
    await this.itemOption(itemName).click();
    await this.fillInto(this.qtyLine3, data.crBundle);
    await this._forceClick(this.uomLine3);
    await this.uomBundleOption.click();
  }

  /** Qty input of the edit-form row whose UOM select shows `uom`. */
  _editQty(uom) {
    return this.page
      .locator('tr')
      .filter({ has: this.containing(this.editUomField, uom) })
      .locator(this.editQtyInput)
      .first();
  }

  async _fillEditQuantities(data) {
    console.log('Editing pcs / box / bundle quantities...');
    for (const [uom, qty] of [['pcs', data.edPcs], ['box', data.edBox], ['bundle', data.edBundle]]) {
      await this._editQty(uom).click();
      await this.fillInto(this._editQty(uom), qty);
    }
  }

  /**
   * Save, then make sure the form actually closed. The app blocks the save without a
   * message when a line asks for more than the stock — fail here with the stock hints
   * instead of timing out on the next navigation click.
   */
  async _saveInvoice() {
    const formOpen = await this.saveDraftBtn.isVisible().catch(() => false);
    await this.saveBtn.click();
    if (!formOpen) return;
    try {
      await expect(this.saveDraftBtn).toBeHidden({ timeout: 15000 });
    } catch {
      const hints = await this.stockLeftHints.allInnerTexts().catch(() => []);
      throw new Error(`Sales Invoice was not saved — form still open. Line stock: ${hints.join(', ') || 'n/a'}`);
    }
  }

  /** Open the newest invoice's preview from the Sales Bill list. */
  async _openFirstInvoiceFromSalesBill() {
    await this.salesBillMenu.click();
    await this.settle(2000, 'sales bill list loads');
    await this.firstInvoiceRow.click();
    await this.settle(4000, 'invoice preview drawer loads');
  }

  async _cancelOpenInvoice(comments, settleAfterClose) {
    console.log('Cancelling the Sales Invoice...');
    await this.cancelBtn.click();
    await this.yesBtn.click();
    await this.settle(1000, 'cancel comments modal opens');
    await this.typeInto(this.cancelComments, comments);
    await this.cancelSaveBtn.click();
    await this.settle(4000, 'cancel saved');
    await this.previewCloseBtn.click();
    await this.settle(settleAfterClose, 'preview closes, list refresh');
  }

  async _deleteOpenInvoice() {
    console.log('Deleting the Sales Invoice...');
    await this.deleteBtn.click();
    await this.yesBtn.click();
  }

  /** Journal in the open preview: visible, no "Unknown Account", debit ≈ credit. */
  async _verifyJournalBalanced(label) {
    console.log(`Verifying journal (${label})...`);
    await this.journalTable.scrollIntoViewIfNeeded();
    await expect(this.journalTable).toBeVisible();
    await expect(this.journalTable).not.toContainText('Unknown Account');
    const debit  = money(await this._readText(this.journalDebit));
    const credit = money(await this._readText(this.journalCredit));
    console.log(`${label} Debit Amount: ${debit}`);
    console.log(`${label} Credit Amount: ${credit}`);
    expectClose(debit, credit, 0.021, `${label} debit vs credit`);
  }

  /** First list row: bill amount must equal due amount and ≈ the invoice total. */
  async _verifyFirstRowAmounts(expectedAmount, label) {
    const billAmt = money(await this._readText(this.firstRowBillAmt));
    const dueAmt  = money(await this._readText(this.firstRowDueAmt));
    console.log(`${label} Bill Amount: ${billAmt}`);
    console.log(`${label} Due Amount: ${dueAmt}`);
    expect(billAmt).toBe(dueAmt);
    expectClose(dueAmt, expectedAmount, 0.011, `${label} dueAmt vs invoice amount`);
  }

  /**
   * Open the customer profile and wait for its balances API. client-info can take 6s+;
   * until it answers the header shows ₹ 0 for Due / Advance, which a fixed wait misread.
   */
  async _openCustomerProfile(customerName) {
    await this.customerTab.click();
    await this.settle(2000, 'customer list loads');
    const clientInfo = this.page.waitForResponse(
      (res) => res.url().includes('/client/client-info/') && res.ok(),
      { timeout: 60000 },
    );
    await this.customerProfile(customerName).click();
    await clientInfo;
    await this.settle(2000, 'customer profile balances render');
  }

  async _readCustomerDue() {
    return money(await this._readText(this.customerDue));
  }

  async _readCustomerAdvance() {
    return money(await this._readText(this.customerAdvance));
  }

  async _readCustomerClosingBalance() {
    return money(await this._readText(this.customerClosingBalance));
  }

  /** Transaction statement: jump to the last page (if paginated) and read the closing balance. */
  async _readStatementClosingBalance() {
    await this._goToLastPage();
    await this.settle(2000, 'statement page renders');
    return money(await this._readText(this.statementClosingBalance));
  }

  async _goToLastPage() {
    if ((await this.pagination.count()) > 0) {
      console.log('Pagination exists, clicking last page...');
      const lastPage = await this.paginationPages.last().getAttribute('title');
      await this.paginationPage(lastPage).click();
      await expect(this.paginationActive).toHaveAttribute('title', lastPage);
    } else {
      console.log('Pagination not available, skipping step');
    }
  }

  // ── test-case methods ──────────────────────────────────────────────────────

  /** TC: read stock, create SI (pcs + box + bundle), stock must drop by the invoiced pcs. */
  async createSalesInvoiceAndVerifyStock(data) {
    const saved = this._savedItem(data.section);
    const { itemName, boxconversion, bundleconversion } = saved;
    await this._openInvoiceApp(2000);

    console.log('Step 1: capturing current inventory...');
    const initial = await this._readStock(saved);
    const initialtotalqty = initial.outOfStock ? 0 : initial.total;
    console.log(`Initial Total Quantity: ${initialtotalqty}`);

    console.log('Step 2: creating Sales Invoice...');
    await this._startNewInvoice(data);
    await this._addItemLines(itemName, data);
    await this.settle(2000, 'line totals recalculate');
    const addpcs    = await this.readNumber(this.qtyLine1);
    const addbox    = await this.readNumber(this.qtyLine2);
    const addbundle = await this.readNumber(this.qtyLine3);
    console.log(`Added Pcs: ${addpcs}, Box: ${addbox}, Bundle: ${addbundle}`);
    await this._saveInvoice();
    await this.settle(5000, 'invoice save');
    const addtotalqty = addpcs + (addbox * boxconversion) + (addbundle * bundleconversion);
    console.log(`Added Total Quantity: ${addtotalqty}`);

    console.log('Step 3: re-checking inventory...');
    const after = await this._readStock(saved);
    if (!after.outOfStock) {
      const newtotalqty = after.total;
      console.log(`New Total Quantity: ${newtotalqty}`);
      expectClose(newtotalqty, initialtotalqty - addtotalqty, 0.01, 'newtotalqty');
      saveSection(data.section, { newtotalqty, initialtotalqty });
    }
  }

  /** TC: edit the newest SI quantities; stock must equal initial − edited pcs. */
  async editSalesInvoiceAndVerifyStock(data) {
    await this._openInvoiceApp(6000);
    const saved = this._savedItem(data.section);
    const { boxconversion, bundleconversion } = saved;
    const initialtotalqty = Number(saved.initialtotalqty || 0);

    console.log('Opening the created Sales Invoice for edit...');
    await this.salesTab.click();
    await this.firstInvoiceRow.click();
    await this.settle(4000, 'invoice preview drawer loads');
    await this.editBtn.click();
    await this.settle(6000, 'edit form loads');
    await this._fillEditQuantities(data);
    await this.page.mouse.click(0, 0);
    await this.settle(2000, 'line totals recalculate');
    const editPcs    = parseFloat(await this._editQty('pcs').inputValue());
    const editBox    = parseFloat(await this._editQty('box').inputValue());
    const editBundle = parseFloat(await this._editQty('bundle').inputValue());
    console.log(`Edited Pcs: ${editPcs}, Box: ${editBox}, Bundle: ${editBundle}`);
    await this._saveInvoice();
    await this.settle(4000, 'invoice save');
    const editTotalqty = editPcs + (editBox * boxconversion) + (editBundle * bundleconversion);
    console.log(`Edited Total Quantity: ${editTotalqty}`);

    console.log('Re-checking inventory...');
    const stock = await this._readStock(saved);
    let updatedTotalqty = 0;
    if (!stock.outOfStock) {
      updatedTotalqty = stock.total;
      console.log(`Updated Total Quantity: ${updatedTotalqty}`);
      expectClose(updatedTotalqty, initialtotalqty - editTotalqty, 0.01, 'updatedTotalqty');
    }
    saveSection(data.section, { updatedTotalqty, editTotalqty });
  }

  /** TC: cancel the newest SI; stock must return to updated + edited (= initial). */
  async cancelSalesInvoiceAndVerifyStock(data) {
    await this._openInvoiceApp(6000);

    console.log('Opening the created Sales Invoice...');
    await this.salesTab.click();
    await this.settle(2000, 'sales list loads');
    await this.firstInvoiceRow.click();
    await this.settle(4000, 'invoice preview drawer loads');
    await this._cancelOpenInvoice(data.cancelComments, 4000);

    const saved = this._savedItem(data.section);
    const updatedTotalqty = Number(saved.updatedTotalqty || 0);
    const editTotalqty    = Number(saved.editTotalqty || 0);
    const initialtotalqty = Number(saved.initialtotalqty || 0);
    await this.settle(4000, 'stock recalculation after cancel');

    console.log('Inventory check after cancel...');
    const stock = await this._readStock(saved);
    let finalTotalqty = 0;
    if (!stock.outOfStock) {
      finalTotalqty = stock.total;
      console.log(`Final Total Quantity: ${finalTotalqty}`);
      expectClose(finalTotalqty, updatedTotalqty + editTotalqty, 0.01, 'finalTotalqty vs updated+edit');
      expectClose(finalTotalqty, initialtotalqty, 0.01, 'finalTotalqty vs initial');
    }
    saveSection(data.section, { finalTotalqty });
  }

  /** TC: delete the newest SI; row gone, stock must equal updated + edited (= initial). */
  async deleteSalesInvoiceAndVerifyStock(data) {
    await this._openInvoiceApp(6000);

    console.log('Capturing bill number and deleting the Sales Invoice...');
    await this.salesTab.click();
    const billNo = (await this._readText(this.firstRowBillNo)).trim();
    console.log(`Captured Bill No: ${billNo}`);
    await this.settle(2000, 'sales list settles');
    await this.firstInvoiceRow.click();
    await this.settle(4000, 'invoice preview drawer loads');
    await this._deleteOpenInvoice();
    await this.settle(2000, 'delete + list refresh');

    const saved = this._savedItem(data.section);
    const updatedTotalqty = Number(saved.updatedTotalqty || 0);
    const editTotalqty    = Number(saved.editTotalqty || 0);
    const initialtotalqty = Number(saved.initialtotalqty || 0);
    await expect(this.invoiceTableRows.filter({ hasText: billNo })).toHaveCount(0);
    await this.settle(4000, 'stock recalculation after delete');

    console.log('Inventory check after delete...');
    const stock = await this._readStock(saved);
    let endTotalqty = 0;
    if (!stock.outOfStock) {
      endTotalqty = stock.total;
      console.log(`End Total Quantity: ${endTotalqty}`);
      expectClose(endTotalqty, updatedTotalqty + editTotalqty, 0.01, 'endTotalqty vs updated+edit');
      expectClose(endTotalqty, initialtotalqty, 0.01, 'endTotalqty vs initial');
    }
    saveSection(data.section, { billNo, endTotalqty });
  }

  /**
   * TC: create → edit → cancel → delete an SI with discounts / shipping / TDS / adjustment and
   * verify customer Due, Advance, Closing Balance, Transaction Statement closing balance and journal.
   * Runs the four step methods below in order; each can also run as its own test.
   */
  async createEditCancelDeleteAndVerifyCustomerBalances(data) {
    await this.createSalesInvoiceWithChargesAndVerifyCustomerBalances(data);
    await this.editSalesInvoiceWithChargesAndVerifyCustomerBalances(data);
    await this.cancelSalesInvoiceAndVerifyCustomerBalances(data);
    await this.deleteCancelledSalesInvoiceAndVerifyCustomerBalances(data);
  }

  /** Open the invoice app on the Sales tab and read back the balances an earlier step saved. */
  async _resumeCustomerBalanceFlow(data, keys) {
    await this._openInvoiceApp(2000);
    await this.salesTab.click();
    const saved = requireSection(data.section, keys);
    return Object.fromEntries(keys.map((k) => [k, Number(saved[k])]));
  }

  /**
   * Customer-balance step 1: capture existing balances, create an SI with discounts /
   * shipping / TDS / adjustment, verify Due / Advance / Closing Balance / TS closing balance.
   * Writes to `data.section`: cbExistingDue, cbExistingAdvance, cbExistingClosing, siAmount.
   */
  async createSalesInvoiceWithChargesAndVerifyCustomerBalances(data) {
    await this._openInvoiceApp(2000);

    // ── existing balances ──
    console.log('Capturing existing customer balances...');
    await this.salesTab.click();
    await this._openCustomerProfile(data.customerName);
    const existingDue = await this._readCustomerDue();
    console.log(`Existing Due captured: ${existingDue}`);
    const existingAdvance = await this._readCustomerAdvance();
    console.log(`Existing Advance captured: ${existingAdvance}`);
    await this._readCustomerClosingBalance(); // read as in the original; value is derived below
    const existingClosingBalance = existingDue - existingAdvance;
    console.log(`Existing Closing Balance captured: ${existingClosingBalance}`);

    // ── create ──
    console.log('Creating Sales Invoice with discounts / shipping / TDS / adjustment...');
    await this._startNewInvoice(data);
    await this._forceClick(this.placeOfSupply);
    await this.page.keyboard.type(data.placeOfSupplyQuery);
    await this.placeOfSupplyOption(data.placeOfSupply).click();
    const { itemName } = requireSection(data.section, ['itemName']);
    await this._addItemLines(itemName, data);
    await this.fillInto(this.discountLine1, data.pcsDiscount);
    await this.fillInto(this.discountLine2, data.boxDiscount);
    await this.fillInto(this.discountLine3, data.bundleDiscount);
    await this._forceClick(this.discountTypeDropdown);
    await this.option(data.discountType).click();
    await this.fillInto(this.discountPrice, data.summaryDiscount);
    await this.typeInto(this.shippingCost, data.shippingCost);
    await this.clickSelect(this.tdsDropdown);
    await this.settle(1000, 'TDS options render');
    await this.tdsOption(data.tdsOption).click();
    await this.clickSelect(this.adjustmentTypeDropdown);
    await this.adjustmentOption(data.adjustmentType).click();
    await this.typeInto(this.adjustmentInput, data.adjustment);
    await this.settle(2000, 'invoice total recalculates');
    const siAmount = money(await this.readText(this.salesTotal));
    console.log(`Sales Invoice Amount captured: ${siAmount}`);
    await this._saveInvoice();
    await this.settle(4000, 'invoice save + list refresh');
    await this._verifyFirstRowAmounts(siAmount, 'Created');
    await this.settle(3000, 'ledger posting');

    console.log('Verifying balances after create...');
    await this._openCustomerProfile(data.customerName);
    const CurrentDue = await this._readCustomerDue();
    console.log(`Current Due captured: ${CurrentDue}`);
    expectClose(CurrentDue, existingDue + siAmount, 0.011, 'CurrentDue');
    const CurrentAdvance = await this._readCustomerAdvance();
    console.log(`Current Advance captured: ${CurrentAdvance}`);
    expect(CurrentAdvance).toBe(existingAdvance);
    const CurrentClosingBalance = await this._readCustomerClosingBalance();
    console.log(`Current Closing Balance captured: ${CurrentClosingBalance}`);
    expectClose(CurrentClosingBalance, (existingDue + siAmount) - CurrentAdvance, 0.011, 'CurrentClosingBalance');
    const CurrentTSCB = await this._readStatementClosingBalance();
    console.log(`Current TSCB captured: ${CurrentTSCB}`);
    expectClose(CurrentTSCB, CurrentClosingBalance, 0.011, 'CurrentTSCB vs CurrentClosingBalance');
    expectClose(CurrentTSCB, (existingDue + siAmount) - CurrentAdvance, 0.011, 'CurrentTSCB vs expected');
    saveSection(data.section, {
      cbExistingDue: existingDue,
      cbExistingAdvance: existingAdvance,
      cbExistingClosing: existingClosingBalance,
      siAmount,
    });
  }

  /**
   * Customer-balance step 2: edit the newest SI (qty / discount / charges), verify balances.
   * Reads cbExistingDue, cbExistingAdvance; writes edsiAmount, cbUpdatedDue.
   */
  async editSalesInvoiceWithChargesAndVerifyCustomerBalances(data) {
    const { cbExistingDue: existingDue, cbExistingAdvance: existingAdvance } =
      await this._resumeCustomerBalanceFlow(data, ['cbExistingDue', 'cbExistingAdvance']);

    console.log('Editing the Sales Invoice...');
    await this._openFirstInvoiceFromSalesBill();
    await this._verifyJournalBalanced('Created');
    await this.editBtn.click();
    await this.settle(4000, 'edit form loads');
    await this._fillEditQuantities(data);
    await this.fillInto(this.editDiscountLine1, data.edPcsDiscount);
    await this.fillInto(this.editDiscountLine2, data.edBoxDiscount);
    await this.fillInto(this.editDiscountLine3, data.edBundleDiscount);
    await this.fillInto(this.discountPrice, data.edSummaryDiscount);
    await this.fillInto(this.shippingCost, data.edShippingCost);
    await this.fillInto(this.adjustmentInput, data.edAdjustment);
    await this.settle(2000, 'invoice total recalculates');
    const edsiAmount = money(await this.readText(this.salesTotal));
    console.log(`Edited Sales Invoice Amount captured: ${edsiAmount}`);
    await this._saveInvoice();
    await this.settle(4000, 'invoice save + list refresh');
    await this._verifyFirstRowAmounts(edsiAmount, 'Edited');
    await this.settle(4000, 'ledger posting');

    console.log('Verifying balances after edit...');
    await this._openCustomerProfile(data.customerName);
    const updatedDue = await this._readCustomerDue();
    console.log(`Updated Due captured: ${updatedDue}`);
    expectClose(updatedDue, existingDue + edsiAmount, 0.011, 'updatedDue');
    const updatedAdvance = await this._readCustomerAdvance();
    console.log(`Updated Advance captured: ${updatedAdvance}`);
    expectClose(updatedAdvance, existingAdvance, 0.011, 'updatedAdvance');
    const updatedClosingBalance = await this._readCustomerClosingBalance();
    console.log(`Updated Closing Balance captured: ${updatedClosingBalance}`);
    expectClose(updatedClosingBalance, (existingDue + edsiAmount) - updatedAdvance, 0.011, 'updatedClosingBalance');
    const updatedTSCB = await this._readStatementClosingBalance();
    console.log(`Updated TSCB captured: ${updatedTSCB}`);
    expectClose(updatedTSCB, updatedClosingBalance, 0.011, 'updatedTSCB vs updatedClosingBalance');
    expectClose(updatedTSCB, (existingDue + edsiAmount) - updatedAdvance, 0.011, 'updatedTSCB vs expected');

    saveSection(data.section, { edsiAmount, cbUpdatedDue: updatedDue });
  }

  /**
   * Customer-balance step 3: cancel the newest SI, verify balances return to the pre-create values.
   * Reads cbExistingDue, cbExistingAdvance, cbExistingClosing, edsiAmount, cbUpdatedDue;
   * writes cbFinalAdvance, cbFinalClosing.
   */
  async cancelSalesInvoiceAndVerifyCustomerBalances(data) {
    const {
      cbExistingDue: existingDue, cbExistingAdvance: existingAdvance,
      cbExistingClosing: existingClosingBalance, edsiAmount, cbUpdatedDue: updatedDue,
    } = await this._resumeCustomerBalanceFlow(data,
      ['cbExistingDue', 'cbExistingAdvance', 'cbExistingClosing', 'edsiAmount', 'cbUpdatedDue']);

    console.log('Cancelling the Sales Invoice...');
    await this._openFirstInvoiceFromSalesBill();
    await this._verifyJournalBalanced('Edited');
    await this._cancelOpenInvoice(data.cancelComments, 2000);

    console.log('Verifying balances after cancel...');
    await this._openCustomerProfile(data.customerName);
    const finalDue = await this._readCustomerDue();
    console.log(`Final Due captured: ${finalDue}`);
    expectClose(finalDue, existingDue, 0.011, 'finalDue vs existingDue');
    expectClose(finalDue, updatedDue - edsiAmount, 0.011, 'finalDue vs updatedDue - edsiAmount');
    const finalAdvance = await this._readCustomerAdvance();
    console.log(`Final Advance captured: ${finalAdvance}`);
    expect(finalAdvance).toBe(existingAdvance);
    const finalClosingBalance = await this._readCustomerClosingBalance();
    console.log(`Final Closing Balance captured: ${finalClosingBalance}`);
    expectClose(finalClosingBalance, existingClosingBalance, 0.01, 'finalClosingBalance vs existing');
    expectClose(finalClosingBalance, updatedDue - edsiAmount - finalAdvance, 0.011, 'finalClosingBalance vs expected');
    const finalTSCB = await this._readStatementClosingBalance();
    console.log(`Final TSCB captured: ${finalTSCB}`);
    expect(finalTSCB).toBe(finalClosingBalance);
    expectClose(finalTSCB, updatedDue - edsiAmount - finalAdvance, 0.011, 'finalTSCB vs expected');

    saveSection(data.section, { cbFinalAdvance: finalAdvance, cbFinalClosing: finalClosingBalance });
  }

  /**
   * Customer-balance step 4: delete the cancelled SI, verify balances are unchanged by it.
   * Reads cbExistingDue, cbExistingAdvance, cbExistingClosing, edsiAmount, cbUpdatedDue,
   * cbFinalAdvance, cbFinalClosing.
   */
  async deleteCancelledSalesInvoiceAndVerifyCustomerBalances(data) {
    const {
      cbExistingDue: existingDue, cbExistingAdvance: existingAdvance,
      cbExistingClosing: existingClosingBalance, edsiAmount, cbUpdatedDue: updatedDue,
      cbFinalAdvance: finalAdvance, cbFinalClosing: finalClosingBalance,
    } = await this._resumeCustomerBalanceFlow(data, [
      'cbExistingDue', 'cbExistingAdvance', 'cbExistingClosing', 'edsiAmount', 'cbUpdatedDue',
      'cbFinalAdvance', 'cbFinalClosing',
    ]);

    console.log('Deleting the cancelled Sales Invoice...');
    await this._openFirstInvoiceFromSalesBill();
    await expect(this.cancelledPreview).toBeVisible();
    await expect(this.cancelledPreview).not.toContainText('Journal');
    await this._deleteOpenInvoice();
    await this.settle(4000, 'delete + ledger posting');

    console.log('Verifying balances after delete...');
    await this._openCustomerProfile(data.customerName);
    const endDue = await this._readCustomerDue();
    console.log(`End Due captured: ${endDue}`);
    expectClose(endDue, existingDue, 0.011, 'endDue vs existingDue');
    expectClose(endDue, updatedDue - edsiAmount, 0.011, 'endDue vs updatedDue - edsiAmount');
    const endAdvance = await this._readCustomerAdvance();
    console.log(`End Advance captured: ${endAdvance}`);
    expect(endAdvance).toBe(existingAdvance);
    const endClosingBalance = await this._readCustomerClosingBalance();
    console.log(`End Closing Balance captured: ${endClosingBalance}`);
    expectClose(endClosingBalance, existingClosingBalance, 0.01, 'endClosingBalance vs existing');
    expectClose(endClosingBalance, updatedDue - edsiAmount - finalAdvance, 0.011, 'endClosingBalance vs expected');
    const endTSCB = await this._readStatementClosingBalance();
    console.log(`End TSCB captured: ${endTSCB}`);
    expect(endTSCB).toBe(finalClosingBalance);
    expectClose(endTSCB, updatedDue - edsiAmount - finalAdvance, 0.011, 'endTSCB vs expected');
  }
}

module.exports = { SalesInvoicePage };
