'use strict';

const { expect } = require('@playwright/test');
const { AppBasePage } = require('../base/app-base-page');
const { saveSection, requireSection } = require('../../utils/flowStore');
const { toNumber, expectClose } = require('../../utils/stockMath');

// Rundata section when the caller's data has no `section` (the old serial spec's name).
const DEFAULT_SECTION = 'customerPaymentData';

/** Same parse as the Cypress placeholder blocks: match number, strip commas, trim, parseFloat. */
function parsePlaceholder(val) {
  return parseFloat((String(val).match(/-?\d[\d,]*(?:\.\d+)?/) || ['0'])[0].replace(/,/g, '').trim());
}

/** First number in a string, commas stripped, NaN -> 0 (Due Invoices table parse). */
function firstNumber(str) {
  return parseFloat((String(str).match(/-?\d[\d,]*(?:\.\d+)?/) || ['0'])[0].replace(/,/g, '')) || 0;
}

/**
 * Invoice app → Sales → Payment Received (bulk customer payment: create / edit / delete)
 * and Sales Bill → invoice preview → Receive Payment (payment against one Sales Invoice).
 * Verifies customer Due / Advance / Closing Balance and the transaction-statement closing balance.
 */
class CustomerPaymentPage extends AppBasePage {

  constructor(page) {
    super(page);

    // ── Navigation ─────────────────────────────────────────────────────────
    this.salesTab      = this.loc('//a[text()="Sales"]');
    this.customerTab   = this.loc('//span[text()="Customer"]');
    this.paymentTab    = this.loc('//div[text()="Payment Received"]');
    this.salesBillTab  = this.loc('//span[text()="Sales Bill"]');
    this.salesInvoiceTab = this.loc('//div[@id="tab_sales_invoice"]');

    // ── Customer profile (list → profile header) ───────────────────────────
    this.customerProfile = (name) => this.loc(`//div[text()="${name}"]`);
    // BRITTLE: cusDue — CSS-module hashed class (_14rpb_61) + nth-child
    this.cusDue = this.loc('._customer_info_header_content_value_14rpb_61 > :nth-child(2) > div');
    // BRITTLE: cusAdvance — long inline style-attribute selector
    this.cusAdvance = this.loc('[style="display: flex; font-size: 14px; font-weight: 500; line-height: 20px; letter-spacing: 0.1px; color: rgb(16, 75, 252); text-decoration: none;"] > .cursor-pointer');
    // BRITTLE: cusClosingBalance — bare nth-child, no anchor
    this.cusClosingBalance = this.loc(':nth-child(8) > div');
    // BRITTLE: tsClosingBalance — positional last row / last cell of the transaction statement
    this.tsClosingBalance = this.loc("//tbody[@class='ant-table-tbody']/tr[last()]/td[last()]");

    // ── Pagination ─────────────────────────────────────────────────────────
    this.pagination         = this.page.locator('ul.ant-pagination');
    this.paginationPages    = this.page.locator('ul.ant-pagination li[title]:not([title="Previous Page"]):not([title="Next Page"]):not([title="..."])');
    this.paginationPage     = (title) => this.page.locator(`ul.ant-pagination li[title="${title}"]`);
    this.paginationSelected = this.page.locator('ul.ant-pagination li.ant-pagination-item-active');

    // ── New Payment Received ───────────────────────────────────────────────
    this.newPaymentBtn   = this.loc('//span[text()="New Payment Received "]');
    this.customerSelect  = this.page.locator('#si_select_cus');
    this.customerOption  = (name) => this.loc(`//div[text()='${name}']`);
    this.proceedBtn      = this.loc('//span[text()="Next"]');
    // BRITTLE: paymentScreenDue — inline style-attribute selector + nth-child
    this.paymentScreenDue = this.loc('[style="display: flex; justify-content: space-between;"] > :nth-child(2) > div');
    this.receiveAmtInput   = this.page.locator('#receiveAmount');
    this.paymentFieldAlert = this.loc('//div[text()="Would you like this amount to be reflected in the Payment field?"]');
    this.paymentFieldAlertOk = this.loc('//span[text()="OK"]');
    // BRITTLE: paymentMode — positional (4th) antd form-item control
    this.paymentMode = this.loc('(//div[@class="ant-form-item-control-input-content"])[4]');
    this.paymentModeOption = (mode) => this.loc(`//div[text()="${mode}"]`);
    this.amtReceived     = this.page.locator('#amount_paid');
    this.amtUsedForPayment = this.page.locator('#full_amount');
    this.excessAmt       = this.page.locator('#excess_amount');
    this.saveReceiptBtn  = this.loc('//span[text()="Save Receipt"]');
    this.saveReceiptButton = this.containing('button', 'Save Receipt');

    // ── Due Invoices table (on the payment form) ───────────────────────────
    this.dueInvoicesHeader = this.loc('//strong[contains(.,"Due Invoices")]');
    // BRITTLE: dueInvoice* — positional row index on exact antd row class
    this.dueInvoiceCell  = (row, col) => this.loc(`(//tr[@class="ant-table-row ant-table-row-level-0"])[${row}]/td[${col}]`);
    this.dueInvoiceInput = (row) => this.loc(`(//tr[@class="ant-table-row ant-table-row-level-0"])[${row}]/td[6]//input`);

    // ── Payment Received list (first row after save) ───────────────────────
    // BRITTLE: first-row cells — positional XPath on exact antd row class
    this.paymentNumberInTable = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[2]');
    this.receivedAmtInTable = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[5]');
    this.excessAmtInTable = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]/td[6]');
    // BRITTLE: firstRow — positional first row (Payment Received / Sales Bill list)
    this.firstRow = this.loc('(//tr[@class="ant-table-row ant-table-row-level-0"])[1]');
    this.editBtn          = this.loc("//span[text()='Edit']");
    this.deleteBtn        = this.loc("//*[normalize-space(text())='Delete']");
    this.deleteConfirmYes = this.loc("//span[text()='Yes']");

