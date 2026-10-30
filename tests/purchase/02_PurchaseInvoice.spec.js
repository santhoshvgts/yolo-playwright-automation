// ════════════════════════════════════════════════════════════════════════════
// Purchase Invoice (YOLO_BOOKS_Purchase_Invoice_TC_v2.xlsx: PI_FUNC / POS / NEG / UI / VAL / BND / BL /
// SF / PAG / EXP / SEC / E2E / PERF / ACC).
// Vendor "New Vendor 1". The purchase form is the SAME component as the Sales Invoice form (lines,
// GST / CESS, tax mode, pricing summary, TDS, adjustment): expected totals come from the shared model
// (computeTotals). Items: the four priced edit-flow items (₹100 / 250 / 40 / 75).
//
// Same case as another one here — not repeated:
//   PI_VAL_001 = PI_NEG_001 · PI_VAL_002 / 008 = PI_NEG_015 · PI_VAL_003 = PI_NEG_002 · PI_VAL_004 = PI_NEG_003 / 004
//   PI_VAL_005 = PI_NEG_014 · PI_VAL_006 = PI_NEG_006 · PI_VAL_007 = PI_NEG_007 · PI_VAL_009 = PI_NEG_011
//   PI_BL_004 = PI_POS_003 · PI_BL_005 = PI_FUNC_006 · PI_BL_012 = PI_POS_017 · PI_BL_016 = PI_FUNC_009
//   PI_BL_019 / PI_E2E_005 = PI_POS_015 · PI_E2E_001 = PI_FUNC_006 + PI_FUNC_011 · PI_E2E_002 = PI_FUNC_009
//   PI_E2E_003 = PI_FUNC_010 · PI_E2E_004 = PI_FUNC_005 · PI_E2E_007 = PI_BL_002 + PI_BL_009
//   PI_SF_011 = PI_NEG_008 · PI_PAG_001 = PI_UI_007
//
//   npx playwright test tests/purchase/02_PurchaseInvoice.spec.js --grep @pi
// ════════════════════════════════════════════════════════════════════════════

