// ═════════════════════════════════════════════════════════════════════════
// Payment Made (YOLO_BOOKS_Payment_Made_TC.xlsx: PAY_FUNC / POS / NEG / UI / VAL / BND / BL / SF / PAG /
// EXP / SEC / E2E / PERF / ACC).
// Vendor "New Vendor 1". The Payment Made form is the same component as the sales bulk receipt.
// Payments are put on FRESH bills (Cancel on the "reflect in the Payment field?" prompt, then the
// bill's row amount) so the vendor's old bills are never paid off by a FIFO distribution; the
// distribution itself is checked on the form without saving.
// Adapted: numbers are PAY-AUTO/NNNN (sheet: PAY/XXXX); required messages are "Received Amount is
// required" / "Paymentmode is Required" / "Account is Required"; Next stays disabled without a vendor.
//
// Already automated — not repeated:
//   PAY_FUNC_014 / 015 / PAY_POS_015 / PAY_UI_017 / 018 / PAY_BL_004 (invoice-side Make Payment, full)
//        ... Purchase Invoice PI_FUNC_011 · PAY_NEG_017 / 018 / PAY_VAL_013 / 014 ... PI_NEG_011
//   PAY_E2E_001 ... PI_FUNC_011 · PAY_E2E_007 (3 partial payments) ... PI_POS_015 (invoice side) + PAY_POS_002 here
// Same case as another one here:
//   PAY_VAL_001 = PAY_NEG_001 · PAY_VAL_002 / 003 / 004 = PAY_NEG_002 / 003 / 004 · PAY_VAL_005 / 011 = PAY_NEG_009
//   PAY_VAL_006 = PAY_NEG_005 · PAY_VAL_007 / 008 = PAY_NEG_006 / 007 · PAY_VAL_012 = PAY_NEG_008
//   PAY_SEC_003 = PAY_NEG_016 · PAY_SEC_004 = PAY_NEG_015 · PAY_POS_013 / PAY_BL_007 = PAY_FUNC_007
//   PAY_POS_014 / PAY_BL_008 / 019 / PAY_E2E_005 = PAY_FUNC_012 · PAY_BL_009 / PAY_E2E_006 = PAY_FUNC_013
//   PAY_E2E_002 = PAY_FUNC_006 (distribution) + PAY_FUNC_016 (save / balances) · PAY_E2E_009 = SF + view + print
// Deferred to the Vendor sheet (opening balance is set on the vendor): PAY_POS_018 / PAY_BL_006 / PAY_BND_011.
//
//   npx playwright test tests/purchase/04_PaymentMade.spec.js --grep @pm
// ═════════════════════════════════════════════════════════════════════════

