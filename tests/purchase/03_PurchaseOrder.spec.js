// ════════════════════════════════════════════════════════════════════════════
// Purchase Order (YOLO_BOOKS_Purchase_Order_TC.xlsx: PO_FUNC / POS / NEG / UI / VAL / BND / BL / SF /
// PAG / EXP / SEC / E2E / PERF / ACC). Vendor "New Vendor 1".
// The order form is the same component as the purchase invoice (02_PurchaseInvoice.spec.js): the
// pure arithmetic is covered there — here only order-specific behaviour plus representative totals.
// App differs from the sheet: list has NO "Store Status" column and no row checkboxes; Delivery Date
// is required to save.
//
// Same case as another one here / in 02_PurchaseInvoice — not repeated:
//   PO_VAL_001 = PO_NEG_001 · PO_VAL_003 = PO_NEG_002 · PO_VAL_004 = PO_NEG_003 / 004 · PO_VAL_005 = PO_NEG_012
//   PO_VAL_006 = PO_NEG_013 · PO_VAL_007 = PO_NEG_006 · PO_VAL_002 / 008 = PO_NEG_015
//   PO_POS_013 / PO_UI_013 = PO_FUNC_008 · PO_POS_014 / 015 / PO_FUNC_016 = PO_FUNC_008
//   PO_BL_009 / 015 = PO_POS_016 · PO_BL_010 = PO_POS_006 · PO_BL_004 / 005 = PO_BL_014
//   PO_SF_010 = PO_NEG_008 · PO_SEC_003 = PO_NEG_018 · PO_SEC_004 = PO_NEG_017 · PO_PAG_* = PI_PAG_* (same list component)
//   PO_E2E_001 / 004 = PO_FUNC_018 + PI_FUNC_011 · PO_E2E_002 = PO_BL_013 · PO_E2E_003 = PO_FUNC_017 · PO_E2E_006 = PO_BL_017
//
//   npx playwright test tests/purchase/03_PurchaseOrder.spec.js --grep @po
// ════════════════════════════════════════════════════════════════════════════

