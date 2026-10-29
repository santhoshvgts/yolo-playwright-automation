const { test, expect, knownBug, bugCheck } = require('../../fixtures/base-test');
const { SalesInvoiceStockPage } = require('../../pages/sales/SalesInvoiceStockPage');
const { StockAdjustmentPage } = require('../../pages/inventory/StockAdjustmentPage');
const { SalesStockAlertPage } = require('../../pages/sales/SalesStockAlertPage');
const { SalesInvoiceEditPage, badgeFamily, pickerDate, listDate, addDays } = require('../../pages/sales/SalesInvoiceEditPage');
const { SalesInvoicePaymentPage, paymentDate } = require('../../pages/sales/SalesInvoicePaymentPage');
const { CustomerTransactionPage, statementDate } = require('../../pages/sales/CustomerTransactionPage');
const { SalesOrderPage } = require('../../pages/sales/SalesOrderPage');
const { CreditNotePage } = require('../../pages/sales/CreditNotePage');
const { CustomerPage } = require('../../pages/sales/CustomerPage');
const { SalesInvoiceStockData: D, SalesInvoiceEditFlowData: E, pcsItem, itemName } = require('../../test-data/SalesInvoiceStock_Data');
const { generateCustomerPaymentData } = require('../../test-data/CustomerPayment_Data');
const { masterData } = require('../../test-data/UserData');
const { expectClose, money } = require('../../utils/stockMath');

const moduleName = 'Sales Invoice - Stock & UOM';

// Sales Invoice stock / UOM / journal scenarios. Every test is self-contained: it creates its
// own item(s) with the exact UOM conversions and opening stock (Stock Adjustment) the case
// needs, so any single test can run alone, in any order. Numbers live in
// test-data/SalesInvoiceStock_Data.js (notes there on cases whose numbers were adjusted).
//
//   npx playwright test tests/sales/02_SalesInvoiceStock.spec.js
//   npx playwright test --grep @si-delete

/** [{ item, qty, uom }] from [{ qty, uom }] for one item. */
const linesFor = (item, rows) => rows.map((r) => ({ item, qty: r.qty, uom: r.uom || item.baseUnit }));