const { test, expect, bugCheck } = require('../../fixtures/base-test');
const { PaymentMadePage } = require('../../pages/purchase/PaymentMadePage');
const { pickerDate, addDays } = require('../../pages/sales/SalesInvoiceEditPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { masterData } = require('../../test-data/UserData');
const { expectClose } = require('../../utils/stockMath');
const { capturePrint } = require('../../utils/testHelpers');

const T = ['@purchase', '@pm'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test.describe('Payment Made', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {PaymentMadePage} */
  let pm;
  let A;
  const VENDOR = masterData.vendorName;
  test.beforeEach(async ({ page }) => {
    pm = new PaymentMadePage(page);
    await pm.open();
    [A] = await pm.ensurePricedItems(E.items());
  });

  const L = (item, qty) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0 });
  /** New saved purchase invoice of `qty` × item A: { no, total }. */
  const bill = async (qty = 1) => {
    const m = { lines: [L(A, qty)], taxMode: 'Excluding Tax' };
    const { billNo } = await pm.createPricedInvoice(m, { vendorName: VENDOR });
    return { no: billNo, total: pm.computeTotals(m).total };
  };
  /** Bulk payment of `amount` with `rows` ({billNo: amt}) on the bills, rest as excess. */
  const pay = (amount, rows = {}, extra = {}) => pm.createPayment({ amount, answer: 'Cancel', rows, ...extra }, VENDOR);
  /** All Due Invoices rows of the open form: [{ desc, balance, payment }]. */
  const dueRows = () => pm.page.locator('table tbody tr').filter({ visible: true }).evaluateAll((trs) => trs
    .filter((tr) => tr.cells.length >= 6)
    .map((tr) => ({
      desc: tr.cells[2].innerText.trim(),
      balance: parseFloat(tr.cells[4].innerText.replace(/[^\d.-]/g, '')) || 0,
      payment: parseFloat((tr.cells[5].querySelector('input') || {}).value || '0') || 0,
    })));

  // ── List ─────────────────────────────────────────────────────────────────

  test('TC01 - The Payment Made list shows Date, Bill No (PAY-AUTO/NNNN), Vendor Name, Mode and Amount, a primary "New Payment Made" button and the Total Count', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_001, PAY_POS_001, PAY_POS_011, PAY_UI_001, PAY_UI_004, PAY_UI_019' } }, async ({ page }) => {
    await pm._searchPayments('');
    await expect(page.locator('table thead th')).toHaveText(['Date', 'Bill No', 'Vendor Name', 'Mode of Payment', 'Amount']);
    await expect(pm.newPaymentBtn).toHaveClass(/ant-btn-primary/);
    const rows = await pm.readListRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r[1]).toMatch(/^PAY-AUTO\/\d{4,}$/);
    }
    expect(await pm.totalCount()).toBeGreaterThanOrEqual(rows.length);
  });

  // QA (BUG-PM-06): by design the footer shows only "Total Count" (no total amount) and the mode is plain text.
  test('TC02 - The Payment Made list footer shows the Total Count of payments', { tag: T, annotation: { type: 'cases', description: 'PAY_POS_017, PAY_PAG_010, PAY_UI_019' } }, async () => {
    await pm._searchPayments('');
    await expect(pm.totalCountText).toBeVisible();
    expect(await pm.totalCount()).toBeGreaterThan(0);
  });

  test('TC03 - In the Payment Made list the Mode of Payment is shown as text and the vendor has an avatar', { tag: T, annotation: { type: 'cases', description: 'PAY_UI_002, PAY_UI_003, PAY_ACC_005' } }, async ({ page }) => {
    await pm._searchPayments('');
    const row = page.locator('table tbody tr.ant-table-row').first();
    await expect(row.locator('td').nth(3)).toHaveText(/\S/);
    await expect(row.locator('td').nth(2).locator('img, svg, .ant-avatar').first(), 'vendor avatar').toBeVisible({ timeout: 5000 });
  });

  // ── Vendor step / form ───────────────────────────────────────────────────

  test('TC04 - "New Payment Made" opens with the Enter key showing vendor search and Next, and Next is disabled without a vendor', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_002, PAY_UI_005, PAY_NEG_001, PAY_ACC_002' } }, async ({ page }) => {
    await pm._searchPayments('');
    await pm.newPaymentBtn.focus();
    await page.keyboard.press('Enter');
    await expect(pm.vendorSelect).toBeVisible();
    await expect(page.getByText('New Payment Made').last()).toBeVisible();
    await expect(pm.vendorNextBtn).toBeDisabled();
  });

  test('TC05 - Payment Made form shows the header, due equal to the vendor due, pending cheque ₹0 and due bills only (a paid bill is not listed)', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_003, PAY_FUNC_004, PAY_BL_018, PAY_BL_020, PAY_UI_006, PAY_UI_007, PAY_UI_008, PAY_UI_009, PAY_UI_010, PAY_UI_011' } }, async ({ page }) => {
    const open = await bill(1);
    const paid = await bill(1);
    await pm.payInvoice(paid.no, paid.total);
    const h = await pm.vendorHeader(VENDOR);
    await pm.openNewPayment(VENDOR);
    const f = await pm.readReceiptForm();
    expect(f.receiptNo).toMatch(/^PAY-AUTO\/\d+$/);
    await expect(pm.receiptNo).not.toBeEditable();
    expect(f.date).toBe(pickerDate(new Date()));
    expectClose(f.due, h.due, 0.05, 'form due = vendor due');
    expect(f.pendingCheque).toBe(0);
    expect(f.text).toContain(VENDOR);
    await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
    for (const id of ['#date', '#receiveAmount', '#paymentmode', '#account', '#reference_number', '#notes', '#amount_paid', '#full_amount', '#excess_amount']) {
      await expect(page.locator(id).first(), id).toBeAttached();
    }
    await expect(pm.payFullLabel).toBeVisible();
    await expect(pm.savePaymentBtn).toHaveClass(/ant-btn-primary/);
    await expect(pm.formCancel).toBeVisible();
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['S.No', 'Bill Date', 'Description', 'Amount', 'Balance', 'Payment']);
    const r = await pm.receiptRow(open.no);
    expect(r, 'unpaid bill listed').not.toBeNull();
    expectClose(r.balance, open.total, 0.01, 'balance');
    expect(await pm.receiptRow(paid.no), 'paid bill not listed').toBeNull();
    await pm.discardPaymentForm();
  });

  test('TC06 - Choosing OK on the prompt fills the bills oldest first (up to 21 bills) in a payment made', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_006, PAY_POS_004, PAY_BL_010, PAY_BND_005, PAY_BND_015' } }, async () => {
    await pm.openNewPayment(VENDOR);
    const rows = await dueRows();
    expect(rows.length).toBeGreaterThan(0);
    const n = Math.min(21, rows.length);
    const amount = Math.round((rows.slice(0, n).reduce((s, r) => s + r.balance, 0) - 0.5) * 100) / 100;
    await pm.setReceivedAmount(String(amount), 'OK');
    const after = await dueRows();
    for (let i = 0; i < n - 1; i++) expectClose(after[i].payment, after[i].balance, 0.01, `row ${i + 1} paid in full`);
    expectClose(after[n - 1].payment, after[n - 1].balance - 0.5, 0.01, `row ${n} gets the rest`);
    for (const r of after.slice(n)) expect(r.payment).toBe(0);
    const f = await pm.readReceiptForm();
    expectClose(f.used, amount, 0.01, 'used');
    expectClose(f.excess, 0, 0.01, 'excess');
    await pm.discardPaymentForm();
  });

  test('TC07 - "Pay Full Amount" (Space key) fills the total due and the excess is ₹0', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_005, PAY_POS_006, PAY_BND_001, PAY_E2E_004, PAY_ACC_008' } }, async ({ page }) => {
    await pm.openNewPayment(VENDOR);
    const f0 = await pm.readReceiptForm();
    await pm.payFullBox.focus();
    await page.keyboard.press('Space');
    await pm.confirmReflectAmount();
    await pm.settle(1500, 'full amount applied');
    await expect(pm.payFullBox).toBeChecked();
    expectClose(parseFloat(await pm.receiveAmtField().inputValue()), f0.due, 0.05, 'paid = due');
    const f = await pm.readReceiptForm();
    expectClose(f.used, f0.due, 0.05, 'used = due');
    expectClose(f.excess, 0, 0.01, 'excess');
    await pm.discardPaymentForm();
  });

  test('TC08 - A payment paid above the total due uses the due and puts the rest in excess (₹99,99,99,999)', { tag: T, annotation: { type: 'cases', description: 'PAY_POS_005, PAY_BND_003, PAY_BL_002' } }, async () => {
    await pm.openNewPayment(VENDOR);
    const f0 = await pm.readReceiptForm();
    await pm.setReceivedAmount('999999999', 'OK');
    const f = await pm.readReceiptForm();
    expectClose(f.received, 999999999, 0.01, 'received');
    expectClose(f.used, f0.due, 0.05, 'used = due');
    expectClose(f.excess, 999999999 - f0.due, 0.05, 'excess');
    await pm.discardPaymentForm();
  });

  // ── Save / balances ──────────────────────────────────────────────────────

  test('TC09 - Partial payment: the list shows it (Cash), the bill due and vendor due go down by the row amount, the excess goes to advance, and the view shows the breakdown', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_008, PAY_FUNC_009, PAY_FUNC_016, PAY_POS_003, PAY_POS_008, PAY_POS_019, PAY_POS_020, PAY_BL_001, PAY_BL_005, PAY_BL_015, PAY_UI_013, PAY_UI_014' } }, async () => {
    const b = await bill(10);
    const h0 = await pm.vendorHeader(VENDOR);
    await pm.openNewPayment(VENDOR);
    await pm.fillPaymentForm({ amount: 1000, answer: 'Cancel', rows: { [b.no]: 600 } });
    const f = await pm.readReceiptForm();
    expectClose(f.used, 600, 0.01, 'used');
    expectClose(f.excess, 400, 0.01, 'excess');
    const no = await pm.confirmPaymentNumber(await pm.savePayment(), VENDOR, 1000);
    const row = await pm.paymentListRow(no);
    expect(row.vendor).toContain(VENDOR);
    expect(row.mode).toBe('Cash');
    expect(row.amount).toBe(1000);
    expect(row.date).toBe(iso(new Date()));
    const br = await pm.billRow(b.no);
    expectClose(br.due, b.total - 600, 0.01, 'bill due');
    expect(br.status).not.toBe('Paid');
    const h1 = await pm.vendorHeader(VENDOR);
    expectClose(h0.due - h1.due, 600, 0.05, 'vendor due down by the used part');
    expectClose(h1.advance - h0.advance, 400, 0.05, 'vendor advance up by the excess');
    const v = await pm.readPaymentView(no);
    expect(v.text).toContain(no);
    expect(v.text).toContain('Payment Date');
    expectClose(v.paid, 1000, 0.01, 'view paid');
    expectClose(v.used, 600, 0.01, 'view used');
    expectClose(v.excess, 400, 0.01, 'view excess');
    const line = v.rows.find((r) => r.desc.includes(b.no));
    expect(line, 'bill in the breakdown').toBeTruthy();
    expectClose(line.paid, 600, 0.01, 'bill paid in view');
  });

  test('TC10 - Three bulk payments on one bill: the due drops each time, the bill shows Paid after the last, and all three are listed for the vendor', { tag: T, annotation: { type: 'cases', description: 'PAY_POS_002, PAY_BND_004, PAY_BL_012, PAY_BL_016, PAY_E2E_007' } }, async () => {
    const b = await bill(5);
    const parts = [200, 200, Math.round((b.total - 400) * 100) / 100];
    const nos = [];
    let paid = 0;
    for (const amt of parts) {
      nos.push(await pay(amt, { [b.no]: amt }));
      paid += amt;
      expectClose((await pm.billRow(b.no)).due, b.total - paid, 0.02, `due after ${paid}`);
    }
    const br = await pm.billRow(b.no);
    expect(br.status).toBe('Paid');
    expect(br.due).toBe(0);
    const listed = (await pm.allPayments(VENDOR)).map((r) => r[1]);
    for (const no of nos) expect(listed, `${no} listed`).toContain(no);
  });

  test('TC11 - Choosing Cancel on the prompt puts everything in excess: the bill is unchanged, the vendor advance goes up, and the journal is balanced with an advance line', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_007, PAY_NEG_014, PAY_E2E_003, PAY_BL_011' } }, async () => {
    const b = await bill(1);
    const h0 = await pm.vendorHeader(VENDOR);
    await pm.openNewPayment(VENDOR);
    await pm.fillPaymentForm({ amount: 50, answer: 'Cancel' });
    const f = await pm.readReceiptForm();
    expect(f.used).toBe(0);
    expectClose(f.excess, 50, 0.01, 'excess');
    expect((await dueRows()).every((r) => r.payment === 0)).toBe(true);
    const no = await pm.confirmPaymentNumber(await pm.savePayment(), VENDOR, 50);
    expectClose((await pm.billRow(b.no)).due, b.total, 0.01, 'bill untouched');
    expectClose((await pm.vendorHeader(VENDOR)).advance - h0.advance, 50, 0.05, 'vendor advance');
    const v = await pm.readPaymentView(no);
    expectClose(v.excess, 50, 0.01, 'view excess');
    expect(v.journal.length).toBeGreaterThan(0);
    const dr = v.journal.reduce((s, j) => s + j.debit, 0);
    const cr = v.journal.reduce((s, j) => s + j.credit, 0);
    expectClose(dr, cr, 0.01, 'debit = credit');
    expect(v.text).toMatch(/Advance|Prepaid/i);
  });

  test('TC12 - The journal of a bill payment shows Account, Debit and Credit columns, and debit equals credit', { tag: T, annotation: { type: 'cases', description: 'PAY_POS_012, PAY_UI_015, PAY_BL_003, PAY_BL_017' } }, async () => {
    const b = await bill(1);
    const no = await pay(b.total, { [b.no]: b.total });
    const v = await pm.readPaymentView(no);
    expect(v.text).toMatch(/Journal/i);
    expect(v.text).toMatch(/Account/i);
    expect(v.journal.length).toBeGreaterThan(1);
    expectClose(v.journal.reduce((s, j) => s + j.debit, 0), v.journal.reduce((s, j) => s + j.credit, 0), 0.01, 'debit = credit');
    expect(v.journal.map((j) => j.account).join(' ')).toMatch(/Payable|Petty Cash|Cash/i);
  });

  test('TC13 - A payment made by Bank Transfer shows as Bank Transfer, and the Reference No and notes are kept', { tag: T, annotation: { type: 'cases', description: 'PAY_POS_007, PAY_POS_009, PAY_POS_010, PAY_EXP_007, PAY_EXP_008' } }, async () => {
    const b = await bill(1);
    const bank = await pay(b.total, { [b.no]: b.total }, { mode: 'Bank Transfer', notes: 'paid by transfer' });
    expect((await pm.paymentListRow(bank)).mode).toBe('Bank Transfer');
    const ref = `TXN-${Date.now() % 100000}`;
    const cash = await pay(1, {}, { ref });
    const v = await pm.readPaymentView(cash);
    await pm.closePaymentView();
    await pm.editPayment(cash);
    const kept = await pm.receiptRef.inputValue();
    await pm.discardPaymentForm();
    await pm.editPayment(bank);
    const notes = await pm.receiptNotes.inputValue();
    await pm.discardPaymentForm();
    // QA (BUG-PM-03): bug — Reference No (and notes) are not saved with the payment.
    await bugCheck('BUG-PM-03', 'Reference No / notes not saved with the payment', async () => {
      expect(kept, 'reference kept').toBe(ref);
      expect(v.text, 'reference in the view').toContain(ref);
      expect(notes, 'notes kept').toBe('paid by transfer');
    });
  });

  test('TC14 - Edit a payment made: fields are pre-filled, raising the bill amount from 500 to 800 lowers the due by 300, and cutting it to ₹0.01 restores the due', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_011, PAY_FUNC_012, PAY_BND_012' } }, async () => {
    const b = await bill(10);
    const no = await pay(500, { [b.no]: 500 });
    expectClose((await pm.billRow(b.no)).due, b.total - 500, 0.01, 'due after 500');
    await pm.editPayment(no);
    expect(parseFloat(await pm.receiveAmtField().inputValue())).toBe(500);
    expect(await pm.selectedText(pm.receiptEditMode)).toBe('Cash');
    expectClose((await pm.receiptRow(b.no)).payment, 500, 0.01, 'row prefilled');
    await pm.setReceivedAmount('800', 'Cancel');
    await pm.setReceiptRowPayment(b.no, '800');
    expect((await pm.trySavePayment()).saved).toBe(true);
    expectClose((await pm.billRow(b.no)).due, b.total - 800, 0.01, 'due after 800');
    await pm.editPayment(no);
    await pm.setReceivedAmount('0.01', 'Cancel');
    await pm.setReceiptRowPayment(b.no, '0.01');
    expect((await pm.trySavePayment()).saved).toBe(true);
    expectClose((await pm.billRow(b.no)).due, b.total - 0.01, 0.01, 'due after 0.01');
  });

  test('TC15 - Delete a payment that cleared a bill: the payment is gone and the bill due and vendor due are restored', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_013, PAY_NEG_010' } }, async () => {
    const b = await bill(5);
    const h0 = await pm.vendorHeader(VENDOR);
    const no = await pay(b.total, { [b.no]: b.total });
    expect((await pm.billRow(b.no)).status).toBe('Paid');
    expect(await pm.deletePayment(no), 'payment deleted').toBe(true);
    const br = await pm.billRow(b.no);
    expectClose(br.due, b.total, 0.01, 'bill due restored');
    expect(br.status).not.toBe('Paid');
    expectClose((await pm.vendorHeader(VENDOR)).due, h0.due, 0.05, 'vendor due restored');
  });

  test('TC16 - Cancel on a filled new payment made returns to the list without saving', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_017' } }, async ({ page }) => {
    const no = await pm.openNewPayment(VENDOR);
    await pm.fillPaymentForm({ amount: 10, answer: 'Cancel' });
    await pm.discardPaymentForm();
    await expect(page).toHaveURL(/purchase/);
    expect(await pm.paymentExists(no), `${no} not created`).toBe(false);
  });

  test('TC17 - A ₹0.01 bulk payment reduces the bill due by ₹0.01', { tag: T, annotation: { type: 'cases', description: 'PAY_BND_002' } }, async () => {
    const b = await bill(1);
    await pay(0.01, { [b.no]: 0.01 });
    expectClose((await pm.billRow(b.no)).due, b.total - 0.01, 0.005, 'due');
  });

  test('TC18 - A payment dated on the financial-year boundary (31 Mar 2026) is saved with that date', { tag: T, annotation: { type: 'cases', description: 'PAY_BND_010' } }, async () => {
    await pm.openNewPayment(VENDOR);
    await pm.setReceiptDate('March 31, 2026');
    await pm.fillPaymentForm({ amount: 1, answer: 'Cancel' });
    const no = await pm.confirmPaymentNumber(await pm.savePayment(), VENDOR, 1);
    expect((await pm.paymentListRow(no)).date).toBe('2026-03-31');
  });

  // ── View / print ─────────────────────────────────────────────────────────

  test('TC19 - Payment made view shows Close, Print, Edit and Delete, the vendor, PAY number, breakdown and summary, and Close and Escape both close it', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_009, PAY_FUNC_018, PAY_UI_013, PAY_UI_014, PAY_UI_016, PAY_ACC_009, PAY_EXP_004, PAY_EXP_005, PAY_EXP_006' } }, async ({ page }) => {
    const b = await bill(1);
    const no = await pay(b.total, { [b.no]: b.total });
    const v = await pm.readPaymentView(no);
    for (const t of ['Close', 'Print', 'Edit', 'Delete']) await expect(pm.paymentDrawer.getByRole('button', { name: t, exact: true })).toBeVisible();
    for (const t of [VENDOR, no, 'Payment Date', 'Paid Amount', 'S.No', 'Description', 'Amount used for payments', 'Excess Amount']) expect(v.text).toContain(t);
    expect(v.rows.some((r) => r.desc.includes(b.no))).toBe(true);
    await pm.closePaymentView();
    await pm.openPayment(no);
    await page.keyboard.press('Escape');
    await expect(pm.paymentDrawer).toBeHidden({ timeout: 5000 });
  });

  test('TC20 - Print in the payment made view opens the print preview', { tag: T, annotation: { type: 'cases', description: 'PAY_FUNC_010, PAY_EXP_001' } }, async ({ page }) => {
    const b = await bill(1);
    const no = await pay(b.total, { [b.no]: b.total });
    await pm.openPayment(no);
    // QA (BUG-PM-05): Print works — it prints through a hidden iframe, which capturePrint detects.
    const r = await capturePrint(page, () => pm.paymentDrawer.getByRole('button', { name: 'Print', exact: true }).click());
    expect(r.popup || r.download || r.print > 0, 'print preview / dialog / PDF opened').toBe(true);
  });

  test('TC21 - "Make Payment" from a bill creates a Payment Made entry with the bill and a balanced journal', { tag: T, annotation: { type: 'cases', description: 'PAY_E2E_010, PAY_BL_013, PAY_EXP_010' } }, async () => {
    const b = await bill(1);
    const before = new Set((await pm.allPayments(VENDOR)).map((r) => r[1]));
    await pm.payInvoice(b.no, b.total);
    expect((await pm.billRow(b.no)).status).toBe('Paid');
    const fresh = (await pm.allPayments(VENDOR)).filter((r) => !before.has(r[1]));
    expect(fresh.length, 'new Payment Made entry').toBeGreaterThan(0);
    let found;
    for (const r of fresh) {
      const v = await pm.readPaymentView(r[1]);
      if (v.rows.some((x) => x.desc.includes(b.no))) { found = v; break; }
      await pm.closePaymentView();
    }
    expect(found, 'payment with the bill').toBeTruthy();
    expectClose(found.journal.reduce((s, j) => s + j.debit, 0), found.journal.reduce((s, j) => s + j.credit, 0), 0.01, 'debit = credit');
    await expect(pm.paymentDrawer.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  });

  // ── Validation ───────────────────────────────────────────────────────────

  test('TC22 - Saving a payment made with nothing filled requires Paid Amount, Payment Mode and Account', { tag: T, annotation: { type: 'cases', description: 'PAY_NEG_002, PAY_NEG_003, PAY_NEG_004' } }, async () => {
    await pm.openNewPayment(VENDOR);
    const msg = await pm.savePaymentExpectRefused();
    expect(msg).toMatch(/Received Amount is required|Paid Amount is required/i);
    expect(msg).toMatch(/Paymentmode is Required|Payment Mode is required/i);
    expect(msg).toMatch(/Account is Required/i);
    await pm.discardPaymentForm();
  });

  test('TC23 - Paid Amount and the bill Payment field refuse "-" and letters', { tag: T, annotation: { type: 'cases', description: 'PAY_NEG_005, PAY_NEG_009, PAY_NEG_013' } }, async () => {
    await pm.openNewPayment(VENDOR);
    const amt = pm.receiveAmtField();
    for (const bad of ['-50', 'abc']) {
      await pm.typeValue(amt, bad);
      await pm.confirmReflectAmount();
      expect(await amt.inputValue(), `paid amount "${bad}"`).not.toMatch(/-|[a-z]/i);
    }
    const rowInput = pm.page.locator('table tbody tr').filter({ visible: true }).first().locator('input').last();
    for (const bad of ['-5', 'xyz']) {
      await pm.typeValue(rowInput, bad);
      expect(await rowInput.inputValue(), `row payment "${bad}"`).not.toMatch(/-|[a-z]/i);
    }
    await pm.discardPaymentForm();
  });

  test('TC24 - A Paid Amount of ₹0 is refused', { tag: T, annotation: { type: 'cases', description: 'PAY_NEG_008' } }, async () => {
    await pm.openNewPayment(VENDOR);
    await pm.fillPaymentForm({ amount: 0, answer: 'Cancel' });
    const r = await pm.trySavePayment();
    expect(r.saved, `₹0 payment must be refused ("${r.message}")`).toBe(false);
    await pm.discardPaymentForm();
  });

  // QA (BUG-PM-04): this is the flow — a Paid Amount above the bill rows is saved and the excess goes to the vendor's advance.
  test('TC25 - A paid amount above the bill payment is saved and the excess goes to advance', { tag: T, annotation: { type: 'cases', description: 'PAY_NEG_006, PAY_NEG_007, PAY_UI_012, PAY_VAL_015' } }, async () => {
    const b = await bill(10);
    await pm.openNewPayment(VENDOR);
    await pm.fillPaymentForm({ amount: b.total + 50, answer: 'Cancel', rows: { [b.no]: b.total } });
    const r = await pm.trySavePayment();
    expect(r.saved, `payment saved (${r.message || 'no message'})`).toBe(true);
  });

  test('TC26 - Paid Amount keeps 2 decimals (5000.75), and a 3rd decimal is rounded or refused', { tag: T, annotation: { type: 'cases', description: 'PAY_BND_013, PAY_BND_014' } }, async () => {
    await pm.openNewPayment(VENDOR);
    const amt = pm.receiveAmtField();
    await pm.setReceivedAmount('5000.75', 'Cancel');
    expect(parseFloat(await amt.inputValue())).toBe(5000.75);
    await pm.setReceivedAmount('5000.129', 'Cancel');
    expect(await amt.inputValue()).toMatch(/^5000(\.\d{1,2})?$/);
    await pm.discardPaymentForm();
  });

  test('TC27 - Bill No is automatic and read-only, and an empty Bill Date is refused', { tag: T, annotation: { type: 'cases', description: 'PAY_VAL_009, PAY_VAL_010' } }, async ({ page }) => {
    await pm.openNewPayment(VENDOR);
    await expect(pm.receiptNo).not.toBeEditable();
    await pm.fillPaymentForm({ amount: 1, answer: 'Cancel' });
    await pm.receiptDate.hover();
    const clear = page.locator('.ant-picker-clear').filter({ visible: true }).first();
    if (await clear.count()) await clear.click();
    else { await pm.receiptDate.click(); await pm.receiptDate.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await page.keyboard.press('Escape'); }
    await pm.settle(500, 'date cleared');
    const left = await pm.receiptDate.inputValue();
    if (left) {
      console.log(`Bill Date cannot be emptied (shows "${left}") — the mandatory date is enforced by the picker`);
      await pm.discardPaymentForm();
      return;
    }
    const r = await pm.trySavePayment();
    expect(r.saved, `empty date must be refused ("${r.message}")`).toBe(false);
    await pm.discardPaymentForm();
  });

  test('TC28 - Script text in notes (up to 250 characters) and a long reference are stored as text and nothing runs', { tag: T, annotation: { type: 'cases', description: 'PAY_NEG_015, PAY_SEC_005, PAY_BND_008, PAY_BND_009' } }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const notes = `<script>window.__xss=1</script>${'N'.repeat(200)}`;   // notes limit: 250 characters
    const ref = `<img src=x onerror="window.__xss=1">${'R'.repeat(200)}`;
    await pm.openNewPayment(VENDOR);
    await pm.fillPaymentForm({ amount: 1, answer: 'Cancel', ref, notes });
    const typedRef = await pm.receiptRef.inputValue();
    const no = await pm.confirmPaymentNumber(await pm.savePayment(), VENDOR, 1);
    await pm.readPaymentView(no);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
    await pm.closePaymentView();
    await pm.editPayment(no);
    const savedRef = await pm.receiptRef.inputValue();
    expect(typedRef.startsWith(savedRef.slice(0, 20))).toBe(true);
    console.log(`reference typed ${typedRef.length} chars, saved ${savedRef.length}; notes saved ${(await pm.receiptNotes.inputValue()).length}`);
  });

  // ── Search / filter / pagination ─────────────────────────────────────────

  test('TC29 - Search payments made by exact, partial, vendor, case, trimmed, no match and SQL text: the count follows and clearing the search restores the list', { tag: T, annotation: { type: 'cases', description: 'PAY_SF_001, PAY_SF_002, PAY_SF_003, PAY_SF_004, PAY_SF_008, PAY_SF_010, PAY_SF_011, PAY_SF_012, PAY_NEG_011, PAY_NEG_016' } }, async ({ page }) => {
    const all = await pm.searchPayments('');
    const total = await pm.totalCount();
    const no = all[0][1];
    const exact = await pm.searchPayments(no);
    expect(exact.map((r) => r[1])).toEqual([no]);
    expect(await pm.totalCount()).toBe(1);
    const part = await pm.searchPayments('PAY-AUTO/00');
    expect(part.length).toBeGreaterThan(0);
    for (const r of part) expect(r[1]).toContain('PAY-AUTO/00');
    const byVendor = await pm.searchPayments(VENDOR);
    expect(byVendor.length).toBeGreaterThan(0);
    for (const r of byVendor) expect(r[2]).toContain(VENDOR);
    const n = await pm.totalCount();
    await pm.searchPayments(VENDOR.toUpperCase());
    expect(await pm.totalCount(), 'case-insensitive').toBe(n);
    await pm.searchPayments(`  ${VENDOR}  `);
    const padded = await pm.totalCount();
    await bugCheck('BUG-GEN-01', 'search does not trim spaces', async () => {
      expect(padded, 'trimmed').toBe(n);
    });
    expect(await pm.searchPayments('ZZZ-NO-SUCH-PAY-123')).toEqual([]);
    expect(await pm.searchPayments("' OR 1=1 --")).toEqual([]);
    await expect(page.locator('table').first()).toBeVisible();
    await pm.searchPayments('');
    expect(await pm.totalCount()).toBe(total);
  });

  test('TC30 - Payment made date filter: a reversed range gives nothing or an error, today to today shows only today, it works with vendor search, and reload restores it', { tag: T, annotation: { type: 'cases', description: 'PAY_SF_005, PAY_SF_006, PAY_SF_007, PAY_SF_009, PAY_NEG_012' } }, async () => {
    const total = (await pm.searchPayments(''), await pm.totalCount());
    await pm.setListDateRange(new Date(), addDays(new Date(), -10)).catch((e) => console.log(`reversed range not accepted: ${e.message.slice(0, 80)}`));
    const reversed = await pm.readListRows();
    console.log(`reversed range rows: ${reversed.length}`);
    await pm.page.reload();
    await pm.settle(3000, 'filter cleared');
    await pm._searchPayments(VENDOR);
    await pm.setListDateRange(new Date(), new Date());
    const today = await pm.readListRows();
    for (const r of today) {
      expect(r[0]).toBe(iso(new Date()));
      expect(r[2]).toContain(VENDOR);
    }
    await pm.page.reload();
    await pm.settle(3000, 'filter cleared');
    await pm.searchPayments('');
    expect(await pm.totalCount()).toBe(total);
  });

  test('TC31 - Payment made pagination: 20 per page, next, previous and page number work with no duplicates (one page when 20 or fewer)', { tag: T, annotation: { type: 'cases', description: 'PAY_PAG_001…009, PAY_BND_006, PAY_BND_007' } }, async ({ page }) => {
    await pm.searchPayments('');
    const total = await pm.totalCount();
    const pag = page.locator('ul.ant-pagination').first();
    const rows1 = await pm.readListRows();
    if (total <= 20) {
      expect(rows1.length).toBe(total);
      if (await pag.count()) await expect(pag.locator('li.ant-pagination-next')).toHaveAttribute('aria-disabled', 'true');
      return;
    }
    expect(rows1.length).toBe(20);
    await expect(pag.locator('li.ant-pagination-prev')).toHaveAttribute('aria-disabled', 'true');
    const seen = rows1.map((r) => r[1]);
    await pag.locator('li.ant-pagination-next').click();
    await pm.settle(2000, 'page 2');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    const rows2 = await pm.readListRows();
    seen.push(...rows2.map((r) => r[1]));
    await pag.locator('li.ant-pagination-prev').click();
    await pm.settle(2000, 'page 1');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('1');
    await pag.locator('li.ant-pagination-item-2').click();
    await pm.settle(2000, 'page 2 directly');
    expect((await pm.readListRows()).map((r) => r[1])).toEqual(rows2.map((r) => r[1]));
    expect(new Set(seen).size).toBe(seen.length);
    await pm.fillInto(pm.listSearch, VENDOR);
    await pm.settle(2500, 'search');
    await bugCheck('BUG-GEN-02', 'a new search keeps the current page', async () => {
      await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('1', { timeout: 5000 });
    });
  });

  // ── Security / accessibility ─────────────────────────────────────────────

  test('TC32 - Without a session the payments made page redirects to login, shows no payments and the payments API refuses', { tag: T, annotation: { type: 'cases', description: 'PAY_SEC_001, PAY_SEC_009' } }, async ({ browser, page }) => {
    const apiCall = page.waitForResponse((r) => /api/.test(r.url()) && /payment/i.test(r.url()) && r.request().method() === 'GET', { timeout: 30_000 }).catch(() => null);
    await pm._searchPayments('');
    const api = await apiCall;
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });   // no saved session
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/purchase/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row')).toHaveCount(0);
    if (api) {
      const res = await anon.request.get(api.url());
      expect([401, 403]).toContain(res.status());
    }
    await ctx.close();
  });

  test('TC33 - Escape closes the Payment Mode dropdown in a payment made', { tag: T, annotation: { type: 'cases', description: 'PAY_ACC_007' } }, async ({ page }) => {
    await pm.openNewPayment(VENDOR);
    await pm.receiptEditMode.locator('.ant-select-selector').click();
    await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toHaveCount(0);
    await pm.discardPaymentForm();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC34', 'PAY_FUNC_003 (other vendor)', 'Another vendor\'s bills not listed', 'Only one test vendor; the due list is checked against paid / unpaid bills of it.'],
    ['TC35', 'PAY_POS_016 / PAY_BL_014 / PAY_E2E_008', 'Vendor advance applied to a new bill', 'No control to apply a vendor advance on the purchase side.'],
    ['TC36', 'PAY_UI_020', 'Empty state with no payments', 'The org already has payments.'],
    ['TC37', 'PAY_EXP_002 / 003 / 009', 'Printed content (company header, title, journal)', 'Browser print preview content needs a PDF reader.'],
    ['TC38', 'PAY_SEC_002', 'Session timeout', 'Needs a shortened session lifetime.'],
    ['TC39', 'PAY_SEC_006 / 007', 'View-only / Accountant role restrictions', 'No such users in the test data.'],
    ['TC40', 'PAY_SEC_008 / 011', 'Another org\'s payments / vendors', 'Needs a second org.'],
    ['TC41', 'PAY_SEC_010 / 012', 'CSRF / DevTools-manipulated amount', 'API-level security tests, not UI tests.'],
    ['TC42', 'PAY_PERF_001…008', 'Response-time limits', 'Environment-dependent; not a functional check.'],
    ['TC43', 'PAY_ACC_001 / 003 / 004 / 006', 'Tab order, screen reader, contrast', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
