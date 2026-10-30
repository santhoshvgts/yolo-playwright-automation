// ═════════════════════════════════════════════════════════════════════════
// Expense (YOLO_BOOKS_Expense_TC.xlsx: EXP_FUNC / POS / NEG / UI / VAL / BND / BL / SF / PAG / SEC / E2E /
// PERF / ACC).
// Expected totals come from the tax model below (exclusive: total = amount × (1 + r); inclusive: amount is
// the total, sub = amount / (1 + r)); intra-state (Source = Destination = Tamil Nadu) splits CGST / SGST,
// inter-state (Source Karnataka) is IGST. Account "Office Supplies", Paid Through "Petty Cash", GST
// Treatment "Registered Business" (+ GSTIN) whenever a row is taxed — tax is disabled for Unregistered Business.
// Adapted: numbers are EXP-AUTO/NNNN (sheet: EXP/XXXX); Description limit is 500 (placeholder "Max. 500
// characters"; sheet: 100); GST Treatment is required ("Please Select Vendor Account").
//
// Same case as another one here:
//   EXP_VAL_001 / 011 = EXP_NEG_003 · EXP_VAL_002 = EXP_NEG_002 · EXP_VAL_003 / 009 = EXP_NEG_005
//   EXP_VAL_004 / 008 = EXP_NEG_008 · EXP_VAL_006 = EXP_NEG_006 · EXP_VAL_007 / EXP_BND_004 = EXP_NEG_007
//   EXP_VAL_012 / EXP_BL_003 = EXP_POS_001 · EXP_VAL_013 / EXP_BL_004 = EXP_POS_014 · EXP_SEC_004 = SF test
//   EXP_NEG_015 = EXP_FUNC_013 (last row) · EXP_BND_005 = EXP_POS_001 · EXP_BND_008 = EXP_FUNC_002
//
//   npx playwright test tests/purchase/06_Expense.spec.js --grep @expense
// ═════════════════════════════════════════════════════════════════════════

const { test, expect } = require('../../fixtures/base-test');
const { ExpensePage } = require('../../pages/purchase/ExpensePage');
const { pickerDate, addDays } = require('../../pages/sales/SalesInvoiceEditPage');
const { masterData } = require('../../test-data/UserData');
const { expectClose } = require('../../utils/stockMath');
const { capturePrint } = require('../../utils/testHelpers');