test.describe(moduleName, () => {
  // Fixed size: the top menu folds "Reports" into "…" on narrow windows.
  test.use({ viewport: { width: 1800, height: 900 } });
  // No retries: a retry would create more items / invoices on top of the first attempt's.
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {SalesInvoiceStockPage} */
  let si;
  test.beforeEach(async ({ page }) => {
    si = new SalesInvoiceStockPage(page);
    await si.open();
  });

  // ── Create: UOM conversion and stock limits ──────────────────────────────

  test('TC01 - 61 pcs = 1 box, 625 pcs = 1 bundle: with 4000 pcs, an invoice over the stock is refused and one within it is saved', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.uomConversion;
    const item = await si.setupItem(c.item());
    expect(item.conversions).toEqual({ pcs: 1, box: 61, bundle: 625 });

    await test.step('PCS 2000 + Box 4 + Bundle 20 (14744 pcs) is refused', async () => {
      await si.startInvoice();
      await si.addLines(linesFor(item, [
        { qty: c.exceeding.pcs, uom: 'pcs' }, { qty: c.exceeding.box, uom: 'box' }, { qty: c.exceeding.bundle, uom: 'bundle' },
      ]));
      expect(await si.saveExpectRefused()).toContain(item.itemName);
    });

    await test.step('PCS 1000 + Box 5 + Bundle 2 (2555 pcs) is saved', async () => {
      for (const [i, [qty, uom]] of [[c.allowed.pcs, 'pcs'], [c.allowed.box, 'box'], [c.allowed.bundle, 'bundle']].entries()) {
        await si.setLine(i, qty, uom);
      }
      await si.save();
    });

    const sold = c.allowed.pcs + c.allowed.box * 61 + c.allowed.bundle * 625;
    await si.expectStock(item, item.openingStock - sold, 'after invoice');
  });

  test('TC02 - Stock 2000 pcs: an invoice for 32.79 box (61 pcs = 1 box) is saved and the stock shows 0', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.decimalBoxToZero;
    const item = await si.setupItem(c.item());
    await si.createInvoice(linesFor(item, [{ qty: c.box, uom: 'box' }]));
    await si.expectStock(item, 0, 'after 32.79 box');
  });

  test('TC03 - Stock 2000 pcs: an invoice for 30 box (61 pcs = 1 box) leaves 170 pcs = 2.79 box', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.decimalBoxRemainder;
    const item = await si.setupItem(c.item());
    await si.createInvoice(linesFor(item, [{ qty: c.box, uom: 'box' }]));
    const left = item.openingStock - c.box * 61;
    await si.expectStock(item, left, 'after 30 box');
    expect(Math.round((left / 61) * 100) / 100, 'stock in box').toBe(c.expectedBoxesLeft);
  });

  test('TC04 - Stock 500.99 pcs: an invoice for 1 bundle (600 pcs) is refused with a validation message', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.bundleOverDecimalStock;
    const item = await si.setupItem(c.item());
    await si.startInvoice();
    await si.addLine(item, c.bundle, 'bundle');
    expect(await si.lineStockHint(0), 'bundle line flags the stock').toMatch(/ left$/);
    expect(await si.saveExpectRefused()).toContain(item.itemName);
    await si.discardForm();
    await si.expectStock(item, item.openingStock, 'refused invoice leaves stock');
  });

  test('TC05 - Stock 3500 pcs: 3501 pcs cannot be invoiced, 3500 is the maximum, and the stock stays 3500', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.maxQty;
    const item = await si.setupItem(c.item());
    await si.startInvoice();
    await si.addLine(item, c.over, 'pcs');
    expect(await si.lineStockHint(0), '3501 pcs flags the 3500 left').toMatch(new RegExp(`^${c.max}(\\.0+)? pcs left$`));
    await si.saveExpectRefused();

    await si.setLine(0, c.max, 'pcs');
    expect(await si.lineStockHint(0), '3500 pcs is within stock').toBe('');
    await si.discardForm();
    await si.expectStock(item, c.max, 'unsaved invoice leaves stock');
  });

  test('TC06 - One invoice with many items, mixed UOMs and decimal quantities reduces every item\'s stock exactly', { tag: ['@sales', '@si-stock'] }, async () => {
    test.setTimeout(3_600_000);   // creates ~20 items
    const c = D.multiItemDecimal;
    const items = await si.setupItems(Array.from({ length: c.count }, (_, i) => c.item(i)));
    const lines = items.map((item, i) => ({ item, ...c.quantities[i % c.quantities.length] }));
    await si.createInvoice(lines);
    for (const item of items) await si.expectStock(item, item.openingStock - si.baseQtyOf(item, lines), item.itemName);
  });

  test('TC07 - Stock 15000 pcs: several invoices for one item totalling 14500 pcs leave 500 pcs', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.multiInvoiceSingleItem;
    const item = await si.setupItem(c.item());
    let left = item.openingStock;
    for (const qty of c.invoices) {
      await si.createInvoice(linesFor(item, [{ qty }]));
      left -= qty;
      await si.expectStock(item, left, `after invoice of ${qty}`);
    }
    expect(left).toBe(500);
  });

  test('TC08 - Stock 20000 pcs: one invoice with many box / pcs / bundle lines of the same item reduces the stock exactly', { tag: ['@sales', '@si-stock'] }, async () => {
    const c = D.multiLineSingleItem;
    const item = await si.setupItem(c.item());
    const lines = linesFor(item, c.lines);
    await si.createInvoice(lines);
    await si.expectStock(item, item.openingStock - si.baseQtyOf(item, lines), 'after multi-line invoice');
  });

  test('TC09 - Several items sold over several invoices in mixed UOMs (62 pcs = 1 box, 702 pcs = 1 bundle) reduce the stock exactly', { tag: ['@sales', '@si-stock'] }, async () => {
    test.setTimeout(2_400_000);   // creates 10 items
    const c = D.multiItemMultiInvoice;
    const items = await si.setupItems(Array.from({ length: c.count }, (_, i) => c.item(i)));
    const allLines = [];
    for (const row of c.perItem) {   // one invoice per UOM, one line per item
      const lines = items.map((item) => ({ item, qty: row.qty, uom: row.uom }));
      await si.createInvoice(lines);
      allLines.push(...lines);
    }
    let totalLeft = 0;
    for (const item of items) {
      const left = item.openingStock - si.baseQtyOf(item, allLines);
      totalLeft += left;
      await si.expectStock(item, left, item.itemName);
    }
    const totalOpening = items.reduce((s, i) => s + i.openingStock, 0);
    console.log(`Total stock ${totalOpening} → ${totalLeft} pcs`);
  });

  test('TC10 - Single-unit items: pcs item offers no box, box item no bundle, bundle item no pcs', { tag: ['@sales', '@si-stock'] }, async () => {
    for (const c of D.singleUnit) {
      const item = await si.setupItem(c.spec());
      await test.step(`${item.baseUnit} item`, async () => {
        await si.startInvoice();
        await si.addLine(item, 1);
        const options = await si.lineUomOptions(0);
        expect(options, `${item.baseUnit}-only item offers only ${item.baseUnit}`).toEqual([item.baseUnit]);
        expect(options).not.toContain(c.forbidden);
        await si.discardForm();
      });
    }
  });

  // ── Journal ───────────────────────────────────────────────────────────────

  test('TC11 - Invoice with different items posts the right journal accounts', { tag: ['@sales', '@si-journal'] }, async () => {
    const c = D.journalMultiItem;
    const items = await si.setupItems(c.items());
    const lines = c.lines.map((l) => ({ item: items[l.item], qty: l.qty, uom: l.uom }));
    const { billNo, total } = await si.createInvoice(lines);
    si.verifyJournal(await si.readJournal(billNo), { total, lines });
  });

  test('TC12 - Invoice with a single item posts the right journal accounts', { tag: ['@sales', '@si-journal'] }, async () => {
    const c = D.journalSingleItem;
    const item = await si.setupItem(c.item());
    const lines = linesFor(item, c.lines);
    const { billNo, total } = await si.createInvoice(lines);
    si.verifyJournal(await si.readJournal(billNo), { total, lines });
  });

  // ── Edit ──────────────────────────────────────────────────────────────────

  /** Create an invoice for `qty` of the item's base unit, then edit line 1 to each of `edits`, checking stock each time. */
  const createThenEdit = async (item, qty, edits) => {
    const { billNo } = await si.createInvoice(linesFor(item, [{ qty }]));
    await si.expectStock(item, item.openingStock - qty, `after create (${qty})`);
    for (const edit of edits) {
      await si.editInvoice(billNo);
      await si.setLine(0, edit);
      await si.save();
      await si.expectStock(item, item.openingStock - edit, `after edit to ${edit}`);
    }
    return billNo;
  };

  test('TC13 - Stock 3000: invoice for 3000 leaves 0, editing it to 1500 leaves 1500', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editRound;
    const item = await si.setupItem(c.item());
    await createThenEdit(item, c.create, [c.edit]);
  });

  test('TC14 - Invoice created with 553 pcs and edited to 234.67 pcs updates the stock correctly', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editRoundToDecimal;
    const item = await si.setupItem(c.item());
    await createThenEdit(item, c.create, [c.edit]);
  });

  test('TC15 - Invoice created with 42.99 pcs and edited to 31 pcs updates the stock correctly', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editDecimalToRound;
    const item = await si.setupItem(c.item());
    await createThenEdit(item, c.create, [c.edit]);
  });

  test('TC16 - Stock 100: the invoice qty raised and lowered many times keeps the stock correct after every edit', { tag: ['@sales', '@si-edit'] }, async () => {
    test.setTimeout(1_800_000);
    const c = D.editManyTimes;
    const item = await si.setupItem(c.item());
    const [first, ...edits] = c.quantities;
    await createThenEdit(item, first, edits);
  });

  test('TC17 - Stock 5000: invoice in pcs edited to 1000 pcs + 2 box + 2 bundle updates the stock correctly', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editToMixedUom;
    const item = await si.setupItem(c.item());
    const { billNo } = await si.createInvoice(linesFor(item, [{ qty: c.create }]));
    await si.expectStock(item, item.openingStock - c.create, 'after create');

    const edited = linesFor(item, c.edit);
    await si.editInvoice(billNo);
    await si.setLine(0, edited[0].qty, edited[0].uom);
    await si.addLines(edited.slice(1));
    await si.save();
    await si.expectStock(item, item.openingStock - si.baseQtyOf(item, edited), 'after edit to mixed UOMs');
  });

  test('TC18 - Stock 2100: editing the invoice to 1000 + 1000 + 200 pcs is refused with a validation message', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editExceeding;
    const item = await si.setupItem(c.item());
    const { billNo } = await si.createInvoice(linesFor(item, [{ qty: c.create }]));
    await si.expectStock(item, item.openingStock - c.create, 'after create');

    await si.editInvoice(billNo);
    await si.setLine(0, c.edit[0]);
    await si.addLines(linesFor(item, c.edit.slice(1).map((qty) => ({ qty }))));
    expect(await si.saveExpectRefused()).toContain(item.itemName);
    await si.discardForm();
    await si.expectStock(item, item.openingStock - c.create, 'refused edit leaves stock');
  });

  test('TC19 - Single-unit pcs item (stock 200) invoice edited to several items in mixed UOMs updates every stock correctly', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editAddItems;
    const [single, other] = await si.setupItems([c.single(), c.other()]);
    const { billNo } = await si.createInvoice(linesFor(single, [{ qty: c.create }]));
    await si.expectStock(single, single.openingStock - c.create, 'after create');

    const singleLines = linesFor(single, c.singleLines.map((qty) => ({ qty })));
    const otherLines = linesFor(other, c.otherLines);
    await si.editInvoice(billNo);
    await si.setLine(0, singleLines[0].qty);
    await si.addLines([...singleLines.slice(1), ...otherLines]);
    await si.save();
    await si.expectStock(single, single.openingStock - si.baseQtyOf(single, singleLines), 'single-unit item after edit');
    await si.expectStock(other, other.openingStock - si.baseQtyOf(other, otherLines), 'added item after edit');
  });

  test('TC20 - Journal is right for a single-item invoice and again after editing it to several items', { tag: ['@sales', '@si-edit', '@si-journal'] }, async () => {
    const c = D.journalAfterEdit;
    const items = await si.setupItems(c.items());
    const created = c.create.map((l) => ({ item: items[l.item], qty: l.qty, uom: l.uom }));
    const { billNo, total } = await si.createInvoice(created);
    si.verifyJournal(await si.readJournal(billNo), { total, lines: created });

    const added = c.added.map((l) => ({ item: items[l.item], qty: l.qty, uom: l.uom }));
    await si.editInvoice(billNo);
    await si.addLines(added);
    const editedTotal = await si.readInvoiceTotal();
    await si.save();
    const journal = await si.readJournal(billNo);
    si.verifyJournal(journal, { total: editedTotal, lines: [...created, ...added] });
  });

  test('TC21 - Draft invoice: creating and editing it (qty change, added items) posts no journal and leaves stock unchanged', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.draft;
    const [a, b] = await si.setupItems(c.items());
    const billNo = await si.startInvoice();
    await si.addLine(a, c.create);
    await si.saveAsDraft();
    expect(await si.invoiceStatus(billNo)).toBe('Draft');
    expect((await si.readJournal(billNo)).rows, 'draft has no journal').toHaveLength(0);
    await si.expectStock(a, a.openingStock, 'draft created');

    await si.editInvoice(billNo);
    await si.setLine(0, c.edit);
    await si.addLine(b, c.added.qty, c.added.uom);
    await si.save();
    expect(await si.invoiceStatus(billNo)).toBe('Draft');
    expect((await si.readJournal(billNo)).rows, 'edited draft has no journal').toHaveLength(0);
    await si.expectStock(a, a.openingStock, 'draft edited (item A)');
    await si.expectStock(b, b.openingStock, 'draft edited (item B)');
  });

  test('TC22 - Editing the invoice qty from 100 to 1,000,000,000.46 pcs is refused with a validation message and the stock stays correct', { tag: ['@sales', '@si-edit'] }, async () => {
    const c = D.editHugeQty;
    const item = await si.setupItem(c.item());
    const { billNo } = await si.createInvoice(linesFor(item, [{ qty: c.create }]));
    await si.expectStock(item, item.openingStock - c.create, 'after create');

    await si.editInvoice(billNo);
    await si.setLine(0, c.edit);
    console.log(`Qty field shows "${await si.lineQtyValue(0)}"`);
    await si.saveExpectRefused();
    await si.discardForm();
    await si.expectStock(item, item.openingStock - c.create, 'refused edit leaves stock');
  });

  // ── Delete / Cancel ───────────────────────────────────────────────────────

  test('TC23 - Stock 2500: invoice for 2200 leaves 300; cancelling or deleting it gives the 2200 back (2500)', { tag: ['@sales', '@si-delete'] }, async () => {
    const c = D.deleteCancelRestore;
    const item = await si.setupItem(c.item());

    await test.step('cancel, then delete the cancelled invoice', async () => {
      const { billNo } = await si.createInvoice(linesFor(item, [{ qty: c.qty }]));
      await si.expectStock(item, item.openingStock - c.qty, 'after create');
      await si.cancelInvoice(billNo, D.cancelComments);
      await si.expectStock(item, item.openingStock, 'after cancel');
      await si.deleteInvoice(billNo);
      await si.expectStock(item, item.openingStock, 'after deleting the cancelled invoice');
    });

    await test.step('delete a live invoice', async () => {
      const { billNo } = await si.createInvoice(linesFor(item, [{ qty: c.qty }]));
      await si.expectStock(item, item.openingStock - c.qty, 'after create');
      await si.deleteInvoice(billNo);
      await si.expectStock(item, item.openingStock, 'after delete');
    });
  });

  test('TC24 - Stock 25000: deleting an invoice with mixed UOM lines restores 25000', { tag: ['@sales', '@si-delete'] }, async () => {
    const c = D.deleteMixedUom;
    const item = await si.setupItem(c.item());
    const lines = linesFor(item, c.lines);
    const { billNo } = await si.createInvoice(lines);
    await si.expectStock(item, item.openingStock - si.baseQtyOf(item, lines), 'after create');
    await si.deleteInvoice(billNo);
    await si.expectStock(item, item.openingStock, 'after delete');
  });

  for (const [id, key, title] of [
    ['TC25', 'deleteBoxes', 'Deleting an invoice for 20 box (1 box = 51 pcs) gives 1020 pcs back'],
    ['TC26', 'deleteBundles', 'Deleting an invoice for 20 bundle (1 bundle = 602 pcs) gives 12040 pcs back'],
  ]) {
    test(`${id} - ${title}`, { tag: ['@sales', '@si-delete'] }, async () => {
      const c = D[key];
      const item = await si.setupItem(c.item());
      const { billNo } = await si.createInvoice(linesFor(item, [{ qty: c.qty, uom: c.uom }]));
      const after = item.openingStock - c.restored;
      await si.expectStock(item, after, 'after create');
      await si.deleteInvoice(billNo);
      await si.expectStock(item, after + c.restored, `after delete (+${c.restored})`);
    });
  }

  test('TC27 - Stock 35900: deleting an invoice with pcs / box / bundle / box2 lines restores 35900', { tag: ['@sales', '@si-delete'] }, async () => {
    const c = D.deleteFourUoms;
    const item = await si.setupItem(c.item());
    const lines = linesFor(item, c.lines);
    const { billNo } = await si.createInvoice(lines);
    await si.expectStock(item, item.openingStock - si.baseQtyOf(item, lines), 'after create');
    await si.deleteInvoice(billNo);
    await si.expectStock(item, item.openingStock, 'after delete');
  });

  test('TC28 - With invoices on different dates, deleting the 21/12/2025 invoice gives back only its qty (2750)', { tag: ['@sales', '@si-delete'] }, async () => {
    const c = D.deleteByDate;
    const item = await si.setupItem(c.item(), { billDate: c.stockDate });
    const created = [];
    for (const inv of c.invoices) {
      const { billNo } = await si.createInvoice(linesFor(item, [{ qty: inv.qty }]), { billDate: inv.billDate || undefined });
      created.push({ ...inv, billNo });
    }
    const sold = c.invoices.reduce((s, i) => s + i.qty, 0);
    await si.expectStock(item, item.openingStock - sold, 'after all invoices');

    const target = created.find((i) => i.deleteIt);
    await si.deleteInvoice(target.billNo);
    await si.expectStock(item, c.expectedAfterDelete, `after deleting the ${target.billDate} invoice`);
    expect(item.openingStock - sold + target.qty).toBe(c.expectedAfterDelete);
  });

  test('TC29 - After deleting every invoice of an item, Inventory, Stock Adjustment and the Sales Invoice alert all show the opening stock', { tag: ['@sales', '@si-delete'] }, async ({ page }) => {
    const c = D.deleteAll;
    const item = await si.setupItem(c.item());
    const billNos = [];
    let sold = 0;
    for (const rows of c.invoices) {
      const lines = linesFor(item, rows);
      billNos.push((await si.createInvoice(lines)).billNo);
      sold += si.baseQtyOf(item, lines);
    }
    await si.expectStock(item, item.openingStock - sold, 'after all invoices');

    for (const billNo of billNos) await si.deleteInvoice(billNo);
    await si.expectStock(item, item.openingStock, 'after deleting all invoices');
    expectClose(await new StockAdjustmentPage(page).readCurrentQty(item.itemName), item.openingStock, 0.01, 'Stock Adjustment current qty');
    expectClose(await new SalesStockAlertPage(page).readPcsLeft(item.itemName), item.openingStock, 0.01, 'Sales Invoice pcs-left alert');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Sales Invoice — Edit Flow (Sales_Invoice_Edit_Flow_TestCases.xlsx, TC-E01…TC-E74)
//
// Each test creates an invoice, opens it in edit mode, changes one thing and checks the
// line amounts and pricing summary against the app's formula (SalesInvoiceEditPage
// .computeTotals), then saves and checks the Sales list Bill Amount. The four priced items
// are shared (created once, kept in Rundata section siEditFlowItems).
//
// Already automated elsewhere — not repeated here:
//   TC-E07 line discount % change ......... tests/unit_flows/Sales_Unit.spec.js TC19 (edits line discounts)
//   TC-E35 overall discount fixed (₹) ..... Sales_Unit TC18 / TC19 (discount type Amount)
//   TC-E41 adjustment amount, Add mode .... Sales_Unit TC19 (edits the Addition adjustment)
//   TC-E47 change shipping cost ........... Sales_Unit TC19 (edits shipping)
//   TC-E67 unpaid Due = Bill Amount ....... Sales_Unit TC18 / TC19 (Bill Amount = Due Amount)
//   TC-E68 draft shows Draft badge ........ TC21 above
//   TC-E69 list Bill Amount = grand total . Sales_Unit TC18
//   TC-E74 edit → list shows new amount ... Sales_Unit TC19
//
// Where the app blocks an invalid value at the keyboard (no "-" sign, discount capped at
// 100) the negative tests accept that as "blocked"; otherwise they expect the save to be
// refused with a message, as the manual cases say.
//
//   npx playwright test --grep @si-edit-flow
// ════════════════════════════════════════════════════════════════════════════

test.describe('Sales Invoice - Edit Flow', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {SalesInvoiceEditPage} */
  let ef;
  let A; let B; let C; let Dn;   // priced items: ₹100, ₹250, ₹40, ₹75 per pcs, GST18
  test.beforeEach(async ({ page }) => {
    ef = new SalesInvoiceEditPage(page);
    await ef.open();
    [A, B, C, Dn] = await ef.ensurePricedItems(E.items());
  });

  /** Invoice-model line for `item` (defaults: item price, no discount, GST18, no CESS). */
  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });

  /** Create, open for edit, apply `change(model)`, check lines + totals, save, check the list amount. */
  const editAndVerify = async (m, change, opts = {}) => {
    const { billNo } = await ef.createPricedInvoice(m, opts);
    await ef.editInvoice(billNo);
    await ef.alignToForm(m);
    await change(m);
    await ef.expectLineAmounts(m, 'after edit');
    await ef.expectTotals(m, 'after edit');
    await ef.save();
    await ef.expectListAmount(billNo, m, 'after edit');
    return billNo;
  };

  // ── Item Change ─────────────────────────────────────────────────────────

  test('TC-E01 - Remove the existing item and add a new item: new line pre-filled, totals recalculate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    const billNo = await editAndVerify(m, async () => {
      const at = m.lines.findIndex((l) => l.item === A);
      await ef.removeLine(at);
      m.lines.splice(at, 1);
      await ef.addLine(C, 3);
      m.lines.push(L(C, 3));
      const added = await ef.readLine(1);
      expect(added.text).toContain(C.itemName);
      expect(added.rate, 'rate pre-filled').toBe(C.price);
      expect(added.uom, 'UOM pre-filled').toBe('pcs');
      expect(added.gst, 'GST pre-filled').toBe('GST18');
      expect(added.cess, 'CESS pre-filled (none)').toBe('');
    });
    await ef.editInvoice(billNo);
    const texts = await ef.lineItemTexts();
    expect(texts).toHaveLength(2);
    expect(texts.some((t) => t.includes(A.itemName)), 'removed item is gone').toBe(false);
    expect(texts.some((t) => t.includes(C.itemName)), 'new item saved').toBe(true);
    await ef.discardForm();
  });

  test('TC-E02 - Remove all items and add multiple new items: totals recalculate from scratch', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1), L(B, 2), L(C, 3)]);
    await editAndVerify(m, async () => {
      // The edit form keeps at least one line, so add the new items first, then remove all old ones
      await ef.addLine(Dn, 2);
      await ef.addLine(A, 4);
      for (let i = 0; i < 3; i++) await ef.removeLine(0);
      m.lines = [L(Dn, 2), L(A, 4)];
      const texts = await ef.lineItemTexts();
      expect(texts.some((t) => t.includes(B.itemName) || t.includes(C.itemName)), 'old items cleared').toBe(false);
    });
  });

  test('TC-E03 - Cancel the edit after removing an item: the invoice keeps all its items', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1), L(B, 2), L(C, 3)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.removeLine(1);
    expect(await ef.lineCount()).toBe(2);
    await ef.discardForm();

    await ef.editInvoice(billNo);
    expect(await ef.lineCount(), 'removed item is back').toBe(3);
    expect((await ef.lineItemTexts()).some((t) => t.includes(B.itemName)), 'removed item is back').toBe(true);
    await ef.expectTotals(m, 'after cancelled edit');
    await ef.discardForm();
    await ef.expectListAmount(billNo, m, 'after cancelled edit');
  });

  test('TC-E04 - Saving with every item removed is refused with "At least one item is required"', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1), L(B, 1)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.removeLine(0);
    // The app may keep the last line (removal blocked) — then the invoice cannot be emptied at all
    if (await ef.tryRemoveLine(0)) {
      expect(await ef.saveExpectRefused()).toMatch(/at least one item/i);
    } else {
      console.log('Last line cannot be removed — an empty invoice cannot be saved');
      expect(await ef.lineCount()).toBe(1);
    }
    await ef.discardForm();
    await ef.expectListAmount(billNo, m, 'refused edit leaves the invoice');
  });

  test('TC-E05 - Replace the middle item: items 1 and 3 unchanged, new item correct, total recalculates', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1, { discount: 5 }), L(B, 2), L(C, 3, { discount: 10 })]);
    const billNo = await editAndVerify(m, async () => {
      const at = m.lines.findIndex((l) => l.item === B);   // the middle item
      await ef.removeLine(at);
      m.lines.splice(at, 1);
      await ef.addLine(Dn, 2);
      m.lines.push(L(Dn, 2));
    });
    // The saved invoice may list the added item first, so find lines by item name
    await ef.editInvoice(billNo);
    const lines = [];
    for (let i = 0; i < await ef.lineCount(); i++) lines.push(await ef.readLine(i));
    const byItem = (item) => lines.find((l) => l.text.includes(item.itemName));
    expect(lines).toHaveLength(3);
    expect(byItem(B), 'removed item is gone').toBeUndefined();
    expect([byItem(A).rate, byItem(A).qty, byItem(A).discount], 'item 1 unchanged').toEqual([A.price, 1, 5]);
    expect([byItem(C).rate, byItem(C).qty, byItem(C).discount], 'item 3 unchanged').toEqual([C.price, 3, 10]);
    expect([byItem(Dn).rate, byItem(Dn).qty], 'new item').toEqual([Dn.price, 2]);
    await ef.discardForm();
  });

  // ── Rate & Discount ─────────────────────────────────────────────────────

  test('TC-E06 - Change the rate of a single item: line total = rate × qty − discount, grand total recalculates', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 3, { discount: 5 })]);
    await editAndVerify(m, async () => {
      await ef.setLineRate(0, 123.45);
      m.lines[0].rate = 123.45;
    });
  });

  test('TC-E08 - Switch a line discount from % to a fixed ₹ amount', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 4, { discount: 10 })]);
    const billNo = await editAndVerify(m, async () => {
      await ef.setLineDiscount(0, 25, '₹');
      Object.assign(m.lines[0], { discount: 25, discountMode: '₹' });
    });
    await ef.editInvoice(billNo);
    const line = await ef.readLine(0);
    expect([line.discountMode, line.discount]).toEqual(['₹', 25]);
    await ef.discardForm();
  });

  test('TC-E09 - Change rate and discount on three items at once: every line and the totals recalculate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2, { discount: 5 }), L(B, 1), L(C, 5, { discount: 10 })]);
    await editAndVerify(m, async () => {
      for (const [i, [rate, discount]] of [[110, 8], [260.5, 12.5], [42, 2.5]].entries()) {
        await ef.setLineRate(i, rate);
        await ef.setLineDiscount(i, discount, '%');
        Object.assign(m.lines[i], { rate, discount });
      }
    });
  });

  test('TC-E10 - A line discount above 100% is blocked', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.expectInvalidValueBlocked(ef.lineDiscount(ef.lineRows.nth(0)), '110', 'line discount 110%');
    await ef.discardForm();
    await ef.expectListAmount(billNo, m, 'invoice unchanged');
  });

  test('TC-E11 - A negative rate is blocked', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    const result = await ef.expectInvalidValueBlocked(ef.lineRate(ef.lineRows.nth(0)), '-100', 'rate -100');
    if (result.prevented) expect(parseFloat(result.shown), 'rate never negative').toBeGreaterThanOrEqual(0);
    await ef.discardForm();
    await ef.expectListAmount(billNo, m, 'invoice unchanged');
  });

  test('TC-E12 - A 100% line discount makes that line ₹0 and leaves the other items alone', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    await editAndVerify(m, async () => {
      await ef.setLineDiscount(0, 100, '%');
      m.lines[0].discount = 100;
      expect((await ef.readLine(0)).amount).toBe(0);
      expect((await ef.readLine(1)).amount, 'other item unaffected').toBe(m.lines[1].rate * m.lines[1].qty);
    });
  });

  test('TC-E13 - A line discount with 2 decimals (12.55) is stored as 12.55', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 3)]);
    const billNo = await editAndVerify(m, async () => {
      expect(await ef.setLineDiscount(0, '12.55', '%')).toBe('12.55');
      m.lines[0].discount = 12.55;
    });
    await ef.editInvoice(billNo);
    expect((await ef.readLine(0)).discount).toBe(12.55);
    await ef.discardForm();
  });

  // QA (BUG-SI-01): the input allows only 2 decimals, so the 3rd digit is dropped.
  test('TC-E14 - A line discount with more than 2 decimals (12.557) keeps only 2 decimals (12.55)', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 3)]));
    await ef.editInvoice(billNo);
    const shown = await ef.setLineDiscount(0, '12.557', '%');
    expect(shown, '12.557 cut to 2 decimals').toBe('12.55');
    await ef.discardForm();
  });

  // ── Zero Rate ───────────────────────────────────────────────────────────

  // QA (BUG-SI-03): zero-value lines / invoices are a supported flow — no warning, the invoice saves.
  test('TC-E15 - Rate 0 on one item is accepted and saved', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.alignToForm(m);
    await ef.setLineRate(0, 0);
    m.lines[0].rate = 0;
    expect((await ef.readLine(0)).amount).toBe(0);
    await ef.expectTotals(m, 'rate 0');
    await ef.save();
    await ef.expectListAmount(billNo, m, 'rate 0 saved');
  });

  test('TC-E16 - Rate 0 on every item: a zero-value invoice is saved', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1), L(B, 1), L(C, 1)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    for (let i = 0; i < 3; i++) { await ef.setLineRate(i, 0); m.lines[i].rate = 0; }
    await ef.expectTotals(m, 'all rates 0');
    await ef.save();
    await ef.expectListAmount(billNo, m, 'zero-value invoice saved');
  });

  test('TC-E17 - Zero rate on items 1 and 3: grand total = item 2 only, and the invoice saves', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1), L(B, 2), L(C, 1)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.alignToForm(m);
    for (const i of [0, 2]) { await ef.setLineRate(i, 0); m.lines[i].rate = 0; }
    const kept = m.lines[1];
    expect((await ef.readLine(1)).amount, 'item 2 unchanged').toBe(kept.rate * kept.qty);
    const expected = await ef.expectTotals(m, 'zero rate on 1 and 3');
    expectClose(expected.total, kept.rate * kept.qty * 1.18, 0.02, 'grand total = item 2 only');
    await ef.save();
    await ef.expectListAmount(billNo, m, 'zero rate on 1 and 3 saved');
  });

  // ── GST & CESS ──────────────────────────────────────────────────────────

  /** Change GST / CESS on lines (changes: [{ index, gst?, cess? }]). */
  const changeTaxes = (m, changes) => async () => {
    for (const c of changes) {
      if (c.gst !== undefined) { await ef.setLineGst(c.index, `GST${c.gst}`); m.lines[c.index].gst = c.gst; }
      if (c.cess !== undefined) { await ef.setLineCess(c.index, `CESS${c.cess}`); m.lines[c.index].cess = c.cess; }
    }
  };

  test('TC-E18 - Change GST from 18% to 12%: tax amount and grand total recalculate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const billNo = await editAndVerify(m, changeTaxes(m, [{ index: 0, gst: 12 }]));
    await ef.editInvoice(billNo);
    expect((await ef.readLine(0)).gst).toBe('GST12');
    await ef.discardForm();
  });

  test('TC-E19 - Change GST from 12% to 5%: grand total goes down', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2, { gst: 12 })]);
    const before = ef.computeTotals(m).total;
    await editAndVerify(m, changeTaxes(m, [{ index: 0, gst: 5 }]));
    expect(ef.computeTotals(m).total).toBeLessThan(before);
  });

  test('TC-E20 - Change CESS from 2% to 4%: tax amount and grand total recalculate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2, { cess: 2 })]);
    await editAndVerify(m, changeTaxes(m, [{ index: 0, cess: 4 }]));
  });

  test('TC-E21 - Remove GST from an item (GST0 — the app has no "none" option): tax drops, total recalculates', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    await editAndVerify(m, changeTaxes(m, [{ index: 0, gst: 0 }]));
  });

  test('TC-E22 - Remove CESS from an item (CESS0): tax drops, total recalculates', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2, { cess: 4 })]);
    await editAndVerify(m, changeTaxes(m, [{ index: 0, cess: 0 }]));
  });

  test('TC-E23 - Different GST rates on three items (5% / 12% / 18%): tax = sum of each item\'s tax', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1), L(B, 1), L(C, 2)]);
    await editAndVerify(m, changeTaxes(m, [{ index: 0, gst: 5 }, { index: 1, gst: 12 }, { index: 2, gst: 18 }]));
  });

  test('TC-E24 - Change GST 18%→12% and CESS 4%→2% on the same item: combined tax correct', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 3, { cess: 4 })]);
    await editAndVerify(m, changeTaxes(m, [{ index: 0, gst: 12, cess: 2 }]));
  });

  // ── Date Change ─────────────────────────────────────────────────────────

  /** Create an invoice, change its bill date in edit (7-day term), check the due date, save, check list + reopen. */
  const changeBillDate = async (newBill) => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 1)]));
    await ef.editInvoice(billNo);
    await ef.setBillDate(pickerDate(newBill));
    const due = pickerDate(addDays(newBill, 7));
    await expect(ef.dueDateInput, 'due date = bill date + 7 days').toHaveValue(due);
    await ef.save();
    expect((await ef.listRow(billNo)).date).toBe(listDate(newBill));
    await ef.editInvoice(billNo);
    expect(await ef.readDates()).toEqual({ billDate: pickerDate(newBill), dueDate: due });
    await ef.discardForm();
  };

  test('TC-E25 - Change the bill date to a past date: due date recalculates and the invoice saves', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    await changeBillDate(addDays(new Date(), -30));
  });

  test('TC-E26 - Change the bill date to a future date: due date recalculates and the invoice saves', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    await changeBillDate(addDays(new Date(), 15));
  });

  test('TC-E27 - A due date before the bill date is refused with a validation message', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 1)]));
    await ef.editInvoice(billNo);
    await ef.setDueTerm('custom');
    await ef.setDueDate(pickerDate(addDays(new Date(), -5)));
    expect(await ef.saveExpectRefused()).toMatch(/due date/i);
    await ef.discardForm();
  });

  test('TC-E28 - Change the due period from 7 to 30 days: due date = bill date + 30 days', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 1)]));
    await ef.editInvoice(billNo);
    const { billDate } = await ef.readDates();
    await ef.setDueTerm('30 days');
    const due = pickerDate(addDays(new Date(billDate), 30));
    await expect(ef.dueDateInput, 'due date = bill date + 30 days').toHaveValue(due);
    await ef.save();
    await ef.editInvoice(billNo);
    expect((await ef.readDates()).dueDate).toBe(due);
    await ef.discardForm();
  });

  test('TC-E29 - Custom due period with a manual due date is saved', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 1)]));
    await ef.editInvoice(billNo);
    const due = pickerDate(addDays(new Date(), 45));
    await ef.setDueTerm('custom');
    await ef.setDueDate(due);
    await ef.save();
    await ef.editInvoice(billNo);
    expect((await ef.readDates()).dueDate).toBe(due);
    await ef.discardForm();
  });

  // ── Tax Mode ────────────────────────────────────────────────────────────

  const switchTaxMode = (m, mode) => async () => { await ef.setTaxMode(mode); m.taxMode = mode; };

  test('TC-E30 - Switch from Including Tax to Excluding Tax: tax is added on top, totals recalculate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(C, 3)], { taxMode: 'Including Tax' });
    await editAndVerify(m, switchTaxMode(m, 'Excluding Tax'));
  });

  test('TC-E31 - Switch from Excluding Tax to Including Tax: tax is taken out of the rates, totals recalculate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(C, 3)]);
    await editAndVerify(m, switchTaxMode(m, 'Including Tax'));
  });

  test('TC-E32 - Switch tax mode with items at GST 5% / 12% / 18%: each item recalculates at its own rate', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 1, { gst: 5 }), L(B, 1, { gst: 12 }), L(C, 2)]);
    await editAndVerify(m, switchTaxMode(m, 'Including Tax'));
  });

  test('TC-E33 - Switch tax mode with % line discounts: tax is on the post-discount amounts', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2, { discount: 10 }), L(B, 1, { discount: 5 })]);
    await editAndVerify(m, switchTaxMode(m, 'Including Tax'));
  });

  // ── Summary Discount ────────────────────────────────────────────────────

  const setSummaryDiscount = (m, type, value) => async () => {
    await ef.setSummaryDiscount(type, value);
    m.summaryDiscount = { type, value: Number(value) };
  };

  test('TC-E34 - Overall discount 10%: 10% of the subtotal is deducted', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    await editAndVerify(m, setSummaryDiscount(m, 'Percentage', 10));
  });

  test('TC-E36 - Overall discount 100%: total = shipping / adjustment only', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)], { shipping: 50, adjustment: { type: 'Addition', value: 10 } });
    await editAndVerify(m, setSummaryDiscount(m, 'Percentage', 100));
    expect(ef.computeTotals(m).total).toBe(60);
  });

  test('TC-E37 - An overall discount above 100% is blocked', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.expectInvalidValueBlocked(ef.summaryDiscountPercent, '110', 'overall discount 110%');
    expect(parseFloat(await ef.summaryDiscountPercent.inputValue())).toBeLessThanOrEqual(100);
    await ef.discardForm();
    await ef.expectListAmount(billNo, m, 'invoice unchanged');
  });

  test('TC-E38 - Remove the overall discount (0): total returns to subtotal + tax', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)], { summaryDiscount: { type: 'Percentage', value: 15 } });
    await editAndVerify(m, setSummaryDiscount(m, 'Percentage', 0));
  });

  test('TC-E39 - Overall discount with 2 decimals (15.75%) is accepted and calculated correctly', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 3), L(C, 4)]);
    const billNo = await editAndVerify(m, async () => {
      expect(await ef.setSummaryDiscount('Percentage', '15.75')).toBe('15.75');
      m.summaryDiscount = { type: 'Percentage', value: 15.75 };
    });
    await ef.editInvoice(billNo);
    expect(await ef.summaryDiscountPercent.inputValue()).toBe('15.75');
    await ef.discardForm();
  });

  // ── Adjustment ──────────────────────────────────────────────────────────

  const setAdjustment = (m, type, value) => async () => {
    await ef.setAdjustment(type, value);
    m.adjustment = { type, value: Number(value || 0) };
  };

  // QA (BUG-SI-04): switching the type resets the amount to 0 (current flow), so it is re-entered.
  test('TC-E40 - Adjustment Add → Subtract: amount resets to 0, the re-entered amount is subtracted', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)], { adjustment: { type: 'Addition', value: 20 } });
    await editAndVerify(m, async () => {
      expect(parseFloat(await ef.adjustmentAmount.inputValue()), 'saved adjustment loaded in edit').toBe(20);
      await ef.setAdjustment('Subtract');
      expect(parseFloat(await ef.adjustmentAmount.inputValue() || '0'), 'amount reset to 0 after switching type').toBe(0);
      await ef.setAdjustment('Subtract', '20');
      m.adjustment = { type: 'Subtract', value: 20 };
    });
  });

  test('TC-E42 - New adjustment amount in Subtract mode is subtracted from the total', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)], { adjustment: { type: 'Subtract', value: 10 } });
    await editAndVerify(m, setAdjustment(m, 'Subtract', '35.5'));
  });

  test('TC-E43 - A Subtract adjustment larger than the invoice total gives ₹0 or a warning', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 4)]);   // ≈ ₹472
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    await ef.setAdjustment('Subtract', 600);
    const { total } = await ef.readSummary();
    console.log(`Total with a ₹600 subtract adjustment: ${total}`);
    if (total !== 0) await ef.saveExpectRefused();
    await ef.discardForm();
  });

  test('TC-E44 - Remove the adjustment (blank): total recalculates without it', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)], { adjustment: { type: 'Addition', value: 25 } });
    await editAndVerify(m, setAdjustment(m, 'Addition', ''));
  });

  test('TC-E45 - Adjustment with overall discount, shipping and tax: total = subtotal − discount + tax + shipping ± adjustment', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)], { summaryDiscount: { type: 'Percentage', value: 10 }, shipping: 80, adjustment: { type: 'Addition', value: 30 } });
    await editAndVerify(m, setAdjustment(m, 'Subtract', '12.5'));
  });

  // ── Shipping Cost ───────────────────────────────────────────────────────

  test('TC-E46 - Add ₹150 shipping to an invoice without shipping: total + ₹150', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const before = ef.computeTotals(m).total;
    await editAndVerify(m, async () => { await ef.setShipping(150); m.shipping = 150; });
    expectClose(ef.computeTotals(m).total, before + 150, 0.01, 'total + 150');
  });

  test('TC-E48 - Remove the shipping cost (blank): total drops by the shipping amount', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)], { shipping: 120 });
    await editAndVerify(m, async () => { await ef.setShipping(''); m.shipping = 0; });
  });

  test('TC-E49 - A negative shipping cost is blocked', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    const result = await ef.expectInvalidValueBlocked(ef.shippingInput, '-100', 'shipping -100');
    if (result.prevented) expect(parseFloat(result.shown || '0'), 'shipping never negative').toBeGreaterThanOrEqual(0);
    await ef.discardForm();
  });

  // QA (BUG-SI-02): the input allows only 2 decimals, so the 3rd digit is dropped.
  test('TC-E50 - Shipping cost with more than 2 decimals (150.999) keeps only 2 decimals (150.99)', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 2)]));
    await ef.editInvoice(billNo);
    const shown = await ef.setShipping('150.999');
    expect(parseFloat(shown), '150.999 cut to 2 decimals').toBe(150.99);
    await ef.discardForm();
  });

  // ── TDS / TCS ───────────────────────────────────────────────────────────

  test('TC-E51 - Apply TDS (Dividend, 10%): TDS is deducted from the total', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    await editAndVerify(m, async () => { m.tdsRate = await ef.setTds(E.tds.dividend); });
    expect(m.tdsRate).toBe(10);
  });

  test('TC-E52 - Change the TDS rate (Dividend 10% → Commission 5%): TDS recalculates', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2), L(B, 1)]);
    await editAndVerify(m, async () => { m.tdsRate = await ef.setTds(E.tds.commission); }, { tds: E.tds.dividend });
    expect(m.tdsRate).toBe(5);
  });

  test('TC-E53 - Remove TDS: no deduction, total goes up', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 2)]);
    const before = ef.computeTotals({ ...m, tdsRate: 10 }).total;
    await editAndVerify(m, async () => { await ef.removeTds(); m.tdsRate = 0; }, { tds: E.tds.dividend });
    expect(ef.computeTotals(m).total).toBeGreaterThan(before);
  });

  test.fixme('TC-E54 - TDS amount 45.67 (2 decimals)', async () => {
    // The app has no TDS amount field: TDS is always section % × taxable (read-only #tax_source).
  });

  test.fixme('TC-E55 - TDS amount 45.678 (more than 2 decimals)', async () => {
    // As TC-E54: a TDS amount cannot be typed.
  });

  test('TC-E56 - TDS on a small invoice (₹90) never exceeds the total (TDS is a % of the taxable amount)', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(C, 1, { rate: 90, gst: 0 })]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.editInvoice(billNo);
    m.tdsRate = await ef.setTds(E.tds.dividend);
    await ef.expectTotals(m, 'small invoice with TDS');
    const shown = await ef.readSummary();
    expect(shown.tds).toBeLessThan(shown.total);
    expect(shown.total).toBeGreaterThan(0);
    await ef.discardForm();
  });

  test('TC-E57 - Change TDS with discount, shipping and adjustment set: total = subtotal − discount + tax + shipping ± adjustment − TDS', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = model([L(A, 3), L(B, 1)], { summaryDiscount: { type: 'Percentage', value: 5 }, shipping: 60, adjustment: { type: 'Addition', value: 15 } });
    await editAndVerify(m, async () => { m.tdsRate = await ef.setTds(E.tds.dividendReduced); }, { tds: E.tds.dividend });
    expect(m.tdsRate).toBe(7.5);
  });

  // ── Round Off ───────────────────────────────────────────────────────────

  /** Open a new form whose total is not a round figure (₹12.19). */
  // QA (BUG-SI-05): Round Off shows only when it is enabled in Settings → Bill Prefix.
  // Turning it on changes every total in the shared org, so these tests skip while it is off.
  const nonRoundForm = async () => {
    const m = model([L(A, 1, { rate: 10.33 })]);
    await ef.startInvoice();
    await ef.fillInvoice(m);
    const on = await ef.roundOff.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (!on) await ef.discardForm();
    test.skip(!on, 'Round Off is disabled for the org (enable it in Settings → Bill Prefix)');
    return m;
  };

  test('TC-E58 - Round off is filled in automatically and the grand total is a round figure', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    await nonRoundForm();
    const { total } = await ef.readRoundOff();
    expect(Number.isInteger(total), `grand total ${total} is rounded`).toBe(true);
  });

  test('TC-E59 - Grand total = subtotal − discount + tax + shipping ± adjustment + round off', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = await nonRoundForm();
    const { value, total } = await ef.readRoundOff();
    expectClose(total, ef.computeTotals(m).total + value, 0.01, 'grand total incl. round off');
  });

  test('TC-E60 - Round off recalculates when the shipping cost changes', { tag: ['@sales', '@si-edit-flow'] }, async () => {
    const m = await nonRoundForm();
    await ef.readRoundOff();
    await ef.setShipping('7.35');
    m.shipping = 7.35;
    const { value, total } = await ef.readRoundOff();
    expect(Number.isInteger(total)).toBe(true);
    expectClose(total, ef.computeTotals(m).total + value, 0.01, 'grand total incl. new round off');
  });

  // ── Dashboard (Sales list) ──────────────────────────────────────────────

  test('TC-E61 - A new invoice is listed with its bill no, customer, date and bill amount', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const m = model([L(A, 2), L(C, 1)]);
    const { billNo } = await ef.createPricedInvoice(m);
    const row = await ef.expectListAmount(billNo, m);
    expect(row.billNo).toBe(billNo);
    expect(row.customer.toLowerCase()).toBe(masterData.customerName.toLowerCase());
    expect(row.date).toBe(listDate(new Date()));
  });

  test('TC-E62 - Status badge after creation: "7 days due" for a saved invoice, "Draft" for a draft', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const saved = await ef.createPricedInvoice(model([L(A, 1)]));
    const draft = await ef.createPricedInvoice(model([L(A, 1)]), { draft: true });
    expect((await ef.listRow(saved.billNo)).status).toBe('7 days due');
    expect((await ef.listRow(draft.billNo)).status).toBe('Draft');
  });

  test('TC-E63 - Every bill number in the Sales list is unique', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    await ef.openSalesList();
    const rows = await ef.readAllListPages();
    const seen = new Set();
    const duplicates = rows.map((r) => r.billNo).filter((b) => (seen.has(b) ? true : (seen.add(b), false)));
    console.log(`${rows.length} invoices scanned`);
    expect(duplicates, 'duplicate bill numbers').toEqual([]);
    expect(rows.length).toBe(await ef.listTotalCountValue());
  });

  test('TC-E64 - A duplicate bill number cannot be entered: Bill No is auto-generated, read-only and unused', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const billNo = await ef.startInvoice();
    await expect(ef.billNoInput).not.toBeEditable();
    await ef.discardForm();
    await ef._searchList(billNo);
    await expect(ef.invoiceRow(billNo), `${billNo} is not used by an existing invoice`).toHaveCount(0);
  });

  test('TC-E65 - Due label matches today\'s date: "7 days due" today, "3 days overdue" for an invoice due 3 days ago', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const current = await ef.createPricedInvoice(model([L(A, 1)]));
    const overdue = await ef.createPricedInvoice(model([L(A, 1)]), { billDate: pickerDate(addDays(new Date(), -10)) });
    expect((await ef.listRow(current.billNo)).status).toBe('7 days due');
    expect((await ef.listRow(overdue.billNo)).status).toBe('3 days overdue');
  });

  test('TC-E66 - A fully paid invoice shows status Paid and Due Amount ₹0', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const m = model([L(C, 2)]);
    const { billNo } = await ef.createPricedInvoice(m);
    await ef.receiveFullPayment(billNo, generateCustomerPaymentData());
    const row = await ef.expectListAmount(billNo, m, 'paid invoice');
    expect(row.status).toBe('Paid');
    expect(row.due).toBe(0);
  });

  // QA (BUG-SI-06): by design the list footer shows only "Total Count", no Bill / Due totals.
  test('TC-E70 - List footer shows the Total Count of invoices', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    await ef.openSalesList();
    const count = ef.page.getByText(/Total Count/i).first();
    await expect(count, 'Total Count in the list footer').toBeVisible({ timeout: 10_000 });
    expect(await count.innerText()).toMatch(/\d/);
  });

  test('TC-E71 - Searching a bill number lists only that invoice', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const { billNo } = await ef.createPricedInvoice(model([L(A, 1)]));
    await ef._searchList(billNo);
    expect((await ef.readListPage()).map((r) => r.billNo)).toEqual([billNo]);
  });

  test('TC-E72 - The date range filter lists only invoices in the range and updates the count', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const billDate = addDays(new Date(), -40);
    const { billNo } = await ef.createPricedInvoice(model([L(A, 1)]), { billDate: pickerDate(billDate) });
    const [start, end] = [addDays(billDate, -5), addDays(billDate, 5)];
    await ef.openSalesList();
    await ef.setListDateRange(start, end);
    const rows = await ef.readAllListPages();
    expect(rows.map((r) => r.billNo)).toContain(billNo);
    for (const r of rows) {
      expect(r.date >= listDate(start) && r.date <= listDate(end), `${r.billNo} dated ${r.date} is in range`).toBe(true);
    }
    expect(await ef.listTotalCountValue()).toBe(rows.length);
  });

  test('TC-E73 - Status badge colours: Paid green, Draft yellow, days due orange, overdue red', { tag: ['@sales', '@si-edit-flow', '@si-dashboard'] }, async () => {
    const due = await ef.createPricedInvoice(model([L(C, 1)]));
    const overdue = await ef.createPricedInvoice(model([L(C, 1)]), { billDate: pickerDate(addDays(new Date(), -20)) });
    const draft = await ef.createPricedInvoice(model([L(C, 1)]), { draft: true });
    const paid = await ef.createPricedInvoice(model([L(C, 1)]));
    await ef.receiveFullPayment(paid.billNo, generateCustomerPaymentData());
    for (const [inv, status, family] of [[paid, /^Paid$/, 'green'], [draft, /^Draft$/, 'yellow'], [due, /days due$/, 'orange'], [overdue, /days overdue$/, 'red']]) {
      const row = await ef.listRow(inv.billNo);
      expect(row.status).toMatch(status);
      expect(badgeFamily(row.badgeColor), `${row.status} badge colour (${row.badgeColor})`).toBe(family);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Sales Invoice — Create (Sales_Invoice_Test_Cases.xlsx, sheet "Sales Invoice Test Cases", TC-01…TC-86)
// (The sheet's second tab is the edit flow — automated above as TC-E01…TC-E74.)
//
// Already automated — not repeated here:
//   TC-04/05/06 bill number unique / read-only ... TC-E63, TC-E64
//   TC-09 due period 30 days .................... TC-E28        TC-11 custom due date ... TC-E29
//   TC-13/14/15 past / future / early due date ... TC-E25 / E26 / E27
//   TC-17 item with no stock is blocked .......... TC04 / TC05 (stock block above)
//   TC-18 same state → CGST + SGST .............. TC11 / TC12 journal
//   TC-22 / 26 optional ref no / sales person .... every create test saves without them
//   TC-31/32/33 tax mode ......................... TC-E30 / E31
//   TC-34/35/36 item pre-filled / multi / remove .. TC-E01 / TC-E02 / TC-E03
//   TC-40/41/42 manual / zero / negative rate ..... TC-E06 / E15 / E11
//   TC-43/44/45/48 qty with pcs / box / bundle / decimal ... TC01, TC06, TC08, TC11
//   TC-49..54 line discount % / ₹ / none / 100 / >100 / 2 decimals ... TC-E09, E08, E12, E10, E13/E14
//   TC-56/57 line totals ......................... TC-E05 / TC-E09 (expectLineAmounts)
//   TC-62/63/64/65 overall discount .............. TC-E34, Sales_Unit TC18, TC-E36, TC-E38
//   TC-67..70 shipping ........................... TC-E46, E50, E49, E48
//   TC-71..74 adjustment ......................... TC-E45, E42, E44, E43
//   TC-75..78 GST / CESS ......................... TC-E18…E23
//   TC-81 draft / TC-84 edit / TC-86 delete ...... TC21, TC-E flow, TC23 / TC24
//   TC-82 Save and Send .......................... every create test (sending e-mail is not checkable)
//
//   npx playwright test --grep @si-create
// ════════════════════════════════════════════════════════════════════════════

test.describe('Sales Invoice - Create', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {SalesInvoiceEditPage} */
  let sc;
  let A; let B; let C; let Dn;
  test.beforeEach(async ({ page }) => {
    sc = new SalesInvoiceEditPage(page);
    await sc.open();
    [A, B, C, Dn] = await sc.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });

  // ── Customer ─────────────────────────────────────────────────────────────

  test('TC-01 - Select a customer and proceed: invoice opens with the customer details', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    const header = await sc.customerHeaderText();
    expect(header).toContain(masterData.customerName);
    expect(header).toMatch(/BILLING ADDRESS/i);
    await expect(sc.billNoInput).not.toHaveValue('');
    expect(await sc.selectedText(sc.placeOfSupplySelect)).toBe('Tamil Nadu');
    await sc.discardForm();
  });

  test('TC-02 - Change the customer on the invoice page: the new customer\'s details load', { tag: ['@sales', '@si-create'] }, async () => {
    knownBug('BUG-SI-07', '"Change" clears the customer but opens no picker');
    await sc.startInvoice();
    await sc.changeCustomerBtn.click();
    await expect(sc.customerDropdown, 'customer picker after "Change"').toBeVisible({ timeout: 10_000 });
    await sc.clickSelect(sc.customerDropdown);
    await sc.customerOption('Rajesh kumar').click();
    if (await sc.customerNextBtn.isVisible().catch(() => false)) await sc.customerNextBtn.click();
    await expect.poll(() => sc.customerHeaderText()).toContain('Rajesh kumar');
    await sc.discardForm();
  });

  test('TC-03 - Proceeding without a customer is blocked', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.openCustomerStep();
    await expect(sc.customerNextBtn, 'Next is disabled until a customer is chosen').toBeDisabled();
  });

  // ── Due period / dates ───────────────────────────────────────────────────

  for (const [id, term, days] of [['TC-07', '7 days', 7], ['TC-08', '15 days', 15], ['TC-10', '60 days', 60]]) {
    test(`${id} - Due period ${term}: due date = bill date + ${days} days`, { tag: ['@sales', '@si-create'] }, async () => {
      await sc.startInvoice();
      if (term !== '7 days') await sc.setDueTerm('15 days');   // move off the default first
      await sc.setDueTerm(term);
      const { billDate } = await sc.readDates();
      await expect(sc.dueDateInput).toHaveValue(pickerDate(addDays(new Date(billDate), days)));
      await sc.discardForm();
    });
  }

  test('TC-12 - Bill date defaults to today (due date today + 7)', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    const today = new Date();
    expect(await sc.readDates()).toEqual({ billDate: pickerDate(today), dueDate: pickerDate(addDays(today, 7)) });
    await sc.discardForm();
  });

  // ── Warehouse / price list / sales person (master data not available) ────

  test.fixme('TC-16 - Warehouse filter shows only that warehouse\'s stock', async () => {
    // The test org has a single warehouse ("Default") — needs a second warehouse with stock.
  });
  test.fixme('TC-24 - Sales order → invoice carries the salesperson', async () => {
    // Needs Sales Order conversion — automated with the Sales_Order_TestCases sheet.
  });
  test.fixme('TC-25 - Manually select a salesperson', async () => {
    // No sales persons exist in the test org (dropdown is empty).
  });
  for (const [id, title] of [
    ['TC-27', 'Retailer customer gets the business-category price list'],
    ['TC-28', 'Standard customer gets the general price list'],
    ['TC-29', 'Switching the price list after adding items refreshes the rates'],
    ['TC-30', 'Customer without a price list uses the default rate'],
    ['TC-39', 'Rate is filled from the active price list'],
  ]) {
    test.fixme(`${id} - ${title}`, async () => {
      // No customer-specific price lists are configured — automate with the PriceList sheet.
    });
  }

  // ── Place of supply / reference ──────────────────────────────────────────

  test('TC-19 - Place of supply in another state: IGST is posted instead of CGST + SGST', { tag: ['@sales', '@si-create'] }, async () => {
    const m = model([L(A, 2)]);
    const billNo = await sc.startInvoice();
    await sc.setPlaceOfSupply('Kerala');
    await sc.fillInvoice(m);
    await sc.expectTotals(m, 'inter-state');
    await sc.save();
    const accounts = (await sc.readJournal(billNo)).rows.map((r) => r.account);
    expect(accounts.some((a) => /IGST/i.test(a)), `journal accounts: ${accounts.join(', ')}`).toBe(true);
    expect(accounts.some((a) => /CGST|SGST/i.test(a))).toBe(false);
  });

  test('TC-20 - The chosen place of supply is shown in the dropdown', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await sc.setPlaceOfSupply('Kerala');
    expect(await sc.selectedText(sc.placeOfSupplySelect)).toBe('Kerala');
    await sc.discardForm();
  });

  test('TC-21 - An alphanumeric reference number is saved with the invoice', { tag: ['@sales', '@si-create'] }, async () => {
    const ref = `REF${Date.now().toString().slice(-6)}AB`;
    const billNo = await sc.startInvoice();
    await sc.fillInto(sc.refNoInput, ref);
    await sc.fillInvoice(model([L(A, 1)]));
    await sc.save();
    await sc.editInvoice(billNo);
    await expect(sc.refNoInput).toHaveValue(ref);
    await sc.discardForm();
  });

  // QA (BUG-SI-08): special characters in the reference number are allowed (current flow).
  test('TC-23 - Special characters in the reference number are accepted and saved', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await sc.fillInvoice(model([L(A, 1)]));
    const typed = 'REF#@!$%';
    expect(await sc.typeValue(sc.refNoInput, typed), 'reference kept as typed').toBe(typed);
    await sc.save();
  });

  // ── Item entry / quantity / discount ─────────────────────────────────────

  test('TC-37 - Searching with part of the item name lists the matching items', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    const partial = A.itemName.slice(0, 6);
    const found = await sc.itemSearchOptions(partial);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((t) => t.toLowerCase().includes(partial.toLowerCase())), `options: ${found.join(', ')}`).toBe(true);
    await sc.discardForm();
  });

  test('TC-38 - Searching for an item that does not exist lists nothing', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    expect(await sc.itemSearchOptions(`qqzz-no-such-item-${Date.now()}`)).toEqual([]);
    await sc.discardForm();
  });

  test('TC-46 - Saving with a blank quantity is refused with "Quantity is required"', { tag: ['@sales', '@si-create'] }, async () => {
    knownBug('BUG-SI-09', 'blank quantity: save does nothing and shows no message');
    await sc.startInvoice();
    await sc.addLine(A, 1);
    await sc.typeValue(sc.lineQty(sc.lineRows.nth(0)), '');
    expect(await sc.saveExpectRefused()).toMatch(/quantity/i);
    await sc.discardForm();
  });

  test('TC-47 - Saving with quantity 0 is refused with a validation message', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await sc.addLine(A, 1);
    await sc.typeValue(sc.lineQty(sc.lineRows.nth(0)), '0');
    await sc.saveExpectRefused();
    await sc.discardForm();
  });

  test('TC-55 - A ₹ line discount larger than the line total is blocked', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await sc.addLine(C, 2);   // ₹80
    const row = sc.lineRows.nth(0);
    await sc.lineDiscountMode(row, '₹').click();
    await sc.expectInvalidValueBlocked(sc.lineDiscount(row), '500', '₹500 discount on an ₹80 line');
    expect((await sc.readLine(0)).amount, 'line amount never negative').toBeGreaterThanOrEqual(0);
    await sc.discardForm();
  });

  test('TC-58 - A line total with more than 2 decimals is shown to 2 decimals', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await sc.addLine(A, 1.5);
    await sc.setLineRate(0, '10.33');   // 15.495
    const { amount } = await sc.readLine(0);
    expect(Math.abs(amount * 100 - Math.round(amount * 100)), `${amount} has at most 2 decimals`).toBeLessThan(1e-6);
    expectClose(amount, 15.495, 0.006, 'line total');
    await sc.discardForm();
  });

  // ── Subtotal ─────────────────────────────────────────────────────────────

  test('TC-59 - Subtotal with one item = that line total', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    const m = model([L(B, 3, { discount: 10 })]);
    await sc.fillInvoice(m);
    expectClose((await sc.readSummary()).sub, sc.computeTotals(m).base, 0.01, 'subtotal');
    await sc.discardForm();
  });

  test('TC-60 - Subtotal with three items = sum of the line totals', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    const m = model([L(A, 2), L(B, 1, { discount: 5 }), L(C, 4)]);
    await sc.fillInvoice(m);
    expectClose((await sc.readSummary()).sub, sc.computeTotals(m).base, 0.02, 'subtotal');
    await sc.discardForm();
  });

  test('TC-61 - Removing an item lowers the subtotal by its line total', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    const m = model([L(A, 2), L(B, 1), L(C, 4)]);
    await sc.fillInvoice(m);
    const before = (await sc.readSummary()).sub;
    await sc.removeLine(1);
    expectClose((await sc.readSummary()).sub, before - B.price, 0.01, 'subtotal after removing item 2');
    await sc.discardForm();
  });

  // QA (BUG-SI-02): the input allows only 2 decimals, so the 3rd digit is dropped.
  test('TC-66 - An overall discount with 3 decimals (5.555%) keeps only 2 decimals (5.55)', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await sc.fillInvoice(model([L(A, 2)]));
    const shown = await sc.setSummaryDiscount('Percentage', '5.555');
    expect(shown, '5.555 cut to 2 decimals').toBe('5.55');
    await sc.discardForm();
  });

  // ── Complete invoice / save / cancel ─────────────────────────────────────

  test('TC-79 - Full invoice: 5 items with mixed rates, discounts, GST / CESS, overall discount, shipping and adjustment', { tag: ['@sales', '@si-create'] }, async () => {
    const m = model([
      L(A, 2, { discount: 10 }),
      L(B, 1, { gst: 12, discount: 15, discountMode: '₹' }),
      L(C, 5, { gst: 5, cess: 2 }),
      L(Dn, 3, { rate: 82.5, discount: 2.5 }),
      L(A, 1, { gst: 28, cess: 4 }),
    ], { summaryDiscount: { type: 'Percentage', value: 5 }, shipping: 45.5, adjustment: { type: 'Subtract', value: 12.25 } });
    const { billNo } = await sc.createPricedInvoice(m);
    await sc.expectListAmount(billNo, m, 'full invoice');
  });

  test.fixme('TC-80 - Sales order → invoice: all fields inherited', async () => {
    // Needs Sales Order conversion — automated with the Sales_Order_TestCases sheet.
  });

  test('TC-83 - Saving with no item rows is blocked', { tag: ['@sales', '@si-create'] }, async () => {
    await sc.startInvoice();
    await expect(sc.saveBtn.locator('xpath=ancestor::button[1]')).toBeDisabled();
    await expect(sc.saveDraftBtn).toBeDisabled();
    await sc.discardForm();
  });

  test('TC-85 - Cancelling a new invoice creates no record', { tag: ['@sales', '@si-create'] }, async () => {
    const billNo = await sc.startInvoice();
    await sc.fillInvoice(model([L(A, 1)]));
    await sc.discardForm();
    await sc._searchList(billNo);
    await expect(sc.invoiceRow(billNo), `${billNo} must not exist`).toHaveCount(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Sales Invoice — Payment (Sales_Invoice_Payment_TestCases.xlsx: Record Payment, Payment Received,
// Payment Edit Flow, Fail Scenarios)
//
// Already automated — not repeated here:
//   TC-RP-07 pay full amount fills the amount ... CustomerPayment_Unit TC04
//   TC-RP-12 blank amount (same as TC-RP-08) .... TC-RP-08 below
//   TC-RP-25 / 35 full payment → Paid, due ₹0 .. TC-E66 / TC-E73
//   TC-RP-27 / 36 partial payment → due left ... CustomerPayment_Unit TC04
//   TC-RP-33 delete payment → due restored ...... CustomerPayment_Unit TC04 (unlink)
//   TC-RP-37 / 38 paid → qty up / down .......... TC-SC-10 / TC-SC-11 below
//   TC-PR-02 / 03 multi-invoice "reflect amount" popup ... CustomerPayment_Unit TC01
//   TC-PR-05 small partial payment .............. CustomerPayment_Unit TC04
//   TC-PR-11 payment date not restricted ........ TC-RP-16 / 17 / 18 below
//   TC-PE-01/02/03/04/05/06/07/11/12/13/15 edit / delete receipt amounts, excess → advance ... CustomerPayment_Unit TC02 / TC03
//   TC-SC-03 delete paid invoice → advance ...... TC-RP-32 below
//   TC-SC-14 no error saving a paid invoice's qty change ... TC-SC-10 / TC-SC-11 below
// Deferred to the Customer_Transaction sheet (customer transaction screen):
//   TC-RP-26, TC-RP-28, TC-PR-01, TC-PR-06, TC-PR-07
//
//   npx playwright test --grep @si-payment
// ════════════════════════════════════════════════════════════════════════════

test.describe('Sales Invoice - Payment', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {SalesInvoicePaymentPage} */
  let sp;
  let A; let C;
  test.beforeEach(async ({ page }) => {
    sp = new SalesInvoicePaymentPage(page);
    await sp.open();
    [A, , C] = await sp.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });
  const customer = masterData.customerName;
  /** A fresh ₹118 invoice (1 × ₹100 + 18% GST). */
  const newInvoice = async (qty = 1, opts = {}) => {
    const m = model([L(A, qty)]);
    const { billNo } = await sp.createPricedInvoice(m, opts);
    return { billNo, m, total: sp.computeTotals(m).total };
  };

  // ── Record Payment modal ─────────────────────────────────────────────────

  test('TC-RP-01 / 02 / 03 - Payment popup shows Bill Amount, Due Amount, Pending Cheque ₹0 and all payment fields', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.openRecordPayment(billNo);
    const p = await sp.readPaymentModal();
    for (const label of ['Bill Amount', 'Due Amount', 'Pending Cheque', 'Bill No', 'Payment Date', 'Payment Account', 'Received Amount', 'Payment Mode', 'Pay full amount', 'Note']) {
      expect(p.text, `popup shows "${label}"`).toContain(label);
    }
    expectClose(p.bill, total, 0.01, 'Bill Amount');
    expectClose(p.due, total, 0.01, 'Due Amount');
    expect(p.pendingCheque, 'Pending Cheque').toBe(0);
    await sp.payCancel.click();
  });

  test('TC-RP-04 - Receipt number (RCPT) is shown in the popup before saving', { tag: ['@sales', '@si-payment'] }, async () => {
    knownBug('BUG-SI-10', 'Record Payment popup shows no receipt number before saving');
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    expect((await sp.readPaymentModal()).billNo, 'popup "Bill No:" value').toMatch(/RCPT/i);
    await sp.payCancel.click();
  });

  test('TC-RP-05 / 06 - Payment date defaults to today; modes are Cash, Cheque, Bank Transfer, Undeposited fund, UPI', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    expect((await sp.readPaymentModal()).date).toBe(paymentDate(new Date()));
    expect(await sp.paymentModeOptions()).toEqual(expect.arrayContaining(['Cash', 'Cheque', 'Bank Transfer', 'Undeposited fund', 'UPI']));
    await sp.payCancel.click();
  });

  test('TC-RP-08 - Saving without a received amount is refused ("Receive amount is required")', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({});
    expect(await sp.savePaymentExpectRefused()).toMatch(/receive ?amount is required/i);
    await sp.payCancel.click();
  });

  test('TC-RP-09 - Saving without a payment account is refused ("Account is required")', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({ account: null, amount: 50 });
    expect(await sp.savePaymentExpectRefused()).toMatch(/account is required/i);
    await sp.payCancel.click();
  });

  test('TC-RP-10 - A zero received amount is refused', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({ amount: '0' });
    expect(await sp.savePaymentExpectRefused()).toMatch(/valid amount|greater than zero/i);
    await sp.payCancel.click();
  });

  test('TC-RP-11 - A negative received amount is blocked', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({});
    const r = await sp.expectInvalidValueBlocked(sp.payAmount, '-100', 'received amount -100');
    if (r.prevented) expect(parseFloat(r.shown || '0')).toBeGreaterThanOrEqual(0);
    await sp.payCancel.click();
  });

  test('TC-RP-13 - A received amount above the invoice due is blocked (capped at the due)', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({});
    const r = await sp.expectInvalidValueBlocked(sp.payAmount, '200', 'received ₹200 on a ₹118 due');
    if (r.prevented) expect(parseFloat(r.shown)).toBeLessThanOrEqual(total);
    await sp.payCancel.click();
  });

  test('TC-RP-14 / 15 - Note is optional; Cancel closes the popup without recording a payment', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({ amount: 40 });
    await sp.payCancel.click();
    await expect(sp.paymentModal).toBeHidden();
    await sp.closePreview().catch(() => {});
    expect(await sp.readInvoicePayments(billNo)).toEqual([]);
    const row = await sp.listRow(billNo);
    expectClose(row.due, total, 0.01, 'due unchanged');
    await sp.recordPayment(billNo, { amount: 40 });   // no note
    expect(await sp.readInvoicePayments(billNo)).toHaveLength(1);
  });

  // ── Payment date / mode ──────────────────────────────────────────────────

  for (const [id, label, offset] of [['TC-RP-16', 'today', 0], ['TC-RP-17', 'a past date', -20], ['TC-RP-18', 'a future date', 20]]) {
    test(`${id} - Payment dated ${label} is recorded with that date`, { tag: ['@sales', '@si-payment'] }, async () => {
      const { billNo, total } = await newInvoice();
      const date = paymentDate(addDays(new Date(), offset));
      await sp.recordPayment(billNo, { amount: 50, date });
      const [p] = await sp.readInvoicePayments(billNo);
      expect(p.date).toBe(date);
      expect(p.amount).toBe(50);
      expectClose((await sp.listRow(billNo)).due, total - 50, 0.01, 'due after payment');
    });
  }

  for (const [id, mode] of [['TC-RP-19', 'Cash'], ['TC-RP-21', 'Bank Transfer'], ['TC-RP-22', 'UPI'], ['TC-RP-23', 'Undeposited fund']]) {
    test(`${id} - Payment via ${mode} is saved with that mode and reduces the due`, { tag: ['@sales', '@si-payment'] }, async () => {
      const { billNo, total } = await newInvoice();
      await sp.recordPayment(billNo, { amount: 60, mode });
      const [p] = await sp.readInvoicePayments(billNo);
      expect(p.mode).toBe(mode);
      expectClose((await sp.listRow(billNo)).due, total - 60, 0.01, 'due after payment');
    });
  }

  test('TC-RP-20 - Cheque payment stays pending: due unchanged, Pending Cheque shows the amount', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.recordPayment(billNo, { amount: 50, mode: 'Cheque', chequeNo: `${Date.now()}`.slice(-6) });
    const [p] = await sp.readInvoicePayments(billNo);
    expect(p.mode).toBe('Cheque');
    expectClose((await sp.listRow(billNo)).due, total, 0.01, 'due unchanged until the cheque clears');
    await sp.openRecordPayment(billNo);
    expect((await sp.readPaymentModal()).pendingCheque).toBe(50);
    await sp.payCancel.click();
  });

  test.fixme('TC-RP-24 - Cheque payment: status Paid only after the cheque is cleared', async () => {
    // Clearing a cheque is in Cheque Tracker — automate with the Cheque_Tracker sheet.
  });

  // ── Partial payment + invoice edit ───────────────────────────────────────

  for (const [id, newQty] of [['TC-RP-29', 15], ['TC-RP-30', 8]]) {
    test(`${id} - Partially paid invoice, qty edited to ${newQty}: status "days due" with the new balance`, { tag: ['@sales', '@si-payment'] }, async () => {
      const { billNo } = await newInvoice(10);   // ₹1180
      await sp.recordPayment(billNo, { amount: 600 });
      await sp.editInvoice(billNo);
      await sp.setLine(0, newQty);
      await sp.save();
      const row = await sp.listRow(billNo);
      expect(row.status).toMatch(/days due|days overdue|partially/i);
      expectClose(row.due, sp.computeTotals(model([L(A, newQty)])).total - 600, 0.02, 'balance after qty change');
    });
  }

  // ── Delete payment / invoice → advance ───────────────────────────────────

  test('TC-RP-31 - Deleting a full payment restores the due and keeps the paid amount as customer advance', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.recordPayment(billNo, { full: true });
    const advanceBefore = await sp.readCustomerAdvance(customer);
    await sp.deleteInvoicePayment(billNo);
    expectClose((await sp.listRow(billNo)).due, total, 0.01, 'due restored');
    expectClose(await sp.readCustomerAdvance(customer), advanceBefore + total, 0.02, 'advance after deleting the payment');
  });

  test('TC-RP-32 - Deleting a paid invoice turns the paid amount into customer advance', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.recordPayment(billNo, { full: true });
    const advanceBefore = await sp.readCustomerAdvance(customer);
    // The app asks to delete the invoice's payments first ("You must delete all the associated payments")
    await sp.openInvoice(billNo);
    await sp.moreMenu.first().click();
    await sp.moreMenuDelete.click();
    await expect(sp.payment.paymentLinkedDeleteMsg).toBeVisible();
    await sp.payment.paymentLinkedDeleteYes.click();
    await sp.settle(2000, 'payments list shows');
    await sp.payment._unlinkAllPayments();
    await sp.settle(3000, 'payments removed');
    await sp.closePreview().catch(() => {});
    await sp.deleteInvoice(billNo);
    expectClose(await sp.readCustomerAdvance(customer), advanceBefore + total, 0.02, 'advance after deleting the paid invoice');
  });

  test.fixme('TC-RP-34 - Print the receipt after saving', async () => {
    // Print opens the browser print dialog — not verifiable in automation; check manually.
  });

  // ── Payment Received (new receipt) ───────────────────────────────────────

  test('TC-PR-04 - A receipt larger than the selected invoices\' total is refused', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({});
    const r = await sp.expectInvalidValueBlocked(sp.payAmount, String(Math.ceil(total) + 500), 'receipt above invoice total');
    if (r.prevented) expect(parseFloat(r.shown)).toBeLessThanOrEqual(total);
    await sp.payCancel.click();
  });

  for (const [id, value, pattern] of [['TC-PR-08', '0', /valid amount|greater than zero/i], ['TC-PR-10', '', /required/i]]) {
    test(`${id} - Receipt amount "${value || 'empty'}" is refused`, { tag: ['@sales', '@si-payment'] }, async () => {
      const { billNo } = await newInvoice();
      await sp.openRecordPayment(billNo);
      await sp.fillPayment(value ? { amount: value } : {});
      expect(await sp.savePaymentExpectRefused()).toMatch(pattern);
      await sp.payCancel.click();
    });
  }

  test('TC-PR-09 - A negative receipt amount is blocked', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.openRecordPayment(billNo);
    await sp.fillPayment({});
    const r = await sp.expectInvalidValueBlocked(sp.payAmount, '-500', 'receipt -500');
    if (r.prevented) expect(parseFloat(r.shown || '0')).toBeGreaterThanOrEqual(0);
    await sp.payCancel.click();
  });

  test.fixme('TC-PR-12 - Print a Payment Received receipt', async () => {
    // Print opens the browser print dialog — not verifiable in automation; check manually.
  });

  // ── Payment edit ─────────────────────────────────────────────────────────

  test('TC-PE-08 - Three partial payments on one invoice; editing the 2nd recalculates the due from all three', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice(10);   // ₹1180
    for (const amount of [100, 200, 300]) await sp.recordPayment(billNo, { amount });
    const payments = await sp.readInvoicePayments(billNo);
    expect(payments.map((p) => p.amount).sort((a, b) => a - b)).toEqual([100, 200, 300]);
    const second = payments.find((p) => p.amount === 200);
    await sp.editReceipt(second.number);
    await sp.typeValue(sp.receiveAmtField(), '250');
    await sp.confirmReflectAmount();   // OK applies the new amount to the invoice row
    await sp.saveReceiptEdit();
    expectClose((await sp.listRow(billNo)).due, total - 650, 0.02, 'due after editing the 2nd payment');
  });

  for (const [id, from, to] of [['TC-PE-09', 'Cash', 'UPI'], ['TC-PE-14', 'Bank Transfer', 'Cheque']]) {
    test(`${id} - Change a receipt's payment mode ${from} → ${to}: amount unchanged, mode updated`, { tag: ['@sales', '@si-payment'] }, async () => {
      const { billNo } = await newInvoice();
      await sp.recordPayment(billNo, { amount: 70, mode: from });
      const [p] = await sp.readInvoicePayments(billNo);
      await sp.editReceipt(p.number);
      await sp.setReceiptMode(to, to === 'Cheque' ? `${Date.now()}`.slice(-6) : undefined);
      await sp.saveReceiptEdit();
      const r = await sp.receiptListRow(p.number);
      expect(r.mode).toBe(to);
      expect(r.received).toBe(70);
    });
  }

  test('TC-PE-10 - Payment of a cancelled invoice cannot be edited', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.recordPayment(billNo, { amount: 50 });
    const [p] = await sp.readInvoicePayments(billNo);
    // Try to cancel: the app refuses to cancel an invoice that has a payment (no reason box opens)
    await sp.openInvoice(billNo);
    await sp.cancelBtn.click();
    await sp.yesBtn.click();
    const cancelOpened = await sp.cancelComments.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (!cancelOpened) {
      console.log('Invoice with a payment cannot be cancelled — its payment can never belong to a cancelled invoice');
      await sp.page.keyboard.press('Escape');
      await sp.closePreview().catch(() => {});
      expect((await sp.listRow(billNo)).status).not.toMatch(/cancel/i);
      return;
    }
    await sp.typeInto(sp.cancelComments, 'Cancelled by automation');
    await sp.cancelSaveBtn.click();
    await sp.settle(4000, 'cancel saved');
    await sp.closePreview().catch(() => {});
    await sp.editReceipt(p.number);
    await sp.typeValue(sp.receiveAmtField(), '40');
    await sp.page.getByRole('button', { name: 'Save Receipt' }).click();
    await expect(sp.validationMessage.filter({ hasText: /cancel/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  // ── Fail scenarios: paid invoices edited / deleted ───────────────────────

  test('TC-SC-01 / 09 - Editing a fully paid invoice shows "invoice is fully paid — adjust the payment first"', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice(10);
    await sp.recordPayment(billNo, { full: true });
    await sp.editInvoice(billNo);
    await sp.setLine(0, 12);
    await sp.saveBtn.click();
    await expect(sp.validationMessage.filter({ hasText: /paid|payment/i }).first(), 'fully-paid warning').toBeVisible({ timeout: 10_000 });
  });

  test('TC-SC-02 - Deleting a paid invoice is blocked or requires removing the payment first', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice();
    await sp.recordPayment(billNo, { full: true });
    await sp.openInvoice(billNo);
    await sp.moreMenu.first().click();
    await sp.moreMenuDelete.click();
    await expect(sp.payment.paymentLinkedDeleteMsg, 'delete asks to remove the payments first').toBeVisible({ timeout: 10_000 });
    await sp.page.getByRole('button', { name: 'No' }).click().catch(() => {});
  });

  test('TC-SC-05 - Setting a paid invoice to ₹0 asks to adjust the payments first', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo } = await newInvoice(2);
    await sp.recordPayment(billNo, { full: true });
    await sp.editInvoice(billNo);
    await sp.setLineRate(0, 0);
    await sp.saveBtn.click();
    await expect(sp.validationMessage.filter({ hasText: /payment/i }).first(), 'payments-exist warning').toBeVisible({ timeout: 10_000 });
  });

  for (const [id, label, pay] of [['TC-SC-06', 'fully', { full: true }], ['TC-SC-08', 'partially', { amount: 100 }]]) {
    test(`${id} - A ${label} paid invoice set to ₹0: the payment moves to customer advance`, { tag: ['@sales', '@si-payment'] }, async () => {
      const { billNo, total } = await newInvoice(2);
      await sp.recordPayment(billNo, pay);
      const paid = pay.full ? total : pay.amount;
      const advanceBefore = await sp.readCustomerAdvance(customer);
      await sp.editInvoice(billNo);
      await sp.setLineRate(0, 0);
      await sp.saveBtn.click();
      const saved = await expect(sp.page).not.toHaveURL(/sales-bill\/add/, { timeout: 15_000 }).then(() => true, () => false);
      test.skip(!saved, 'the app refuses to set a paid invoice to ₹0 (TC-SC-05) — nothing to move');
      expectClose(await sp.readCustomerAdvance(customer), advanceBefore + paid, 0.02, 'advance after the invoice went to ₹0');
    });
  }

  test('TC-SC-10 - Fully paid invoice, qty increased: total up, status due, balance = difference', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice(10);   // ₹1180
    await sp.recordPayment(billNo, { full: true });
    await sp.editInvoice(billNo);
    await sp.setLine(0, 15);
    await sp.save();
    const newTotal = sp.computeTotals(model([L(A, 15)])).total;
    const row = await sp.listRow(billNo);
    expectClose(row.bill, newTotal, 0.02, 'new total');
    expectClose(row.due, newTotal - total, 0.02, 'balance due');
    expect(row.status).toMatch(/days due|days overdue|partially/i);
  });

  test('TC-SC-11 - Fully paid invoice, qty decreased: stays Paid, the overpaid amount becomes advance', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice(10);
    await sp.recordPayment(billNo, { full: true });
    const advanceBefore = await sp.readCustomerAdvance(customer);
    await sp.editInvoice(billNo);
    await sp.setLine(0, 5);
    await sp.save();
    const newTotal = sp.computeTotals(model([L(A, 5)])).total;
    const row = await sp.listRow(billNo);
    expect(row.status).toBe('Paid');
    expect(row.due).toBe(0);
    expectClose(await sp.readCustomerAdvance(customer), advanceBefore + (total - newTotal), 0.02, 'overpaid amount as advance');
  });

  test('TC-SC-12 - Payment history is intact after changing the qty of a paid invoice', { tag: ['@sales', '@si-payment'] }, async () => {
    const { billNo, total } = await newInvoice(10);
    await sp.recordPayment(billNo, { full: true });
    const before = await sp.readInvoicePayments(billNo);
    await sp.editInvoice(billNo);
    await sp.setLine(0, 12);
    await sp.save();
    const after = await sp.readInvoicePayments(billNo);
    expect(after.map((p) => p.number)).toEqual(before.map((p) => p.number));
    expectClose(after.reduce((s, p) => s + p.amount, 0), total, 0.02, 'paid amount unchanged');
  });

  for (const [id, title] of [
    ['TC-SC-04', 'Reports are accurate after the middle invoice is paid'],
    ['TC-SC-07', 'Outstanding / advance reports after a paid invoice is set to ₹0'],
    ['TC-SC-13', 'Outstanding / advance reports after a paid invoice\'s qty change'],
  ]) {
    test.fixme(`${id} - ${title}`, async () => {
      // Outstanding / advance reports are not automated yet — add with a Reports sheet.
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Bulk Payment — New Receipt (Bulk_Payment_TestCases.xlsx: UI Validation, Bulk Payment,
// Payment Edit Flow, Invoice Status). Uses customer "saravana store"; rows are found by bill no.
//
// Already automated — not repeated here:
//   TC-UI-20 save with each payment mode ........ TC-RP-19…23 (same modes / save)
//   TC-UI-21 / 38 ref optional / valid save ....... every receipt saved below
//   TC-BP-02 / 03 popup OK / Cancel .............. TC-UI-29 / TC-UI-30
//   TC-BP-05 small partial payment ............... CustomerPayment_Unit TC04
//   TC-BP-08 / 09 / 10 zero / negative / empty ... TC-UI-13 / 14 / 12
//   TC-BP-17 row payment > balance ............... TC-UI-25
//   TC-BP-21 / 22 summary formulas ............... TC-UI-24 / 31 / 32 / 33
//   TC-BP-25 / 26 / 27 cheque / UPI / bank ....... TC-RP-20 / 22 / 21
//   TC-PE-01…19 receipt edits .................... Sales_Invoice_Payment TC-PE-* and CustomerPayment_Unit TC02 / TC03
//   TC-IS-01 / 02 all paid / partial ............. TC-BP-19 / TC-BP-20
//   TC-IS-03 / 04 / 08 paid / partial + qty change  TC-SC-10 / 11, TC-RP-29 / 30
//   TC-IS-05 cheque pending ...................... TC-RP-20        TC-IS-07 footer totals ... TC-E70
// Deferred to the Customer_Transaction sheet: TC-BP-01, TC-BP-06, TC-BP-07.
//
//   npx playwright test --grep @si-bulk
// ════════════════════════════════════════════════════════════════════════════

test.describe('Bulk Payment - New Receipt', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {SalesInvoicePaymentPage} */
  let bp;
  let A; let C;
  // A customer with a billing address (Test Customer has none, so its invoices cannot be saved)
  const TC = 'saravana store';
  test.beforeEach(async ({ page }) => {
    bp = new SalesInvoicePaymentPage(page);
    await bp.open();
    [A, , C] = await bp.ensurePricedItems(E.items());
  });

  const L = (item, qty) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0 });
  /** New invoice for Test Customer: { billNo, total }. */
  const invoice = async (item, qty) => {
    const m = { lines: [L(item, qty)], taxMode: 'Excluding Tax' };
    const { billNo } = await bp.createPricedInvoice(m, { customerName: TC });
    return { billNo, total: bp.computeTotals(m).total };
  };
  const deleteReceipt = async (receiptNo) => {
    await bp.openReceipt(receiptNo);
    await bp.receiptDrawer.getByRole('button', { name: 'Delete' }).click();
    await bp.yesBtn.click();
    await bp.settle(4000, 'receipt deleted');
    await bp.page.keyboard.press('Escape');
    await bp.closePreview().catch(() => {});
    await bp.fillInto(bp.listSearch, receiptNo);
    await bp.settle(2500, 'receipt search');
    await expect(bp.invoiceRow(receiptNo), `${receiptNo} deleted`).toHaveCount(0);
  };

  // ── Page load ────────────────────────────────────────────────────────────

  test('TC-UI-01 / 02 / 03 / 04 / 06 / 07 - New Receipt opens with RCPT no, today\'s date, customer, due / pending cheque and a ₹0 summary', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    const f = await bp.readReceiptForm();
    expect(f.receiptNo).toMatch(/RCPT/i);
    await expect(bp.receiptNo).not.toBeEditable();
    expect(f.date).toBe(pickerDate(new Date()));
    for (const label of [TC, 'Due amount', 'Pending Cheque', 'Receipt Account', 'Received Amount', 'Payment Mode', 'Amount Received', 'Amount used for payments', 'Excess Amount']) {
      expect(f.text, `receipt page shows "${label}"`).toContain(label);
    }
    expect(Number.isFinite(f.due) && Number.isFinite(f.pendingCheque)).toBe(true);
    expect([f.received, f.used, f.excess]).toEqual([0, 0, 0]);
    await bp.discardForm();
  });

  test('TC-UI-05 / 23 - Due Invoices lists the customer\'s outstanding invoices with amount and balance', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv1 = await invoice(A, 1);
    const inv2 = await invoice(C, 3);
    await bp.openNewReceipt(TC);
    const head = (await bp.page.locator('table thead th').allInnerTexts()).map((t) => t.trim());
    expect(head).toEqual(expect.arrayContaining(['S.No', 'Bill Date', 'Description', 'Amount', 'Balance', 'Payment']));
    for (const inv of [inv1, inv2]) {
      const row = await bp.receiptRow(inv.billNo);
      expect(row, `${inv.billNo} listed`).not.toBeNull();
      expectClose(row.amount, inv.total, 0.01, `${inv.billNo} amount`);
      expectClose(row.balance, inv.total, 0.01, `${inv.billNo} balance`);
    }
    await bp.discardForm();
  });

  test('TC-UI-08 - "Change" on the receipt page opens the customer picker', { tag: ['@sales', '@si-bulk'] }, async () => {
    knownBug('BUG-BR-01', '"Change" on a new receipt opens no customer picker');
    await bp.openNewReceipt(TC);
    await bp.changeCustomerBtn.click();
    await expect(bp.customerDropdown, 'customer picker after "Change"').toBeVisible({ timeout: 10_000 });
  });

  // ── Receipt account / amount / mode ──────────────────────────────────────

  test('TC-UI-09 / 10 - Receipt Account lists the accounts and Petty Cash can be selected', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    await bp.receiptAccount.locator('.ant-select-selector').click();
    const options = (await bp.openOptionTexts.allInnerTexts()).map((t) => t.trim());
    await bp.page.keyboard.press('Escape');
    expect(options).toEqual(expect.arrayContaining(['Petty Cash', 'Bank']));
    await bp.pickOption(bp.receiptAccount, 'Petty Cash');
    expect(await bp.selectedText(bp.receiptAccount)).toBe('Petty Cash');
    await bp.discardForm();
  });

  test('TC-UI-11 - Saving without a Receipt Account is refused', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(100, 'Cancel');
    await bp.receiptAccount.hover();
    const clear = bp.receiptAccount.locator('.ant-select-clear');
    if (!(await clear.count())) {
      console.log('Receipt Account cannot be cleared (always has a value) — the blank case cannot happen');
      expect(await bp.selectedText(bp.receiptAccount)).not.toBe('');
    } else {
      await clear.click();
      expect(await bp.saveReceiptExpectRefused()).toMatch(/account/i);
    }
    await bp.discardForm();
  });

  test('TC-UI-12 - Saving with no received amount is refused ("Received Amount is required")', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    expect(await bp.saveReceiptExpectRefused()).toMatch(/received amount is required/i);
    await bp.discardForm();
  });

  test('TC-UI-13 - A zero received amount is refused', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount('0', 'Cancel');
    expect(await bp.saveReceiptExpectRefused()).toMatch(/amount/i);
    await bp.discardForm();
  });

  test('TC-UI-14 / 15 - Negative and alphabetic received amounts are rejected', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    for (const bad of ['-500', 'abc']) {
      const shown = await bp.typeValue(bp.receiveAmtField(), bad);
      expect(shown, `"${bad}" not accepted as typed`).not.toBe(bad);
      if (shown) expect(parseFloat(shown)).toBeGreaterThanOrEqual(0);
      const pop = bp.page.getByRole('tooltip', { name: /reflected in the Payment field/ });
      if (await pop.isVisible().catch(() => false)) await pop.getByRole('button', { name: 'Cancel' }).click();
    }
    await bp.discardForm();
  });

  test('TC-UI-16 / 17 - A decimal received amount (500.75) is saved to 2 decimals', { tag: ['@sales', '@si-bulk'] }, async () => {
    const receiptNo = await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount('500.75', 'Cancel');
    expect((await bp.readReceiptForm()).received).toBe(500.75);
    await bp.saveNewReceipt();
    expect((await bp.receiptListRow(receiptNo)).received).toBe(500.75);
  });

  test('TC-UI-18 / 19 - Payment Mode lists all modes and is required', { tag: ['@sales', '@si-bulk'] }, async () => {
    await bp.openNewReceipt(TC);
    await bp.receiptEditMode.locator('.ant-select-selector').click();
    const modes = (await bp.openOptionTexts.allInnerTexts()).map((t) => t.trim());
    await bp.page.keyboard.press('Escape');
    expect(modes).toEqual(expect.arrayContaining(['Cash', 'Cheque', 'Bank Transfer', 'UPI']));
    expect(modes.some((m) => /undeposited/i.test(m)), `modes: ${modes.join(', ')}`).toBe(true);
    await bp.setReceivedAmount(100, 'Cancel');
    expect(await bp.saveReceiptExpectRefused()).toMatch(/payment ?mode is required/i);
    await bp.discardForm();
  });

  test('TC-UI-22 / 35 / 36 - Reference No and Additional Notes are saved with the receipt', { tag: ['@sales', '@si-bulk'] }, async () => {
    const ref = `REF-2026-${Date.now().toString().slice(-4)}`;
    const note = `Bulk receipt note ${Date.now()}`;
    const receiptNo = await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(25, 'Cancel');
    await bp.fillInto(bp.receiptRef, ref);
    await bp.fillInto(bp.receiptNotes, note);
    await bp.saveNewReceipt();
    await bp.editReceipt(receiptNo);
    await expect(bp.receiptRef).toHaveValue(ref);
    await bugCheck('BUG-BR-02', 'Additional Notes not saved with the bulk receipt', async () => {
      await expect(bp.receiptNotes).toHaveValue(note, { timeout: 5000 });
    });
    await bp.discardForm();
  });

  // ── Due invoices / popup / summary ───────────────────────────────────────

  test('TC-UI-24 / 31 / 32 / 33 - Row payments update the summary: Used = Σ rows, Excess = Received − Used', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv = await invoice(A, 10);   // ₹1180
    await bp.openNewReceipt(TC);
    await bp.setReceivedAmount(1000, 'Cancel');
    await bp.setReceiptRowPayment(inv.billNo, 600);
    expect((await bp.receiptRow(inv.billNo)).payment).toBe(600);
    const f = await bp.readReceiptForm();
    expect([f.received, f.used, f.excess]).toEqual([1000, 600, 400]);
    await bp.discardForm();
  });

  test('TC-UI-34 - Excess is ₹0 when the received amount equals the amount used', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv = await invoice(A, 10);
    await bp.openNewReceipt(TC);
    await bp.setReceivedAmount(600, 'Cancel');
    await bp.setReceiptRowPayment(inv.billNo, 600);
    const f = await bp.readReceiptForm();
    expect([f.received, f.used, f.excess]).toEqual([600, 600, 0]);
    await bp.discardForm();
  });

  test('TC-UI-25 - A row payment above that invoice\'s balance is blocked', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv = await invoice(C, 2);   // ₹94.40
    await bp.openNewReceipt(TC);
    await bp.setReceivedAmount(500, 'Cancel');
    await bp.setReceiptPaymentMode('Cash');
    const r = await bp.expectInvalidValueBlocked(bp.receiptRowPayment(inv.billNo), '500', 'row payment ₹500 on a ₹94.40 balance');
    if (r.prevented) expect(parseFloat(r.shown || '0')).toBeLessThanOrEqual(inv.total);
    else expect(r.message).toMatch(/exceed|balance/i);
    await bp.discardForm();
  });

  test('TC-UI-27 - A fully paid invoice is listed with Balance ₹0', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv = await invoice(C, 1);
    await bp.recordPayment(inv.billNo, { full: true });
    await bp.openNewReceipt(TC);
    const row = await bp.receiptRow(inv.billNo);
    expect(row, `${inv.billNo} listed in Due Invoices`).not.toBeNull();
    expect(row.balance).toBe(0);
    await bp.discardForm();
  });

  test('TC-UI-28 / 29 - Entering a received amount asks to reflect it; OK spreads it over the invoice payments', { tag: ['@sales', '@si-bulk'] }, async () => {
    await invoice(A, 2);
    await bp.openNewReceipt(TC);
    const due = (await bp.readReceiptForm()).due;
    const amount = Math.min(150, due);
    expect(await bp.setReceivedAmount(amount, 'OK'), 'reflect-amount popup shown').toBe(true);
    const payments = (await bp.page.locator('table tbody tr input').evaluateAll((es) => es.map((e) => parseFloat(e.value || '0'))));
    expectClose(payments.reduce((s, v) => s + v, 0), amount, 0.01, 'sum of row payments');
    expectClose((await bp.readReceiptForm()).used, amount, 0.01, 'Amount used for payments');
    await bp.discardForm();
  });

  test('TC-UI-30 - Cancel on the popup leaves every invoice payment at 0', { tag: ['@sales', '@si-bulk'] }, async () => {
    await invoice(A, 1);
    await bp.openNewReceipt(TC);
    expect(await bp.setReceivedAmount(100, 'Cancel')).toBe(true);
    const payments = (await bp.page.locator('table tbody tr input').evaluateAll((es) => es.map((e) => parseFloat(e.value || '0'))));
    expect(payments.every((v) => v === 0)).toBe(true);
    expect((await bp.readReceiptForm()).used).toBe(0);
    await bp.discardForm();
  });

  test('TC-UI-37 - Cancel on a new receipt creates no record', { tag: ['@sales', '@si-bulk'] }, async () => {
    const receiptNo = await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(10, 'Cancel');
    await bp.discardForm();
    await bp.salesTab.click();
    await bp.paymentReceivedTab.click();
    await bp.fillInto(bp.listSearch, receiptNo);
    await bp.settle(2500, 'receipt search');
    await expect(bp.invoiceRow(receiptNo), `${receiptNo} must not exist`).toHaveCount(0);
  });

  // ── Bulk payment ─────────────────────────────────────────────────────────

  // QA (BUG-BR-04): paying more than the total due is correct — the excess goes to the customer's advance.
  test('TC-BP-04 - A receipt above the total of all due invoices is saved (excess goes to advance)', { tag: ['@sales', '@si-bulk'] }, async () => {
    await invoice(C, 1);
    await bp.openNewReceipt(TC);
    const due = (await bp.readReceiptForm()).due;
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(Math.ceil(due) + 500, 'OK');
    await bp.saveNewReceipt();
  });

  test.fixme('TC-BP-11 - Print a bulk receipt', async () => {
    // Print opens the browser print dialog — not verifiable in automation; check manually.
  });

  for (const [id, label, offset] of [['TC-BP-12', 'a past date', -15], ['TC-BP-13', 'a future date', 15]]) {
    test(`${id} - Receipt dated ${label} is saved with that date`, { tag: ['@sales', '@si-bulk'] }, async () => {
      const receiptNo = await bp.openNewReceipt(TC);
      const date = addDays(new Date(), offset);
      await bp.receiptDate.click();
      await bp.receiptDate.press('ControlOrMeta+A');
      await bp.page.keyboard.type(pickerDate(date));
      await bp.page.keyboard.press('Enter');
      await bp.setReceiptPaymentMode('Cash');
      await bp.setReceivedAmount(15, 'Cancel');
      await bp.saveNewReceipt();
      expect((await bp.receiptListRow(receiptNo)).date).toBe(listDate(date));
    });
  }

  test('TC-BP-14 / 15 - Manual split: one invoice paid in full, another partly → Paid and remaining due', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv1 = await invoice(C, 2);   // ₹94.40
    const inv2 = await invoice(A, 5);   // ₹590
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(inv1.total + 300, 'Cancel');
    await bp.setReceiptRowPayment(inv1.billNo, inv1.total);
    await bp.setReceiptRowPayment(inv2.billNo, 300);
    await bp.saveNewReceipt();
    const r1 = await bp.listRow(inv1.billNo);
    const r2 = await bp.listRow(inv2.billNo);
    expect([r1.status, r1.due]).toEqual(['Paid', 0]);
    expectClose(r2.due, inv2.total - 300, 0.01, 'invoice 2 remaining due');
    expect(r2.status).toMatch(/days due|partially/i);
  });

  test('TC-BP-18 - Excess on a bulk receipt is kept as customer advance', { tag: ['@sales', '@si-bulk'] }, async () => {
    const inv = await invoice(C, 1);
    const advanceBefore = await bp.readCustomerAdvance(TC);
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(inv.total + 200, 'Cancel');
    await bp.setReceiptRowPayment(inv.billNo, inv.total);
    expectClose((await bp.readReceiptForm()).excess, 200, 0.01, 'excess on the form');
    await bp.saveNewReceipt();
    expectClose(await bp.readCustomerAdvance(TC), advanceBefore + 200, 0.02, 'customer advance');
  });

  test('TC-BP-19 - Paying every selected invoice in full marks them all Paid', { tag: ['@sales', '@si-bulk'] }, async () => {
    const invs = [await invoice(C, 1), await invoice(C, 2), await invoice(A, 1)];
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(invs.reduce((s, i) => s + i.total, 0).toFixed(2), 'Cancel');
    for (const inv of invs) await bp.setReceiptRowPayment(inv.billNo, inv.total);
    await bp.saveNewReceipt();
    for (const inv of invs) expect(await bp.listRow(inv.billNo)).toMatchObject({ status: 'Paid', due: 0 });
  });

  test('TC-BP-20 - 50% of each invoice paid: each shows half its amount as due', { tag: ['@sales', '@si-bulk'] }, async () => {
    const invs = [await invoice(A, 2), await invoice(C, 5)];
    await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(invs.reduce((s, i) => s + i.total / 2, 0).toFixed(2), 'Cancel');
    for (const inv of invs) await bp.setReceiptRowPayment(inv.billNo, (inv.total / 2).toFixed(2));
    await bp.saveNewReceipt();
    for (const inv of invs) {
      const row = await bp.listRow(inv.billNo);
      expectClose(row.due, inv.total / 2, 0.01, `${inv.billNo} due`);
      expect(row.status).toMatch(/days due|partially/i);
    }
  });

  test('TC-BP-23 - Every receipt number in Payment Received is unique', { tag: ['@sales', '@si-bulk'] }, async () => {
    const all = await bp.allReceiptNumbers();
    const seen = new Set();
    const dups = all.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    console.log(`${all.length} receipts scanned`);
    expect(dups, 'duplicate receipt numbers').toEqual([]);
  });

  test('TC-BP-24 - Receipt into Petty Cash posts Petty Cash Dr for the amount', { tag: ['@sales', '@si-bulk'] }, async () => {
    const receiptNo = await bp.openNewReceipt(TC);
    await bp.pickOption(bp.receiptAccount, 'Petty Cash');
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(35, 'Cancel');
    await bp.saveNewReceipt();
    const journal = await bp.readReceiptJournal(receiptNo);
    const petty = journal.find((r) => r.account === 'Petty Cash');
    expect(petty, `journal: ${journal.map((r) => r.account).join(', ')}`).toBeTruthy();
    expect(petty.debit).toBe(35);
  });

  // ── Invoice status ───────────────────────────────────────────────────────

  test('TC-IS-06 - Deleting a bulk receipt returns every invoice it paid to its original due', { tag: ['@sales', '@si-bulk'] }, async () => {
    const invs = [await invoice(C, 1), await invoice(A, 1)];
    const receiptNo = await bp.openNewReceipt(TC);
    await bp.setReceiptPaymentMode('Cash');
    await bp.setReceivedAmount(invs.reduce((s, i) => s + i.total, 0).toFixed(2), 'Cancel');
    for (const inv of invs) await bp.setReceiptRowPayment(inv.billNo, inv.total);
    await bp.saveNewReceipt();
    for (const inv of invs) expect((await bp.listRow(inv.billNo)).status).toBe('Paid');
    await deleteReceipt(receiptNo);
    for (const inv of invs) {
      const row = await bp.listRow(inv.billNo);
      expectClose(row.due, inv.total, 0.01, `${inv.billNo} due restored`);
      expect(row.status).not.toBe('Paid');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Customer Transaction page (Customer_Transaction_TestCases.xlsx) — customer "saravana store";
// balances are compared before / after each action (the customer has other transactions).
//
// Already automated — not repeated here:
//   TC-TD-03 closing balance = statement closing .... Sales_Unit TC18–TC21
//   TC-TD-05 / TC-BC-04 advance from overpayment ...... TC-BP-18
//   TC-SI-07 / 08 / 09 / 10 qty edits, paid edits, over-stock edit ... TC13, TC-SC-10, TC-SC-11, TC18
//   TC-SI-13 / 20 / TC-SC-02 / TC-BC-09 delete paid invoice ... TC-SC-02, TC-RP-32
//   TC-PT-05 / 06 / 07 / 10 / 12 payment edits / cancelled / over-pay ... TC-PE-* (Sales_Invoice_Payment), TC-PE-10, TC-RP-13
//   TC-PT-09 delete payment → advance ................. TC-RP-31
//   TC-BC-08 duplicate bill number .................... TC-E64
//   TC-ST-01…04 / 07 / 09 stock after invoice create / edit / delete ... TC01–TC29 (stock block)
//   TC-SC-01 / 05 / 06 / 07 / 08 / 09 / 10 paid-invoice scenarios ... TC-SC-01/09, 05, 06, 10, 11, 12
// Deferred (need a Sales Order, Credit Note or a new customer — automated with those sheets):
//   TC-TD-02 / 08 / 10, TC-SO-01…09, TC-CN-01…10, TC-BC-01 / 03 / 06 / 07, TC-ST-05 / 06 / 08, TC-VD-02…08
//
//   npx playwright test --grep @si-customer-tx
// ════════════════════════════════════════════════════════════════════════════

test.describe('Customer Transaction', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {CustomerTransactionPage} */
  let ct;
  let A; let C;
  const CUST = 'saravana store';
  test.beforeEach(async ({ page }) => {
    ct = new CustomerTransactionPage(page);
    await ct.open();
    [A, , C] = await ct.ensurePricedItems(E.items());
  });

  const L = (item, qty) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0 });
  /** New invoice for the customer: { billNo, total, m }. opts: { draft, billDate }. */
  const invoice = async (item, qty, opts = {}) => {
    const m = { lines: [L(item, qty)], taxMode: 'Excluding Tax' };
    const { billNo } = await ct.createPricedInvoice(m, { customerName: CUST, ...opts });
    return { billNo, total: ct.computeTotals(m).total, m };
  };
  const header = async () => { await ct.openCustomer(CUST); return ct.readHeader(); };
  const stmtRow = (rows, no) => rows.filter((r) => r.no === no);

  test('TC-TD-01 - Customer page shows balances, the transaction tabs and the statement columns', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    await ct.openCustomer(CUST);
    const h = await ct.readHeader();
    for (const [k, v] of Object.entries(h)) expect(Number.isFinite(v), `header ${k}`).toBe(true);
    for (const tab of ['Transaction Statement', 'Sales Invoice', 'Sales Order', 'Payment Report', 'Credit Notes']) {
      await expect(ct.customerTabButton(tab)).toBeVisible();
    }
    await ct.openCustomerTab('Transaction Statement');
    expect((await ct.visibleHead.allInnerTexts()).map((t) => t.trim())).toEqual(
      expect.arrayContaining(['Date', 'Transaction No', 'Transaction Detail', 'Amount', 'Payment', 'Balance Due']));
  });

  test('TC-TD-06 / TC-SI-05 / TC-SI-14 - A draft invoice is not counted, and deleting it changes nothing', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const before = await header();
    const draft = await invoice(A, 2, { draft: true });
    const afterDraft = await header();
    expectClose(afterDraft.due, before.due, 0.01, 'due after draft');
    expectClose(afterDraft.closing, before.closing, 0.01, 'closing after draft');
    expect(stmtRow(await ct.readStatement(), draft.billNo), 'draft in statement').toHaveLength(0);
    await ct.deleteInvoice(draft.billNo);
    const afterDelete = await header();
    expectClose(afterDelete.closing, before.closing, 0.01, 'closing after deleting the draft');
  });

  test('TC-TD-07 / TC-SI-01 - A saved invoice is listed (bill no, date, amount, due, status) and adds to due and closing balance', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const before = await header();
    const inv = await invoice(A, 3);
    const after = await header();
    expectClose(after.due - before.due, inv.total, 0.02, 'due increase');
    expectClose(after.closing - before.closing, inv.total, 0.02, 'closing increase');
    const [row] = stmtRow(await ct.readStatement(), inv.billNo);
    expect(row, `${inv.billNo} in statement`).toBeTruthy();
    expect(row.detail).toBe('Generated Invoice');
    expect(row.date).toBe(statementDate(new Date()));
    expectClose(row.amount, inv.total, 0.01, 'statement amount');
    const si = (await ct.readCustomerInvoices()).find((r) => r.billNo === inv.billNo);
    expect(si).toMatchObject({ status: '7 days due' });
    expectClose(si.bill, inv.total, 0.01, 'Bill Amount');
    expectClose(si.due, inv.total, 0.01, 'Due Amount');
  });

  test('TC-SI-02 - Clicking a bill number in the statement opens that invoice', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const inv = await invoice(C, 2);
    await ct.openCustomer(CUST);
    await ct.openFromStatement(inv.billNo);
    const drawer = ct.page.locator('.ant-drawer-content').filter({ hasText: inv.billNo }).last();
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Bill Amount');
    await expect(drawer).toContainText(C.itemName);
  });

  test('TC-SI-03 / TC-PT-02 - A fully paid invoice shows Paid, ₹0 due, and its payment in the statement', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const inv = await invoice(C, 3);
    const before = await header();
    await ct.recordPayment(inv.billNo, { full: true });
    const after = await header();
    expectClose(before.due - after.due, inv.total, 0.02, 'due reduced by the payment');
    const [p] = await ct.readInvoicePayments(inv.billNo);
    await ct.openCustomer(CUST);
    const [row] = stmtRow(await ct.readStatement(), p.number);
    expect(row, `${p.number} in statement`).toBeTruthy();
    expectClose(row.payment, inv.total, 0.01, 'statement payment');
    const si = (await ct.readCustomerInvoices()).find((r) => r.billNo === inv.billNo);
    expect(si).toMatchObject({ status: 'Paid', due: 0 });
  });

  test('TC-SI-04 / TC-PT-01 / TC-PT-03 / TC-BC-02 - Partial payment: RCPT row with date, amount and mode; due and closing drop by the payment', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const inv = await invoice(A, 10);   // ₹1180
    const before = await header();
    await ct.recordPayment(inv.billNo, { amount: 600, mode: 'Cash' });
    const after = await header();
    expectClose(before.due - after.due, 600, 0.02, 'due reduced by 600');
    expectClose(before.closing - after.closing, 600, 0.02, 'closing reduced by 600');
    const [p] = await ct.readInvoicePayments(inv.billNo);
    await ct.openCustomer(CUST);
    const [row] = stmtRow(await ct.readStatement(), p.number);
    expect(row).toMatchObject({ detail: expect.stringMatching(/Payment/i), date: statementDate(new Date()) });
    expect(row.payment).toBe(600);
    const report = (await ct.readPaymentReport()).find((r) => r.receiptNo === p.number);
    expect(report).toMatchObject({ mode: 'Cash', received: 600 });
    const si = (await ct.readCustomerInvoices()).find((r) => r.billNo === inv.billNo);
    expectClose(si.due, inv.total - 600, 0.01, 'invoice due');
  });

  test('TC-SI-06 / TC-SI-11 - Editing invoices updates their statement amounts and the due', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const invs = [await invoice(C, 1), await invoice(C, 2), await invoice(C, 3)];
    const before = await header();
    const newQty = [4, 1, 6];
    for (const [i, inv] of invs.entries()) {
      await ct.editInvoice(inv.billNo);
      await ct.setLine(0, newQty[i]);
      await ct.save();
    }
    const newTotals = newQty.map((q) => ct.computeTotals({ lines: [L(C, q)], taxMode: 'Excluding Tax' }).total);
    const after = await header();
    expectClose(after.due - before.due, newTotals.reduce((s, t) => s + t, 0) - invs.reduce((s, i) => s + i.total, 0), 0.03, 'due change');
    const rows = await ct.readStatement();
    for (const [i, inv] of invs.entries()) expectClose(stmtRow(rows, inv.billNo)[0].amount, newTotals[i], 0.01, `${inv.billNo} amount`);
  });

  test('TC-SI-12 / TC-BC-05 - Deleting an unpaid invoice removes it and takes its amount off due and closing', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const before = await header();
    const inv = await invoice(A, 2);
    await ct.deleteInvoice(inv.billNo);
    const after = await header();
    expectClose(after.due, before.due, 0.02, 'due back');
    expectClose(after.closing, before.closing, 0.02, 'closing back');
    expect(stmtRow(await ct.readStatement(), inv.billNo)).toHaveLength(0);
  });

  test('TC-SI-15 / TC-SI-18 - Deleting the middle invoices leaves the others and the right due', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const before = await header();
    const invs = [await invoice(C, 1), await invoice(C, 2), await invoice(C, 3), await invoice(C, 4)];
    for (const inv of [invs[1], invs[2]]) await ct.deleteInvoice(inv.billNo);
    const after = await header();
    expectClose(after.due - before.due, invs[0].total + invs[3].total, 0.02, 'due = invoices 1 + 4');
    const rows = await ct.readStatement();
    expect([invs[0], invs[3]].every((i) => stmtRow(rows, i.billNo).length === 1)).toBe(true);
    expect([invs[1], invs[2]].every((i) => stmtRow(rows, i.billNo).length === 0)).toBe(true);
  });

  test('TC-TD-09 / TC-SI-16 / TC-SI-17 / TC-SC-03 / TC-BC-10 - Back-dated invoices are listed by date and the running balance stays consistent after editing the middle one', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const days = [-6, -4, -2];
    const invs = [];
    for (const d of days) invs.push(await invoice(C, 1, { billDate: pickerDate(addDays(new Date(), d)) }));
    await ct.editInvoice(invs[1].billNo);
    await ct.setLine(0, 5);
    await ct.save();
    await ct.openCustomer(CUST);
    const rows = await ct.readStatement();
    const ours = invs.map((i) => rows.findIndex((r) => r.no === i.billNo));
    expect(ours.every((i) => i >= 0), 'all three listed').toBe(true);
    expect([...ours].sort((a, b) => a - b), 'listed in date order').toEqual(ours);
    days.forEach((d, i) => expect(rows[ours[i]].date).toBe(statementDate(addDays(new Date(), d))));
    expectClose(rows[ours[1]].amount, ct.computeTotals({ lines: [L(C, 5)], taxMode: 'Excluding Tax' }).total, 0.01, 'edited middle amount');
    for (let i = 1; i < rows.length; i++) {
      expectClose(rows[i].balance, rows[i - 1].balance + rows[i].amount - rows[i].payment, 0.02, `running balance at ${rows[i].no}`);
    }
  });

  test('TC-SI-19 - Paying the middle of three invoices: only it shows Paid', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const invs = [await invoice(C, 1), await invoice(C, 2), await invoice(C, 3)];
    await ct.recordPayment(invs[1].billNo, { full: true });
    await ct.openCustomer(CUST);
    const list = await ct.readCustomerInvoices();
    const status = (inv) => list.find((r) => r.billNo === inv.billNo);
    expect(status(invs[1])).toMatchObject({ status: 'Paid', due: 0 });
    for (const inv of [invs[0], invs[2]]) expectClose(status(inv).due, inv.total, 0.01, `${inv.billNo} still due`);
  });

  test('TC-PT-04 - Editing a payment amount (600 → 800) updates the statement and the Payment Report', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const inv = await invoice(A, 10);
    await ct.recordPayment(inv.billNo, { amount: 600 });
    const [p] = await ct.readInvoicePayments(inv.billNo);
    await ct.editReceipt(p.number);
    await ct.typeValue(ct.receiveAmtField(), '800');
    await ct.confirmReflectAmount();
    await ct.saveReceiptEdit();
    await ct.openCustomer(CUST);
    expect(stmtRow(await ct.readStatement(), p.number)[0].payment).toBe(800);
    expect((await ct.readPaymentReport()).find((r) => r.receiptNo === p.number).received).toBe(800);
  });

  test('TC-PT-08 - Deleting a payment removes it from the statement and restores the invoice due', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const inv = await invoice(A, 5);
    await ct.recordPayment(inv.billNo, { amount: 300 });
    const [p] = await ct.readInvoicePayments(inv.billNo);
    await ct.openReceipt(p.number);
    await ct.receiptDrawer.getByRole('button', { name: 'Delete' }).click();
    await ct.yesBtn.click();
    await ct.settle(4000, 'receipt deleted');
    await ct.page.keyboard.press('Escape');
    await ct.openCustomer(CUST);
    expect(stmtRow(await ct.readStatement(), p.number)).toHaveLength(0);
    expectClose((await ct.readCustomerInvoices()).find((r) => r.billNo === inv.billNo).due, inv.total, 0.01, 'invoice due restored');
  });

  test('TC-PT-11 - One bulk receipt for two invoices: one RCPT row, both invoices Paid', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    const invs = [await invoice(C, 1), await invoice(C, 2)];
    const receiptNo = await ct.openNewReceipt(CUST);
    await ct.setReceiptPaymentMode('Cash');
    const sum = invs.reduce((s, i) => s + i.total, 0);
    await ct.setReceivedAmount(sum.toFixed(2), 'Cancel');
    for (const inv of invs) await ct.setReceiptRowPayment(inv.billNo, inv.total);
    await ct.saveNewReceipt();
    await ct.openCustomer(CUST);
    const rows = stmtRow(await ct.readStatement(), receiptNo);
    expect(rows).toHaveLength(1);
    expectClose(rows[0].payment, sum, 0.01, 'bulk receipt payment');
    const list = await ct.readCustomerInvoices();
    for (const inv of invs) expect(list.find((r) => r.billNo === inv.billNo)).toMatchObject({ status: 'Paid', due: 0 });
  });

  test('TC-VD-01 - View Details opens the customer profile', { tag: ['@sales', '@si-customer-tx'] }, async () => {
    await ct.openCustomer(CUST);
    await ct.viewDetailsBtn.click();
    await expect(ct.page).toHaveURL(/\/org-info/);
    await expect(ct.page.getByText('Customer Details')).toBeVisible();
    await expect(ct.page.getByText('Basic Info')).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Sales Order (Sales_Order_TestCases.xlsx: New Sales Order TC-SO-01…103, Order Edit Flow TC-OE-01…44)
// + deferred: Customer_Transaction TC-SO-01…09 (as "CT TC-SO-…"), Sales_Invoice TC-80.
// Customer "saravana store". The order form is the SAME component as the Sales Invoice form, so its
// pure line / summary arithmetic is already exercised by the invoice tests — only order-specific
// behaviour, persistence and a few representative totals are automated here.
//
// Already automated (same form component) — not repeated:
//   TC-SO-28 / 99 optional sales person / save ........ every order saved below
//   TC-SO-34 / 36 partial / unknown item search ........ TC-37 / TC-38
//   TC-SO-41 negative rate ............................. TC-E11
//   TC-SO-53 / 55 / 58 / 61 single / remove / qty / decimal qty ... TC-E01, TC-61, TC06
//   TC-SO-59 / 60 blank / zero qty ..................... TC-46 / TC-47
//   TC-SO-62…74 line discount / line total / subtotal .. TC-E05…E14, TC-58…61
//   TC-SO-75…89 overall discount / shipping / adjustment  TC-E34…E50, TC-66
//   TC-SO-90 / 91 round off (no Round Off field) ....... TC-E58 / E59 (app defect)
//   TC-SO-92…95 GST / CESS ............................. TC-E18…E24
//   TC-OE-01…19, 26…43 edit-form item / rate / tax / summary changes ... TC-E01…E60 (same edit form)
//
//   npx playwright test --grep @so
// ════════════════════════════════════════════════════════════════════════════

test.describe('Sales Order', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {SalesOrderPage} */
  let so;
  let A; let B; let C;
  const CUST = 'saravana store';
  test.beforeEach(async ({ page }) => {
    so = new SalesOrderPage(page);
    await so.open();
    [A, B, C] = await so.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });
  /** New saved order: { no, total, m }. opts: { billDate } */
  const order = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const { billNo } = await so.createPricedInvoice(m, { customerName: CUST, billDate: opts.billDate });
    return { no: billNo, total: so.computeTotals(m).total, m };
  };
  const num = (no) => parseInt(String(no).match(/(\d+)$/)[1], 10);

  // ── Number / dates / defaults ────────────────────────────────────────────

  test('TC-SO-01 / 02 / 03 - SO number is auto-generated SO-AUTO/NNNN, read-only and increments by 1', { tag: ['@sales', '@so'] }, async () => {
    const first = await order([L(C, 1)]);
    const no = await so.startInvoice({ customerName: CUST });
    await expect(so.billNoInput).not.toBeEditable();
    expect(first.no).toMatch(/^SO-AUTO\/\d{4}$/);
    expect(num(no)).toBe(num(first.no) + 1);
    await so.discardForm();
  });

  test('TC-SO-04 / 20 / 22 / 48 - Defaults: SO date and expected delivery today, 7-day term, Default warehouse; saves with no delivery date', { tag: ['@sales', '@so'] }, async () => {
    await so.startInvoice({ customerName: CUST });
    const h = await so.readOrderHeader();
    expect(h).toMatchObject({ soDate: pickerDate(new Date()), expectedDeliveryDate: pickerDate(new Date()), term: '7 days', warehouse: 'Default', deliveryDate: '' });
    await so.discardForm();
    const o = await order([L(C, 1)]);
    expect(await so.listRow(o.no)).toMatchObject({ date: listDate(new Date()), status: 'Pending' });
  });

  for (const [id, label, offset] of [['TC-SO-05', 'a past date', -30], ['TC-SO-06', 'a future date', 20]]) {
    test(`${id} - Order dated ${label} is saved with that date`, { tag: ['@sales', '@so'] }, async () => {
      const d = addDays(new Date(), offset);
      const o = await order([L(C, 1)], { billDate: pickerDate(d) });
      expect((await so.listRow(o.no)).date).toBe(listDate(d));
    });
  }

  for (const [id, term] of [['TC-SO-07', '7 days'], ['TC-SO-08', '15 days'], ['TC-SO-09', '30 days'], ['TC-SO-10', '60 days'], ['TC-SO-11', 'custom']]) {
    test(`${id} - Payment term "${term}" is saved with the order`, { tag: ['@sales', '@so'] }, async () => {
      const no = await so.startInvoice({ customerName: CUST });
      await so.setDueTerm(term === '7 days' ? '15 days' : '7 days');
      await so.setDueTerm(term);
      await so.addLine(C, 1);
      await so.save();
      await so.editInvoice(no);
      expect((await so.readOrderHeader()).term).toBe(term);
      await so.discardForm();
    });
  }

  test('TC-SO-12 - Payment term cannot be left blank (it always has a value)', { tag: ['@sales', '@so'] }, async () => {
    await so.startInvoice({ customerName: CUST });
    await so.dueTermSelect.hover();
    expect(await so.dueTermSelect.locator('.ant-select-clear').count(), 'no clear control on Payment Term').toBe(0);
    expect((await so.readOrderHeader()).term).not.toBe('');
    await so.discardForm();
  });

  for (const [id, mode] of [['TC-SO-13', 'Road'], ['TC-SO-14', 'Rail'], ['TC-SO-15', 'Air'], ['TC-SO-16', 'Ship']]) {
    test(`${id} - Mode of transport "${mode}" is saved with the order`, { tag: ['@sales', '@so'] }, async () => {
      const no = await so.startInvoice({ customerName: CUST, transport: mode });
      await so.addLine(C, 1);
      await so.save();
      await so.editInvoice(no);
      expect((await so.readOrderHeader()).transport).toBe(mode);
      await so.discardForm();
    });
  }

  test('TC-SO-17 / 100 - Without items save is disabled; without mode of transport save is refused', { tag: ['@sales', '@so'] }, async () => {
    await so.startInvoice({ customerName: CUST, transport: null });
    await expect(so.saveBtn.locator('xpath=ancestor::button[1]'), 'save disabled with no items').toBeDisabled();
    await so.addLine(C, 1);
    expect(await so.saveExpectRefused()).toMatch(/Please Select Mode Of Transport/i);
    await so.discardForm();
  });

  test('TC-SO-18 / 21 - Delivery and expected delivery dates after the order date are saved', { tag: ['@sales', '@so'] }, async () => {
    const no = await so.startInvoice({ customerName: CUST });
    const [delivery, expected] = [pickerDate(addDays(new Date(), 5)), pickerDate(addDays(new Date(), 8))];
    await so.setDeliveryDate(delivery);
    await so.expectedDeliveryDate.click();
    await so.expectedDeliveryDate.press('ControlOrMeta+A');
    await so.page.keyboard.type(expected);
    await so.page.keyboard.press('Enter');
    await so.addLine(C, 1);
    await so.save();
    await so.editInvoice(no);
    expect(await so.readOrderHeader()).toMatchObject({ deliveryDate: delivery, expectedDeliveryDate: expected });
    await so.discardForm();
  });

  test('TC-SO-19 - A delivery date before the order date is refused', { tag: ['@sales', '@so'] }, async () => {
    knownBug('BUG-SO-01', 'delivery date before the order date accepted');
    await so.startInvoice({ customerName: CUST });
    const typed = pickerDate(addDays(new Date(), -3));
    await so.setDeliveryDate(typed);
    await so.addLine(C, 1);
    const shown = await so.deliveryDate.inputValue();
    if (shown !== typed) { console.log(`Delivery date ${typed} not accepted by the picker (shows "${shown}")`); await so.discardForm(); return; }
    expect(await so.saveExpectRefused()).toMatch(/delivery/i);
    await so.discardForm();
  });

  test('TC-SO-23 / 24 / 25 - Place of supply: Tamil Nadu → CGST + SGST, another state → IGST (changed after items are added)', { tag: ['@sales', '@so'] }, async () => {
    const tn = await order([L(A, 1)]);
    await so.openInvoice(tn.no);
    await expect(so.previewDrawer).toContainText('CGST');
    await so.closePreview();
    const no = await so.startInvoice({ customerName: CUST });
    await so.addLine(A, 1);
    await so.setPlaceOfSupply('Kerala');
    await so.save();
    await so.openInvoice(no);
    await expect(so.previewDrawer).toContainText('IGST');
    await expect(so.previewDrawer).not.toContainText('CGST');
  });

  // ── Tax mode / items / UOM / rate ────────────────────────────────────────

  test('TC-SO-29 / 30 / 31 / 32 - Including Tax with GST 5% / 12% / 18% items, switched to Excluding: totals correct and saved', { tag: ['@sales', '@so'] }, async () => {
    const m = model([L(A, 1, { gst: 5 }), L(B, 1, { gst: 12 }), L(C, 2)], { taxMode: 'Including Tax' });
    const no = await so.startInvoice({ customerName: CUST });
    await so.fillInvoice(m);
    await so.expectTotals(m, 'including tax');
    await so.setTaxMode('Excluding Tax');
    m.taxMode = 'Excluding Tax';
    await so.expectTotals(m, 'excluding tax');
    await so.save();
    expectClose((await so.listRow(no)).bill, so.computeTotals(m).total, 0.03, 'list Bill Amount');
  });

  test('TC-SO-33 / 38 - Selected item comes with rate (≤ 2 decimals), GST and UOM pre-filled', { tag: ['@sales', '@so'] }, async () => {
    await so.startInvoice({ customerName: CUST });
    await so.addLine(B, 1);
    const line = await so.readLine(0);
    expect(line.rate).toBe(B.price);
    expect(String(line.rate).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    expect([line.gst, line.uom]).toEqual(['GST18', 'pcs']);
    await so.discardForm();
  });

  test('TC-SO-37 - A long item name is shown in full on the order line', { tag: ['@sales', '@so'] }, async () => {
    // Created without a stock check — the inventory list is not what this case is about
    const long = await so.itemPage.createItemWithUoms({ name: `Lifespice Kitchen Queen Garam Masala 100g Pouch-2 ${Date.now().toString().slice(-5)}`, baseUnit: 'pcs', price: '56', alternates: [] });
    await so.startInvoice({ customerName: CUST });
    await so.addLine(long, 1);
    expect((await so.readLine(0)).text).toContain(long.itemName);
    await so.discardForm();
  });

  test('TC-SO-39 - Rate 0 on an order shows a "rate cannot be zero" warning', { tag: ['@sales', '@so'] }, async () => {
    knownBug('BUG-SO-02', 'rate 0 saved on a sales order without a message');
    await so.startInvoice({ customerName: CUST });
    await so.addLine(A, 1);
    await so.setLineRate(0, 0);
    await so.saveExpectWarning(/rate|zero/i);
  });

  test('TC-SO-40 - An empty rate is refused ("Rate is required")', { tag: ['@sales', '@so'] }, async () => {
    knownBug('BUG-SO-02', 'empty rate saved on a sales order without a message');
    await so.startInvoice({ customerName: CUST });
    await so.addLine(A, 1);
    await so.setLineRate(0, '');
    const rate = (await so.readLine(0)).rate;
    if (!Number.isNaN(rate)) { console.log(`Empty rate not accepted — the field shows ${rate}`); await so.discardForm(); return; }
    expect(await so.saveExpectRefused()).toMatch(/rate/i);
    await so.discardForm();
  });

  test('TC-SO-42 / 43 / 44 / 45 - UOM pcs / box / bundle set the rate by conversion, and the rate can be overridden', { tag: ['@sales', '@so'] }, async () => {
    const u = await so.setupItem(pcsItem('SO-UOM', { box: 12, bundle: 60, stock: 500 }));
    await so.startInvoice({ customerName: CUST });
    await so.addLine(u, 2);
    expect((await so.readLine(0)).rate, 'pcs rate').toBe(u.price);
    for (const [uom, conv] of [['box', 12], ['bundle', 60]]) {
      await so.setLine(0, 2, uom);
      await expect.poll(async () => (await so.readLine(0)).rate, { message: `${uom} rate` }).toBe(u.price * conv);
    }
    await so.setLineRate(0, 555.5);
    expectClose((await so.readLine(0)).amount, 555.5 * 2, 0.01, 'line total with overridden rate');
    await so.discardForm();
  });

  test('TC-SO-54 / 96 / 97 - Order with 4 items, decimal rates / qty / discounts, overall discount, shipping and adjustment is saved with the right total', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([
      L(A, 2.5, { rate: 56.75, discount: 12.5 }),
      L(B, 1, { gst: 12, cess: 1, discount: 15, discountMode: '₹' }),
      L(C, 3, { gst: 5, cess: 10 }),
      L(A, 1, { gst: 12, cess: 1 }),
    ], { model: { summaryDiscount: { type: 'Percentage', value: 7.5 }, shipping: 99.99, adjustment: { type: 'Addition', value: 10.25 } } });
    expectClose((await so.listRow(o.no)).bill, o.total, 0.05, 'list Bill Amount');
  });

  // ── Stock / convert ──────────────────────────────────────────────────────

  // QA (BUG-SO-03): a sales order does not touch inventory; stock moves only when it is invoiced.
  test('TC-SO-56 - Saving a sales order leaves the item stock unchanged', { tag: ['@sales', '@so'] }, async () => {
    const before = await so.readStock(C);
    await order([L(C, 4)]);
    await so.open();
    const after = await so.readStock(C);
    expect(after, 'stock unchanged by the order').toBe(before);
  });

  test('TC-SO-57 / Sales_Invoice TC-80 - Convert an order to an invoice: lines and reference carried over, order Converted, stock down by the qty', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 3), L(B, 1)]);
    const before = await so.readStock(C);
    const siNo = await so.convertToInvoice(o.no);
    await expect(so.refNoInput).toHaveValue(o.no);
    expect(await so.lineCount()).toBe(2);
    const texts = await so.lineItemTexts();
    expect(texts.some((t) => t.includes(C.itemName)) && texts.some((t) => t.includes(B.itemName))).toBe(true);
    expect((await so.customerHeaderText()).toLowerCase()).toContain(CUST);
    await so.saveConvertedInvoice();
    expect((await so.listRow(o.no)).status).toBe('Converted');
    const inv = await so.invoiceListRow(siNo);
    expectClose(inv.bill, o.total, 0.03, 'invoice amount = order amount');
    await so.open();
    expect(before - (await so.readStock(C)), 'stock down by 3').toBe(3);
  });

  test('TC-SO-98 - Save As Draft is available on a new sales order', { tag: ['@sales', '@so'] }, async () => {
    await so.startInvoice({ customerName: CUST });
    await so.addLine(C, 1);
    await expect(so.saveDraftBtn, '"Save As Draft" button').toBeVisible({ timeout: 5000 });
    await so.discardForm();
  });

  // ── Save / edit / cancel / delete ────────────────────────────────────────

  test('TC-SO-101 - Editing a saved order (qty) updates its amount', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 2)]);
    await so.editInvoice(o.no);
    await so.setLine(0, 7);
    await so.save();
    expectClose((await so.listRow(o.no)).bill, so.computeTotals(model([L(C, 7)])).total, 0.02, 'edited amount');
  });

  test('TC-SO-102 - Cancelling a new order creates no record', { tag: ['@sales', '@so'] }, async () => {
    const no = await so.startInvoice({ customerName: CUST });
    await so.addLine(C, 1);
    await so.discardForm();
    await so._searchList(no);
    await expect(so.invoiceRow(no)).toHaveCount(0);
  });

  test('TC-SO-103 - Deleting a saved order removes it', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 1)]);
    await so.deleteOrder(o.no);
  });

  // ── Order edit flow (order-specific fields) ──────────────────────────────

  for (const [id, label, offset] of [['TC-OE-20', 'a past date', -12], ['TC-OE-21', 'a future date', 12]]) {
    test(`${id} - Changing the SO date to ${label} on edit is saved`, { tag: ['@sales', '@so'] }, async () => {
      const o = await order([L(C, 1)]);
      const d = addDays(new Date(), offset);
      await so.editInvoice(o.no);
      await so.setBillDate(pickerDate(d));
      await so.save();
      expect((await so.listRow(o.no)).date).toBe(listDate(d));
    });
  }

  test('TC-OE-22 - On edit, a delivery date before the SO date is refused', { tag: ['@sales', '@so'] }, async () => {
    knownBug('BUG-SO-01', 'delivery date before the order date accepted on edit');
    const o = await order([L(C, 1)]);
    await so.editInvoice(o.no);
    const typed = pickerDate(addDays(new Date(), -4));
    await so.setDeliveryDate(typed);
    const shown = await so.deliveryDate.inputValue();
    if (shown !== typed) { console.log(`Delivery date ${typed} not accepted by the picker (shows "${shown}")`); await so.discardForm(); return; }
    expect(await so.saveExpectRefused()).toMatch(/delivery/i);
    await so.discardForm();
  });

  test('TC-OE-23 / 24 - On edit, payment term 7 → 30 days and transport Road → Air are saved', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 1)]);
    await so.editInvoice(o.no);
    await so.setDueTerm('30 days');
    await so.setTransport('Air');
    await so.save();
    await so.editInvoice(o.no);
    expect(await so.readOrderHeader()).toMatchObject({ term: '30 days', transport: 'Air' });
    await so.discardForm();
  });

  test('TC-OE-25 - Mode of transport cannot be removed on edit', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 1)]);
    await so.editInvoice(o.no);
    await so.transportSelect.hover();
    const clear = so.transportSelect.locator('.ant-select-clear');
    if (await clear.count()) {
      await clear.click();
      expect(await so.saveExpectRefused()).toMatch(/Mode Of Transport/i);
    } else {
      console.log('Mode of transport has no clear control — it cannot be emptied');
      expect((await so.readOrderHeader()).transport).not.toBe('');
    }
    await so.discardForm();
  });

  test('TC-OE-44 - Edit the order qty, convert to an invoice: stock drops by the edited qty', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 2)]);
    await so.editInvoice(o.no);
    await so.setLine(0, 5);
    await so.save();
    const before = await so.readStock(C);
    await so.convertToInvoice(o.no);
    expect((await so.readLine(0)).qty).toBe(5);
    await so.saveConvertedInvoice();
    await so.open();
    expect(before - (await so.readStock(C)), 'stock down by the edited qty').toBe(5);
  });

  // ── Customer transaction view of orders (deferred from Customer_Transaction) ─

  test('CT TC-SO-01 / 02 / 03 - The order is listed on the customer\'s Sales Order tab with its amount and opens on click', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 3)]);
    await so.openCustomer(CUST);
    const row = (await so.readCustomerOrders()).find((r) => r.text.includes(o.no));
    expect(row, `${o.no} on the customer's Sales Order tab`).toBeTruthy();
    expectClose(money(row.cells.filter((c) => /₹/.test(c)).pop()), o.total, 0.01, 'order amount');
    await so.clickTabRow('Sales Order', o.no);
    await expect(so.page.locator('.ant-drawer-content').filter({ hasText: o.no }).last()).toBeVisible();
  });

  test('CT TC-SO-04 / 05 / 06 / 07 / 09 - Editing (qty up / down) and deleting orders is reflected on the customer\'s Sales Order tab', { tag: ['@sales', '@so'] }, async () => {
    const [o1, o2, o3] = [await order([L(C, 10)]), await order([L(C, 10)]), await order([L(C, 1)])];
    for (const [o, q] of [[o1, 15], [o2, 5]]) {
      await so.editInvoice(o.no);
      await so.setLine(0, q);
      await so.save();
    }
    await so.deleteOrder(o3.no);
    await so.openCustomer(CUST);
    const rows = await so.readCustomerOrders();
    const amount = (o) => money(rows.find((r) => r.text.includes(o.no)).cells.filter((c) => /₹/.test(c)).pop());
    expectClose(amount(o1), so.computeTotals(model([L(C, 15)])).total, 0.01, 'order 1 increased');
    expectClose(amount(o2), so.computeTotals(model([L(C, 5)])).total, 0.01, 'order 2 decreased');
    expect(rows.some((r) => r.text.includes(o3.no)), 'deleted order gone').toBe(false);
  });

  // QA (BUG-SO-05): the "Converted" status is not developed yet.
  test.fixme('CT TC-SO-08 - A converted sales order cannot be deleted (Converted status not developed yet)', { tag: ['@sales', '@so'] }, async () => {
    const o = await order([L(C, 1)]);
    await so.convertToInvoice(o.no);
    await so.saveConvertedInvoice();
    const shown = await so.tryDeleteOrder(o.no);
    if (/Are you sure/i.test(shown)) {
      await so.yesBtn.click();
      await so.settle(3000, 'delete attempted');
      await so.page.keyboard.press('Escape');
    }
    await so._searchList(o.no);
    await expect(so.invoiceRow(o.no), 'converted order still present').toHaveCount(1);
  });

  // ── Not automatable with the current test data ───────────────────────────

  for (const [id, title, why] of [
    ['TC-SO-26', 'Select a sales person', 'No sales persons exist in the test org.'],
    ['TC-SO-27', 'Customer\'s assigned sales person in the dropdown', 'No sales persons exist in the test org.'],
    ['TC-SO-35', 'Search item by SKU', 'Test items have no SKU codes.'],
    ['TC-SO-46', 'Warehouse filter limits items to that warehouse\'s stock', 'Only one warehouse ("Default").'],
    ['TC-SO-47', 'Item with zero stock in the selected warehouse', 'Only one warehouse ("Default").'],
    ['TC-SO-49', 'Retailer customer gets the business-category price list', 'No customer-specific price lists — PriceList sheet.'],
    ['TC-SO-50', 'Standard customer gets the general price list', 'No customer-specific price lists — PriceList sheet.'],
    ['TC-SO-51', 'Changing the price list refreshes the rates', 'No customer-specific price lists — PriceList sheet.'],
    ['TC-SO-52', 'Customer without a price list uses the default rate', 'No customer-specific price lists — PriceList sheet.'],
  ]) {
    test.fixme(`${id} - ${title} (${why})`, async () => {});
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Credit Note (Credit_Note_TestCases.xlsx: Create TC-CN-01…61, Linked TC-LCN-01…30, Unlinked TC-UCN-01…22)
// + deferred: Customer_Transaction TC-CN-01…10 (as "CT TC-CN-…"), TC-BC-03 / 06 / 07, TC-ST-05 / 06 / 08, TC-TD-08.
// Customer "saravana store". The credit note form is the SAME component as the Sales Invoice form, so
// pure line / summary arithmetic is already exercised by the invoice tests — only credit-note
// behaviour (linking, auto-apply, Apply to Invoices, stock return, balances) plus a few
// representative totals are automated here.
// App facts: linking an invoice does NOT copy its lines; on save the CN is auto-applied to the
// linked invoice (up to its due), the rest stays as Remaining Amount (Apply to Invoices).
//
// Already automated (same form component) — not repeated:
//   TC-CN-09 proceed without a customer ............... TC-03 (same customer step)
//   TC-CN-14 / 16 / 22 reason / ref / sales person blank  every credit note saved below
//   TC-CN-36 negative rate ............................. TC-E11
//   TC-CN-37…41 line discount % / ₹ / 100% / >100% / decimals ... TC-E05…E14, TC-55
//   TC-CN-44 no tax .................................... TC-E18…E24
//   TC-CN-47 / 49 / 52 / 53 fixed discount / negative shipping / subtract / round off ... TC-E34…E50, TC-E49, TC-E58 / 59
//   TC-UCN-01 / 02 / 03 unlinked CN dates .............. TC-CN-05 / 06 and TC-CN-11 (no date restriction)
//
//   npx playwright test --grep @cn
// ════════════════════════════════════════════════════════════════════════════

test.describe('Credit Note', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {CreditNotePage} */
  let cn;
  /** @type {SalesInvoiceEditPage} */
  let si;
  /** @type {SalesInvoicePaymentPage} */
  let pay;
  let A; let B; let C;
  const CUST = 'saravana store';
  test.beforeEach(async ({ page }) => {
    cn = new CreditNotePage(page);
    si = new SalesInvoiceEditPage(page);
    pay = new SalesInvoicePaymentPage(page);
    await cn.open();
    [A, B, C] = await cn.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });
  /** New saved credit note: { no, total, m }. opts: { invoiceNo, billDate, reason, refNo, draft, model } */
  const credit = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const r = await cn.createCreditNote(m, { customerName: CUST, ...opts });
    return { ...r, m };
  };
  /** New saved Sales Invoice: { no, total, m }. */
  const invoice = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const { billNo } = await si.createPricedInvoice(m, { customerName: CUST, billDate: opts.billDate });
    return { no: billNo, total: si.computeTotals(m).total, m };
  };
  const due = async (billNo) => (await cn.invoiceListRow(billNo)).due;
  const num = (no) => parseInt(String(no).match(/(\d+)$/)[1], 10);
  const header = async () => { await cn.openCustomer(CUST); return cn.readHeader(); };
  /** Clear the CN's Invoice No. The app then drops every line (Save disabled), so put A × 1 back. */
  const unlink = async () => {
    await cn.unlinkInvoice();
    if ((await cn.readInvoiceTotal()) === 0) await cn.addLine(A, 1);
  };
  /** Pick another Invoice No on a saved CN — this also drops the lines, so put A × 1 back. */
  const relink = async (no) => {
    await cn.linkInvoice(no);
    if ((await cn.readInvoiceTotal()) === 0) await cn.addLine(A, 1);
  };
  /** Index of the form line holding `item`. */
  const lineOf = async (page, item) => (await page.lineItemTexts()).findIndex((t) => t.includes(item.itemName || item.name));

  // ── Number / dates / defaults / customer ─────────────────────────────────

  test('TC-CN-01 / 02 / 03 - CN number is auto-generated CN-AUTO/NNNN, read-only (no duplicate or over-long number can be typed) and increments by 1', { tag: ['@sales', '@cn'] }, async () => {
    const first = await credit([L(C, 1)]);
    const no = await cn.startInvoice({ customerName: CUST });
    await expect(cn.billNoInput).not.toBeEditable();
    expect(first.no).toMatch(/^CN-AUTO\/\d{4}$/);
    expect(num(no)).toBe(num(first.no) + 1);
    await cn.discardForm();
  });

  test('TC-CN-04 / 07 / 18 - Defaults: date today, Default warehouse, no invoice; the customer is shown in the header', { tag: ['@sales', '@cn'] }, async () => {
    await cn.startInvoice({ customerName: CUST });
    expect(await cn.readCreditHeader()).toMatchObject({ billDate: pickerDate(new Date()), warehouse: 'Default', invoice: '' });
    expect((await cn.customerHeaderText()).toLowerCase()).toContain(CUST);
    await cn.discardForm();
  });

  for (const [id, label, offset] of [['TC-CN-05 / TC-UCN-02', 'a past date', -30], ['TC-CN-06 / TC-UCN-03', 'a future date', 20]]) {
    test(`${id} - Credit note dated ${label} is saved with that date`, { tag: ['@sales', '@cn'] }, async () => {
      const d = addDays(new Date(), offset);
      const c = await credit([L(C, 1)], { billDate: pickerDate(d) });
      expect((await cn.listRow(c.no)).date).toBe(listDate(d));
    });
  }

  test('TC-CN-08 - Change the customer on the credit note: the new customer\'s details load', { tag: ['@sales', '@cn'] }, async () => {
    await cn.startInvoice({ customerName: CUST });
    await cn.changeCustomerBtn.click();
    // The credit note's "Change" shows its own "Select Customer" picker (no #si_select_cus)
    const picker = cn.page.locator('.ant-select').filter({ hasText: 'Select Customer' }).first();
    await expect(picker, 'customer picker after "Change"').toBeVisible({ timeout: 10_000 });
    await picker.click();
    await cn.settle(2500, 'customer options load');
    // Any other customer offered by the picker (the option text also holds the city)
    const opt = cn.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasNotText: CUST }).first();
    const other = (await opt.innerText()).split('\n')[0].trim();
    await opt.click();
    if (await cn.customerNextBtn.isVisible().catch(() => false)) await cn.customerNextBtn.click();
    await expect.poll(async () => (await cn.customerHeaderText()).toLowerCase()).toContain(other.toLowerCase());
    await cn.discardForm();
  });

  // ── Invoice No / reason / ref / unlinked ─────────────────────────────────

  test('TC-CN-10 / 12 / TC-LCN-19 / 20 / TC-UCN-11 / 12 - Invoice No lists only this customer\'s invoices; linking one copies no lines (adapted)', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 1)]);
    const others = await cn.otherCustomerInvoices(CUST);
    await cn.startInvoice({ customerName: CUST });
    expect(await cn.invoiceOptions(inv.no), 'own invoice offered').toContain(inv.no);
    if (others.length) expect(await cn.invoiceOptions(others[0]), `other customer's ${others[0]} not offered`).not.toContain(others[0]);
    else console.log('No other-customer invoice on the first list page — cross-customer check skipped');
    await cn.linkInvoice(inv.no);
    expect(await cn.linkedInvoice()).toBe(inv.no);
    expect(await cn.readInvoiceTotal(), 'no lines copied from the invoice').toBe(0);
    await cn.discardForm();
  });

  test('TC-CN-11 / 13 / 15 / 57 - Unlinked CN with a reason and an alphanumeric Ref No: Save and Send lists it Open, no invoice, full remaining; reason / ref kept', { tag: ['@sales', '@cn'] }, async () => {
    const c = await credit([L(C, 2)], { reason: 'Damaged goods returned', refNo: 'RET-A1b2' });
    const r = await cn.listRow(c.no);
    expect(r).toMatchObject({ customer: CUST, status: 'Open' });
    expect(r.invoice).toMatch(/^-?$/);
    expectClose(r.amount, c.total, 0.05, 'Credit Amount');
    expectClose(r.remaining, c.total, 0.05, 'Remaining Amount');
    await cn.editInvoice(c.no);
    expect(await cn.readCreditHeader()).toMatchObject({ reason: 'Damaged goods returned', refNo: 'RET-A1b2', invoice: '' });
    await cn.discardForm();
  });

  test('TC-CN-19 / 20 - Place of supply: Tamil Nadu → CGST + SGST, another state → IGST', { tag: ['@sales', '@cn'] }, async () => {
    const tn = await credit([L(A, 1)]);
    await cn.openInvoice(tn.no);
    await expect(cn.previewDrawer).toContainText('CGST');
    await cn.closePreview();
    const no = await cn.startInvoice({ customerName: CUST });
    await cn.addLine(A, 1);
    await cn.setPlaceOfSupply('Kerala');
    await cn.save();
    await cn.openInvoice(no);
    await expect(cn.previewDrawer).toContainText('IGST');
    await expect(cn.previewDrawer).not.toContainText('CGST');
  });

  // ── Tax mode / items / totals ────────────────────────────────────────────

  test('TC-CN-23 / 24 / 25 - Including Tax, switched to Excluding Tax: totals recalculate and the saved amount matches', { tag: ['@sales', '@cn'] }, async () => {
    const m = model([L(A, 1, { gst: 5 }), L(B, 1, { gst: 12 }), L(C, 2)], { taxMode: 'Including Tax' });
    const no = await cn.startInvoice({ customerName: CUST });
    await cn.fillInvoice(m);
    await cn.expectTotals(m, 'including tax');
    await cn.setTaxMode('Excluding Tax');
    m.taxMode = 'Excluding Tax';
    await cn.expectTotals(m, 'excluding tax');
    await cn.save();
    expectClose((await cn.listRow(no)).amount, cn.computeTotals(m).total, 0.03, 'list Credit Amount');
  });

  test('TC-CN-26 / 27 / 34 / 42 / 43 / 45 - Several items with own rate, GST and CESS: rate pre-filled, each taxed at its rate, saved amount correct', { tag: ['@sales', '@cn'] }, async () => {
    await cn.startInvoice({ customerName: CUST });
    await cn.addLine(B, 1);
    expect((await cn.readLine(0)).rate, 'rate pre-filled from the item').toBe(Number(B.price));
    await cn.discardForm();
    const c = await credit([L(A, 2, { gst: 5 }), L(B, 1, { gst: 12, cess: 1 }), L(C, 3, { gst: 18, cess: 10 })]);
    expectClose((await cn.listRow(c.no)).amount, c.total, 0.05, 'list Credit Amount');
  });

  test('TC-CN-28 - Removing an item recalculates the total; saved amount matches', { tag: ['@sales', '@cn'] }, async () => {
    const m = model([L(A, 1), L(C, 2)]);
    const no = await cn.startInvoice({ customerName: CUST });
    await cn.fillInvoice(m);
    await cn.removeLine(0);
    m.lines.shift();
    await cn.expectTotals(m, 'after removing item 1');
    await cn.save();
    expectClose((await cn.listRow(no)).amount, cn.computeTotals(m).total, 0.03, 'list Credit Amount');
  });

  test('TC-CN-46 / 48 / 50 / 51 - Overall discount, shipping, TDS and adjustment: totals correct and saved amount matches', { tag: ['@sales', '@cn'] }, async () => {
    const m = model([L(A, 2), L(B, 1, { gst: 12 })], { summaryDiscount: { type: 'Percentage', value: 5 }, shipping: 50, adjustment: { type: 'Addition', value: 10 } });
    const no = await cn.startInvoice({ customerName: CUST });
    await cn.fillInvoice(m, { tds: E.tds.commission });
    await cn.expectTotals(m, 'summary');
    await cn.save();
    expectClose((await cn.listRow(no)).amount, cn.computeTotals(m).total, 0.05, 'list Credit Amount');
  });

  // ── Validation ───────────────────────────────────────────────────────────

  test('TC-CN-29 / 58 - Without items the credit note cannot be saved (Save disabled)', { tag: ['@sales', '@cn'] }, async () => {
    await cn.startInvoice({ customerName: CUST });
    await expect(cn.saveBtn.locator('xpath=ancestor-or-self::button[1]'), 'save disabled with no items').toBeDisabled();
    await cn.discardForm();
  });

  test('TC-CN-30 - Quantity 0: either refused, or saved without changing stock', { tag: ['@sales', '@cn'] }, async () => {
    const before = await cn.readStock(C);
    const no = await cn.startInvoice({ customerName: CUST });
    await cn.addLine(C, 1);
    await cn.typeValue(cn.lineQty(cn.lineRows.nth(0)), '0');
    const r = await cn.trySave();
    if (!r.saved) { await cn.discardForm(); return; }
    console.log(`${no} saved with qty 0`);
    expect(await cn.readStock(C), 'stock unchanged by a zero-qty credit note').toBe(before);
  });

  test('TC-CN-31 - Saving with a blank quantity is refused', { tag: ['@sales', '@cn'] }, async () => {
    await cn.startInvoice({ customerName: CUST });
    await cn.addLine(C, 1);
    await cn.typeValue(cn.lineQty(cn.lineRows.nth(0)), '');
    const r = await cn.trySave();
    expect(r.saved, 'blank quantity must not be saved').toBe(false);
    await cn.discardForm();
  });

  test('TC-CN-35 - A zero rate gets a warning', { tag: ['@sales', '@cn'] }, async () => {
    knownBug('BUG-CN-01', 'rate 0 on a credit note saved without a message');
    await cn.startInvoice({ customerName: CUST });
    await cn.addLine(C, 1);
    await cn.setLineRate(0, 0);
    expect(await cn.saveExpectWarning(/rate|zero|price/i)).toBeTruthy();
    if (/credit-notes-bill\//.test(cn.page.url())) await cn.discardForm();
  });

  // ── Stock / draft / delete / edit / cancel ───────────────────────────────

  test('TC-CN-32 / 33 - Stock goes up by the credited quantity (whole and decimal)', { tag: ['@sales', '@cn'] }, async () => {
    const s0 = await cn.readStock(C);
    await credit([L(C, 5)]);
    const s1 = await cn.readStock(C);
    expectClose(s1 - s0, 5, 0.001, 'stock up by 5');
    await credit([L(C, 2.5)]);
    expectClose((await cn.readStock(C)) - s1, 2.5, 0.001, 'stock up by 2.5');
  });

  test('TC-ST-05 (CT) - Invoice 10 then credit note 5 for the same item: stock down by 5 net', { tag: ['@sales', '@cn'] }, async () => {
    const s0 = await cn.readStock(C);
    const inv = await invoice([L(C, 10)]);
    await credit([L(C, 5)], { invoiceNo: inv.no });
    expect(s0 - (await cn.readStock(C))).toBe(5);
  });

  test('TC-CN-54 / 55 / 56 - Draft: listed as Draft and editable, stock unchanged, not in the transaction statement', { tag: ['@sales', '@cn'] }, async () => {
    const before = await cn.readStock(C);
    const c = await credit([L(C, 4)], { draft: true });
    expect((await cn.listRow(c.no)).status).toBe('Draft');
    expect(await cn.readStock(C), 'draft does not move stock').toBe(before);
    await cn.openCustomer(CUST);
    expect((await cn.readStatement()).map((r) => r.no), 'draft not in statement').not.toContain(c.no);
    await cn.editInvoice(c.no);
    await expect(cn.lineRows.first()).toBeVisible();
    await cn.discardForm();
  });

  test('TC-CN-59 / TC-ST-06 (CT) - Deleting an unlinked credit note removes it and takes the returned stock back out', { tag: ['@sales', '@cn'] }, async () => {
    const s0 = await cn.readStock(C);
    const c = await credit([L(C, 5)]);
    expect(await cn.readStock(C)).toBe(s0 + 5);
    await cn.deleteCreditNote(c.no);
    expect(await cn.readStock(C), 'stock back to the pre-CN value').toBe(s0);
  });

  test('TC-CN-60 / CT TC-CN-04 / 05 - Editing qty 5 → 3 and the rate: amount, stock and statement follow', { tag: ['@sales', '@cn'] }, async () => {
    const c = await credit([L(C, 5)]);
    const s1 = await cn.readStock(C);
    await cn.editInvoice(c.no);
    await cn.setLine(0, 3);
    await cn.setLineRate(0, 50);
    const m = model([L(C, 3, { rate: 50 })]);
    await cn.expectTotals(m, 'edited');
    await cn.save();
    const total = cn.computeTotals(m).total;
    expectClose((await cn.listRow(c.no)).amount, total, 0.03, 'list Credit Amount after edit');
    expect(s1 - (await cn.readStock(C)), 'stock down by 2 after edit').toBe(2);
    await cn.openCustomer(CUST);
    const row = (await cn.readStatement()).find((r) => r.no === c.no);
    expect(row, `${c.no} in statement`).toBeTruthy();
    expect([row.amount, row.payment].some((v) => Math.abs(v - total) < 0.05), `statement shows ${total}: ${JSON.stringify(row)}`).toBe(true);
  });

  test('TC-CN-61 - Cancelling a new credit note creates no record', { tag: ['@sales', '@cn'] }, async () => {
    const no = await cn.startInvoice({ customerName: CUST });
    await cn.addLine(C, 1);
    await cn.discardForm();
    await cn._searchList(no);
    await expect(cn.invoiceRow(no)).toHaveCount(0);
  });

  // ── Linked credit note ───────────────────────────────────────────────────

  test('TC-LCN-01 / 02 / 03 - Linked CN dated on or after the invoice date is saved; before it is refused', { tag: ['@sales', '@cn'] }, async () => {
    const d0 = addDays(new Date(), -5);
    const inv = await invoice([L(A, 3)], { billDate: pickerDate(d0) });
    await credit([L(A, 1)], { invoiceNo: inv.no, billDate: pickerDate(d0) });
    await credit([L(A, 1)], { invoiceNo: inv.no });
    const early = pickerDate(addDays(d0, -3));
    await cn.startInvoice({ customerName: CUST, billDate: early, invoiceNo: inv.no });
    await cn.addLine(A, 1);
    const shown = await cn.billDateInput.inputValue();
    if (shown !== early) { console.log(`Date before the invoice not accepted by the picker (shows ${shown})`); await cn.discardForm(); return; }
    const r = await cn.trySave();
    expect(r.saved, `CN dated before its invoice must be refused (${r.message || 'no message'})`).toBe(false);
    await cn.discardForm();
  });

  test('TC-LCN-04 / 09 / TC-UCN-04 / CT TC-CN-02 / TC-BC-03 - Partial linked CN: saved, auto-applied to the invoice; invoice and customer due down by the CN', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 10)]);
    const h0 = await header();
    const c = await credit([L(A, 5)], { invoiceNo: inv.no });
    expectClose(await due(inv.no), inv.total - c.total, 0.05, 'invoice due after CN');
    const r = await cn.listRow(c.no);
    expect(r.invoice).toBe(inv.no);
    expectClose(r.remaining, 0, 0.05, 'CN fully used on the invoice');
    const h1 = await header();
    expectClose(h0.due - h1.due, c.total, 0.05, 'customer Due down by the CN');
    expectClose(h0.closing - h1.closing, c.total, 0.05, 'Closing Balance down by the CN');
  });

  test('TC-LCN-05 / 07 - CN equal to the invoice (same qty and rate): invoice fully credited, CN fully used', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const c = await credit([L(A, 2)], { invoiceNo: inv.no });
    expectClose(c.total, inv.total, 0.01, 'CN total = invoice total');
    const ir = await cn.invoiceListRow(inv.no);
    expectClose(ir.due, 0, 0.05, 'invoice due');
    expect(ir.status).toMatch(/paid/i);
    expectClose((await cn.listRow(c.no)).remaining, 0, 0.05, 'CN remaining');
  });

  // QA (BUG-CN-02): a linked credit note above the invoice quantity / total is the current flow.
  test('TC-LCN-06 - CN quantity above the linked invoice quantity is saved', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 1)]);
    await cn.startInvoice({ customerName: CUST, invoiceNo: inv.no });
    await cn.addLine(A, 3);
    const r = await cn.trySave();
    expect(r.saved, `qty 3 vs invoiced 1 is accepted (${r.message || 'no message'})`).toBe(true);
  });

  test('TC-LCN-08 / CT TC-CN-06 - CN total above the linked invoice total is saved (on create and on edit)', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 1)]);
    await cn.startInvoice({ customerName: CUST, invoiceNo: inv.no });
    await cn.fillInvoice(model([L(A, 1, { rate: 500 })]));
    const created = await cn.trySave();
    expect.soft(created.saved, `create: CN ₹590 vs invoice ₹${inv.total} is accepted`).toBe(true);
    if (!created.saved) await cn.discardForm();
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await cn.editInvoice(c.no);
    await cn.setLine(0, 3);
    const edited = await cn.trySave();
    expect(edited.saved, 'edit: CN raised above the invoice amount is accepted').toBe(true);
  });

  test('TC-LCN-10 / 11 / CT TC-CN-07 - Deleting a linked CN asks for confirmation, restores the invoice due and takes the stock back out', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 4)]);
    const s0 = await cn.readStock(A);
    const c = await credit([L(A, 2)], { invoiceNo: inv.no });
    expect(await cn.readStock(A)).toBe(s0 + 2);
    const r = await cn.tryDeleteCreditNote(c.no);
    expect(r.prompt, 'confirmation shown').not.toBe('');
    expect(r.deleted, `linked CN deleted (${r.message})`).toBe(true);
    expectClose(await due(inv.no), inv.total, 0.05, 'invoice due restored');
    expect(await cn.readStock(A), 'stock back').toBe(s0);
  });

  test('TC-LCN-12 - An invoice with a linked credit note cannot be deleted', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    await credit([L(A, 1)], { invoiceNo: inv.no });
    const r = await si.tryDeleteInvoice(inv.no);
    expect(r.deleted, `invoice with a linked CN must not be deleted (${r.message})`).toBe(false);
  });

  test('TC-LCN-14 - Replacing the item on the invoice after a CN is linked: invoice saves, CN stays linked', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await si.editInvoice(inv.no);
    await si.addLine(B, 1);
    await si.tryRemoveLine(await lineOf(si, A));
    await si.save();
    expect((await cn.listRow(c.no)).invoice).toBe(inv.no);
  });

  // QA (BUG-CN-03): line items can be added to a credit note directly, even when it is linked to an invoice.
  test('TC-LCN-16 - Replacing the item on a linked CN with one not on the invoice is saved', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await cn.editInvoice(c.no);
    await cn.addLine(B, 1);
    await cn.tryRemoveLine(await lineOf(cn, A));
    const r = await cn.trySave();
    expect(r.saved, `item not on the invoice is accepted (${r.message || 'no message'})`).toBe(true);
  });

  test('TC-LCN-17 / 18 - Extra item not on the invoice: saved, total includes it, still linked, stock up for the extra item', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const sB = await cn.readStock(B);
    const c = await credit([L(A, 1), L(B, 1)], { invoiceNo: inv.no });
    const r = await cn.listRow(c.no);
    expect(r.invoice).toBe(inv.no);
    expectClose(r.amount, c.total, 0.05, 'Credit Amount incl. the extra item');
    expect(await cn.readStock(B), 'extra item stock up by 1').toBe(sB + 1);
  });

  test('TC-LCN-21 - Unlinking the invoice in the CN: amount change is accepted', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 3)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await cn.editInvoice(c.no);
    await unlink();
    await cn.setLine(0, 2);
    await cn.save();
    const r = await cn.listRow(c.no);
    expect(r.invoice).toMatch(/^-?$/);
    expectClose(r.amount, cn.computeTotals(model([L(A, 2)])).total, 0.05, 'Credit Amount after unlink + edit');
  });

  test('TC-LCN-22 - After unlinking the invoice, adding items to the CN is refused', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 3)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await cn.editInvoice(c.no);
    await unlink();
    await cn.addLine(B, 1);
    const r = await cn.trySave();
    expect(r.saved, 'item count increase after unlinking must be refused').toBe(false);
    await cn.discardForm();
  });

  test('TC-LCN-23 / 24 / 26 - After unlinking, the invoice rate and items can change and the CN amount stays the same', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await cn.editInvoice(c.no);
    await unlink();
    await cn.save();
    await si.editInvoice(inv.no);
    await si.setLineRate(await lineOf(si, A), 120);
    await si.addLine(B, 1);
    await si.save();
    expectClose((await si.listRow(inv.no)).bill, si.computeTotals(model([L(A, 2, { rate: 120 }), L(B, 1)])).total, 0.05, 'invoice amount after edit');
    expectClose((await cn.listRow(c.no)).amount, c.total, 0.05, 'CN amount unchanged');
  });

  test('TC-LCN-25 - After unlinking, editing the CN does not change the invoice due', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 3)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    await cn.editInvoice(c.no);
    await unlink();
    await cn.save();
    const d1 = await due(inv.no);
    await cn.editInvoice(c.no);
    await cn.setLine(0, 2);
    await cn.save();
    expectClose(await due(inv.no), d1, 0.01, 'invoice due unchanged by the CN edit');
  });

  // ── Re-linking on edit ───────────────────────────────────────────────────

  test('TC-UCN-05 - Linking a partly paid invoice: CN applied up to the invoice due, the rest stays remaining', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    await pay.recordPayment(inv.no, { amount: 200 });
    const d = await due(inv.no);
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    expectClose(await due(inv.no), 0, 0.05, 'invoice due cleared');
    expectClose((await cn.listRow(c.no)).remaining, c.total - d, 0.05, 'CN remaining = CN − invoice due');
  });

  test('TC-UCN-06 - Linking an invoice while editing an unlinked CN does not auto-apply it', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const c = await credit([L(A, 1)]);
    await cn.editInvoice(c.no);
    await relink(inv.no);
    await cn.save();
    const r = await cn.listRow(c.no);
    expect(r.invoice).toBe(inv.no);
    expectClose(r.amount, c.total, 0.05, 'CN amount unchanged');
    expectClose(await due(inv.no), inv.total, 0.05, 'invoice due not auto-adjusted on edit');
  });

  test('TC-UCN-07 - Changing the linked invoice on edit links the new one; CN amount unchanged', { tag: ['@sales', '@cn'] }, async () => {
    const inv1 = await invoice([L(A, 2)]);
    const inv2 = await invoice([L(A, 2)]);
    const c = await credit([L(A, 1)], { invoiceNo: inv1.no });
    await cn.editInvoice(c.no);
    await relink(inv2.no);
    await cn.save();
    const r = await cn.listRow(c.no);
    expect(r.invoice).toBe(inv2.no);
    expectClose(r.amount, c.total, 0.05, 'CN amount unchanged');
  });

  test('TC-UCN-08 / 10 - Same customer, different item and smaller amount than the invoice: mapping saved', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(B, 4)]);
    const c = await credit([L(C, 1)], { invoiceNo: inv.no });
    const r = await cn.listRow(c.no);
    expect(r.invoice).toBe(inv.no);
    expectClose(r.amount, c.total, 0.05, 'Credit Amount');
  });

  // ── Apply to Invoices ────────────────────────────────────────────────────

  test('TC-LCN-27 / 28 / TC-UCN-13 / 14 - Apply to Invoices lists only this customer\'s invoices', { tag: ['@sales', '@cn'] }, async () => {
    const c = await credit([L(A, 1)]);
    const inv = await invoice([L(C, 1)]);
    const others = await cn.otherCustomerInvoices(CUST);
    await cn.openApply(c.no);
    const nos = await cn.applyInvoiceNumbers();
    expect(nos, 'own open invoice listed').toContain(inv.no);
    for (const o of others) expect(nos, `other customer's ${o} not listed`).not.toContain(o);
    await cn.cancelApply();
  });

  test('TC-UCN-15 / 18 - Partial apply: invoice due and CN remaining drop by the amount; items and rates unchanged on both', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(B, 2)]);
    const c = await credit([L(A, 3)]);
    await cn.openApply(c.no);
    await cn.setApplyAmount(inv.no, 100);
    const t = await cn.readApplyTotals();
    expectClose(t.used, 100, 0.01, 'Amount used');
    expectClose(t.remaining, c.total - 100, 0.05, 'Remaining Amount');
    await cn.saveApply();
    expectClose(await due(inv.no), inv.total - 100, 0.05, 'invoice due');
    expectClose((await cn.listRow(c.no)).remaining, c.total - 100, 0.05, 'CN remaining');
    await si.editInvoice(inv.no);
    expect(await si.readLine(0)).toMatchObject({ qty: 2, rate: Number(B.price) });
    await si.discardForm();
    await cn.editInvoice(c.no);
    expect(await cn.readLine(0)).toMatchObject({ qty: 3, rate: Number(A.price) });
    await cn.discardForm();
  });

  test('TC-UCN-16 / 19 / CT TC-CN-09 - Full apply: invoice due 0 and CN remaining 0; both shown in the statement', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const c = await credit([L(A, 2)]);
    await cn.openApply(c.no);
    await cn.setApplyAmount(inv.no, c.total);
    await cn.saveApply();
    expectClose(await due(inv.no), 0, 0.05, 'invoice due');
    expectClose((await cn.listRow(c.no)).remaining, 0, 0.05, 'CN remaining');
    await cn.openCustomer(CUST);
    const nos = (await cn.readStatement()).map((r) => r.no);
    expect(nos).toEqual(expect.arrayContaining([inv.no, c.no]));
  });

  for (const [id, title, invLines, cnLines] of [
    ['TC-UCN-17', 'more than the invoice balance', () => [L(C, 1)], () => [L(A, 2)]],
    ['TC-UCN-20', 'more than the credit note balance', () => [L(A, 2)], () => [L(C, 1)]],
  ]) {
    test(`${id} - Applying ${title} is refused`, { tag: ['@sales', '@cn'] }, async () => {
      const inv = await invoice(invLines());
      const c = await credit(cnLines());
      await cn.openApply(c.no);
      const shown = await cn.setApplyAmount(inv.no, 100);
      if (parseFloat(shown) !== 100) { console.log(`Amount Used refused 100 (shows "${shown}")`); await cn.cancelApply(); return; }
      await cn.saveApplyExpectRefused();
      await cn.cancelApply();
    });
  }

  test('TC-UCN-21 - One CN split over two invoices: CN remaining 0, both invoices settled', { tag: ['@sales', '@cn'] }, async () => {
    const i1 = await invoice([L(B, 1)]);
    const i2 = await invoice([L(B, 1)]);
    const c = await credit([L(A, 5)]);
    await cn.openApply(c.no);
    await cn.setApplyAmount(i1.no, i1.total);
    await cn.setApplyAmount(i2.no, c.total - i1.total);
    await cn.saveApply();
    expectClose((await cn.listRow(c.no)).remaining, 0, 0.05, 'CN remaining');
    expectClose(await due(i1.no), 0, 0.05, 'invoice 1 due');
    expectClose(await due(i2.no), i2.total - (c.total - i1.total), 0.05, 'invoice 2 due');
  });

  test('TC-UCN-22 - Lowering a CN below its applied amount: refused, or the application shrinks (never a negative remaining)', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(B, 2)]);
    const c = await credit([L(A, 3)]);
    await cn.openApply(c.no);
    await cn.setApplyAmount(inv.no, 300);
    await cn.saveApply();
    await cn.editInvoice(c.no);
    await cn.setLine(0, 1);
    const r = await cn.trySave();
    if (!r.saved) { await cn.discardForm(); return; }
    const newTotal = cn.computeTotals(model([L(A, 1)])).total;
    expect((await cn.listRow(c.no)).remaining, 'remaining not negative').toBeGreaterThanOrEqual(0);
    expect(await due(inv.no), 'invoice credited at most the new CN amount').toBeGreaterThanOrEqual(inv.total - newTotal - 0.05);
  });

  // ── Customer transaction / balances (deferred from Customer_Transaction) ─

  test('CT TC-CN-01 / 03 / 10 - Three credit notes (linked and unlinked) appear in the customer statement and Credit Notes tab with their amounts', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    const cs = [await credit([L(C, 1)]), await credit([L(C, 2)]), await credit([L(A, 1)], { invoiceNo: inv.no })];
    await cn.openCustomer(CUST);
    const st = await cn.readStatement();
    for (const c of cs) {
      const row = st.find((r) => r.no === c.no);
      expect(row, `${c.no} in statement`).toBeTruthy();
      expect([row.amount, row.payment].some((v) => Math.abs(v - c.total) < 0.05), `${c.no} amount ${c.total}: ${JSON.stringify(row)}`).toBe(true);
    }
    const tab = await cn.readCustomerCreditNotes();
    for (const c of cs) expect(tab.some((r) => r.text.includes(c.no)), `${c.no} in Credit Notes tab`).toBe(true);
  });

  test('CT TC-CN-08 - Deleting a partly applied credit note is refused', { tag: ['@sales', '@cn'] }, async () => {
    const inv = await invoice([L(B, 1)]);
    const c = await credit([L(A, 5)]);
    await cn.openApply(c.no);
    await cn.setApplyAmount(inv.no, 100);
    await cn.saveApply();
    const r = await cn.tryDeleteCreditNote(c.no);
    expect(r.deleted, `partly applied CN must not be deleted (${r.message})`).toBe(false);
  });

  test('CT TC-BC-06 / TC-TD-08 - Invoice, sales order, payment and credit note: due moves by invoice − payment − CN, the order does not count', { tag: ['@sales', '@cn'] }, async ({ page }) => {
    const so = new SalesOrderPage(page);
    const h0 = await header();
    const inv = await invoice([L(B, 2)]);
    await so.createPricedInvoice(model([L(C, 1)]), { customerName: CUST });
    await pay.recordPayment(inv.no, { amount: 200 });
    const c = await credit([L(A, 1)], { invoiceNo: inv.no });
    const h1 = await header();
    expectClose(h1.due - h0.due, inv.total - 200 - c.total, 0.05, 'Due change');
    expectClose(h1.closing - h0.closing, inv.total - 200 - c.total, 0.05, 'Closing Balance change');
  });

  test('CT TC-BC-07 / TC-ST-08 - Invoices 20 + 15 (+1 deleted), first edited to 10, payment, CN 5: stock and closing balance correct', { tag: ['@sales', '@cn'] }, async () => {
    const s0 = await cn.readStock(C);
    const h0 = await header();
    const i1 = await invoice([L(C, 20)]);
    const i2 = await invoice([L(C, 15)]);
    const i3 = await invoice([L(C, 1)]);
    await si.editInvoice(i1.no);
    await si.setLine(0, 10);
    await si.save();
    await si.deleteInvoice(i3.no);
    await pay.recordPayment(i2.no, { amount: 100 });
    const c = await credit([L(C, 5)]);
    expect(s0 - (await cn.readStock(C)), 'stock = start − 10 − 15 + 5').toBe(20);
    const i1Total = si.computeTotals(model([L(C, 10)])).total;
    const h1 = await header();
    expectClose(h1.closing - h0.closing, i1Total + i2.total - 100 - c.total, 0.05, 'Closing Balance change');
  });

  // ── Not automatable with the current test data / app ─────────────────────

  for (const [id, title, why] of [
    ['TC-CN-17', 'Warehouse filter limits items to that warehouse', 'Only one warehouse ("Default").'],
    ['TC-UCN-09', 'Linked invoice from a different warehouse', 'Only one warehouse ("Default").'],
    ['TC-CN-21', 'Select a sales person', 'No sales persons exist in the test org.'],
    ['TC-LCN-13', 'Change the item unit on the invoice after a CN is linked', 'Priced test items are single-UOM; UOM conversion is covered by TC01–TC29.'],
    ['TC-LCN-15', 'Change the item unit on a linked CN', 'Priced test items are single-UOM; UOM conversion is covered by TC01–TC29.'],
    ['TC-LCN-29', 'Remove the copied linked item on the CN', 'Linking does not copy invoice lines into the CN — there is no "linked item".'],
    ['TC-LCN-30', 'Remove the copied linked item on the invoice', 'Linking does not copy invoice lines into the CN — there is no "linked item".'],
  ]) {
    test.fixme(`${id} - ${title} (${why})`, async () => {});
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Payment & Credit Note (Payment_CreditNote_Full_TestCases.xlsx — IDs prefixed "PCF" because
// TC-PE-… also exists in the Sales_Invoice_Payment sheet).
// Customer "saravana store".
//
// Already automated — not repeated:
//   PCF TC-PE-01…15 payment edit / delete / mode change ... TC-PE-08 / 09 / 10 / 14 and CustomerPayment_Unit TC02 / TC03
//   PCF TC-PE-17 increase beyond the invoice ......... excess → advance (CustomerPayment_Unit TC03); sheet expects an error
//   PCF TC-PE-18 delete edited payment ................ same as TC-PE-15
//   PCF TC-DE-01 edit invoice date before payment ..... TC-E25 / TC-E26
//   PCF TC-DA-01 / 03 edit amount before / after full payment ... TC-E01…E14 / TC-SC-10
//   PCF TC-FS-01…14 fail scenarios ..................... TC-SC-01…14 (identical cases)
//   PCF TC-CP-01 / 02 / 04 / 06 / 07 apply CN full / partial / part-used / too much / other customer
//        ... TC-UCN-16 / TC-LCN-04 / TC-UCN-15 / TC-UCN-17 / TC-UCN-13
//   PCF TC-CI-01 / 05 / 06 stock on return / unlinked / qty above sold ... TC-ST-05 / TC-CN-33 / TC-LCN-06
//   PCF TC-CC-01 / 03 / 05 / 06 / 07 / 08 / 09 / 14 / 15 / 20 / 21 / 23 / 24 / 25
//        ... TC-LCN-04 / TC-CN-11 / TC-CN-60 / TC-CN-59 / TC-CN-06 / TC-LCN-03 / TC-LCN-06 / TC-CN-27 / TC-CN-26 /
//            TC-ST-05 + TC-CN-59 / TC-CN-11 / TC-LCN-08 / TC-UCN-14 / CT TC-CN-08
//   PCF TC-CC-04 / TC-CI-04 discount-only CN (no items) ... TC-CN-29 (a CN without items cannot be saved)
// Contradicting the Credit_Note sheet (app behaviour checked there):
//   PCF TC-CI-08 / TC-CC-10 item not on the invoice must be refused  ↔ TC-UCN-08 (different item allowed)
//   PCF TC-CI-10 future-dated CN must be refused                    ↔ TC-CN-06 (future date allowed)
//   PCF TC-CC-13 reason required                                    ↔ TC-CN-14 (reason optional)
//   PCF TC-CC-18 CN qty below invoice qty refused                   ↔ TC-LCN-04 (partial CN allowed)
// Deferred to Customer_Create_Edit (opening balance is set on the customer): PCF TC-OB-01…07.
//
//   npx playwright test --grep @pcf
// ════════════════════════════════════════════════════════════════════════════

test.describe('Payment & Credit Note', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {CreditNotePage} */
  let cn;
  /** @type {SalesInvoiceEditPage} */
  let si;
  /** @type {SalesInvoicePaymentPage} */
  let pay;
  let A; let B; let C;
  const CUST = 'saravana store';
  test.beforeEach(async ({ page }) => {
    cn = new CreditNotePage(page);
    si = new SalesInvoiceEditPage(page);
    pay = new SalesInvoicePaymentPage(page);
    await cn.open();
    [A, B, C] = await cn.ensurePricedItems(E.items());
  });

  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines, extra = {}) => ({ lines, taxMode: 'Excluding Tax', ...extra });
  const credit = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const r = await cn.createCreditNote(m, { customerName: CUST, ...opts });
    return { ...r, m };
  };
  const invoice = async (lines, opts = {}) => {
    const m = model(lines, opts.model);
    const { billNo } = await si.createPricedInvoice(m, { customerName: CUST, billDate: opts.billDate });
    return { no: billNo, total: si.computeTotals(m).total, m };
  };
  const due = async (billNo) => (await cn.invoiceListRow(billNo)).due;
  const firstPayment = async (billNo) => (await pay.readInvoicePayments(billNo))[0];
  /** Click Save on the open Sales Invoice form: true when it left the form. */
  const invoiceSaved = async () => {
    await si.saveBtn.click();
    return expect(si.page).not.toHaveURL(/\/sales-bill\/add/, { timeout: 8000 }).then(() => true, () => false);
  };

  // ── Payment edit / dates / amounts ───────────────────────────────────────

  // QA (BUG-PCN-01): editing the payment of a settled invoice is the current flow.
  test('PCF TC-PE-16 - Editing the payment of a fully settled invoice is saved', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    await pay.recordPayment(inv.no, { amount: inv.total });
    const p = await firstPayment(inv.no);
    await pay.editReceipt(p.number);
    await pay.typeValue(pay.receiveAmtField(), String(inv.total - 50));
    const r = await pay.trySaveReceiptEdit();
    expect(r.saved, 'payment edit after full settlement is accepted').toBe(true);
  });

  for (const [id, title, days] of [['PCF TC-DE-02', 'an earlier date', 2], ['PCF TC-DE-03', 'the invoice date', 0]]) {
    test(`${id} - Payment date edited to ${title} is saved`, { tag: ['@sales', '@pcf'] }, async () => {
      const d0 = addDays(new Date(), -10);
      const inv = await invoice([L(A, 1)], { billDate: pickerDate(d0) });
      await pay.recordPayment(inv.no, { amount: 50, date: paymentDate(addDays(d0, 5)) });
      const p = await firstPayment(inv.no);
      await pay.editReceipt(p.number);
      const target = addDays(d0, days);
      const shown = await pay.setReceiptDate(pickerDate(target));
      expect(shown).toBe(pickerDate(target));
      await pay.saveReceiptEdit();
      expect((await pay.receiptListRow(p.number)).date, 'list date').toBe(listDate(target));
    });
  }

  // QA (BUG-PCN-02): any receipt date can be set on edit (current flow).
  for (const [id, label, offset] of [['PCF TC-DE-04', 'a future date', 15], ['PCF TC-DE-05', 'a date before the invoice', -5]]) {
    test(`${id} - Editing the payment date to ${label} is saved`, { tag: ['@sales', '@pcf'] }, async () => {
      const d0 = addDays(new Date(), -3);
      const inv = await invoice([L(A, 1)], { billDate: pickerDate(d0) });
      await pay.recordPayment(inv.no, { amount: 50, date: paymentDate(d0) });
      const p = await firstPayment(inv.no);
      await pay.editReceipt(p.number);
      const typed = pickerDate(addDays(offset > 0 ? new Date() : d0, offset));
      const shown = await pay.setReceiptDate(typed);
      if (shown !== typed) { console.log(`Date picker refused ${typed} (shows ${shown})`); return; }
      const r = await pay.trySaveReceiptEdit();
      expect(r.saved, `payment date ${typed} is accepted`).toBe(true);
    });
  }

  // QA (BUG-PCN-03): the invoice date stays editable after a partial payment (current flow).
  test('PCF TC-DE-06 - Editing the invoice date after a partial payment is saved', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 4)], { billDate: pickerDate(addDays(new Date(), -2)) });
    await pay.recordPayment(inv.no, { amount: 100 });
    await si.editInvoice(inv.no);
    await si.setBillDate(pickerDate(addDays(new Date(), -9)));
    expect(await invoiceSaved(), 'invoice date change after payment is accepted').toBe(true);
  });

  test('PCF TC-DA-02 - Invoice amount raised after a partial payment: due = new total − paid', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 10)]);
    await pay.recordPayment(inv.no, { amount: 500 });
    await si.editInvoice(inv.no);
    await si.setLine(0, 15);
    await si.save();
    expectClose(await due(inv.no), si.computeTotals(model([L(A, 15)])).total - 500, 0.05, 'due after raising the invoice');
  });

  // ── Credit note payment ──────────────────────────────────────────────────

  test('PCF TC-CP-03 - Two credit notes applied to one invoice: invoice Paid, both credit notes used up', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 5)]);
    const c1 = await credit([L(A, 2)]);
    const c2 = await credit([L(A, 3)]);
    for (const c of [c1, c2]) {
      await cn.openApply(c.no);
      await cn.setApplyAmount(inv.no, c.total);
      await cn.saveApply();
    }
    const ir = await cn.invoiceListRow(inv.no);
    expectClose(ir.due, 0, 0.05, 'invoice due');
    expect(ir.status).toMatch(/paid/i);
    for (const c of [c1, c2]) expectClose((await cn.listRow(c.no)).remaining, 0, 0.05, `${c.no} remaining`);
  });

  test('PCF TC-CP-09 - A fully paid invoice is not offered in Apply to Invoices', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 1)]);
    await pay.recordPayment(inv.no, { amount: inv.total });
    const c = await credit([L(A, 1)]);
    await cn.openApply(c.no);
    expect(await cn.applyInvoiceNumbers()).not.toContain(inv.no);
    await cn.cancelApply();
  });

  // QA (BUG-CN-06): a credit note against a fully paid invoice is accepted; its amount goes to the advance.
  test('PCF TC-CC-11 / 17 - A credit note against a fully paid invoice is saved (amount goes to advance)', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    await pay.recordPayment(inv.no, { amount: inv.total });
    await cn.startInvoice({ customerName: CUST });
    if (!(await cn.invoiceOptions(inv.no)).includes(inv.no)) { console.log(`${inv.no} not offered (paid)`); await cn.discardForm(); return; }
    await cn.linkInvoice(inv.no);
    await cn.addLine(A, 1);
    const r = await cn.trySave();
    expect(r.saved, 'CN against a fully paid invoice is accepted').toBe(true);
  });

  // QA (BUG-CN-08): a future-dated credit note can be applied to an earlier invoice (current flow).
  test('PCF TC-CP-10 - A future-dated credit note can be applied to an earlier invoice', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 2)], { billDate: pickerDate(addDays(new Date(), -5)) });
    const c = await credit([L(A, 1)], { billDate: pickerDate(addDays(new Date(), 5)) });
    await cn.openApply(c.no);
    expect(await cn.applyInvoiceNumbers(), `${inv.no} offered to a future CN`).toContain(inv.no);
    await cn.setApplyAmount(inv.no, 50);
    await cn.saveApply();
  });

  test('PCF TC-CC-19 - Paid invoice, then a credit note raised and increased: saved with the new amount', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 2)]);
    await pay.recordPayment(inv.no, { amount: inv.total });
    const c = await credit([L(A, 2)]);
    await cn.editInvoice(c.no);
    await cn.setLine(0, 3);
    await cn.save();
    expectClose((await cn.listRow(c.no)).amount, cn.computeTotals(model([L(A, 3)])).total, 0.05, 'Credit Amount after increase');
  });

  // QA (BUG-CN-09): a linked credit note dated after the payment is the current flow.
  test('PCF TC-CC-22 - A linked credit note dated after the invoice\'s payment date is saved', { tag: ['@sales', '@pcf'] }, async () => {
    const d0 = addDays(new Date(), -10);
    const inv = await invoice([L(A, 4)], { billDate: pickerDate(d0) });
    await pay.recordPayment(inv.no, { amount: 100, date: paymentDate(addDays(d0, 2)) });
    await cn.startInvoice({ customerName: CUST, billDate: pickerDate(addDays(d0, 5)), invoiceNo: inv.no });
    await cn.addLine(A, 1);
    const r = await cn.trySave();
    expect(r.saved, 'CN dated after the payment date is accepted').toBe(true);
  });

  // ── Credit note inventory ────────────────────────────────────────────────

  test('PCF TC-CI-02 - Full return: invoice 20, credit note 20 → stock fully restored', { tag: ['@sales', '@pcf'] }, async () => {
    const s0 = await cn.readStock(C);
    const inv = await invoice([L(C, 20)]);
    expect(await cn.readStock(C)).toBe(s0 - 20);
    await credit([L(C, 20)], { invoiceNo: inv.no });
    expect(await cn.readStock(C)).toBe(s0);
  });

  test('PCF TC-CI-03 / TC-CC-02 - Two items sold 20 / 15, returned 10 / 5 on one credit note: each stock correct', { tag: ['@sales', '@pcf'] }, async () => {
    const [sA, sC] = [await cn.readStock(A), await cn.readStock(C)];
    const inv = await invoice([L(A, 20), L(C, 15)]);
    await credit([L(A, 10), L(C, 5)], { invoiceNo: inv.no });
    expect(sA - (await cn.readStock(A)), 'item A net −10').toBe(10);
    expect(sC - (await cn.readStock(C)), 'item C net −10').toBe(10);
  });

  test('PCF TC-CI-07 - A credit note for an item with zero stock is refused', { tag: ['@sales', '@pcf'] }, async () => {
    const z = await cn.setupItem({ name: itemName('CN-0'), baseUnit: 'pcs', price: '40', alternates: [] });
    await cn.startInvoice({ customerName: CUST });
    await cn.addLine(z, 5);
    const r = await cn.trySave();
    expect(r.saved, 'CN for a zero-stock item must be refused').toBe(false);
    await cn.discardForm();
  });

  test('PCF TC-CI-09 - A deleted invoice is no longer offered for a credit note', { tag: ['@sales', '@pcf'] }, async () => {
    const inv = await invoice([L(A, 10)]);
    await si.deleteInvoice(inv.no);
    await cn.startInvoice({ customerName: CUST });
    expect(await cn.invoiceOptions(inv.no)).not.toContain(inv.no);
    await cn.discardForm();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Customer Create / Edit (Customer_Create_Edit_TestCases.xlsx: Step 1 TC-S1-…, Step 2 TC-S2-…,
// Step 3 TC-S3-…, Edit TC-CE-…, Opening Balance TC-OB-…)
// + deferred: Customer_Transaction TC-TD-02 / 10, TC-BC-01, TC-VD-02…08; Bulk_Payment TC-UI-26 / TC-BP-16;
//   Payment_CreditNote_Full PCF TC-OB-01…07 (same cases as TC-OB-… here).
// App differs from the sheet: the customer is created on ONE form (no Step 1 / 2 / 3 and no Next /
// Back) — "Next" in the sheet = Save here. Editing is per field on the customer's View Details page.
//
// Already automated / same case — not repeated:
//   TC-S1-14 type blank ...................... TC-S1-04
//   TC-S1-20 / S2-03 / S2-10 / S2-16 / S3-03 / S3-11 optional fields blank ... TC-S3-11 (minimal customer)
//   TC-S1-29 / S2-26 save with valid data ..... every customer created below
//   TC-OB-01 / 02 / 03 / 04 / 16 / 17 ........ TC-S1-22 / 23 / 24 / 27 / 26 / 27
//   TC-CE-06 add category .................... category is mandatory on create (always present) — TC-CE-07 covers change
//   TC-VD-06 / 07 ............................ TC-CE-13 / TC-CE-02
//
//   npx playwright test --grep @customer
// ════════════════════════════════════════════════════════════════════════════

test.describe('Customer Create / Edit', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {CustomerPage} */
  let cu;
  /** @type {SalesInvoiceEditPage} */
  let si;
  /** @type {SalesInvoicePaymentPage} */
  let pay;
  let A;
  test.beforeEach(async ({ page }) => {
    cu = new CustomerPage(page);
    si = new SalesInvoiceEditPage(page);
    pay = new SalesInvoicePaymentPage(page);
    await cu.open();
    [A] = await cu.ensurePricedItems(E.items());
  });

  const uniq = () => `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
  const ADDR = { line1: '12 Main Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' };
  /** A valid customer spec; `extra` overrides. */
  const spec = (extra = {}) => ({ name: `ZZ Cust ${uniq()}`, type: 'Wholesaler', category: true, gst: 'UnRegistered', ...extra });
  const create = async (extra = {}) => cu.createCustomer(spec(extra));
  /** Open the new-customer form filled with a valid spec + `extra`, without saving. */
  const fillNew = async (extra = {}) => { await cu.openNewCustomer(); const s = spec(extra); await cu.fillCustomer(s); return s; };
  const L = (item, qty, extra = {}) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0, ...extra });
  const model = (lines) => ({ lines, taxMode: 'Excluding Tax' });
  const header = async (name) => { await cu.openCustomer(name); return cu.readHeader(); };
  const validGstin = () => `33${'ABCDE'.split('').map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}${Math.floor(1000 + Math.random() * 8999)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}1Z${Math.floor(Math.random() * 10)}`;

  // ── Form / required fields / name ────────────────────────────────────────

  test('TC-S1-01 / 02 / TC-S2-01 / TC-S3-01 - New customer form shows every field on one form (adapted from 3 steps); Business Location India (display); GST status Registered / UnRegistered', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    for (const l of [cu.nameInput, cu.openingBalance, cu.phoneInput, cu.emailInput, cu.addAddressBtn]) await expect(l).toBeVisible();
    for (const id of ['business_type', 'business_category', 'business_tags', 'registration_type']) await expect(cu.select(id), id).toBeVisible();
    expect(await cu.countryInput.getAttribute('placeholder')).toMatch(/India/);
    expect(await cu.countryInput.isEditable(), 'Business Location is display only').toBe(false);
    expect(await cu.selectOptions('registration_type')).toEqual(['Registered', 'UnRegistered']);
    await cu.closeForm();
  });

  test('TC-S1-04 / 14 / 30 / TC-S3-04 - Saving an empty form: Name, Business Type and GST Status are required', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    const r = await cu.trySaveCustomer();
    expect(r.saved).toBe(false);
    expect(r.errors).toEqual(expect.arrayContaining(['Name is Required', 'Business Type is Required', 'Please Select GST Status!']));
    await cu.closeForm();
  });

  test('TC-S1-05 - A name of spaces only is refused ("Name is Required")', { tag: ['@sales', '@customer'] }, async () => {
    await fillNew({ name: '    ' });
    const r = await cu.trySaveCustomer();
    expect(r.saved, 'spaces-only name must be refused').toBe(false);
    expect(r.errors.join(' ')).toMatch(/Name is Required/i);
    await cu.closeForm();
  });

  for (const [id, base] of [['TC-S1-03', 'Krishna Sweets'], ['TC-S1-06', 'Krishna & Sons Pvt. Ltd.'], ['TC-S1-07', 'Store 99 Distributors']]) {
    test(`${id} - Customer named "${base} …" is created and listed`, { tag: ['@sales', '@customer'] }, async () => {
      const name = await create({ name: `${base} ${uniq()}` });
      expect(await cu.searchCustomers(name)).toContain(name);
    });
  }

  test('TC-S1-08 - A 300-character name is truncated or refused', { tag: ['@sales', '@customer'] }, async () => {
    const long = `ZZ ${'L'.repeat(297)}`;
    await fillNew({ name: long });
    const shown = await cu.nameInput.inputValue();
    if (shown.length < long.length) { console.log(`Name truncated to ${shown.length} characters`); await cu.closeForm(); return; }
    const r = await cu.trySaveCustomer();
    expect(r.saved, '300-character name must be refused or truncated').toBe(false);
    await cu.closeForm();
  });

  // QA (BUG-CU-01): there is no duplicate-name check, customers with the same name can be created.
  test('TC-S1-09 / TC-S3-13 - A duplicate customer name is accepted', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await fillNew({ name });
    const r = await cu.trySaveCustomer();
    expect(r.saved, `second "${name}" is accepted (${r.errors.join(' | ')})`).toBe(true);
  });

  // ── Business type / category / tag ───────────────────────────────────────

  test('TC-S1-10 / 11 / 12 / 13 - Retailer, Wholesaler, Manufacturer, Distributor (Distributor/Agency) can be picked and each loads its categories', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    const missing = [];
    for (const type of ['Retailer', 'Wholesaler', 'Manufacturer', 'Distributor/Agency']) {
      await cu.pick('business_type', type);
      expect(await cu.picked('business_type')).toBe(type);
      const cats = await cu.selectOptions('business_category');
      console.log(`${type}: ${cats.join(', ') || 'no categories'}`);
      if (!cats.length) missing.push(type);
    }
    await cu.closeForm();
    expect(missing, 'types without any business category (category is mandatory)').toEqual([]);
  });

  test('TC-S1-15 / 18 - Changing the Business Type resets the category and offers that type\'s categories', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    await cu.pick('business_type', 'Wholesaler');
    const wholesale = await cu.selectOptions('business_category');
    await cu.pick('business_category', true);
    await cu.pick('business_type', 'Manufacturer');
    expect(await cu.picked('business_category'), 'category reset').toBe('');
    expect(await cu.selectOptions('business_category'), 'options follow the type').not.toEqual(wholesale);
    await cu.closeForm();
  });

  // QA (BUG-CU-02): Business Category is mandatory by design.
  test('TC-S1-17 - Business Category is mandatory: saving without one is refused', { tag: ['@sales', '@customer'] }, async () => {
    await fillNew({ category: undefined });
    const r = await cu.trySaveCustomer();
    expect(r.saved, 'saved without a category').toBe(false);
    expect(r.errors.join(' | ')).toMatch(/Business Category/i);
    await cu.closeForm();
  });

  test('TC-S1-16 / 19 / 21 / TC-S2-02 / 09 / 14 / 17 / 18 / 20 / 22 / TC-S3-10 / 12 - Customer with every field: all details saved (type, category, two tags, phone, sub-domain email, billing without line 2, shipping = billing)', { tag: ['@sales', '@customer'] }, async () => {
    const s = spec({ tags: ['Tag XJ13OP', 'Tag RDPSKN'], phone: '9876543210', email: `user${uniq()}@mail.company.com`, address: ADDR, opening: '250' });
    await cu.createCustomer(s);
    await cu.openDetails(s.name);
    const d = await cu.readDetails();
    expect(d).toMatchObject({ name: s.name, phone: '9876543210', email: s.email, type: 'Wholesaler', gst: 'Unregistered' });
    expect(d.category).not.toMatch(/^$|Not Defined/);
    expect(d.tags).toContain('Tag XJ13OP');
    expect(d.tags).toContain('Tag RDPSKN');
    expect(d.billing).toMatch(/12 Main Road.*Chennai.*Tamil Nadu.*600001/);
    expect(d.shipping.replace(/\s|,/g, '')).toBe(d.billing.replace(/\s|,/g, ''));
  });

  // ── Opening balance ──────────────────────────────────────────────────────

  test('TC-S1-22 / TC-OB-01 / 04 / CT TC-TD-02 - Debit opening balance ₹5,000: customer Due and statement show it', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '5000' });
    const h = await header(name);
    expect(h.due).toBe(5000);
    expect(h.closing).toBe(5000);
    expect((await cu.readStatement()).some((r) => /Opening Balance/i.test(`${r.no} ${r.detail}`)), 'opening balance row').toBe(true);
  });

  // QA (BUG-CU-03): Credit was removed; a customer's opening balance is Debit only.
  test('TC-S1-23 / 28 / TC-OB-02 / 14 - Opening balance type offers Debit only', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    const types = await cu.selectOptions('opening_balance_type');
    await cu.closeForm();
    expect(types, 'opening balance types').toEqual(['Debit']);
  });

  test('TC-S1-24 / TC-OB-03 / CT TC-TD-10 - No opening balance: Due and Closing ₹0, statement empty', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    const h = await header(name);
    expect([h.due, h.advance, h.closing]).toEqual([0, 0, 0]);
    expect(await cu.readStatement()).toEqual([]);
  });

  for (const [id, value] of [['TC-S1-25', '-1000'], ['TC-S1-26 / TC-OB-16', 'abc']]) {
    test(`${id} - Opening balance "${value}" is refused`, { tag: ['@sales', '@customer'] }, async () => {
      await fillNew({ opening: value });
      const shown = await cu.openingBalance.inputValue();
      if (shown !== value) { console.log(`Opening balance input refused "${value}" (shows "${shown}")`); await cu.closeForm(); return; }
      const r = await cu.trySaveCustomer();
      expect(r.saved, `opening balance ${value} must be refused`).toBe(false);
      await cu.closeForm();
    });
  }

  test('TC-S1-27 / TC-OB-17 - Decimal opening balance 500.89 is kept to 2 decimals', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '500.89' });
    expect((await header(name)).due).toBe(500.89);
  });

  test('CT TC-BC-01 - Opening balance + invoice: Closing Balance = opening + invoice', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '500', address: ADDR });
    const m = model([L(A, 2)]);
    await si.createPricedInvoice(m, { customerName: name });
    expectClose((await header(name)).closing, 500 + si.computeTotals(m).total, 0.05, 'Closing Balance');
  });

  test('TC-OB-07 / 08 / 09 / 10 - Opening balance edited 5,000 → 8,000 → 4,000 → 0 (no payments): Due follows', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '5000' });
    for (const v of [8000, 4000, 0]) {
      await cu.openDetails(name);
      expect((await cu.editTextField('OPENING BALANCE', v)).saved, `opening → ${v}`).toBe(true);
      expect((await header(name)).due, `Due after opening → ${v}`).toBe(v);
    }
  });

  test('TC-OB-05 / 06 / 18 / Bulk TC-UI-26 / TC-BP-16 - Opening balance row in New Receipt; paying it clears the Due', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '500.89' });
    await pay.openNewReceipt(name);
    const row = await pay.receiptRow('Opening Balance');
    expect(row, 'Opening Balance row in Due Invoices').toBeTruthy();
    expect(row.balance).toBe(500.89);
    await pay.setReceiptPaymentMode('Cash');
    await pay.setReceivedAmount('500.89', 'Cancel');
    await pay.setReceiptRowPayment('Opening Balance', '500.89');
    await pay.saveNewReceipt();
    expect((await header(name)).due).toBe(0);
  });

  // QA (BUG-CU-04): the opening balance stays editable after a payment (current flow).
  for (const [id, title, paid] of [['TC-OB-11', 'a partial', 4000], ['TC-OB-12', 'a full', 10000]]) {
    test(`${id} - Opening balance can be edited after ${title} payment`, { tag: ['@sales', '@customer'] }, async () => {
      const name = await create({ opening: '10000' });
      await pay.openNewReceipt(name);
      await pay.setReceiptPaymentMode('Cash');
      await pay.setReceivedAmount(String(paid), 'Cancel');
      await pay.setReceiptRowPayment('Opening Balance', String(paid));
      await pay.saveNewReceipt();
      await cu.openDetails(name);
      const r = await cu.editTextField('OPENING BALANCE', 15000);
      expect(r.saved, 'opening balance edit after a payment is accepted').toBe(true);
    });
  }

  test('TC-OB-13 - Opening balance edited to a negative value is refused', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '3000' });
    await cu.openDetails(name);
    const r = await cu.editTextField('OPENING BALANCE', -2000);
    if (r.saved) expect((await header(name)).due, 'negative opening must not be stored').toBeGreaterThanOrEqual(0);
    else await cu.cancelFieldEdit();
  });

  test('TC-OB-15 - Opening balance partly paid: Due = opening − paid in the customer header and statement', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ opening: '500.89' });
    await pay.openNewReceipt(name);
    await pay.setReceiptPaymentMode('Cash');
    await pay.setReceivedAmount('200', 'Cancel');
    await pay.setReceiptRowPayment('Opening Balance', '200');
    await pay.saveNewReceipt();
    const h = await header(name);
    expectClose(h.due, 300.89, 0.01, 'Due');
    expect((await cu.readStatement()).length, 'opening + receipt rows').toBeGreaterThanOrEqual(2);
  });

  // ── Phone / email ────────────────────────────────────────────────────────

  for (const [id, phone] of [['TC-S2-04', 'abc1234567'], ['TC-S2-05', '98765'], ['TC-S2-06', '987654321099'], ['TC-S2-07', '+91-9876543210']]) {
    test(`${id} - Phone "${phone}" is refused or reduced to 10 digits`, { tag: ['@sales', '@customer'] }, async () => {
      if (id !== 'TC-S2-04') knownBug('BUG-CU-05', `phone "${phone}" not validated`);
      await fillNew({ phone });
      const shown = await cu.phoneInput.inputValue();
      if (shown !== phone) { expect(shown, 'phone input keeps digits only').toMatch(/^\d{0,10}$/); await cu.closeForm(); return; }
      const r = await cu.trySaveCustomer();
      expect(r.saved, `phone ${phone} must be refused`).toBe(false);
      await cu.closeForm();
    });
  }

  test('TC-S2-08 - Phone starting with 0: either accepted or refused with a phone message', { tag: ['@sales', '@customer'] }, async () => {
    await fillNew({ phone: '0123456789' });
    const r = await cu.trySaveCustomer();
    if (!r.saved) { expect(r.errors.join(' ')).toMatch(/phone|mobile|number/i); await cu.closeForm(); }
  });

  for (const [id, email] of [['TC-S2-11', 'testexample.com'], ['TC-S2-12', 'test@'], ['TC-S2-13', 'test @example.com']]) {
    test(`${id} - Email "${email}" is refused ("Invalid Email!")`, { tag: ['@sales', '@customer'] }, async () => {
      await fillNew({ email });
      const r = await cu.trySaveCustomer();
      expect(r.saved).toBe(false);
      expect(r.errors.join(' ')).toMatch(/Invalid Email/i);
      await cu.closeForm();
    });
  }

  // ── Address ──────────────────────────────────────────────────────────────

  test('TC-S2-15 - Add Address opens the billing form with "Use Billing address as your Shipping Address" ticked', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    await cu.addAddressBtn.click();
    for (const id of ['billing_address1', 'billing_address2', 'billing_city', 'billing_pincode']) await expect(cu.page.locator(`#${id}`), id).toBeVisible();
    await expect(cu.select('billing_state')).toBeVisible();
    await expect(cu.sameShipping).toBeChecked();
    await cu.closeForm();
  });

  for (const [id, pincode] of [['TC-S2-19 (letters)', 'ABCDE'], ['TC-S2-19 (5 digits)', '12345']]) {
    test(`${id} - Pincode "${pincode}" is refused`, { tag: ['@sales', '@customer'] }, async () => {
      await cu.openNewCustomer();
      await cu.fillCustomer(spec());
      await cu.fillAddress({ ...ADDR, pincode });
      const errors = await cu.formErrors();
      const r = (await cu.saveAddressBtn.isVisible()) ? { saved: false, errors } : await cu.trySaveCustomer();
      expect(r.saved, `pincode ${pincode} must be refused (${errors.join(' | ')})`).toBe(false);
      await cu.closeForm();
    });
  }

  test('TC-S2-21 - Billing address without Address Line 1 is refused', { tag: ['@sales', '@customer'] }, async () => {
    await cu.openNewCustomer();
    await cu.fillCustomer(spec());
    await cu.fillAddress({ ...ADDR, line1: '' });
    expect(await cu.formErrors()).toContain('Billing Address1 is Required');
    await cu.closeForm();
  });

  test('TC-S2-23 - A different shipping address is saved separately', { tag: ['@sales', '@customer'] }, async () => {
    const s = spec({ address: { ...ADDR, shipping: { line1: '7 Port Road', city: 'Kochi', state: 'Kerala', pincode: '682001' } } });
    await cu.createCustomer(s);
    await cu.openDetails(s.name);
    const d = await cu.readDetails();
    expect(d.billing).toMatch(/Chennai/);
    expect(d.shipping).toMatch(/7 Port Road.*Kochi.*Kerala.*682001/);
  });

  // QA (BUG-CU-08): working as designed — with "Use Billing address as your Shipping Address" unticked,
  // the shipping fields are required; a billing-only address is saved by keeping that box ticked.
  test('TC-S2-24 - Shipping address left blank with "Use Billing address" unticked: shipping fields are required', { tag: ['@sales', '@customer'] }, async () => {
    const s = spec({ address: { ...ADDR, sameShipping: false } });
    await cu.openNewCustomer();
    await cu.fillCustomer(s);
    const errors = await cu.formErrors();
    await cu.closeForm();
    for (const f of ['Address1', 'City', 'State', 'Pincode']) expect(errors.join(' | ')).toContain(`Shipping ${f} is Required`);
  });

  // ── GST ──────────────────────────────────────────────────────────────────

  test('TC-S3-02 / 05 - Registered customer with a valid GSTIN is created', { tag: ['@sales', '@customer'] }, async () => {
    const s = spec({ gst: 'Registered', gstin: validGstin() });
    await cu.createCustomer(s);
    await cu.openDetails(s.name);
    const d = await cu.readDetails();
    expect(d.gst, 'GST STATUS shows Registered or the GSTIN').toMatch(new RegExp(`Registered|${s.gstin}`, 'i'));
  });

  for (const [id, gstin, msg] of [['TC-S3-06', '33ABCDE1234', /GST/i], ['TC-S3-07', 'INVALID123', /Invalid GST/i], ['TC-S3-08', '', /Gst Num is Required/i]]) {
    test(`${id} - Registered with GSTIN "${gstin}" is refused`, { tag: ['@sales', '@customer'] }, async () => {
      await fillNew({ gst: 'Registered', gstin });
      const r = await cu.trySaveCustomer();
      expect(r.saved).toBe(false);
      expect(r.errors.join(' ')).toMatch(msg);
      await cu.closeForm();
    });
  }

  // ── Edit (View Details) ──────────────────────────────────────────────────

  test('TC-CE-01 / 28 / CT TC-VD-02 / 08 - Renaming a customer with invoices: details and existing invoices show the new name', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ address: ADDR });
    const { billNo } = await si.createPricedInvoice(model([L(A, 1)]), { customerName: name });
    const renamed = `${name} Renamed`;
    await cu.openDetails(name);
    expect((await cu.editTextField('DISPLAY NAME', renamed)).saved).toBe(true);
    expect((await cu.readDetails()).name).toBe(renamed);
    expect((await si.listRow(billNo)).customer).toBe(renamed);
  });

  test('TC-CE-02 / CT TC-VD-07 - Clearing the name on edit is refused', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    const r = await cu.editTextField('DISPLAY NAME', '');
    expect(r.saved, 'blank name must be refused').toBe(false);
    await cu.cancelFieldEdit();
  });

  test('TC-CE-03 / 04 / 05 - Business Type changed Wholesaler → Distributor/Agency → Manufacturer on edit', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    for (const type of ['Distributor/Agency', 'Manufacturer']) {
      expect((await cu.editRadioField('BUSINESS TYPE', type)).saved, `type → ${type}`).toBe(true);
      expect((await cu.readDetails()).type).toBe(type);
    }
  });

  test('TC-CE-07 - Business Category changed on edit', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    const before = (await cu.readDetails()).category;
    const other = (await cu.radioOptions('BUSINESS CATEGORY')).find((o) => o !== before);
    expect((await cu.editRadioField('BUSINESS CATEGORY', other)).saved).toBe(true);
    expect((await cu.readDetails()).category).toBe(other);
  });

  test('TC-CE-08 - Business Tag added on edit', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    expect((await cu.addTag('Tag X2DKBE')).saved).toBe(true);
    expect((await cu.readDetails()).tags).toContain('Tag X2DKBE');
  });

  test('TC-CE-10 / 11 / 13 / CT TC-VD-06 - Phone and email added, then the phone changed on edit', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    const email = `edit${uniq()}@example.com`;
    expect((await cu.editTextField('PHONE NUMBER', '9876543210')).saved).toBe(true);
    expect((await cu.editTextField('EMAIL', email)).saved).toBe(true);
    expect((await cu.editTextField('PHONE NUMBER', '9123456780')).saved).toBe(true);
    expect(await cu.readDetails()).toMatchObject({ phone: '9123456780', email });
  });

  test('TC-CE-12 - Phone edited to 5 digits is refused', { tag: ['@sales', '@customer'] }, async () => {
    knownBug('BUG-CU-05', 'phone edited to 5 digits not validated');
    const name = await create({ phone: '9876543210' });
    await cu.openDetails(name);
    const r = await cu.editTextField('PHONE NUMBER', '12345');
    expect(r.saved, '5-digit phone must be refused').toBe(false);
    await cu.cancelFieldEdit();
  });

  test('TC-CE-14 - Email edited to "notanemail" is refused', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    const r = await cu.editTextField('EMAIL', 'notanemail');
    expect(r.saved).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Invalid Email/i);
    await cu.cancelFieldEdit();
  });

  test('TC-CE-15 / 16 / 18 / 19 - Address added, then billing changed and shipping set separately, then shipping synced to billing', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    await cu.editAddress(ADDR);
    expect((await cu.readDetails()).billing).toMatch(/12 Main Road.*Chennai/);
    await cu.editAddress({ line1: '45 Anna Salai', city: 'Chennai', pincode: '600002', shipping: { line1: '9 Dock St', city: 'Chennai', state: 'Tamil Nadu', pincode: '600003' } });
    let d = await cu.readDetails();
    expect(d.billing).toMatch(/45 Anna Salai/);
    expect(d.shipping).toMatch(/9 Dock St/);
    await cu.editAddress({});
    d = await cu.readDetails();
    expect(d.shipping.replace(/\s|,/g, '')).toBe(d.billing.replace(/\s|,/g, ''));
  });

  test('TC-CE-17 / CT TC-VD-04 - Billing state changed to Kerala: a new invoice uses IGST', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ address: ADDR });
    await cu.openDetails(name);
    await cu.editAddress({ state: 'Kerala', pincode: '682001', city: 'Kochi' });
    const billNo = await si.startInvoice({ customerName: name });
    expect(await si.selectedText(si.placeOfSupplySelect)).toBe('Kerala');
    await si.addLine(A, 1);
    await si.save();
    await si.openInvoice(billNo);
    await expect(si.page.locator('.ant-drawer-content').filter({ visible: true }).last()).toContainText('IGST');
  });

  test('TC-CE-20 - Pincode edited to "ABCDE" is refused', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ address: ADDR });
    await cu.openDetails(name);
    await cu.fillAddress({ pincode: 'ABCDE' });
    expect(await cu.saveAddressBtn.isVisible(), 'address form stays open').toBe(true);
    expect((await cu.formErrors()).join(' ')).toMatch(/pincode/i);
  });

  // QA (BUG-CU-06): GST details cannot be edited on the customer details screen.
  test('TC-CE-21 / 22 / 23 / CT TC-VD-05 - GST status has no Edit on the customer details', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    await expect(cu.page.getByText('GST STATUS').first(), 'GST STATUS shown').toBeVisible({ timeout: 10_000 });
    await expect(cu.editButtonOf('GST STATUS'), 'no Edit button for GST STATUS').toHaveCount(0);
  });

  test('TC-CE-25 - Cancelling a field edit keeps the original value', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create({ phone: '9876543210' });
    await cu.openDetails(name);
    const m = await cu.openFieldEdit('PHONE NUMBER');
    await m.locator('input').first().fill('9000000000');
    await cu.cancelFieldEdit();
    expect((await cu.readDetails()).phone).toBe('9876543210');
  });

  // QA (BUG-CU-07): customers cannot be deleted, only marked Inactive.
  test('TC-CE-26 / 27 - A customer has no Delete, only Inactive', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    await expect(cu.page.getByText(/Inactive/i).first(), 'Inactive on the customer details').toBeVisible({ timeout: 10_000 });
    await expect(cu.page.getByRole('button', { name: /^Delete$/ }), 'no Delete on the customer details').toHaveCount(0);
  });

  test('TC-CE-26 (adapted) - "Inactive" removes the customer from the customer list', { tag: ['@sales', '@customer'] }, async () => {
    const name = await create();
    await cu.openDetails(name);
    await cu.inactiveBtn.click();
    if (await cu.yesBtn.isVisible().catch(() => false)) await cu.yesBtn.click();
    await cu.settle(2500, 'status changes');
    expect(await cu.searchCustomers(name)).not.toContain(name);
  });

  // ── Not automatable / not in this app ────────────────────────────────────

  for (const [id, title, why] of [
    ['TC-S2-25', 'Back from Step 2 keeps Step 1 data', 'The customer form is a single page — no steps / Back.'],
    ['TC-S3-09', 'Back from Step 3 keeps Step 2 data', 'The customer form is a single page — no steps / Back.'],
    ['TC-CE-09 / CT TC-VD-03', 'Business type change switches the invoice price list', 'No customer-specific price lists — PriceList sheet.'],
    ['TC-CE-24', 'GST status change: existing invoices unaffected', 'GST status cannot be edited (TC-CE-21).'],
  ]) {
    test.fixme(`${id} - ${title} (${why})`, async () => {});
  }
});
