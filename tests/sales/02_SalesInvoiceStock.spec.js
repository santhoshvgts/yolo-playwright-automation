const { test, expect } = require('../../fixtures/base-test');
const { SalesInvoiceStockPage } = require('../../pages/sales/SalesInvoiceStockPage');
const { StockAdjustmentPage } = require('../../pages/inventory/StockAdjustmentPage');
const { SalesStockAlertPage } = require('../../pages/sales/SalesStockAlertPage');
const { SalesInvoiceStockData: D } = require('../../test-data/SalesInvoiceStock_Data');
const { expectClose } = require('../../utils/stockMath');

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