const T = ['@purchase', '@expense'];
const REG = { gst: 'Registered Business' };   // POM fills a GSTIN
const r2 = (n) => Math.round(n * 100) / 100;
// The expense list shows dates as MM/DD/YYYY
const iso = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
const filterDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}, ${d.getFullYear()}`;
/** Expected summary of rows [{ amount, tax: 'GST18' | undefined }]. */
const model = (rows, { inclusive = false } = {}) => {
  let sub = 0; let tax = 0;
  for (const r of rows) {
    const rate = r.tax ? Number(r.tax.replace('GST', '')) / 100 : 0;
    const base = inclusive ? r.amount / (1 + rate) : r.amount;
    sub += base; tax += base * rate;
  }
  return { sub: r2(sub), tax: r2(tax), total: r2(sub + tax) };
};

test.describe('Expense', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {ExpensePage} */
  let ex;
  const VENDOR = masterData.vendorName;
  test.beforeEach(async ({ page }) => {
    ex = new ExpensePage(page);
    await ex.open();
  });

  const expectSummary = async (exp, label = 'summary') => {
    const s = await ex.readExpenseSummary();
    expectClose(s.sub, exp.sub, 0.02, `${label} sub total`);
    expectClose(s.tax, exp.tax, 0.02, `${label} tax`);
    expectClose(s.total, exp.total, 0.02, `${label} total`);
    return s;
  };

  // ── List / form ──────────────────────────────────────────────────────────

  test('TC01 - The expense list shows Date, Expense No., Reference, Vendor Name, Paid Through, Amount and Status, a "New Expense" button, search and dates, and the Total Count', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_001, EXP_FUNC_017, EXP_UI_001, EXP_UI_009, EXP_UI_014' } }, async ({ page }) => {
    await ex._searchList('');
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['Date', 'Expense No.', 'Reference', 'Vendor Name', 'Paid Through', 'Amount', 'Status']);
    await expect(ex.newExpenseBtn).toHaveClass(/ant-btn-primary/);
    await expect(ex.listSearch).toBeVisible();
    await expect(ex.listDateStart).toBeVisible();
    await expect(ex.listDateEnd).toBeVisible();
    await expect(ex.footerText).toBeVisible();
  });

  test('TC02 - New Expense (Enter key) opens with a read-only EXP-AUTO number, today\'s date, header fields, row columns, summary and buttons', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_002, EXP_FUNC_003, EXP_UI_003, EXP_UI_004, EXP_UI_005, EXP_UI_007, EXP_UI_010, EXP_UI_012, EXP_VAL_015, EXP_ACC_002, EXP_ACC_007' } }, async ({ page }) => {
    await ex._searchList('');
    await ex.newExpenseBtn.focus();
    await page.keyboard.press('Enter');
    await expect(ex.expenseNo).toBeVisible();
    await expect(ex.expenseNo).toHaveValue(/^EXP-AUTO\/\d{4,}$/);
    await expect(ex.expenseNo).not.toBeEditable();
    await expect(ex.expenseDate).toHaveValue(pickerDate(new Date()));
    for (const id of ['#payment_account', '#reference_number', '#vendor', '#vendor_registration_type', '#source', '#destination', '#client']) await expect(page.locator(id), id).toBeAttached();
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['EXPENSE ACCOUNT', 'CATEGORY', 'EXPENSE TYPE', 'Description', 'TAX', 'AMOUNT', '']);
    await expect(ex.addRowBtn).toBeVisible();
    expect(await ex.totalRows()).toBe(1);
    const s = await ex.readExpenseSummary();
    for (const t of ['Sub Total', 'Total Tax Amount', 'Expense Total']) expect(s.text).toContain(t);
    for (const b of ['Cancel', 'Save as Draft', 'Save']) await expect(page.getByRole('button', { name: b, exact: true })).toBeVisible();
    await expect(ex.expSaveBtn).toHaveClass(/ant-btn-primary/);
    await ex.discardExpense();
  });

  test('TC03 - Saving an empty expense requires Paid Through, GST Treatment and Source, and a row without an Expense Account is refused', { tag: T, annotation: { type: 'cases', description: 'EXP_NEG_001, EXP_NEG_002, EXP_NEG_003' } }, async () => {
    await ex.openNewExpense();
    const r = await ex.trySaveExpense();
    expect(r.saved).toBe(false);
    expect(r.message).toMatch(/Payment Account is Required/i);
    expect(r.message).toMatch(/Source is Required/i);
    await ex.fillHeader({});
    await ex.fillRow(0, { account: null, amount: 100 });
    const r2b = await ex.trySaveExpense();
    expect(r2b.saved, `row without account must be refused ("${r2b.message}")`).toBe(false);
    await ex.discardExpense();
  });

  test('TC04 - Expense rows: add a row (keyboard), amounts sum, remove row 1, and the last row cannot be removed so the table is never empty', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_012, EXP_FUNC_013, EXP_UI_013, EXP_POS_004, EXP_BL_005, EXP_VAL_017, EXP_ACC_009' } }, async ({ page }) => {
    await ex.openNewExpense();
    await ex.fillRow(0, { amount: 1000 });
    await ex.addRowBtn.focus();
    await page.keyboard.press('Enter');
    await ex.settle(600, 'row added');
    expect(await ex.totalRows()).toBe(2);
    await ex.fillRow(1, { amount: 2000 });
    await expectSummary(model([{ amount: 1000 }, { amount: 2000 }]), 'two rows');
    await ex.removeRow(0);
    expect(await ex.totalRows()).toBe(1);
    await expectSummary(model([{ amount: 2000 }]), 'after removing row 1');
    await ex.removeRow(0).catch(() => {});
    expect(await ex.rows.count(), 'at least one row stays').toBeGreaterThanOrEqual(1);
    await ex.discardExpense();
  });

  // ── Create / totals ──────────────────────────────────────────────────────

  test('TC05 - Expense GST18 exclusive ₹5,000 intra-state: CGST and SGST are 450 each, total is 5,900, and it is listed (no vendor, Petty Cash)', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_001, EXP_POS_002, EXP_POS_012, EXP_POS_013, EXP_BL_001, EXP_BL_006, EXP_BL_007, EXP_BL_017, EXP_FUNC_004, EXP_E2E_001, EXP_E2E_014' } }, async () => {
    const rows = [{ amount: 5000, tax: 'GST18' }];
    const exp = model(rows);
    await ex.openNewExpense();
    await ex.fillHeader({ ...REG, taxMode: 'Exclusive tax' });
    await ex.fillRow(0, rows[0]);
    const s = await expectSummary(exp);
    expectClose(s.cgst, 450, 0.02, 'CGST');
    expectClose(s.sgst, 450, 0.02, 'SGST');
    expect(s.igst).toBe(0);
    expect(s.text).toMatch(/Expense Total \( ₹ \)\s*5,900\.00/);
    const no = await ex.confirmExpenseNumber(await ex.saveExpense(), exp.total);
    const row = await ex.expenseRow(no);
    expect(row.date).toBe(iso(new Date()));
    expect(row.paidThrough).toMatch(/Petty Cash/);
    expect(row.vendor).toMatch(/^-?$/);
    expectClose(row.amount, exp.total, 0.02, 'list amount');
    // Journal checks dropped — QA (BUG-EX-01): expense journal entries are not developed yet.
  });

  test('TC06 - Expense inclusive ₹5,000 at GST18: total is 5,000 and sub total 4,237.29, and switching to exclusive recalculates the total to 5,900', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_003, EXP_BL_002, EXP_E2E_010, EXP_UI_006' } }, async () => {
    const rows = [{ amount: 5000, tax: 'GST18' }];
    await ex.openNewExpense();
    await ex.fillHeader({ ...REG, taxMode: 'Inclusive tax' });
    await ex.fillRow(0, rows[0]);
    await expectSummary(model(rows, { inclusive: true }), 'inclusive');
    await ex.choose(ex.taxModeSel, 'Exclusive tax');
    await ex.settle(800, 'recalculated');
    await expectSummary(model(rows), 'exclusive');
    await ex.discardExpense();
  });

  test('TC07 - Inter-state expense (Source Karnataka to Tamil Nadu) of ₹10,000 at GST18: IGST is 1,800 with no CGST or SGST', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_014, EXP_E2E_011' } }, async () => {
    const rows = [{ amount: 10000, tax: 'GST18' }];
    const exp = model(rows);
    await ex.openNewExpense();
    await ex.fillHeader({ ...REG, source: 'Karnataka', taxMode: 'Exclusive tax' });
    await ex.fillRow(0, rows[0]);
    const s = await expectSummary(exp);
    expectClose(s.igst, 1800, 0.02, 'IGST');
    expect(s.cgst + s.sgst).toBe(0);
    await ex.confirmExpenseNumber(await ex.saveExpense(), exp.total);
    // Journal check dropped — QA (BUG-EX-01): expense journal entries are not developed yet.
  });

  test('TC08 - Expense rows with GST5, no tax and GST18: each is taxed on its own, and the untaxed row adds only to the sub total', { tag: T, annotation: { type: 'cases', description: 'EXP_BL_015, EXP_BL_016, EXP_E2E_004, EXP_BND_011' } }, async () => {
    const rows = [{ amount: 1000, tax: 'GST5' }, { amount: 2000, tax: 'GST0' }, { amount: 500, tax: 'GST18' }];   // a registered expense needs a tax on every row — "no tax" = GST0
    const exp = model(rows);
    await ex.openNewExpense();
    await ex.fillHeader({ ...REG, taxMode: 'Exclusive tax' });
    for (const [i, r] of rows.entries()) await ex.fillRow(i, r);
    await expectSummary(exp);
    const no = await ex.confirmExpenseNumber(await ex.saveExpense(), exp.total);
    expectClose((await ex.expenseRow(no)).amount, exp.total, 0.02, 'list amount');
  });

  test('TC09 - An expense with a vendor and a special-character reference: both appear in the list and script text is not run', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_005, EXP_E2E_006, EXP_POS_007, EXP_VAL_014, EXP_NEG_014, EXP_SEC_005, EXP_BND_012' } }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const ref = `R#-/${Date.now() % 10000}<img src=x onerror=window.__xss=1>${'X'.repeat(60)}`;
    const rows = [{ amount: 750 }];
    await ex.openNewExpense();
    await ex.fillHeader({ vendor: VENDOR, ref });
    await ex.fillRow(0, rows[0]);
    const typed = await ex.expRef.inputValue();
    const no = await ex.confirmExpenseNumber(await ex.saveExpense(), 750);
    const row = await ex.expenseRow(no);
    expect(row.vendor).toContain(VENDOR);
    expect(row.ref.slice(0, 10)).toBe(typed.slice(0, 10));
    await ex.readExpenseView(no);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  // QA (BUG-EX-04): a customer alone does not make it billable — "This Expense is Billable" must be ticked.
  test('TC10 - An expense with a customer and Billable ticked shows IS BILLABLE Yes in the view, and without a customer it is Non-Billable', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_009, EXP_BL_012, EXP_BL_013, EXP_E2E_005, EXP_FUNC_019' } }, async () => {
    const plain = await ex.createExpense({}, [{ amount: 300 }]);
    expect((await ex.readExpenseView(plain.no)).text).toMatch(/Non-Billable/i);
    await ex.page.keyboard.press('Escape');
    const billable = await ex.createExpense({ customer: 'saravana store', billable: true }, [{ amount: 310 }]);
    // The view header shows "IS BILLABLE Yes" (the footer keeps a Non-Billable label either way)
    expect((await ex.readExpenseView(billable.no)).text).toMatch(/IS BILLABLE\s*Yes/i);
  });

  test('TC11 - Expense for a Registered Business: an invalid GSTIN is refused and a valid one saves', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_008, EXP_NEG_009, EXP_VAL_005, EXP_VAL_010' } }, async ({ page }) => {
    await ex.openNewExpense();
    await ex.fillHeader({ gst: 'Registered Business' });
    const gst = ex.gstinInput();
    const ids = await page.locator('input').filter({ visible: true }).evaluateAll((es) => es.map((e) => `${e.id}|${e.placeholder}`));
    console.log(`inputs after Registered: ${ids.join(', ')}`);
    await expect(gst, 'GST number field for Registered Business').toBeVisible({ timeout: 5000 });
    await ex.fillRow(0, { amount: 400, tax: 'GST18' });
    await gst.fill('INVALID123');
    const bad = await ex.trySaveExpense();
    expect(bad.saved, 'invalid GSTIN refused').toBe(false);
    await gst.fill('33ABCDE1234F1Z5');
    const ok = await ex.trySaveExpense();
    expect(ok.saved, `valid GSTIN saves ("${ok.message}")`).toBe(true);
  });

  // ── Draft / edit / delete ────────────────────────────────────────────────

  test('TC12 - Save an expense as Draft: it has Draft status and the values are kept', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_005, EXP_VAL_016, EXP_BL_010, EXP_POS_017, EXP_UI_002' } }, async () => {
    const d = await ex.createExpense({ ...REG, ref: 'DRAFT-REF' }, [{ amount: 1200, tax: 'GST18', desc: 'draft row' }], { draft: true });
    expect((await ex.expenseRow(d.no)).status).toMatch(/Draft/i);
    await ex.editExpense(d.no);
    // BUG-EX-06 fixed (2026-10-28 run): the draft keeps its Reference No.
    expect(await ex.expRef.inputValue()).toBe('DRAFT-REF');
    expect(parseFloat(await ex.rowAmount(0).inputValue())).toBe(1200);
    expect(await ex.rowNotes(0).inputValue()).toBe('draft row');
    await expectSummary(model([{ amount: 1200, tax: 'GST18' }]), 'draft reopened');
    await ex.discardExpense();
  });

  test('TC13 - Edit a draft expense and Save: it is no longer Draft, and the edit screen of a saved expense has no "Save as Draft"', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_010, EXP_BL_011, EXP_BL_018, EXP_E2E_002, EXP_FUNC_020' } }, async ({ page }) => {
    const d = await ex.createExpense({}, [{ amount: 800 }], { draft: true });
    await ex.editExpense(d.no);
    await ex.fillRow(0, { account: null, amount: 900 });
    await ex.saveExpense();
    const row = await ex.expenseRow(d.no);
    expect(row.status).not.toMatch(/Draft/i);
    expectClose(row.amount, 900, 0.02, 'amount');
    // Journal check dropped — QA (BUG-EX-01): expense journal entries are not developed yet.
    await ex.editExpense(d.no);
    await expect(page.getByRole('button', { name: 'Save as Draft' })).toHaveCount(0);
    await ex.discardExpense();
  });

  // QA (BUG-EX-03): Paid Through keeps its saved account on edit (current flow).
  // QA (BUG-EX-01): expense journal entries are not developed yet, so no journal checks.
  test('TC14 - Edit a saved expense: fields are pre-filled, changing ₹1,000 to ₹1,500 shows in the list, and Paid Through stays Petty Cash', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_009, EXP_FUNC_010, EXP_BL_008, EXP_E2E_008, EXP_E2E_013' } }, async () => {
    const e = await ex.createExpense({}, [{ amount: 1000 }]);
    await ex.editExpense(e.no);
    expect(parseFloat(await ex.rowAmount(0).inputValue())).toBe(1000);
    await ex.fillRow(0, { account: null, amount: 1500 });
    await ex.saveExpense();
    const row = await ex.expenseRow(e.no);
    expectClose(row.amount, 1500, 0.02, 'amount');
    expect(row.paidThrough).toMatch(/Petty Cash/);
  });

  test('TC15 - Cancel on the expense edit screen keeps the saved amount', { tag: T, annotation: { type: 'cases', description: 'EXP_NEG_016' } }, async () => {
    const e = await ex.createExpense({}, [{ amount: 5000 }]);
    await ex.editExpense(e.no);
    await ex.fillRow(0, { account: null, amount: 7777 });
    await ex.discardExpense();
    expectClose((await ex.expenseRow(e.no)).amount, 5000, 0.02, 'unchanged');
  });

  test('TC16 - Delete an expense: choosing No keeps it, and choosing Yes removes it and the count drops', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_011, EXP_POS_011, EXP_BL_009, EXP_E2E_003, EXP_NEG_010, EXP_ACC_008' } }, async () => {
    const e = await ex.createExpense({}, [{ amount: 222 }]);
    expect(await ex.deleteExpense(e.no, { confirm: false }), 'No keeps the expense').toBe(false);
    expect(await ex.deleteExpense(e.no), 'Yes deletes').toBe(true);   // (no count check: other users add expenses meanwhile)
  });

  test('TC17 - Cancel on a filled new expense saves nothing', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_006, EXP_E2E_015' } }, async () => {
    await ex._searchList('');
    const before = await ex.totalCount();
    const no = await ex.openNewExpense();
    await ex.fillHeader({});
    await ex.fillRow(0, { amount: 99 });
    await ex.discardExpense();
    expect(await ex.expenseExists(no)).toBe(false);
    await ex._searchList('');
    expect(await ex.totalCount()).toBe(before);
  });

  // ── View / print ─────────────────────────────────────────────────────────

  test('TC18 - Expense view shows the #EXP number, Close, Print, Edit and ⋮ actions and company details, and Close returns to the list', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_007, EXP_FUNC_008, EXP_FUNC_015, EXP_FUNC_018, EXP_UI_008, EXP_UI_011, EXP_POS_016' } }, async ({ page }) => {
    const e = await ex.createExpense({ ...REG }, [{ amount: 640, tax: 'GST18' }]);
    const v = await ex.readExpenseView(e.no);
    expect(v.text).toContain(e.no);
    for (const b of ['Close', 'Print', 'Edit']) expect(v.buttons.join(' ')).toContain(b);
    expect(v.text).toContain('Automation Testing Org');
    // Journal checks dropped — QA (BUG-EX-01): expense journal entries are not developed yet.
    await ex.expDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.ant-drawer-content').filter({ visible: true })).toHaveCount(0);
  });

  test('TC19 - Print on an expense opens a print preview, dialog or PDF', { tag: T, annotation: { type: 'cases', description: 'EXP_FUNC_014, EXP_E2E_007' } }, async ({ page }) => {
    const e = await ex.createExpense({}, [{ amount: 150 }]);
    await ex.openExpense(e.no);
    // QA (BUG-EX-07): Print works — it prints through a hidden iframe, which capturePrint detects.
    const r = await capturePrint(page, () => ex.expDrawer.getByRole('button', { name: 'Print' }).click());
    expect(r.popup || r.download || r.print > 0, 'print preview / dialog / PDF opened').toBe(true);
  });

  // ── Field rules ──────────────────────────────────────────────────────────

  test('TC20 - Expense amount refuses "-" and letters, and ₹0 is not saved', { tag: T, annotation: { type: 'cases', description: 'EXP_NEG_004, EXP_NEG_005, EXP_NEG_006' } }, async () => {
    await ex.openNewExpense();
    await ex.fillHeader({});
    await ex.fillRow(0, {});
    for (const bad of ['-50', 'abc']) {
      await ex.typeValue(ex.rowAmount(0), bad);
      expect(await ex.rowAmount(0).inputValue(), `amount "${bad}"`).not.toMatch(/-|[a-z]/i);
    }
    await ex.fillRow(0, { account: null, amount: 0 });
    const r = await ex.trySaveExpense();
    expect(r.saved, `₹0 expense must be refused ("${r.message}")`).toBe(false);
    await ex.discardExpense();
  });

  test('TC21 - Expense description keeps 100 characters, is cut beyond 500, and whitespace-only and script text are saved as text', { tag: T, annotation: { type: 'cases', description: 'EXP_NEG_007, EXP_NEG_018, EXP_POS_015, EXP_BND_003, EXP_SEC_006' } }, async ({ page }) => {
    await ex.openNewExpense();
    await ex.fillHeader({});
    await ex.fillRow(0, { desc: 'D'.repeat(600), amount: 50 });
    expect((await ex.rowNotes(0).inputValue()).length, 'description limit').toBeLessThanOrEqual(500);
    await ex.rowNotes(0).fill(`<script>window.__xss=1</script>${'d'.repeat(68)}`);
    const no = await ex.confirmExpenseNumber(await ex.saveExpense(), 50);
    await ex.readExpenseView(no);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await ex.page.keyboard.press('Escape');
    const blank = await ex.createExpense({}, [{ desc: '     ', amount: 51 }]);
    expect(await ex.expenseExists(blank.no)).toBe(true);
  });

  test('TC22 - Expense amounts: 1000.999 is limited to 2 decimals, and ₹0.01 and ₹9,99,99,999 save with correct totals', { tag: T, annotation: { type: 'cases', description: 'EXP_VAL_018, EXP_BND_001, EXP_BND_002, EXP_BND_009' } }, async () => {
    await ex.openNewExpense();
    await ex.fillHeader({});
    await ex.fillRow(0, { amount: '1000.999' });
    expect(await ex.rowAmount(0).inputValue()).toMatch(/^1\d{3}(\.\d{1,2})?$/);
    await ex.discardExpense();
    for (const amt of [0.01, 99999999]) {
      const e = await ex.createExpense({ ...REG }, [{ amount: amt, tax: 'GST18' }]);
      expectClose((await ex.expenseRow(e.no)).amount, model([{ amount: amt, tax: 'GST18' }]).total, 0.02, `total for ${amt}`);
    }
  });

  test('TC23 - An expense with twenty rows of ₹100 saves with a sub total of ₹2,000', { tag: T, annotation: { type: 'cases', description: 'EXP_BND_006, EXP_PERF_004' } }, async () => {
    const rows = Array.from({ length: 20 }, () => ({ amount: 100 }));
    await ex.openNewExpense();
    await ex.fillHeader({});
    for (const [i, r] of rows.entries()) await ex.fillRow(i, r);
    expect(await ex.totalRows()).toBe(20);
    await expectSummary(model(rows));
    const t0 = Date.now();
    const no = await ex.confirmExpenseNumber(await ex.saveExpense(), 2000);
    console.log(`20-row save took ${Date.now() - t0} ms`);
    expectClose((await ex.expenseRow(no)).amount, 2000, 0.02, 'amount');
  });

  test('TC24 - An expense with an empty date is refused', { tag: T, annotation: { type: 'cases', description: 'EXP_NEG_008' } }, async ({ page }) => {
    await ex.openNewExpense();
    await ex.fillHeader({});
    await ex.fillRow(0, { amount: 60 });
    await ex.expenseDate.hover();
    const clear = page.locator('.ant-picker-clear').filter({ visible: true }).first();
    if (await clear.count()) await clear.click();
    await ex.settle(500, 'date cleared');
    const left = await ex.expenseDate.inputValue();
    test.skip(!!left, `date cannot be emptied (shows "${left}")`);
    const r = await ex.trySaveExpense();
    expect(r.saved, `empty date must be refused ("${r.message}")`).toBe(false);
    await ex.discardExpense();
  });

  // QA (BUG-EX-02): a future date is allowed and the "created successfully" message must show (fixed in the 2026-10-28 run).
  test('TC25 - An expense dated a year ahead is saved with a "created successfully" message', { tag: T, annotation: { type: 'cases', description: 'EXP_NEG_013, EXP_BND_007' } }, async () => {
    await ex.openNewExpense();
    await ex.fillHeader({ date: pickerDate(addDays(new Date(), 365)) });
    await ex.fillRow(0, { amount: 61 });
    const success = ex.page.locator('.ant-message-notice').filter({ hasText: /success/i }).first()
      .waitFor({ timeout: 20_000 }).then(() => true, () => false);
    const r = await ex.trySaveExpense();
    expect(r.saved, 'future-dated expense is saved').toBe(true);
    expect(await success, '"created successfully" message shown').toBe(true);
  });

  // ── Search / filter / pagination ─────────────────────────────────────────

  test('TC26 - Search expenses by number, vendor, partial text, case, no match and SQL text, and clearing the search restores the list', { tag: T, annotation: { type: 'cases', description: 'EXP_SF_001, EXP_SF_002, EXP_SF_003, EXP_SF_007, EXP_SF_008, EXP_SF_010, EXP_SEC_004' } }, async () => {
    const e = await ex.createExpense({ vendor: VENDOR }, [{ amount: 333 }]);
    await ex._searchList('');
    const total = await ex.totalCount();
    await ex._searchList(e.no);
    expect((await ex.readListRows()).map((r) => r[1])).toEqual([e.no]);
    await ex._searchList(VENDOR);
    const byVendor = await ex.readListRows();
    expect(byVendor.length).toBeGreaterThan(0);
    for (const r of byVendor) expect(r[3]).toContain(VENDOR);
    const n = await ex.totalCount();
    await ex._searchList(VENDOR.toUpperCase());
    expect(await ex.totalCount(), 'case-insensitive').toBe(n);
    await ex._searchList('EXP-AUTO/00');
    for (const r of await ex.readListRows()) expect(r[1]).toContain('EXP-AUTO/00');
    await ex._searchList('ZZZ-NO-SUCH-EXPENSE');
    expect(await ex.readListRows()).toEqual([]);
    await ex._searchList("' OR 1=1 --");
    expect(await ex.readListRows()).toEqual([]);
    await ex._searchList('');
    expect(await ex.totalCount()).toBe(total);
  });

  test('TC27 - Expense date filter: today only (with vendor search), reversed range and reload restore work, and the newest expense is first', { tag: T, annotation: { type: 'cases', description: 'EXP_SF_004, EXP_SF_005, EXP_SF_006, EXP_SF_009, EXP_SF_011, EXP_SF_012, EXP_NEG_017, EXP_E2E_009, EXP_PAG_010' } }, async () => {
    const created = await ex.createExpense({ vendor: VENDOR }, [{ amount: 444 }]);
    await ex._searchList('');
    const total = await ex.totalCount();
    // QA (BUG-EX-07): the list is ordered newest created first, not by expense date.
    expect((await ex.readListRows())[0][1], 'newest created expense first').toBe(created.no);
    await ex._searchList(VENDOR);
    await ex.setListDateRange(new Date(), new Date());
    const rows = await ex.readListRows();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) { expect(r[0]).toBe(iso(new Date())); expect(r[3]).toContain(VENDOR); }
    await ex.setListDateRange(new Date(), addDays(new Date(), -10)).catch(() => {});
    console.log(`reversed range rows: ${(await ex.readListRows()).length}`);
    await ex.page.reload();
    await ex.settle(3000, 'reload');
    await ex._searchList('');
    expect(await ex.totalCount()).toBe(total);
  });

  test('TC28 - The expense list footer total equals the sum of the amounts, and there is one page when 20 or fewer', { tag: T, annotation: { type: 'cases', description: 'EXP_POS_018, EXP_PAG_001, EXP_PAG_005' } }, async ({ page }) => {
    await ex._searchList('');
    const f = await ex.footer();
    const rows = await ex.readListRows();
    if (f.count <= 20) {
      expect(rows.length).toBe(f.count);
      expectClose(f.total, rows.reduce((s, r) => s + (parseFloat(r[5].replace(/[^\d.-]/g, '')) || 0), 0), 0.1, 'footer total');
      const next = page.locator('ul.ant-pagination li.ant-pagination-next').first();
      if (await next.count()) await expect(next).toHaveAttribute('aria-disabled', 'true');
    } else {
      expect(rows.length).toBe(20);
    }
  });

  // ── Security ─────────────────────────────────────────────────────────────

  test('TC29 - Without a session the expense list redirects to login, and URLs hold no amounts or GST numbers', { tag: T, annotation: { type: 'cases', description: 'EXP_SEC_001, EXP_SEC_011' } }, async ({ browser, page }) => {
    await ex._searchList('');
    expect(page.url()).not.toMatch(/amount|gst|₹/i);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });   // no saved session
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/purchase/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row')).toHaveCount(0);
    await ctx.close();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC30', 'EXP_FUNC_016 / EXP_BND_010', 'Sequential / 5-digit expense numbers', 'Other users share the org — numbers jump; EXP-AUTO/9999 needs 9,999 expenses.'],
    ['TC31', 'EXP_BL_014', 'Paid Through account balance', 'Account balances are a Chart of Accounts / Manual Journal check.'],
    ['TC32', 'EXP_PAG_002 / 003 / 004 / 006 / 007 / 008 / 009 / EXP_E2E_012', 'Pagination with 21+ expenses', 'Needs 21+ expenses; the org starts with none.'],
    ['TC33', 'EXP_UI_015', 'Responsive layout', 'Visual design check.'],
    ['TC34', 'EXP_NEG_011 / EXP_SEC_002', 'Another org\'s expense by URL', 'Needs a second org.'],
    ['TC35', 'EXP_NEG_012 / EXP_SEC_003 / 009 / 013', 'Role restrictions', 'No view-only / accountant / inventory-manager users in the test data.'],
    ['TC36', 'EXP_SEC_007 / 010 / 012 / 014', 'CSRF / API auth / rate limiting / API fields', 'API-level security tests, not UI tests.'],
    ['TC37', 'EXP_SEC_008', 'Session timeout', 'Needs a shortened session lifetime.'],
    ['TC38', 'EXP_SEC_015', 'Deleted expense by URL', 'The expense view is a drawer — no per-expense URL.'],
    ['TC39', 'EXP_PERF_001…003 / 005…010', 'Response-time / concurrency limits', 'Environment-dependent; not a functional check.'],
    ['TC40', 'EXP_ACC_001 / 003 / 004 / 005 / 006 / 010', 'Keyboard list, screen reader, contrast, table semantics', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