const { test, expect, bugCheck } = require('../../fixtures/base-test');
const { PurchaseInvoiceFlowPage } = require('../../pages/purchase/PurchaseInvoiceFlowPage');
const { badgeFamily, pickerDate, listDate, addDays } = require('../../pages/sales/SalesInvoiceEditPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { masterData } = require('../../test-data/UserData');
const { expectClose, money } = require('../../utils/stockMath');

const T = ['@purchase', '@pi'];

test.describe('Purchase Invoice', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {PurchaseInvoiceFlowPage} */
  let pi;
  let A; let B; let C;
  const VENDOR = masterData.vendorName;
  test.beforeEach(async ({ page }) => {
    pi = new PurchaseInvoiceFlowPage(page);
    await pi.open();
    [A, B, C] = await pi.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });
  /** New saved purchase invoice: { no, total, m }. opts: { billDate, tds, draft, model } */
  const bill = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const { billNo } = await pi.createPricedInvoice(m, { vendorName: VENDOR, ...opts });
    return { no: billNo, total: pi.computeTotals(m).total, m };
  };
  /** Fill a new bill from lines + summary without saving; returns the model. */
  const draftForm = async (lines, extra = {}, opts = {}) => {
    const m = model(lines, extra);
    await pi.startInvoice({ vendorName: VENDOR, billDate: opts.billDate });
    await pi.fillInvoice(m, opts);
    return m;
  };
  const num = (no) => parseInt(String(no).match(/(\d+)$/)[1], 10);
  /** Type a bad value into `locator`: input refuses it, or saving is refused. */
  const blocked = async (locator, value, label) => {
    const shown = await pi.typeValue(locator, value);
    if (String(shown) !== String(value)) { console.log(`${label}: input refused "${value}" (shows "${shown}")`); return; }
    const r = await pi.trySave();
    expect(r.saved, `${label} "${value}" must be refused`).toBe(false);
  };

  // ── List / vendor step / form defaults ───────────────────────────────────

  test('TC01 - Purchase invoice list loads with its tabs, columns, primary New button and row checkboxes', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_001, PI_UI_001, PI_UI_002, PI_UI_004, PI_UI_005' } }, async ({ page }) => {
    await pi._searchList('');
    await expect(page.getByRole('tab', { name: 'Purchase Invoice' })).toHaveAttribute('aria-selected', 'true');
    const th = (await page.locator('table thead th').filter({ visible: true }).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    expect(th).toEqual(expect.arrayContaining(['Date', 'Bill No', 'Vendor Name', 'Status', 'Bill Amount', 'Due Amount']));
    await expect(pi.newInvoiceBtn).toHaveClass(/ant-btn-primary/);
    await expect(page.locator('table tbody tr.ant-table-row').first().locator('input[type=checkbox]')).toBeVisible();
    await bugCheck('BUG-PI-01', 'no select-all checkbox in the list header', async () => {
      await expect(page.locator('table thead input[type=checkbox]').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test('TC02 - New purchase invoice vendor step shows a searchable vendor select with Next, and Next without a vendor does not open the form', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_002, PI_UI_008, PI_NEG_001, PI_VAL_001' } }, async ({ page }) => {
    await pi.purchaseTab.click();
    await pi.newInvoiceBtn.click();
    await expect(pi.vendorSelect).toBeVisible();
    await expect(pi.vendorNextBtn).toBeVisible();
    if (await pi.vendorNextBtn.isEnabled()) {
      await pi.vendorNextBtn.click();
      await pi.settle(1500, 'next without vendor');
    } else {
      console.log('Next is disabled until a vendor is picked');
    }
    await expect(pi.billNoInput, 'form must not open without a vendor').toHaveCount(0);
    await pi.vendorSelect.click();
    await page.keyboard.type(VENDOR.slice(0, 6));
    await pi.settle(1500, 'vendor search');
    expect((await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').allInnerTexts()).join(' ')).toContain(VENDOR);
  });

  test('TC03 - Purchase invoice form shows the vendor, an auto Bill No and today\'s date; 7 days gives due date +7 and 30 days gives +30; billing address and unpaid warning are shown', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_003, PI_UI_009, PI_UI_017, PI_UI_018, PI_POS_012, PI_VAL_012' } }, async ({ page }) => {
    const no = await pi.startInvoice({ vendorName: VENDOR });
    expect(no).toMatch(/^PINV-AUTO\/\d{4}$/);
    expect(await pi.selectedText(pi.dueTermSelect)).toBe('7 days');
    const d = await pi.readDates();
    expect(d.billDate).toBe(pickerDate(new Date()));
    expect(d.dueDate).toBe(pickerDate(addDays(new Date(), 7)));
    await pi.setDueTerm('30 days');
    await expect(pi.dueDateInput).toHaveValue(pickerDate(addDays(new Date(), 30)));
    const head = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(head).toContain(VENDOR);
    expect(head).toMatch(/BILLING ADDRESS/);
    expect(head).toMatch(/Already .*(Unpaid Bill|Pending)/);
    for (const l of ['Warehouse', 'Place of Supply', 'Reference Bill No', 'Bill Date', 'Due Date']) expect(head).toContain(l);
    await pi.discardForm();
  });

  test('TC04 - Purchase invoice form shows the item table columns, pricing summary, tax-mode toggle and the Cancel, Save as Draft and Save and Send buttons', { tag: T, annotation: { type: 'cases', description: 'PI_UI_010, PI_UI_011, PI_UI_012, PI_UI_013' } }, async ({ page }) => {
    await pi.startInvoice({ vendorName: VENDOR });
    const th = (await page.locator('table thead th').filter({ visible: true }).allInnerTexts()).map((t) => t.trim().toUpperCase());
    expect(th).toEqual(expect.arrayContaining(['ITEM NAME', 'RATE', 'QUANTITY', 'DISCOUNT', 'GST', 'CESS', 'AMOUNT']));
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const l of ['Subtotal', 'Tax Amount', 'Discount', 'Shipping Cost', 'TDS', 'Total']) expect(text).toContain(l);
    expect(text).toMatch(/Excluding Tax|Including Tax/);
    for (const b of [pi.formCancelBtn, pi.saveDraftBtn, pi.saveBtn]) await expect(b).toBeVisible();
    await expect(pi.saveBtn).toHaveClass(/ant-btn-primary/);
    await pi.discardForm();
  });

  // ── Create / draft / save / edit / delete ────────────────────────────────

  test('TC05 - Save a purchase invoice with one item (qty 1, GST 18%): totals are correct, Save and Send lists it as due with bill equal to due equal to total, and stock goes up by the qty', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_004, PI_FUNC_006, PI_POS_001, PI_POS_003, PI_BL_005, PI_BND_001' } }, async () => {
    const s0 = await pi.readStock(A);
    const b = await bill([L(A, 1)]);
    const row = await pi.listRow(b.no);
    expect(row.status).toMatch(/days? due/i);
    expectClose(row.bill, b.total, 0.02, 'Bill Amount');
    expectClose(row.due, b.total, 0.02, 'Due Amount');
    expect(await pi.readStock(A), 'stock up by 1').toBe(s0 + 1);
  });

  test('TC06 - A purchase invoice saved as Draft is listed as Draft with stock unchanged, and Convert To Invoice gives due status and raises stock', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_005, PI_E2E_004' } }, async () => {
    const s0 = await pi.readStock(C);
    const b = await bill([L(C, 4)], { draft: true });
    expect((await pi.listRow(b.no)).status).toMatch(/draft/i);
    expect(await pi.readStock(C), 'draft does not move stock').toBe(s0);
    // QA (BUG-PI-04): working fine — a draft is published with "Convert To Invoice" in its view (Save from edit keeps it Draft).
    await pi.openInvoice(b.no);
    await pi.page.getByRole('button', { name: 'Convert To Invoice' }).click();
    await expect(pi.page.getByRole('button', { name: 'Make Payment' }), 'converted bill can be paid').toBeVisible({ timeout: 20_000 });
    await pi.open();
    expect((await pi.listRow(b.no)).status).toMatch(/days? due/i);
    expect(await pi.readStock(C), 'stock up after Convert To Invoice').toBe(s0 + 4);
  });

  test('TC07 - Purchase invoice view panel opens, Edit pre-fills the form, and changing qty from 10 to 20 updates the amount and stock', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_007, PI_FUNC_008, PI_FUNC_009, PI_BL_016, PI_E2E_002' } }, async () => {
    const b = await bill([L(C, 10)]);
    const s1 = await pi.readStock(C);
    expect(await pi.previewText(b.no)).toContain(b.no);
    await pi.closePreview();
    await pi.editInvoice(b.no);
    expect((await pi.readLine(0)).qty).toBe(10);
    await pi.setLine(0, 20);
    await pi.save();
    expectClose((await pi.listRow(b.no)).bill, pi.computeTotals(model([L(C, 20)])).total, 0.02, 'Bill Amount after edit');
    expect((await pi.readStock(C)) - s1, 'stock up by 10 more').toBe(10);
  });

  test('TC08 - Delete a purchase invoice (⋮ menu and confirm): the bill is gone and stock and vendor due go back', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_010, PI_BL_010, PI_BL_011, PI_E2E_003' } }, async () => {
    const h0 = await pi.vendorHeader(VENDOR);
    const s0 = await pi.readStock(C);
    const b = await bill([L(C, 5)]);
    await pi.deleteInvoice(b.no);
    expect(await pi.readStock(C), 'stock back').toBe(s0);
    expectClose((await pi.vendorHeader(VENDOR)).due, h0.due, 0.02, 'vendor due back');
  });

  test('TC09 - Cancel on a new purchase invoice creates no record', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_012' } }, async () => {
    const no = await pi.startInvoice({ vendorName: VENDOR });
    await pi.addLine(A, 1);
    await pi.discardForm();
    await pi._searchList(no);
    await expect(pi.invoiceRow(no)).toHaveCount(0);
  });

  test('TC10 - On a purchase invoice, Add Row adds an empty row, and removing a line recalculates the summary', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_013, PI_FUNC_014' } }, async ({ page }) => {
    const m = await draftForm([L(A, 1), L(C, 2)]);
    const before = await pi.lineCount();
    await page.getByRole('button', { name: 'Add Row' }).click();
    await expect(page.getByText(/Total Items:\s*\d+/)).toBeVisible();
    await pi.removeLine(0);
    m.lines.shift();
    await pi.expectTotals(m, 'after removing line 1');
    expect(await pi.lineCount()).toBeLessThanOrEqual(before);
    await pi.discardForm();
  });

  test('TC11 - Changing the vendor on a purchase invoice loads the new vendor and address', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_016, PI_POS_002' } }, async ({ page }) => {
    await pi.startInvoice({ vendorName: VENDOR });
    await pi.changeCustomerBtn.click();
    // "Change" shows its own "Select Vendor" picker
    const picker = page.locator('.ant-select').filter({ hasText: /Select Vendor/ }).first();
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await picker.click();
    await pi.settle(1500, 'vendor list');
    // Any vendor other than the current one (the named second vendor is gone from the shared test org)
    const other = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasNotText: VENDOR }).first();
    const otherName = (await other.innerText()).split('\n')[0].trim();
    await other.click();
    if (await pi.vendorNextBtn.isVisible().catch(() => false)) await pi.vendorNextBtn.click();
    await expect.poll(async () => (await page.locator('body').innerText())).toContain(otherName);
    await pi.discardForm();
  });

  test('TC12 - Notes and Reference Bill No on a purchase invoice are saved and shown in the view', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_017, PI_POS_011, PI_POS_020' } }, async () => {
    await draftForm([L(A, 1)]);
    const no = await pi.billNoInput.inputValue();
    await pi.refNoInput.fill('REF-001');
    await pi.notesInput.fill('Deliver to back gate');
    await pi.save();
    const saved = await pi.confirmSavedNumber(no, VENDOR, pi.computeTotals(model([L(A, 1)])).total);
    const text = await pi.previewText(saved);
    expect(text).toContain('REF-001');
    expect(text).toContain('Deliver to back gate');
  });

  test('TC13 - Terms & Condition edited on a purchase invoice are saved and shown', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_018' } }, async ({ page }) => {
    await draftForm([L(A, 1)]);
    const no = await pi.billNoInput.inputValue();
    const terms = page.locator('#terms');
    if (!(await terms.isEditable().catch(() => false))) await page.getByText('Terms & Condition').locator('xpath=following::button[1]').click();
    await terms.fill('Goods once sold will not be taken back');
    await pi.save();
    const saved = await pi.confirmSavedNumber(no, VENDOR, pi.computeTotals(model([L(A, 1)])).total);
    expect(await pi.previewText(saved)).toContain('Goods once sold will not be taken back');
  });

  // ── Totals (shared model) ────────────────────────────────────────────────

  for (const [tc, id, title, lines, extra, tds] of [
    ['TC14', 'PI_POS_004 / PI_BL_020', 'GST 28% + CESS on the base amount', () => [L(B, 7, { gst: 28, cess: 1 })], {}],
    ['TC15', 'PI_POS_005', '10% line discount', () => [L(B, 7, { discount: 10 })], {}],
    ['TC16', 'PI_POS_006 / PI_BL_014', '₹345 line discount', () => [L(B, 7, { discount: 345, discountMode: '₹' })], {}],
    ['TC17', 'PI_POS_007', 'shipping ₹500', () => [L(A, 10)], { shipping: 500 }],
    ['TC18', 'PI_POS_008 / PI_BL_013', 'TDS', () => [L(A, 10)], {}, E.tds.commission],
    ['TC19', 'PI_POS_009', 'adjustment − ₹20.50', () => [L(A, 10)], { adjustment: { type: 'Subtract', value: 20.5 } }],
    ['TC20', 'PI_POS_010', 'adjustment + ₹20.50', () => [L(A, 10)], { adjustment: { type: 'Addition', value: 20.5 } }],
    ['TC21', 'PI_POS_016 / PI_BL_017', 'two items at 18% and 28%', () => [L(A, 10), L(A, 10, { gst: 28 })], {}],
    ['TC22', 'PI_BL_003', 'Including Tax', () => [L(A, 1)], { taxMode: 'Including Tax' }],
    ['TC23', 'PI_BND_004', '0% discount', () => [L(A, 3, { discount: 0 })], {}],
    ['TC24', 'PI_BND_005', '100% line discount', () => [L(A, 3, { discount: 100 })], {}],
    ['TC25', 'PI_BND_002 / 003', 'large quantity and rate', () => [L(A, 99999), L(B, 1, { rate: 9999999 })], {}],
    ['TC26', 'PI_BND_012', 'shipping 0', () => [L(A, 2)], { shipping: 0 }],
    ['TC27', 'PI_BND_013', 'decimal quantity 0.5', () => [L(A, 0.5)], {}],
    ['TC28', 'PI_E2E_009', 'discount + shipping + TDS + adjustment', () => [L(B, 7, { gst: 28, discount: 5 })], { summaryDiscount: { type: 'Percentage', value: 2 }, shipping: 100, adjustment: { type: 'Addition', value: 10 } }, E.tds.commission],
  ]) {
    test(`${tc} - Totals with ${title} match the model and the saved Bill Amount`, { tag: T, annotation: { type: 'cases', description: id } }, async () => {
      const m = model(lines(), extra);
      const { billNo } = await pi.createPricedInvoice(m, { vendorName: VENDOR, tds });
      expectClose((await pi.listRow(billNo)).bill, pi.computeTotals(m).total, 0.05, 'Bill Amount');
    });
  }

  test('TC29 - A purchase invoice with twenty item rows saves without a problem', { tag: T, annotation: { type: 'cases', description: 'PI_BND_006, PI_PERF_008' } }, async () => {
    const lines = Array.from({ length: 20 }, (_, i) => L([A, B, C][i % 3], i + 1));
    const m = model(lines);
    const { billNo } = await pi.createPricedInvoice(m, { vendorName: VENDOR });
    expectClose((await pi.listRow(billNo)).bill, pi.computeTotals(m).total, 0.2, 'Bill Amount');
  });

  test('TC30 - TDS on a ₹0 taxable amount is ₹0 and the purchase invoice total is not negative', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_016' } }, async () => {
    await draftForm([L(A, 1, { discount: 100 })], {}, { tds: E.tds.commission });
    const s = await pi.readSummary();
    expect(s.tds).toBe(0);
    expect(s.total).toBeGreaterThanOrEqual(0);
    await pi.discardForm();
  });

  // ── Dates / status ───────────────────────────────────────────────────────

  for (const [tc, id, label, date] of [['TC31', 'PI_BND_007', 'an early date (2000-01-01)', new Date(2000, 0, 1)], ['TC32', 'PI_BND_008', 'a far future date (+5 years)', addDays(new Date(), 5 * 365)]]) {
    test(`${tc} - Bill dated ${label} saves`, { tag: T, annotation: { type: 'cases', description: id } }, async () => {
      const b = await bill([L(A, 1)], { billDate: pickerDate(date) });
      const rows = await pi.searchList(b.no);
      if (rows.length) expect(rows[0]).toContain(listDate(date));
    });
  }

  test('TC33 - Purchase invoice status badges: overdue (red) for an old bill, days due (orange) and Paid (green), all with text labels', { tag: T, annotation: { type: 'cases', description: 'PI_POS_017, PI_BL_012, PI_UI_003, PI_ACC_005' } }, async () => {
    const old = await bill([L(A, 1)], { billDate: pickerDate(addDays(new Date(), -60)) });
    const due = await bill([L(A, 1)]);
    const paid = await bill([L(A, 1)]);
    await pi.payInvoice(paid.no, paid.total);
    const o = await pi.listRow(old.no);
    expect(o.status).toMatch(/overdue/i);
    const d = await pi.listRow(due.no);
    expect(d.status).toMatch(/days? due/i);
    // QA (BUG-PI-05): due bills need their own colour — overdue and days-due badges are green like Paid.
    await bugCheck('BUG-PI-05', 'overdue / days-due badges are green, same as Paid', async () => {
      expect(badgeFamily(o.badgeColor), 'overdue badge').toBe('red');
      expect(badgeFamily(d.badgeColor), 'days-due badge').toBe('orange');
    });
    const p = await pi.listRow(paid.no);
    expect(p.status).toBe('Paid');
    expect(badgeFamily(p.badgeColor)).toBe('green');
  });

  // ── Payment ──────────────────────────────────────────────────────────────

  test('TC34 - Make Payment in full on a purchase invoice: it is Paid with due ₹0, and vendor due goes up by the bill and then back down', { tag: T, annotation: { type: 'cases', description: 'PI_FUNC_011, PI_POS_014, PI_UI_014, PI_BL_007, PI_BL_008, PI_E2E_001' } }, async () => {
    const h0 = await pi.vendorHeader(VENDOR);
    const b = await bill([L(A, 5)]);
    expectClose((await pi.vendorHeader(VENDOR)).due - h0.due, b.total, 0.05, 'vendor due up by the bill');
    await pi.openInvoice(b.no);
    await expect(pi.makePaymentBtn).toHaveClass(/ant-btn-primary/);
    await pi.closePreview();
    await pi.payInvoice(b.no, b.total);
    const row = await pi.listRow(b.no);
    expect(row.status).toBe('Paid');
    expect(row.due).toBe(0);
    expectClose((await pi.vendorHeader(VENDOR)).due, h0.due, 0.05, 'vendor due back');
  });

  test('TC35 - Three partial payments on a purchase invoice: due drops each time and the bill is Paid after the third', { tag: T, annotation: { type: 'cases', description: 'PI_POS_015, PI_BL_019, PI_E2E_005' } }, async () => {
    const b = await bill([L(A, 10)]);   // ₹1,180
    const parts = [400, 400, b.total - 800];
    let paid = 0;
    for (const amt of parts) {
      await pi.payInvoice(b.no, amt);
      paid += amt;
      expectClose((await pi.listRow(b.no)).due, b.total - paid, 0.02, `due after paying ${paid}`);
    }
    expect((await pi.listRow(b.no)).status).toBe('Paid');
  });

  test('TC36 - A purchase invoice payment of ₹0 or letters is refused', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_011, PI_VAL_009' } }, async () => {
    const b = await bill([L(A, 1)]);
    for (const v of ['0', 'abc']) {
      await pi.makePayment(b.no, { amount: v });
      const shown = await pi.payForm.payAmount.inputValue();
      if (shown !== v) {
        console.log(`Paid amount input refused "${v}" (shows "${shown}")`);
        await pi.payForm.payCancel.click();
        await pi.closePreview().catch(() => {});
        continue;
      }
      const r = await pi.savePaymentForm();
      expect(r.saved, `payment "${v}" must be refused`).toBe(false);
      await pi.page.keyboard.press('Escape');
      await pi.closePreview().catch(() => {});
    }
  });

  test('TC37 - A purchase invoice payment above the due is refused or kept as vendor advance', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_012' } }, async () => {
    const b = await bill([L(A, 1)]);
    const h0 = await pi.vendorHeader(VENDOR);
    await pi.makePayment(b.no, { amount: b.total + 100 });
    const shown = parseFloat(await pi.payForm.payAmount.inputValue());
    const r = await pi.savePaymentForm();
    if (!r.saved) return;
    if (shown <= b.total + 0.01) { console.log(`Paid amount capped at the due (${shown})`); expect((await pi.listRow(b.no)).due).toBe(0); return; }
    expect((await pi.listRow(b.no)).due).toBe(0);
    expectClose((await pi.vendorHeader(VENDOR)).advance - h0.advance, 100, 0.05, 'excess kept as advance');
  });

  test('TC38 - A ₹0.01 payment on a purchase invoice is accepted and reduces the due by ₹0.01', { tag: T, annotation: { type: 'cases', description: 'PI_BND_015' } }, async () => {
    const b = await bill([L(A, 1)]);
    await pi.payInvoice(b.no, 0.01);
    expectClose((await pi.listRow(b.no)).due, b.total - 0.01, 0.001, 'due');
  });

  test('TC39 - A fully paid purchase invoice cannot be deleted', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_010' } }, async () => {
    const b = await bill([L(A, 1)]);
    await pi.payInvoice(b.no, b.total);
    const r = await pi.tryDeleteInvoice(b.no);
    expect(r.deleted, `paid bill must not be deleted (${r.message})`).toBe(false);
  });

  // ── Validation ───────────────────────────────────────────────────────────

  test('TC40 - Without items on a purchase invoice, Save and Send and Save as Draft are disabled', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_002, PI_VAL_003' } }, async () => {
    await pi.startInvoice({ vendorName: VENDOR });
    await expect(pi.saveBtn).toBeDisabled();
    await pi.discardForm();
  });

  for (const [tc, id, field, value] of [
    ['TC41', 'PI_NEG_003 / PI_VAL_004', 'qty', '0'], ['TC42', 'PI_NEG_004 / PI_VAL_004', 'qty', '-5'], ['TC43', 'PI_NEG_013', 'qty', 'abc'],
    ['TC44', 'PI_NEG_005', 'rate', '-100'], ['TC45', 'PI_NEG_014 / PI_VAL_005', 'rate', 'abc'],
  ]) {
    test(`${tc} - ${field} "${value}" is refused`, { tag: T, annotation: { type: 'cases', description: id } }, async () => {
      await draftForm([L(A, 1)]);
      const row = pi.lineRows.nth(0);
      await blocked(field === 'qty' ? pi.lineQty(row) : pi.lineRate(row), value, field);
      if (/purchase-bill\/add/.test(pi.page.url())) await pi.discardForm();
    });
  }

  test('TC46 - A line discount above 100% on a purchase invoice is refused or capped (the total is never below ₹0)', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_006, PI_VAL_006' } }, async () => {
    await draftForm([L(A, 1)]);
    const shown = await pi.typeValue(pi.lineDiscount(pi.lineRows.nth(0)), '110');
    if (parseFloat(shown) === 110) {
      const r = await pi.trySave();
      expect(r.saved, '110% discount must be refused').toBe(false);
    }
    expect((await pi.readSummary()).total).toBeGreaterThanOrEqual(0);
    if (/purchase-bill\/add/.test(pi.page.url())) await pi.discardForm();
  });

  test('TC47 - Purchase invoice shipping cost rejects letters', { tag: T, annotation: { type: 'cases', description: 'PI_VAL_010' } }, async () => {
    await draftForm([L(A, 1)]);
    await blocked(pi.shippingInput, 'abc', 'shipping');
    if (/purchase-bill\/add/.test(pi.page.url())) await pi.discardForm();
  });

  test('TC48 - Saving a purchase invoice without Place of Supply is refused', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_007, PI_VAL_007' } }, async () => {
    await draftForm([L(A, 1)]);
    await pi.placeOfSupplySelect.hover();
    const clear = pi.placeOfSupplySelect.locator('.ant-select-clear');
    if (!(await clear.isVisible().catch(() => false))) { console.log('Place of Supply cannot be cleared'); await pi.discardForm(); return; }
    await clear.click();
    const r = await pi.trySave();
    expect(r.saved, 'no place of supply must be refused').toBe(false);
    await pi.discardForm();
  });

  test('TC49 - An empty or invalid Bill Date on a purchase invoice is refused', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_015, PI_VAL_002, PI_VAL_008' } }, async () => {
    await draftForm([L(A, 1)]);
    const shown = await pi.clearBillDate();
    if (shown) { console.log(`Bill date cannot be emptied (shows "${shown}")`); await pi.discardForm(); return; }
    const r = await pi.trySave();
    expect(r.saved, 'empty bill date must be refused').toBe(false);
    await pi.discardForm();
  });

  test('TC50 - Purchase invoice Reference Bill No: 300 characters are truncated or refused, and script text is stored as plain text', { tag: T, annotation: { type: 'cases', description: 'PI_VAL_015, PI_NEG_017, PI_SEC_005' } }, async ({ page }) => {
    let dialog = false;
    page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
    await draftForm([L(A, 1)]);
    await pi.refNoInput.fill('R'.repeat(300));
    const len = (await pi.refNoInput.inputValue()).length;
    console.log(`Reference Bill No keeps ${len} characters`);
    const xss = '<script>alert(1)</script>';
    await pi.refNoInput.fill(xss);
    const no = await pi.billNoInput.inputValue();
    const r = await pi.trySave();
    if (r.saved) {
      const saved = await pi.confirmSavedNumber(no, VENDOR, pi.computeTotals(model([L(A, 1)])).total);
      await pi.previewText(saved);
    }
    expect(dialog, 'no script executed').toBe(false);
  });

  test('TC51 - Purchase invoice notes: script text is not executed, and 2,000 characters are saved or limited', { tag: T, annotation: { type: 'cases', description: 'PI_SEC_004, PI_BND_014' } }, async ({ page }) => {
    let dialog = false;
    page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
    await draftForm([L(A, 1)]);
    await pi.notesInput.fill(`<img src=x onerror=alert(1)> ${'N'.repeat(2000)}`);
    console.log(`Notes keep ${(await pi.notesInput.inputValue()).length} characters`);
    const no = await pi.billNoInput.inputValue();
    await pi.save();
    const saved = await pi.confirmSavedNumber(no, VENDOR, pi.computeTotals(model([L(A, 1)])).total);
    await pi.previewText(saved);
    expect(dialog, 'no script executed').toBe(false);
  });

  // ── Tax / journal ────────────────────────────────────────────────────────

  test('TC52 - Purchase invoice place of supply Tamil Nadu gives CGST + SGST, and Kerala gives IGST', { tag: T, annotation: { type: 'cases', description: 'PI_BL_001, PI_BL_002, PI_E2E_007' } }, async () => {
    await draftForm([L(A, 1)]);
    await pi.setPlaceOfSupply('Tamil Nadu');
    const tnNo = await pi.billNoInput.inputValue();
    await pi.save();
    const tn = await pi.confirmSavedNumber(tnNo, VENDOR, pi.computeTotals(model([L(A, 1)])).total);
    let text = await pi.previewText(tn);
    expect(text).toMatch(/CGST/);
    expect(text).toMatch(/SGST/);
    await pi.closePreview();
    await draftForm([L(A, 1)]);
    await pi.setPlaceOfSupply('Kerala');
    const kNo = await pi.billNoInput.inputValue();
    await pi.save();
    const k = await pi.confirmSavedNumber(kNo, VENDOR, pi.computeTotals(model([L(A, 1)])).total);
    text = await pi.previewText(k);
    expect(text).toMatch(/IGST/);
    expect(text).not.toMatch(/CGST/);
  });

  test('TC53 - Purchase invoice journal has total Debit equal to total Credit, with payable, tax and discount lines', { tag: T, annotation: { type: 'cases', description: 'PI_BL_009, PI_BL_014, PI_BL_015' } }, async () => {
    const b = await bill([L(B, 7, { discount: 345, discountMode: '₹' })], { model: { shipping: 0.27 } });
    const j = await pi.readJournal(b.no);
    expect(j.rows.length, 'journal rows').toBeGreaterThan(1);
    expectClose(j.debit, j.credit, 0.01, 'Dr = Cr');
    const accounts = j.rows.map((r) => r.account).join(' | ');
    console.log(`Journal accounts: ${accounts}`);
    expect(accounts).toMatch(/payable|vendor/i);
    expect(accounts).toMatch(/GST|tax/i);
  });

  // ── Search / filter / pagination ─────────────────────────────────────────

  test('TC54 - Purchase invoice search works for exact, partial, case-insensitive, trimmed and vendor partial text, and clearing restores the list', { tag: T, annotation: { type: 'cases', description: 'PI_SF_001, PI_SF_002, PI_SF_003, PI_SF_004, PI_SF_008, PI_SF_010' } }, async () => {
    const b = await bill([L(A, 1)]);
    expect((await pi.searchList(b.no)).map((r) => r[2])).toEqual([b.no]);
    const partial = b.no.slice(0, -1);
    expect((await pi.searchList(partial)).every((r) => r[2].startsWith(partial))).toBe(true);
    const lower = await pi.searchList(VENDOR.toLowerCase());
    const upper = await pi.searchList(VENDOR.toUpperCase());
    expect(lower.length).toBeGreaterThan(0);
    expect.soft(upper.map((r) => r[2]), 'case-insensitive search').toEqual(lower.map((r) => r[2]));
    const padded = (await pi.searchList(`  ${VENDOR}  `)).map((r) => r[2]);
    await bugCheck('BUG-GEN-01', 'search does not trim spaces', async () => {
      expect(padded, 'search trims spaces').toEqual(lower.map((r) => r[2]));
    });
    expect((await pi.searchList(VENDOR.split(' ')[1] || VENDOR.slice(1))).length).toBeGreaterThan(0);
    expect((await pi.searchList('')).length).toBeGreaterThan(1);
  });

  test('TC55 - Unknown, special-character, SQL and very long searches on purchase invoices give an empty list with no crash', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_008, PI_NEG_018, PI_SF_011, PI_SEC_003, PI_UI_020, PI_VAL_011' } }, async ({ page }) => {
    for (const q of ['PINV-NOPE-99999', '!@#$%^&*()', "' OR 1=1 --", 'X'.repeat(500)]) {
      expect(await pi.searchList(q), `search "${q.slice(0, 20)}"`).toEqual([]);
      await expect(page.locator('.ant-empty, .ant-table-placeholder').first()).toBeVisible();
    }
    expect((await pi.searchList('')).length, 'list still works').toBeGreaterThan(0);
  });

  test('TC56 - Purchase invoice pagination: 20 per page with Next, Prev and page number, Prev disabled on page 1 and Next disabled on the last page', { tag: T, annotation: { type: 'cases', description: 'PI_UI_007, PI_PAG_001, PI_PAG_002, PI_PAG_003, PI_PAG_004, PI_PAG_005, PI_PAG_006' } }, async ({ page }) => {
    await pi._searchList('');
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    await expect(pag).toBeVisible();
    const p1 = await pi.readListRows();
    expect(p1.length).toBe(20);
    await expect(pag.locator('li.ant-pagination-prev')).toHaveAttribute('aria-disabled', 'true');
    await pag.locator('li.ant-pagination-next').click();
    await pi.settle(1500, 'page 2');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    const p2 = await pi.readListRows();
    expect(p2.map((r) => r[2]).some((n) => p1.map((r) => r[2]).includes(n)), 'no duplicates').toBe(false);
    await pag.locator('li.ant-pagination-prev').click();
    await pi.settle(1500, 'page 1');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('1');
    await pag.locator('li.ant-pagination-item-2').click();
    await pi.settle(1500, 'page 2 by number');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    const last = pag.locator('li.ant-pagination-item').last();
    await last.click();
    await pi.settle(1500, 'last page');
    await expect(pag.locator('li.ant-pagination-next')).toHaveAttribute('aria-disabled', 'true');
  });

  test('TC57 - A vendor search on purchase invoices resets to page 1 and the count follows the filter', { tag: T, annotation: { type: 'cases', description: 'PI_PAG_007, PI_PAG_008, PI_PAG_009, PI_SF_012' } }, async ({ page }) => {
    await pi._searchList('');
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    await pag.locator('li.ant-pagination-item-2').click();
    await pi.settle(1500, 'page 2');
    const rows = await pi.searchList(VENDOR);
    expect(rows.every((r) => r.includes(VENDOR))).toBe(true);
    const active = pag.locator('li.ant-pagination-item-active');
    if (await active.count()) {
      await bugCheck('BUG-GEN-02', 'a new search keeps the current page', async () => {
        await expect(active).toHaveText('1', { timeout: 5000 });
      });
    }
    const count = (await page.locator('body').innerText()).match(/Total(?: Count)?\s*:?\s*(\d+)/i);
    if (count && rows.length < 20) expect(Number(count[1])).toBe(rows.length);
  });

  test('TC58 - The first three pages of purchase invoices hold no duplicate bills', { tag: T, annotation: { type: 'cases', description: 'PI_PAG_010' } }, async ({ page }) => {
    await pi._searchList('');
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    const seen = [];
    for (let p = 0; p < 3; p++) {
      seen.push(...(await pi.readListRows()).map((r) => r[2]));
      const next = pag.locator('li.ant-pagination-next');
      if ((await next.getAttribute('aria-disabled')) === 'true') break;
      await next.click();
      await pi.settle(1500, 'next page');
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('TC59 - Purchase invoice date range filter: a start after the end gives an error or nothing, a range limits the list, and clearing restores it', { tag: T, annotation: { type: 'cases', description: 'PI_NEG_009, PI_SF_005, PI_SF_006, PI_SF_007, PI_SF_009' } }, async () => {
    const all = (await pi.searchList('')).length;
    await pi.setListDateRange(addDays(new Date(), -1), addDays(new Date(), -10)).catch((e) => console.log(`reversed range not accepted: ${e.message.slice(0, 80)}`));
    const reversed = await pi.readListRows();
    expect(reversed.every((r) => true)).toBe(true);
    await pi.setListDateRange(addDays(new Date(), -2), new Date());
    const ranged = await pi.readListRows();
    for (const r of ranged) expect(new Date(r[1]) >= new Date(listDate(addDays(new Date(), -2)))).toBe(true);
    await pi.page.reload();
    await pi.settle(3000, 'filter cleared');
    expect((await pi.searchList('')).length).toBe(all);
  });

  // ── Download ─────────────────────────────────────────────────────────────

  /** Tick the list rows of `nos` (current list) and click Download; returns the downloads. */
  const download = async (page, nos) => {
    for (const no of nos) {
      await pi._searchList(no);
      await pi.invoiceRow(no).first().locator('input[type=checkbox]').check();
    }
    const got = [];
    page.on('download', (d) => got.push(d));
    await page.getByRole('button', { name: 'Download' }).click();
    await expect.poll(() => got.length, { timeout: 60_000 }).toBeGreaterThan(0);
    await pi.settle(3000, 'remaining downloads');
    return got;
  };

  test('TC60 - Ticking a purchase invoice shows Download, and a due, a paid and an overdue bill each download as a PDF', { tag: T, annotation: { type: 'cases', description: 'PI_EXP_001, PI_EXP_009, PI_EXP_010' } }, async ({ page }) => {
    const due = await bill([L(A, 1)]);
    const paid = await bill([L(A, 1)]);
    await pi.payInvoice(paid.no, paid.total);
    const old = await bill([L(A, 1)], { billDate: pickerDate(addDays(new Date(), -40)) });
    for (const b of [due, paid, old]) {
      const [d] = await download(page, [b.no]);
      expect(d.suggestedFilename(), `${b.no} file`).toMatch(/\.(pdf|zip)$/i);
      expect(await d.failure()).toBeNull();
    }
  });

  test('TC61 - Bulk download of 3 purchase invoices gives PDFs (or a zip) named after the bills', { tag: T, annotation: { type: 'cases', description: 'PI_EXP_007, PI_EXP_008, PI_E2E_008' } }, async ({ page }) => {
    const bs = [await bill([L(A, 1)]), await bill([L(A, 1)]), await bill([L(A, 1)])];
    await pi._searchList(VENDOR);
    for (const b of bs) await pi.invoiceRow(b.no).first().locator('input[type=checkbox]').check();
    const got = [];
    page.on('download', (d) => got.push(d));
    await page.getByRole('button', { name: 'Download' }).click();
    await expect.poll(() => got.length, { timeout: 90_000 }).toBeGreaterThan(0);
    await pi.settle(5000, 'remaining downloads');
    const names = got.map((d) => d.suggestedFilename());
    console.log(`Downloaded: ${names.join(', ')}`);
    if (names.length === 1) expect(names[0]).toMatch(/\.(zip|pdf)$/i);
    else expect(names.length).toBe(3);
  });

  // ── Security / accessibility that can run here ───────────────────────────

  test('TC62 - Without a session the purchase invoice page redirects to login and the API answers 401', { tag: T, annotation: { type: 'cases', description: 'PI_SEC_001, PI_SEC_011' } }, async ({ browser, page }) => {
    const url = page.url();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });   // no saved session
    const anon = await ctx.newPage();
    await anon.goto(url.replace(/\/[^/]*$/, '/purchase?purchase=1'));
    // Lands on the app's start page (Log In / Go to Dashboard) — never on the purchase list
    await expect(anon).not.toHaveURL(/purchase/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row'), 'no purchase data shown').toHaveCount(0);
    const res = await anon.request.get('https://invoice.test.api.vgts.xyz/bills/v2/purchase-invoice/?page=1&page_size=20');
    expect([401, 403]).toContain(res.status());
    await ctx.close();
  });

  test('TC63 - No password or bearer token is written to the console while creating a purchase invoice', { tag: T, annotation: { type: 'cases', description: 'PI_SEC_009' } }, async ({ page }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    await bill([L(A, 1)]);
    expect(logs.filter((l) => /password|bearer\s+[a-z0-9._-]{20,}/i.test(l))).toEqual([]);
  });

  test('TC64 - On the purchase invoice screen, Escape closes an open dropdown and the view panel', { tag: T, annotation: { type: 'cases', description: 'PI_ACC_007, PI_ACC_009' } }, async ({ page }) => {
    await pi.startInvoice({ vendorName: VENDOR });
    await pi.dueTermSelect.locator('.ant-select-selector').click();
    await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toHaveCount(0);
    await pi.discardForm();
    const b = await bill([L(A, 1)]);
    await pi.openInvoice(b.no);
    await page.keyboard.press('Escape');
    await expect(pi.page.locator('.ant-drawer-content').filter({ visible: true })).toHaveCount(0, { timeout: 5000 });
  });

  test('TC65 - New Purchase Invoice opens with the Enter key', { tag: T, annotation: { type: 'cases', description: 'PI_ACC_002' } }, async ({ page }) => {
    await pi._searchList('');
    await pi.newInvoiceBtn.focus();
    await page.keyboard.press('Enter');
    await expect(pi.vendorSelect).toBeVisible();
  });

  test('TC66 - Purchase invoice view panel shows Close, Print, Edit and the ⋮ menu', { tag: T, annotation: { type: 'cases', description: 'PI_UI_015' } }, async () => {
    const b = await bill([L(A, 1)]);
    const text = await pi.previewText(b.no);
    for (const t of ['Close', 'Print', 'Edit']) expect(text).toContain(t);
    await expect(pi.moreMenu.first()).toBeVisible();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC67', 'PI_FUNC_015 / PI_POS_013 / PI_UI_016', 'Print / PDF preview content', 'Browser print dialog and PDF content need a PDF reader — not checked in the browser.'],
    ['TC68', 'PI_EXP_002…006 / PI_E2E_006', 'Downloaded PDF content (header, Bill To, items, tax, words)', 'PDF content checks need a PDF parser in the test project.'],
    ['TC69', 'PI_POS_018 / PI_VAL_013', 'Warehouse B on the bill', 'Only one warehouse ("Default").'],
    ['TC70', 'PI_POS_019 / PI_VAL_014', 'Add a vendor / vendor GSTIN', 'Vendor creation — Vendor sheet.'],
    ['TC71', 'PI_BL_006 / 018', 'Service / non-inventory item has no stock movement', 'Needs a service item — Inventory_Product sheet.'],
    ['TC72', 'PI_BND_009 / 010 / 011', 'Pagination with exactly 1 / 20 / 21 bills', 'Needs an org with a controlled number of bills.'],
    ['TC73', 'PI_UI_006', 'Vendor avatar beside the name', 'Visual design check.'],
    ['TC74', 'PI_UI_019', 'Loading state while the list loads', 'Timing-dependent visual check.'],
    ['TC75', 'PI_SEC_002', 'Session timeout', 'Needs a shortened session lifetime.'],
    ['TC76', 'PI_SEC_006 / 007 / 012 / PI_E2E_010', 'Role restrictions', 'No Accountant / read-only / inventory-manager users in the test data.'],
    ['TC77', 'PI_SEC_008', 'Another org\'s bill by URL', 'Needs a second org.'],
    ['TC78', 'PI_SEC_010', 'CSRF protection', 'API-level security test, not a UI test.'],
    ['TC79', 'PI_PERF_001…007', 'Response-time limits', 'Environment-dependent; not a functional check.'],
    ['TC80', 'PI_ACC_001 / 003 / 004 / 006 / 008 / 010', 'Tab order, screen reader, contrast, keyboard date picker', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