    // ── Sales Invoice tab search (verification) ────────────────────────────
    this.searchInput    = this.page.locator('.ant-input-affix-wrapper').locator('input');
    this.tableBody      = this.page.locator('tbody.ant-table-tbody');
    this.tableFirstRow  = this.page.locator('tbody.ant-table-tbody tr').first();
    // Document-wide XPaths (Cypress evaluated "//..." inside .within() against the whole document)
    this.invoiceBillNoCell = this.loc('//tr[@class="ant-table-row ant-table-row-level-0"]/td[3]');
    this.invoiceDueCell    = this.loc('//tr[@class="ant-table-row ant-table-row-level-0"]/td[last()]');

    // ── Sales Bill list: first row with a payment status ───────────────────
    // BRITTLE: statusRow* — positional first row filtered on td[5] status text
    const statusRow = '(//tr[@class="ant-table-row ant-table-row-level-0"][td[5][contains(., "Paid") or contains(., "days due") or contains(., "days overdue")]])[1]';
    this.statusRow       = this.loc(statusRow);
    this.statusRowBillNo = this.loc(`${statusRow}/td[3]`);
    this.statusRowStatus = this.loc(`${statusRow}/td[5]`);
    this.rowByBillNo     = (billNo) => this.containing('td', billNo).locator('xpath=parent::tr');

    // ── Sales Invoice preview drawer ───────────────────────────────────────
    // BRITTLE: dueAmtInSIPreview — inline style-attribute selector + nth-child
    this.dueAmtInSIPreview = this.loc(':nth-child(4) > [style="display: flex; font-size: 14px; font-weight: 500; line-height: 20px; letter-spacing: 0.1px;"] > div');
    // BRITTLE: previewStatus — exact class match on a utility class
    this.previewStatus    = this.loc('//div[@class="text-black"]');
    this.previewCloseBtn  = this.loc('//span[text()="Close"]');
    this.threeDots        = this.page.locator('svg.ant-dropdown-trigger');
    this.receivePaymentBtn = this.loc('//span[text()="Receive Payment"]');
    this.paymentLinkedDeleteMsg = this.loc('//div[text()="Payments or Credits or Debit Notes have been applied to this Invoice. You must delete all the associated payments to delete the Invoice. Do you wish to proceed?"]');
    this.paymentLinkedDeleteYes = this.loc('//span[text()="Yes"]');
    this.unlinkPaymentIcons  = this.page.locator('span.anticon.anticon-delete');
    // The previous unlink's popconfirm can still be in the DOM — confirm on the newest one only.
    this.unlinkPaymentConfirm = this.page
      .getByRole('tooltip', { name: /Are you sure to delete the payment/ }).last()
      .getByRole('button', { name: 'Delete' });
    // BRITTLE: paymentBox — exact utility class
    this.paymentBox = this.loc('//div[@class="px-24"]');