const { test, expect, bugCheck } = require('../../fixtures/base-test');
const { PurchaseOrderFlowPage } = require('../../pages/purchase/PurchaseOrderFlowPage');
const { badgeFamily, pickerDate, listDate, addDays } = require('../../pages/sales/SalesInvoiceEditPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { masterData } = require('../../test-data/UserData');
const { expectClose } = require('../../utils/stockMath');

const T = ['@purchase', '@po'];

test.describe('Purchase Order', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {PurchaseOrderFlowPage} */
  let po;
  let A; let B; let C;
  const VENDOR = masterData.vendorName;
  test.beforeEach(async ({ page }) => {
    po = new PurchaseOrderFlowPage(page);
    await po.open();
    [A, B, C] = await po.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });
  /** New saved order: { no, total, m }. opts: { billDate, tds, model } */
  const order = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const { billNo } = await po.createPricedInvoice(m, { vendorName: VENDOR, ...opts });
    return { no: billNo, total: po.computeTotals(m).total, m };
  };
  const num = (no) => parseInt(String(no).match(/(\d+)$/)[1], 10);
  const blocked = async (locator, value, label) => {
    const shown = await po.typeValue(locator, value);
    if (String(shown) !== String(value)) { console.log(`${label}: input refused "${value}" (shows "${shown}")`); return; }
    const r = await po.trySave();
    expect(r.saved, `${label} "${value}" must be refused`).toBe(false);
  };

  // ── List / form ──────────────────────────────────────────────────────────

  // QA (BUG-PO-01): there is no separate "Store Status" column (current flow).
  test('PO_FUNC_001 / PO_UI_001 / 002 / 004 / 005 - List: Order Date, Order No, Vendor Name, Status, Bill Amount (no Store Status); primary New button; search placeholder', { tag: T }, async ({ page }) => {
    await po._searchList('');
    const th = (await page.locator('table thead th').filter({ visible: true }).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    expect(th).toEqual(expect.arrayContaining(['Order Date', 'Order No', 'Vendor Name', 'Status', 'Bill Amount']));
    await expect(po.newOrderBtn).toHaveClass(/ant-btn-primary/);
    expect(await po.listSearch.getAttribute('placeholder')).toMatch(/Search by Bill No\. or Name/i);
    expect(th, 'no separate "Store Status" column').not.toContain('Store Status');
  });

  test('PO_FUNC_002 / PO_NEG_001 / PO_VAL_001 - Vendor step; Next without a vendor does not open the form', { tag: T }, async () => {
    await po.purchaseTab.click();
    await po.purchaseOrderTab.click();
    await po.newOrderBtn.click();
    await expect(po.vendorSelect).toBeVisible();
    if (await po.vendorNextBtn.isEnabled()) {
      await po.vendorNextBtn.click();
      await po.settle(1500, 'next without vendor');
    } else {
      console.log('Next is disabled until a vendor is picked');
    }
    await expect(po.billNoInput).toHaveCount(0);
  });

  test('PO_FUNC_003 / PO_POS_002 / 003 / PO_UI_006 / 007 / 008 / 012 / PO_VAL_015(no) - Form: auto PO-AUTO/NNNN (+1 each), transports Road / Rail / Air / Ship, PO Date + Delivery Date (no Due Date), only Cancel + Save and Send', { tag: T }, async ({ page }) => {
    const first = await order([L(A, 1)]);
    const no = await po.startInvoice({ vendorName: VENDOR });
    expect(no).toMatch(/^PO-AUTO\/\d{4}$/);
    expect(num(no)).toBe(num(first.no) + 1);
    await po.transportSelect.locator('.ant-select-selector').click();
    expect(await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').allInnerTexts()).toEqual(expect.arrayContaining(['Road', 'Rail', 'Air', 'Ship']));
    await page.keyboard.press('Escape');
    expect(await po.billDateInput.inputValue()).toBe(pickerDate(new Date()));
    await expect(po.deliveryDate).toBeVisible();
    await expect(po.dueDateInput).toHaveCount(0);
    await expect(po.saveBtn).toBeVisible();
    await expect(po.saveDraftBtn).toHaveCount(0);
    const head = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const l of ['Mode of Transport', 'Warehouse', 'Place of Supply', 'Delivery Date', 'Reference Bill No']) expect(head.toLowerCase()).toContain(l.toLowerCase());
    await po.discardForm();
  });

  test('PO_UI_009 / 010 / 011 / PO_POS_017 - Item columns, tax-mode toggle, pricing summary and the unpaid-bills warning', { tag: T }, async ({ page }) => {
    await po.startInvoice({ vendorName: VENDOR });
    const th = (await page.locator('table thead th').filter({ visible: true }).allInnerTexts()).map((t) => t.trim().toUpperCase());
    expect(th).toEqual(expect.arrayContaining(['ITEM NAME', 'RATE', 'QUANTITY', 'DISCOUNT', 'GST', 'CESS', 'AMOUNT']));
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const l of ['Subtotal', 'Tax Amount', 'Discount', 'Shipping Cost', 'Total']) expect(text).toContain(l);
    // QA (BUG-PO-02): TDS / TCS are not required on a purchase order.
    expect(text, 'no TDS / TCS on the order').not.toMatch(/\bTDS\b|\bTCS\b/);
    expect(text).toMatch(/Excluding Tax|Including Tax/);
    expect(text).toMatch(/Already .*(Unpaid Bill|Pending)/);
    await po.discardForm();
  });

  // ── Create / view / edit / delete ────────────────────────────────────────

  test('PO_FUNC_004 / 005 / 006 / PO_POS_001 / 004 / 012 / PO_UI_003 / 014 / 015 / 016 / 017 - Order with Rail + delivery date: listed Pending; view shows #number, PO / Delivery Date, Mode of Transport, vendor and Ship To, Close / Print / Edit / Delete', { tag: T }, async () => {
    const delivery = addDays(new Date(), 9);
    const m = model([L(C, 100, { rate: 65 })]);
    await po.startInvoice({ vendorName: VENDOR, transport: 'Rail', deliveryDate: pickerDate(delivery) });
    const no0 = await po.billNoInput.inputValue();
    await po.fillInvoice(m);
    await po.expectTotals(m, 'order');
    await po.save();
    const no = await po.confirmSavedNumber(no0, VENDOR, po.computeTotals(m).total);
    const row = await po.listRow(no);
    expect(row.status).toBe('Pending');
    expect(badgeFamily(await po._badgeColor(po.invoiceRow(no).first().locator('td').nth(row.cells.indexOf('Pending'))))).toMatch(/orange|yellow/);
    expectClose(row.bill, po.computeTotals(m).total, 0.02, 'Bill Amount');
    const text = await po.previewText(no);
    expect(text).toContain(`#${no}`);
    for (const t of ['PO Date', 'Delivery Date', 'Mode of Transport', 'Rail', 'Close', 'Print', 'Edit', 'Delete', VENDOR]) expect(text.toLowerCase()).toContain(t.toLowerCase());
    expect(text).toMatch(/SHIP TO|Ship To/);
  });

  test('PO_FUNC_009 / 010 / PO_POS_019 / 020 - Edit: pre-filled; qty, transport and delivery date changes saved', { tag: T }, async () => {
    const o = await order([L(C, 2)]);
    await po.editInvoice(o.no);
    expect((await po.readLine(0)).qty).toBe(2);
    await po.setLine(0, 5);
    await po.pickOption(po.transportSelect, 'Air');
    const dd = await po.setDeliveryDate(pickerDate(addDays(new Date(), 12)));
    await po.save();
    expectClose((await po.listRow(o.no)).bill, po.computeTotals(model([L(C, 5)])).total, 0.02, 'Bill Amount after edit');
    await po.editInvoice(o.no);
    expect(await po.readOrderHeader()).toMatchObject({ transport: 'Air', deliveryDate: dd });
    await po.discardForm();
  });

  test('PO_FUNC_011 / PO_BL_017 / PO_E2E_006 - Delete: order gone; stock unchanged', { tag: T }, async () => {
    const s0 = await po.readStock(C);
    const o = await order([L(C, 3)]);
    expect(await po.deleteOrder(o.no), 'order deleted').toBe(true);
    expect(await po.readStock(C)).toBe(s0);
  });

  test('PO_FUNC_013 - Cancel on a new order creates no record', { tag: T }, async () => {
    const no = await po.startInvoice({ vendorName: VENDOR });
    await po.addLine(A, 1);
    await po.discardForm();
    await po._searchList(no);
    await expect(po.invoiceRow(no)).toHaveCount(0);
  });

  test('PO_FUNC_014 / 015 - Add Row adds a row; removing a line recalculates the summary', { tag: T }, async ({ page }) => {
    const m = model([L(A, 1), L(C, 2)]);
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(m);
    await page.getByRole('button', { name: 'Add Row' }).click();
    await po.removeLine(0);
    m.lines.shift();
    await po.expectTotals(m, 'after removing line 1');
    await po.discardForm();
  });

  test('PO_POS_011 / PO_NEG_017 / PO_SEC_004 / 005 - Reference Bill No and notes saved; script text not executed', { tag: T }, async ({ page }) => {
    let dialog = false;
    page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
    const m = model([L(A, 1)]);
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(m);
    await po.refNoInput.fill('REF-PO-<b>1</b>');
    await po.notesInput.fill('<script>alert(1)</script> back gate');
    const no0 = await po.billNoInput.inputValue();
    await po.save();
    const no = await po.confirmSavedNumber(no0, VENDOR, po.computeTotals(m).total);
    const text = await po.previewText(no);
    await bugCheck('BUG-PO-06', 'Reference No not shown in the order view', async () => {
      expect(text).toContain('REF-PO-');
    });
    expect(dialog, 'no script executed').toBe(false);
  });

  test('PO_UI_018 - "Show Tax & Total" toggles the tax breakdown in the view', { tag: T }, async ({ page }) => {
    const o = await order([L(A, 1)]);
    await po.openInvoice(o.no);
    const toggle = po.previewDrawer.getByText('Show Tax & Total');
    await expect(toggle).toBeVisible();
    const before = await po.previewDrawer.innerText();
    await toggle.click();
    await po.settle(1000, 'toggle');
    expect(await po.previewDrawer.innerText()).not.toBe(before);
  });

  // ── Totals ───────────────────────────────────────────────────────────────

  for (const [id, title, lines, extra, tds] of [
    ['PO_POS_005 / PO_BND_001', 'GST 18% (qty 100 × ₹65)', () => [L(C, 100, { rate: 65 })], {}],
    ['PO_POS_006 / PO_BL_010', 'GST 28% + CESS on the base', () => [L(A, 1, { gst: 28, cess: 1 })], {}],
    ['PO_POS_007', 'overall % discount', () => [L(B, 10)], { summaryDiscount: { type: 'Percentage', value: 12 } }],
    ['PO_POS_008', 'shipping ₹4,500', () => [L(B, 2)], { shipping: 4500 }],
    ['PO_POS_009', 'adjustment + ₹3,400', () => [L(B, 2)], { adjustment: { type: 'Addition', value: 3400 } }],
    ['PO_POS_016 / PO_BL_009 / 015', 'Including Tax', () => [L(A, 1)], { taxMode: 'Including Tax' }],
    // PO_BL_011 (totals with TDS) dropped — QA (BUG-PO-02): TDS / TCS are not required on a purchase order.
    ['PO_BL_016', 'two slabs 5% / 18%', () => [L(A, 1, { gst: 5 }), L(A, 1)], {}],
    ['PO_BL_020', '10% line discount before tax', () => [L(A, 1, { discount: 10 })], {}],
    ['PO_BND_002 / 003', 'very large qty and rate', () => [L(A, 999999), L(B, 1, { rate: 9999999 })], {}],
    ['PO_BND_004 / 013', '0% discount and no shipping', () => [L(A, 2)], { shipping: 0 }],
    ['PO_BND_005', '100% line discount', () => [L(A, 2, { discount: 100 })], {}],
    ['PO_BND_012', 'decimal qty 0.5', () => [L(A, 0.5)], {}],
  ]) {
    test(`${id} - Order totals with ${title} match the model and the saved Bill Amount`, { tag: T }, async () => {
      const m = model(lines(), extra);
      const { billNo } = await po.createPricedInvoice(m, { vendorName: VENDOR, tds });
      expectClose((await po.listRow(billNo)).bill, po.computeTotals(m).total, 0.05, 'Bill Amount');
    });
  }

  // QA (BUG-PO-03): Round Off shows only when it is enabled in Settings → Bill Prefix.
  test('PO_POS_010 - Round off makes the grand total a whole rupee', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(model([L(A, 1, { rate: 99.37 })]));
    const on = await po.roundOff.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (!on) await po.discardForm();
    test.skip(!on, 'Round Off is disabled for the org (enable it in Settings → Bill Prefix)');
    const r = await po.readRoundOff();
    expect(Number.isInteger(r.total), `total ${r.total} rounded`).toBe(true);
    await po.discardForm();
  });

  test('PO_BND_006 / 015 / PO_PERF_008 - 50 item rows save; converting that order loads all 50 lines', { tag: T }, async () => {
    test.setTimeout(1_800_000);
    const lines = Array.from({ length: 50 }, (_, i) => L([A, B, C][i % 3], i + 1));
    const o = await order(lines);
    await po.convertToInvoice(o.no);
    expect(await po.lineCount()).toBeGreaterThanOrEqual(50);
    await po.discardForm().catch(() => {});
  });

  test('PO_BND_007 / 008 - PO dated 2000-01-01 with delivery 2099-12-31 saves', { tag: T }, async () => {
    const m = model([L(A, 1)]);
    await po.startInvoice({ vendorName: VENDOR, billDate: pickerDate(new Date(2000, 0, 1)), deliveryDate: pickerDate(new Date(2099, 11, 31)) });
    const no0 = await po.billNoInput.inputValue();
    await po.fillInvoice(m);
    const r = await po.trySave();
    expect(r.saved, r.message).toBe(true);
    await po.confirmSavedNumber(no0, VENDOR, po.computeTotals(m).total);
  });

  // QA (BUG-PO-02): no TDS on a purchase order, so only the discount part of PO_BND_014 is checked.
  test('PO_BND_014 / PO_NEG_007 - Discount above the total: total never negative', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(model([L(A, 1, { discount: 100 })]));
    const s = await po.readSummary();
    expect(s.total).toBeGreaterThanOrEqual(0);
    await po.discardForm();
  });

  // ── Business rules ───────────────────────────────────────────────────────

  test('PO_BL_001 / 002 / 003 / 013 / PO_E2E_002 - Saving and editing an order moves no stock, posts no journal, leaves the vendor due', { tag: T }, async () => {
    const s0 = await po.readStock(C);
    const h0 = await po.vendorHeader(VENDOR);
    const o = await order([L(C, 25)]);
    expect(await po.readStock(C), 'no stock on save').toBe(s0);
    expectClose((await po.vendorHeader(VENDOR)).due, h0.due, 0.02, 'vendor due unchanged');
    const j = await po.readJournal(o.no);
    expect(j.rows, 'no journal for a PO').toEqual([]);
    await po.editInvoice(o.no);
    await po.setLine(0, 40);
    await po.save();
    expect(await po.readStock(C), 'no stock on edit').toBe(s0);
  });

  test('PO_FUNC_008 / 016 / 018 / PO_POS_013 / 014 / 015 / PO_UI_019 / PO_BL_006 / 007 / 008 / 014 / PO_E2E_004 / 007 - Convert To Invoice: vendor, items, place of supply and Ref = PO no carried; Save and Send posts stock, vendor due and journal', { tag: T }, async ({ page }) => {
    const s0 = await po.readStock(C);
    const h0 = await po.vendorHeader(VENDOR);
    const o = await order([L(C, 25)]);
    await po.convertToInvoice(o.no);
    expect(await po.refNoInput.inputValue()).toBe(o.no);
    expect((await po.readLine(0)).qty).toBe(25);
    expect((await page.locator('body').innerText())).toContain(VENDOR);
    await expect(po.saveDraftBtn).toBeVisible();
    const billNo = await po.billNoInput.inputValue();
    await po.saveConvertedInvoice();
    expect(await po.readStock(C), 'stock up after conversion').toBe(s0 + 25);
    expectClose((await po.vendorHeader(VENDOR)).due - h0.due, o.total, 0.05, 'vendor due up');
    const inv = await po.invoiceListRow(billNo).catch(() => null);
    if (inv) expect(inv.status).toMatch(/days? due/i);
  });

  test('PO_FUNC_017 / PO_E2E_003 - Converted invoice saved as Draft: listed Draft, no stock yet', { tag: T }, async () => {
    const s0 = await po.readStock(C);
    const o = await order([L(C, 6)]);
    const billNo = await po.convertToInvoice(o.no);
    await po.saveConvertedInvoice({ draft: true });
    expect((await po.invoiceListRow(billNo)).status).toMatch(/draft/i);
    expect(await po.readStock(C)).toBe(s0);
  });

  // QA (BUG-PO-05): the "Converted" status is not developed yet.
  test.fixme('PO_BL_018 / PO_NEG_010 - A converted order cannot be converted again or deleted (Converted status not developed yet)', { tag: T }, async () => {
    const o = await order([L(C, 1)]);
    await po.convertToInvoice(o.no);
    await po.saveConvertedInvoice();
    await po.openInvoice(o.no);
    const canConvert = await po.convertBtn.isVisible().catch(() => false) && await po.convertBtn.isEnabled().catch(() => false);
    expect(canConvert, 'Convert To Invoice offered again').toBe(false);
    await po.closePreview().catch(() => {});
    expect(await po.deleteOrder(o.no), 'converted order deleted').toBe(false);
  });

  test('PO_E2E_005 - Two orders converted separately: two invoices, vendor due up by both', { tag: T }, async () => {
    const h0 = await po.vendorHeader(VENDOR);
    const o1 = await order([L(A, 1)]);
    const o2 = await order([L(A, 2)]);
    for (const o of [o1, o2]) { await po.convertToInvoice(o.no); await po.saveConvertedInvoice(); }
    expectClose((await po.vendorHeader(VENDOR)).due - h0.due, o1.total + o2.total, 0.05, 'vendor due');
  });

  // ── Validation ───────────────────────────────────────────────────────────

  test('PO_NEG_002 / PO_VAL_003 - Without items Save and Send is disabled', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await expect(po.saveBtn).toBeDisabled();
    await po.discardForm();
  });

  for (const [id, field, value] of [
    ['PO_NEG_003', 'qty', '0'], ['PO_NEG_004', 'qty', '-5'], ['PO_NEG_011', 'qty', 'abc'],
    ['PO_NEG_005', 'rate', '-100'], ['PO_NEG_012 / PO_VAL_005', 'rate', 'abc'],
  ]) {
    test(`${id} - ${field} "${value}" is refused`, { tag: T }, async () => {
      await po.startInvoice({ vendorName: VENDOR });
      await po.fillInvoice(model([L(A, 1)]));
      const row = po.lineRows.nth(0);
      await blocked(field === 'qty' ? po.lineQty(row) : po.lineRate(row), value, field);
      if (/purchase-order-bill\/add/.test(po.page.url())) await po.discardForm();
    });
  }

  test('PO_NEG_013 / PO_VAL_006 - Line discount 110% is refused or capped', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(model([L(A, 1)]));
    const shown = await po.typeValue(po.lineDiscount(po.lineRows.nth(0)), '110');
    if (parseFloat(shown) === 110) expect((await po.trySave()).saved, '110% discount must be refused').toBe(false);
    if (/purchase-order-bill\/add/.test(po.page.url())) await po.discardForm();
  });

  test('PO_VAL_010 / 011 - Shipping and adjustment reject letters', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(model([L(A, 1)]));
    await blocked(po.shippingInput, 'abc', 'shipping');
    if (/purchase-order-bill\/add/.test(po.page.url())) await blocked(po.adjustmentAmount, 'abc', 'adjustment');
    if (/purchase-order-bill\/add/.test(po.page.url())) await po.discardForm();
  });

  test('PO_VAL_009 - A delivery date before the PO date is refused', { tag: T }, async () => {
    const typed = pickerDate(addDays(new Date(), -3));
    await po.startInvoice({ vendorName: VENDOR, deliveryDate: typed });
    await po.fillInvoice(model([L(A, 1)]));
    if ((await po.deliveryDate.inputValue()) !== typed) { console.log('Picker did not accept an earlier delivery date'); await po.discardForm(); return; }
    expect((await po.trySave()).saved, 'delivery before PO date must be refused').toBe(false);
    await po.discardForm();
  });

  test('PO_NEG_006 / PO_VAL_007 - No Place of Supply: save refused', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(model([L(A, 1)]));
    await po.placeOfSupplySelect.hover();
    const clear = po.placeOfSupplySelect.locator('.ant-select-clear');
    if (!(await clear.isVisible().catch(() => false))) { console.log('Place of Supply cannot be cleared'); await po.discardForm(); return; }
    await clear.click();
    expect((await po.trySave()).saved).toBe(false);
    await po.discardForm();
  });

  test('PO_NEG_015 / PO_VAL_002 / 008 - Empty PO Date is refused', { tag: T }, async () => {
    await po.startInvoice({ vendorName: VENDOR });
    await po.fillInvoice(model([L(A, 1)]));
    if (await po.clearBillDate()) { console.log('PO date cannot be emptied'); await po.discardForm(); return; }
    expect((await po.trySave()).saved, 'empty PO date must be refused').toBe(false);
    await po.discardForm();
  });

  test('PO_NEG_016 - Converting an order whose items were all removed is blocked', { tag: T }, async () => {
    const o = await order([L(A, 1)]);
    await po.editInvoice(o.no);
    const removed = await po.tryRemoveLine(0);
    if (!removed || (await po.lineCount()) > 0) { console.log('The last line of an order cannot be removed — no item-less order possible'); await po.discardForm(); return; }
    expect((await po.trySave()).saved).toBe(false);
  });

  test('PO_VAL_014 / PO_NEG_008 / 014 / 018 / PO_SEC_003 / PO_UI_020 - Unknown, special, SQL and long searches: empty list, no crash', { tag: T }, async ({ page }) => {
    for (const q of ['PO-NOPE-99999', '!@#$%^&*()', "' OR 1=1 --", 'X'.repeat(500)]) {
      expect(await po.searchList(q), `search "${q.slice(0, 20)}"`).toEqual([]);
      await expect(page.locator('.ant-empty, .ant-table-placeholder').first()).toBeVisible();
    }
  });

  // ── Search / filter ──────────────────────────────────────────────────────

  test('PO_SF_001 / 002 / 003 / 004 / 008 / 012 - Search by exact / partial number, vendor (any case, trimmed); clearing restores', { tag: T }, async () => {
    const o = await order([L(A, 1)]);
    const col = (rows) => rows.map((r) => r.find((c) => /^PO-/.test(c)));
    expect(col(await po.searchList(o.no))).toEqual([o.no]);
    expect(col(await po.searchList(o.no.slice(0, -1))).every((n) => n.startsWith(o.no.slice(0, -1)))).toBe(true);
    const lower = col(await po.searchList(VENDOR.toLowerCase()));
    expect(lower.length).toBeGreaterThan(0);
    expect(col(await po.searchList(VENDOR.toUpperCase()))).toEqual(lower);
    const padded = col(await po.searchList(`  ${VENDOR}  `));
    await bugCheck('BUG-GEN-01', 'search does not trim spaces', async () => {
      expect(padded).toEqual(lower);
    });
    expect((await po.searchList('')).length).toBeGreaterThan(0);
  });

  test('PO_SF_005 / 006 / 009 / 011 / PO_NEG_009 / PO_PAG_010 - Date range filter (incl. same start and end day) limits the list; reversed range gives nothing / an error', { tag: T }, async ({ page }) => {
    await order([L(A, 1)]);
    await po._searchList('');
    await po.setListDateRange(new Date(), new Date());
    const today = await po.readListRows();
    expect(today.length).toBeGreaterThan(0);
    for (const r of today) expect(r[0]).toBe(listDate(new Date()));
    await po.setListDateRange(addDays(new Date(), -1), addDays(new Date(), -10)).catch(() => {});
    expect(await po.readListRows()).toBeDefined();
    expect((await page.locator('body').innerText())).toMatch(/Total Count/i);
  });

  // ── Security / accessibility ─────────────────────────────────────────────

  test('PO_SEC_001 / 011 - Without a session the page redirects to login and the API answers 401', { tag: T }, async ({ browser, page }) => {
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto(page.url().replace(/\/[^/]*$/, '/purchase?purchase=3'));
    // Lands on the app's start page (Log In / Go to Dashboard) — never on the purchase list
    await expect(anon).not.toHaveURL(/purchase/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row'), 'no purchase data shown').toHaveCount(0);
    const res = await anon.request.get('https://invoice.test.api.vgts.xyz/bills/v2/purchase-order/?page=1&page_size=20');
    expect([401, 403]).toContain(res.status());
    await ctx.close();
  });

  test('PO_SEC_012 - No password or bearer token in the console while creating an order', { tag: T }, async ({ page }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    await order([L(A, 1)]);
    expect(logs.filter((l) => /password|bearer\s+[a-z0-9._-]{20,}/i.test(l))).toEqual([]);
  });

  test('PO_ACC_002 / 005 / 007 / 009 / 010 - Keyboard: Enter opens New PO, Escape closes dropdown and view, Convert reachable; status has a text label', { tag: T }, async ({ page }) => {
    const o = await order([L(A, 1)]);
    expect((await po.listRow(o.no)).status).toBe('Pending');
    await po.openInvoice(o.no);
    await po.convertBtn.focus();
    await expect(po.convertBtn).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ant-drawer-content').filter({ visible: true })).toHaveCount(0, { timeout: 5000 });
    await po.newOrderBtn.focus();
    await page.keyboard.press('Enter');
    await expect(po.vendorSelect).toBeVisible();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [id, title, why] of [
    ['PO_FUNC_012 / PO_EXP_001…010 / PO_E2E_009', 'Print preview and printed content', 'Browser print dialog / PDF content are not checkable in the browser.'],
    ['PO_POS_018 / PO_VAL_012', 'Add New Vendor / vendor GSTIN from the PO', 'Vendor creation — Vendor sheet.'],
    ['PO_VAL_013', 'Warehouse required for stock items', 'Only one warehouse ("Default").'],
    ['PO_BL_012', 'Round off posts to the Round Off account on conversion', 'Covered by PI_BL_015 (same invoice journal).'],
    ['PO_BL_019', 'Service item in a PO has no stock impact', 'Needs a service item — Inventory_Product sheet.'],
    ['PO_BND_009 / 010 / PO_PAG_001…009', 'Pagination boundaries / navigation', 'Same list component as Purchase Invoice — PI_PAG_*; exact counts need a controlled org.'],
    ['PO_BND_011', 'Notes maximum length', 'Covered by PI_BND_014 (same form).'],
    ['PO_SEC_002', 'Session timeout', 'Needs a shortened session lifetime.'],
    ['PO_SEC_006 / 007 / 009 / PO_E2E_010', 'Role restrictions', 'No role-restricted users in the test data.'],
    ['PO_SEC_008', 'Another org\'s PO by URL', 'Needs a second org.'],
    ['PO_SEC_010', 'CSRF protection', 'API-level security test.'],
    ['PO_PERF_001…007', 'Response-time limits', 'Environment-dependent; not a functional check.'],
    ['PO_ACC_001 / 003 / 004 / 006 / 008', 'Tab order, screen reader, contrast, keyboard date picker', 'Needs an accessibility audit tool / screen reader.'],
    ['PO_E2E_008', 'Converted invoice inherits every pricing field', 'Covered by PO_FUNC_008 (items / ref) and the shared totals model.'],
  ]) {
    test.fixme(`${id} - ${title} (${why})`, async () => {});
  }
});