    // ── Receive Payment form (against a Sales Invoice) ─────────────────────
    // BRITTLE: dueAmtInSI — inline style-attribute selector + nth-child
    this.dueAmtInSI = this.loc(':nth-child(3) > [style="display: flex; font-size: 16px; font-weight: 500; line-height: 24px; letter-spacing: 0.15px;"] > div');
    this.paymentAccount       = this.loc('//input[@id="account"]');
    this.paymentAccountOption = (name) => this.loc(`//span[text()="${name}"]`);
    this.payFullAmountCheckbox = this.loc('//label[contains(.,"Pay full amount")]//input[@type="checkbox"]');
    this.receiveAmtInSI       = this.loc('//input[@id="receiveAmount"]');
  }

  // ── private helpers ───────────────────────────────────────────────────────

  _section(data) {
    return data.section || DEFAULT_SECTION;
  }

  async _openInvoiceApp() {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(5000, 'org switch reloads data');
  }

  /** Open the invoice app on the Sales tab and read back the numbers an earlier step saved. */
  async _resumeBulkPaymentFlow(data, keys) {
    await this._openInvoiceApp();
    await this.salesTab.click();
    const saved = requireSection(this._section(data), keys);
    return Object.fromEntries(keys.map((k) => [k, Number(saved[k])]));
  }

  /** cy.get/xpath(sel).invoke('text') without a visibility check. */
  async _rawText(locator) {
    return this.readRawText(locator);
  }

  /** cy.get(sel).invoke('attr', 'placeholder') */
  async _placeholder(locator) {
    const loc = locator.first();
    await loc.waitFor({ state: 'attached' });
    return loc.getAttribute('placeholder');
  }

  async _openCustomerProfile(data) {
    await this.customerTab.click();
    await this.settle(4000, 'customer list load');
    await this.customerProfile(data.customerName).click();
    await this.settle(5000, 'customer profile load');
  }

  async _selectPaymentMode(data) {
    await this.paymentMode.click();
    await this.paymentModeOption(data.paymentMode).click();
  }

  /** Pagination Check and Click Last Page (repeated block in the original). */
  async _clickLastPageIfPaginated() {
    if ((await this.pagination.count()) > 0) {
      console.log('Pagination exists, clicking last page...');
      const lastPage = await this.paginationPages.last().getAttribute('title');
      await this.paginationPage(lastPage).click();
      await expect(this.paginationSelected).toHaveAttribute('title', lastPage);
    } else {
      console.log('Pagination not available, skipping step');
    }
  }

  /** Collect Due Invoices rows on the payment form. keys = [invoiceNoKey, beforeKey, paymentKey, expectedKey] */
  async _collectDueInvoices(keys) {
    const data = [];
    const txt = await this._rawText(this.dueInvoicesHeader);
    const rowCount = parseInt(txt.match(/\((\d+)\)/)?.[1] || '0');
    console.log(`📌 Row count from header = ${rowCount}`);

    if (rowCount === 0) {
      console.log('⚠️ No invoices found — skipping data extraction.');
      return data;
    }

    for (let i = 1; i <= rowCount; i++) {
      const desc = await this._rawText(this.dueInvoiceCell(i, 3));
      const invoiceNo = desc.trim().replace('#', '');

      const balanceText = await this._rawText(this.dueInvoiceCell(i, 5));
      const beforeBalance = firstNumber(balanceText);

      const paymentVal = await this.readValue(this.dueInvoiceInput(i));
      const payment = firstNumber(paymentVal);
      const expectedDue = beforeBalance - payment;

      data.push({
        [keys[0]]: invoiceNo,
        [keys[1]]: beforeBalance,
        [keys[2]]: payment,
        [keys[3]]: expectedDue,
      });

      console.log(`Row ${i} | ${invoiceNo} | Before: ${beforeBalance} | Paid: ${payment} | Expected Due: ${expectedDue}`);
    }
    return data;
  }

  /** Search an invoice in the Sales Invoice tab and verify its due. */
  async _verifyInvoiceDue(invoiceNo, expectedDue) {
    console.log(`🔍 Verifying invoice: ${invoiceNo}`);
    // Original: cy.get('.ant-input-affix-wrapper').clear().type(x) — the wrapper is a span, so fill its inner input
    await this.searchInput.fill(String(invoiceNo));
    await this.settle(1000, 'invoice search filter');

    await this.tableFirstRow.waitFor({ state: 'attached' });
    const billNo = await this._rawText(this.invoiceBillNoCell);
    console.log(`Fetched Bill No: ${billNo}`);
    expect(billNo.trim()).toBe(invoiceNo);

    const dueText = await this._rawText(this.invoiceDueCell);
    const actualDue = toNumber(dueText);
    expectClose(actualDue, expectedDue, 0.01, `Due for ${invoiceNo}`);
  }

  /** Step 2 / Step 4: open Sales Invoice tab and verify each collected invoice's due. */
  async _verifyInvoicesInSalesTab(invoices, noKey, dueKey, skipWhenEmpty) {
    await this.salesInvoiceTab.click();
    await this.settle(5000, 'sales invoice list load');
    await expect(this.tableBody).toBeVisible();

    console.log(`🔍 Starting verification for ${invoices.length} invoices`);
    if (skipWhenEmpty && invoices.length === 0) {
      console.log('🔵 No invoices to verify — skipping Step 3.');
      return;
    }
    for (const invoice of invoices) {
      // Skip if the row is Opening Balance
      if (invoice[noKey].trim().toLowerCase() === 'opening balance') {
        console.log('⚠️ Skipping verification for Opening Balance');
        continue;
      }
      await this._verifyInvoiceDue(invoice[noKey], invoice[dueKey]);
    }
  }

  async _readCustomerBalances(visibleWait) {
    const read = visibleWait
      ? (loc) => this.readText(loc)
      : (loc) => this._rawText(loc);
    const due = toNumber(await read(this.cusDue));
    const advance = toNumber(await read(this.cusAdvance));
    const closing = toNumber(await read(this.cusClosingBalance));
    return { due, advance, closing };
  }

  async _readPaymentSummary() {
    const amtReceived = parsePlaceholder(await this._placeholder(this.amtReceived));
    const amtUsedForPayment = parsePlaceholder(await this._placeholder(this.amtUsedForPayment));
    const excessAmt = parsePlaceholder(await this._placeholder(this.excessAmt));
    return { amtReceived, amtUsedForPayment, excessAmt };
  }

  async _unlinkAllPayments(maxAttempts = 30) {
    for (let remaining = maxAttempts; ; remaining--) {
      if (remaining <= 0) throw new Error('unlinkAllPayments: max attempts reached');

      const count = await this.unlinkPaymentIcons.count();
      if (count === 0) {
        console.log('✅ All payments unlinked');
        return;
      }

      console.log(`Found ${count} unlink button(s) — unlinking one`);

      const btn = this.unlinkPaymentIcons.first();
      await btn.scrollIntoViewIfNeeded();
      await expect(btn).toBeVisible();
      await btn.click();

      await this.unlinkPaymentConfirm.click();

      // Wait until number of unlink buttons decreases
      await expect.poll(() => this.unlinkPaymentIcons.count()).toBeLessThanOrEqual(count - 1);
    }
  }

  /** Receive-payment + verify block shared by both status branches (identical in the original). Returns amountEntered3. */
  async _receivePartialPaymentAndVerify(data, ctx) {
    await this.settle(1000, 'receive payment form render');
    const dueAmtinSI = toNumber(await this._rawText(this.dueAmtInSI));
    console.log(`Due Amount in SI captured: ${dueAmtinSI}`);
    // NOTE: in Cypress this ran synchronously before either value was captured (always 0 === 0).
    expect(dueAmtinSI).toBe(ctx.dueAmtinSIpreview);
    await this.clickSelect(this.paymentAccount);
    await this.paymentAccountOption(data.paymentAccount).click();
    await this.payFullAmountCheckbox.check();
    await this.settle(1000, 'full amount fills receive field');
    const receiveAmtinSI = parseFloat(await this.readValue(this.receiveAmtInSI));
    console.log(`Receive Amount in SI captured: ${receiveAmtinSI}`);
    expect(receiveAmtinSI).toBe(dueAmtinSI);
    await this.settle(1000, 'before unchecking full amount');
    await this.payFullAmountCheckbox.uncheck();
    await this.typeInto(this.receiveAmtInSI, data.receiveAmt);
    await this.receiveAmtInSI.blur();
    const amountEntered3 = parseFloat(await this.readValue(this.receiveAmtInSI));
    console.log(`Payment Entered against SI : ${amountEntered3}`);
    expect(amountEntered3).toBeLessThanOrEqual(dueAmtinSI);
    await this._selectPaymentMode(data);
    await this.settle(2000, 'payment mode applied');
    await this.saveReceiptButton.click();
    await this.settle(5000, 'receipt save + preview refresh');

    console.log('Verifying invoice status after receipt...');
    const stsText = await this.readText(this.previewStatus);
    if (amountEntered3 === dueAmtinSI) {
      expect(stsText).toContain('Paid');
      const updatedSIpreviewDue = toNumber(await this._rawText(this.dueAmtInSIPreview));
      console.log(`Due Amount in SI preview after full payment: ${updatedSIpreviewDue}`);
      expectClose(updatedSIpreviewDue, amountEntered3 - dueAmtinSI, 0.011, 'SI preview due after payment');
    } else {
      // A partial receipt shows "Partially paid"; older builds showed the due-days text instead.
      expect(stsText).toMatch(/partially paid|days due|days overdue/i);
      const updatedSIpreviewDue = toNumber(await this._rawText(this.dueAmtInSIPreview));
      console.log(`Due Amount in SI preview after full payment: ${updatedSIpreviewDue}`);
      expectClose(updatedSIpreviewDue, dueAmtinSI - amountEntered3, 0.011, 'SI preview due after payment');
    }
    await this.previewCloseBtn.click();
    await this.settle(2000, 'preview drawer close');

    const row = this.rowByBillNo(ctx.billNo);
    if (amountEntered3 === dueAmtinSI) {
      await expect(row.locator('td').nth(4)).toContainText('Paid');
    } else {
      await expect(row.locator('td').nth(4)).toHaveText(/days due|days overdue/);
    }
    await this.settle(2000, 'list status refresh');
    return amountEntered3;
  }

  // ── public test-case methods ──────────────────────────────────────────────

  /**
   * TC01: bulk Payment Received against the customer's due invoices → edit → delete,
   * verifying invoice dues, customer Due / Advance / Closing Balance and TS closing balance at each stage.
   * data: generateCustomerPaymentData()
   * Runs the three step methods below in order; each can also run as its own test.
   */
  async createEditDeleteBulkPaymentAndVerifyBalances(data) {
    await this.createBulkPaymentAndVerifyBalances(data);
    await this.editBulkPaymentAndVerifyBalances(data);
    await this.deleteBulkPaymentAndVerifyBalances(data);
  }

  /**
   * Bulk-payment step 1: capture existing balances, create a Payment Received against the
   * customer's due invoices, verify invoice dues + Due / Advance / Closing / TS closing balance.
   * Writes paymentNumber, existingDue, existingAdvance, existingClosingBalance, amtReceived,
   * amtUsedForPayment, excessAmt.
   */
  async createBulkPaymentAndVerifyBalances(data) {
    await this._openInvoiceApp();

    // ── Existing balances ──
    console.log('Reading existing customer balances...');
    await this.salesTab.click();
    await this._openCustomerProfile(data);
    const existing = await this._readCustomerBalances(true);
    const existingDue = existing.due;
    const existingAdvance = existing.advance;
    const existingClosingBalance = existing.closing;
    console.log(`Existing Due captured: ${existingDue}`);
    console.log(`Existing Advance captured: ${existingAdvance}`);
    console.log(`Existing Closing Balance captured: ${existingClosingBalance}`);
    expectClose(existingClosingBalance, existingDue - existingAdvance, 0.011, 'Existing Closing Balance');
    await this.settle(6000, 'before leaving customer profile');

    // ── Create payment ──
    console.log('Creating new Payment Received...');
    await this.salesTab.click();
    await this.paymentTab.click();
    await this.settle(2000, 'payment list load');
    await this.newPaymentBtn.click();
    await this.clickSelect(this.customerSelect);
    await this.customerOption(data.customerName).click();
    await this.proceedBtn.click();
    await this.settle(4000, 'payment form + due invoices load');

    const paymentScreenDue = toNumber(await this._rawText(this.paymentScreenDue));
    console.log(`Payment Screen Due captured: ${paymentScreenDue}`);
    expect(paymentScreenDue).toBe(existingDue);

    await this.typeInto(this.receiveAmtInput, data.receiveAmt);
    await this.receiveAmtInput.blur();
    const amountEntered = parseFloat(await this.readValue(this.receiveAmtInput));
    console.log(`Payment Entered: ${amountEntered}`);
    await this.settle(1000, 'payment-field alert');
    await expect(this.paymentFieldAlert).toBeVisible();
    await this.paymentFieldAlertOk.click();
    await this.page.mouse.click(0, 0);
    await this.settle(1000, 'alert close');
    await this._selectPaymentMode(data);

    // STEP 1: collect invoice data from "Payment Received"
    const invoiceData = await this._collectDueInvoices(['invoiceNo', 'beforeBalance', 'payment', 'expectedDue']);

    const created = await this._readPaymentSummary();
    const amtReceived = created.amtReceived;
    const amtUsedForPayment = created.amtUsedForPayment;
    const excessAmt = created.excessAmt;
    console.log(`Amount Received captured: ${amtReceived}`);
    console.log(`Amount Used for Payment captured: ${amtUsedForPayment}`);
    console.log(`Excess Amount captured: ${excessAmt}`);
    // NOTE: in Cypress these two ran synchronously before the values above were captured (always 0 === 0).
    expect(amountEntered).toBe(amtReceived);
    expectClose(excessAmt, amtReceived - amtUsedForPayment, 0.011, 'Excess Amount');
    await this.settle(2000, 'before save');
    await this.saveReceiptBtn.click();
    await this.settle(6000, 'payment save + list refresh');

    const paymentNumber = (await this._rawText(this.paymentNumberInTable)).trim();
    console.log(`Captured Payment No: ${paymentNumber}`);
    {
      const receivedAmtinTable = toNumber(await this._rawText(this.receivedAmtInTable));
      console.log(`Received Amount in Table captured: ${receivedAmtinTable}`);
      expect(receivedAmtinTable).toBe(amtReceived);
    }
    {
      const excsAmtininTable = toNumber(await this._rawText(this.excessAmtInTable));
      console.log(`Excess Amount in Table captured: ${excsAmtininTable}`);
      expect(excsAmtininTable).toBe(excessAmt);
    }
    saveSection(this._section(data), { paymentNumber, existingDue, existingAdvance, existingClosingBalance, amtReceived, amtUsedForPayment, excessAmt });

    // STEP 2: verify the due amount on each sales invoice
    console.log('Verifying invoice dues after payment...');
    await this._verifyInvoicesInSalesTab(invoiceData, 'invoiceNo', 'expectedDue', true);

    console.log('Verifying customer balances after payment...');
    await this._openCustomerProfile(data);
    const current = await this._readCustomerBalances(false);
    const currentDue = current.due;
    console.log(`Current Due captured: ${currentDue}`);
    expectClose(currentDue, existingDue - amtUsedForPayment, 0.011, 'Current Due');
    const currentAdvance = current.advance;
    console.log(`Current Advance captured: ${currentAdvance}`);
    expectClose(currentAdvance, existingAdvance + excessAmt, 0.011, 'Current Advance');
    const currentClosingBalance = current.closing;
    console.log(`Current Closing Balance captured: ${currentClosingBalance}`);
    expectClose(currentClosingBalance, currentDue - currentAdvance, 0.011, 'Current Closing Balance');
    expectClose(currentClosingBalance, (existingDue - currentAdvance) - amtUsedForPayment, 0.011, 'Current Closing Balance vs existing');

    await this._clickLastPageIfPaginated();
    await this.settle(2000, 'last page render');
    const currentTSCB = toNumber(await this._rawText(this.tsClosingBalance));
    console.log(`Current TSCB captured: ${currentTSCB}`);
    expectClose(currentTSCB, currentClosingBalance, 0.011, 'Current TSCB');
    expectClose(currentTSCB, (existingDue - currentAdvance) - amtUsedForPayment, 0.011, 'Current TSCB vs existing');
  }

  /**
   * Bulk-payment step 2: edit the newest payment's amount, verify invoice dues + balances.
   * Reads existingDue, existingAdvance; writes updatedamtReceived, updatedamtUsedForPayment,
   * updatedexcessAmt, updatedDue, updatedAdvance.
   */
  async editBulkPaymentAndVerifyBalances(data) {
    const { existingDue, existingAdvance } =
      await this._resumeBulkPaymentFlow(data, ['existingDue', 'existingAdvance']);

    console.log('Editing the payment...');
    await this.salesBillTab.click();
    await this.paymentTab.click();
    await this.firstRow.click();
    await this.settle(2000, 'payment preview open');
    await this.editBtn.click();
    await this.settle(4000, 'edit form load');
    await this.fillInto(this.receiveAmtInput, data.edReceiveAmt);
    await this.receiveAmtInput.blur();
    await this.settle(1000, 'payment-field alert');
    const amountEntered2 = parseFloat(await this.readValue(this.receiveAmtInput));
    console.log(`Payment Edited: ${amountEntered2}`);
    await expect(this.paymentFieldAlert).toBeVisible();
    await this.paymentFieldAlertOk.click();
    await this._selectPaymentMode(data);

    // STEP 3: repeat Step 1 for the edit flow
    const editinvoiceData = await this._collectDueInvoices(['invoiceNo1', 'beforeBalance1', 'payment1', 'expectedDue1']);

    const updated = await this._readPaymentSummary();
    const updatedamtReceived = updated.amtReceived;
    const updatedamtUsedForPayment = updated.amtUsedForPayment;
    const updatedexcessAmt = updated.excessAmt;
    console.log(`Updated Amount Received captured: ${updatedamtReceived}`);
    console.log(`Updated Amount Used for Payment captured: ${updatedamtUsedForPayment}`);
    console.log(`Updated Excess Amount captured: ${updatedexcessAmt}`);
    // NOTE: in Cypress these two ran synchronously before the values above were captured (always 0 === 0).
    expect(amountEntered2).toBe(updatedamtReceived);
    expectClose(updatedexcessAmt, updatedamtReceived - updatedamtUsedForPayment, 0.011, 'Updated Excess Amount');
    await this.settle(2000, 'before save');
    await this.saveReceiptBtn.click();
    await this.settle(6000, 'payment save + list refresh');
    {
      const receivedAmtinTable = toNumber(await this._rawText(this.receivedAmtInTable));
      console.log(`Received Amount in Table captured: ${receivedAmtinTable}`);
      expect(receivedAmtinTable).toBe(updatedamtReceived);
    }
    {
      const excsAmtininTable = toNumber(await this._rawText(this.excessAmtInTable));
      console.log(`Excess Amount in Table captured: ${excsAmtininTable}`);
      expect(excsAmtininTable).toBe(updatedexcessAmt);
    }
    saveSection(this._section(data), { updatedamtReceived, updatedamtUsedForPayment, updatedexcessAmt });

    // STEP 4: repeat Step 2 for the edit flow
    console.log('Verifying invoice dues after edit...');
    await this._verifyInvoicesInSalesTab(editinvoiceData, 'invoiceNo1', 'expectedDue1', false);

    console.log('Verifying customer balances after edit...');
    await this._openCustomerProfile(data);
    const upd = await this._readCustomerBalances(false);
    const updatedDue = upd.due;
    console.log(`Updated Due captured: ${updatedDue}`);
    expectClose(updatedDue, existingDue - updatedamtUsedForPayment, 0.011, 'Updated Due');
    const updatedAdvance = upd.advance;
    console.log(`Updated Advance captured: ${updatedAdvance}`);
    expectClose(updatedAdvance, existingAdvance + updatedexcessAmt, 0.011, 'Updated Advance');
    const updatedClosingBalance = upd.closing;
    console.log(`Updated Closing Balance captured: ${updatedClosingBalance}`);
    expectClose(updatedClosingBalance, updatedDue - updatedAdvance, 0.011, 'Updated Closing Balance');
    expectClose(updatedClosingBalance, (existingDue - updatedAdvance) - updatedamtUsedForPayment, 0.011, 'Updated Closing Balance vs existing');

    await this._clickLastPageIfPaginated();
    await this.settle(2000, 'last page render');
    const updatedTSCB = toNumber(await this._rawText(this.tsClosingBalance));
    console.log(`Updated TSCB captured: ${updatedTSCB}`);
    expectClose(updatedTSCB, updatedClosingBalance, 0.011, 'Updated TSCB');
    expectClose(updatedTSCB, (existingDue - updatedAdvance) - updatedamtUsedForPayment, 0.011, 'Updated TSCB vs existing');
    saveSection(this._section(data), { updatedDue, updatedAdvance });
  }

  /**
   * Bulk-payment step 3: delete the newest payment, verify balances return to the pre-payment values.
   * Reads existingDue, existingAdvance, existingClosingBalance, updatedDue, updatedAdvance,
   * updatedamtUsedForPayment, updatedexcessAmt.
   */
  async deleteBulkPaymentAndVerifyBalances(data) {
    const {
      existingDue, existingAdvance, existingClosingBalance,
      updatedDue, updatedAdvance, updatedamtUsedForPayment, updatedexcessAmt,
    } = await this._resumeBulkPaymentFlow(data, [
      'existingDue', 'existingAdvance', 'existingClosingBalance',
      'updatedDue', 'updatedAdvance', 'updatedamtUsedForPayment', 'updatedexcessAmt',
    ]);

    console.log('Deleting the payment...');
    await this.salesBillTab.click();
    await this.paymentTab.click();
    await this.firstRow.click();
    await this.settle(2000, 'payment preview open');
    await this.deleteBtn.click();
    await this.deleteConfirmYes.click();
    await this.settle(4000, 'payment delete');

    console.log('Verifying customer balances after delete...');
    await this._openCustomerProfile(data);
    const fin = await this._readCustomerBalances(false);
    const finalDue = fin.due;
    console.log(`Final Due captured: ${finalDue}`);
    expectClose(finalDue, existingDue, 0.011, 'Final Due');
    expectClose(finalDue, updatedDue + updatedamtUsedForPayment, 0.011, 'Final Due vs updated');

    const finalAdvance = fin.advance;
    console.log(`Final Advance captured: ${finalAdvance}`);
    expectClose(finalAdvance, existingAdvance, 0.011, 'Final Advance');
    expectClose(finalAdvance, updatedAdvance - updatedexcessAmt, 0.011, 'Final Advance vs updated');

    const finalClosingBalance = fin.closing;
    console.log(`Final Closing Balance captured: ${finalClosingBalance}`);
    expectClose(finalClosingBalance, finalDue - finalAdvance, 0.011, 'Final Closing Balance');
    expectClose(finalClosingBalance, existingClosingBalance, 0.011, 'Final Closing Balance vs existing');
    expectClose(finalClosingBalance, (updatedDue - finalAdvance) + updatedamtUsedForPayment, 0.011, 'Final Closing Balance vs updated');

    await this._clickLastPageIfPaginated();
    await this.settle(2000, 'last page render');
    const finalTSCB = toNumber(await this._rawText(this.tsClosingBalance));
    console.log(`Final TSCB captured: ${finalTSCB}`);
    expectClose(finalTSCB, finalClosingBalance, 0.011, 'Final TSCB');
    expectClose(finalTSCB, (updatedDue - finalAdvance) + updatedamtUsedForPayment, 0.011, 'Final TSCB vs updated');
    saveSection(this._section(data), { finalDue, finalAdvance, finalClosingBalance, finalTSCB });
    console.log('Bulk payment create / edit / delete verified.');
  }

  /**
   * TC02: receive a partial payment against the latest Sales Invoice from its preview,
   * verify status + due, then unlink the payment(s) and verify the due is restored.
   * data: generateCustomerPaymentData()
   */
  async receivePaymentAgainstSalesInvoiceAndVerify(data) {
    await this.openApp('invoice');
    await this.selectOrg();
    await this.settle(5000, 'org switch reloads data');

    console.log('Reading latest Sales Invoice with a payment status...');
    await this.salesTab.click();
    const billNo = (await this._rawText(this.statusRowBillNo)).trim();
    console.log(`Captured Bill No: ${billNo}`);
    const status = (await this._rawText(this.statusRowStatus)).trim();
    console.log(`Invoice status: ${status}`);
    const ctx = { billNo, dueAmtinSIpreview: 0 };
    saveSection(this._section(data), { billNo, invoiceStatus: status });

    if (status === 'Paid') {
      console.log('Invoice is Paid — unlinking existing payments first...');
      await this.statusRow.click();
      await this.settle(2000, 'invoice preview open');
      await this._unlinkAllPayments();
      await this.settle(10000, 'invoice due recalculation after unlink');
      ctx.dueAmtinSIpreview = toNumber(await this._rawText(this.dueAmtInSIPreview));
      console.log(`Due Amount in SI captured: ${ctx.dueAmtinSIpreview}`);
      await this.settle(2000, 'preview settle');
      await this.receivePaymentBtn.scrollIntoViewIfNeeded();
      await expect(this.receivePaymentBtn).toBeVisible();
      await this.receivePaymentBtn.click();

      console.log('Receiving partial payment...');
      const amountEntered3 = await this._receivePartialPaymentAndVerify(data, ctx);
      saveSection(this._section(data), { dueAmtinSIpreview: ctx.dueAmtinSIpreview, amountEntered3 });

      console.log('Unlinking the payment...');
      await this.statusRow.click();
      await this.threeDots.click();
      await this.deleteBtn.click({ force: true }); // original used force here (menu item may be covered)
      await expect(this.paymentLinkedDeleteMsg).toBeVisible();
      await this.paymentLinkedDeleteYes.click();
      await this.settle(2000, 'payment list in preview');
      await this._unlinkAllPayments();
      await this.settle(5000, 'invoice due recalculation after unlink');
      await expect(this.paymentBox).toHaveCount(0);
      {
        const finalDueAmt = toNumber(await this._rawText(this.dueAmtInSIPreview));
        console.log(`Final Due amount in SI Preview: ${finalDueAmt}`);
        expect(finalDueAmt).toBe(ctx.dueAmtinSIpreview);
      }
      await this.previewCloseBtn.click();
      await this.settle(2000, 'preview drawer close');
    } else {
      await this.statusRow.click();
      ctx.dueAmtinSIpreview = toNumber(await this._rawText(this.dueAmtInSIPreview));
      console.log(`Due Amount in SI captured: ${ctx.dueAmtinSIpreview}`);
      await this.receivePaymentBtn.click();

      console.log('Receiving partial payment...');
      const amountEntered3 = await this._receivePartialPaymentAndVerify(data, ctx);
      saveSection(this._section(data), { dueAmtinSIpreview: ctx.dueAmtinSIpreview, amountEntered3 });

      console.log('Unlinking the payment...');
      await this.statusRow.click();
      await this.threeDots.click();
      await this.deleteBtn.click();
      await expect(this.paymentLinkedDeleteMsg).toBeVisible();
      await this.paymentLinkedDeleteYes.click();
      await this.settle(2000, 'payment list in preview');
      await this._unlinkAllPayments();
      await this.settle(10000, 'invoice due recalculation after unlink');
      await expect(this.paymentBox).toHaveCount(0);
      {
        const finalDueAmt = toNumber(await this._rawText(this.dueAmtInSIPreview));
        console.log(`Final Due amount in SI Preview: ${finalDueAmt}`);
        expect(finalDueAmt).toBeGreaterThanOrEqual(ctx.dueAmtinSIpreview);
      }
      await this.previewCloseBtn.click();
    }
    console.log('Receive payment against Sales Invoice verified.');
  }
}

module.exports = { CustomerPaymentPage };
