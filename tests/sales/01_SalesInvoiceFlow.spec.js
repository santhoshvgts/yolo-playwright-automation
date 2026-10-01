const { test } = require('@playwright/test');
const { runSafely } = require('../../utils/testHelpers');
const { ItemPage } = require('../../pages/inventory/ItemPage');
const { SalesInvoicePage } = require('../../pages/sales/SalesInvoicePage');
const { StockStatementPage } = require('../../pages/reports/StockStatementPage');
const { SalesStockAlertPage } = require('../../pages/sales/SalesStockAlertPage');
const { StockAdjustmentPage } = require('../../pages/inventory/StockAdjustmentPage');
const { generateItemData } = require('../../test-data/Item_Data');
const { generateSalesInvoiceData } = require('../../test-data/SalesInvoice_Data');

const SECTION = 'salesFlowData';

let page;
let context;
let itemData;
let salesInvoiceData;

test.describe.serial('Sales Module Flow', () => {
  // Never auto-retry: a retry re-runs the whole serial flow (creates duplicate items/invoices).
  test.describe.configure({ retries: 0 });


  test.beforeAll(async ({ browser }) => {
    // Fixed size: the top menu folds "Reports" into "…" on narrow windows, and the
    // host config may use viewport: null (maximized window = screen size).
    context = await browser.newContext({ viewport: { width: 1800, height: 900 } });
    page = await context.newPage();
    itemData = { ...generateItemData(), section: SECTION };
    salesInvoiceData = { ...generateSalesInvoiceData(), section: SECTION };
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── Item creation ──
  test('TC01 - Creating an Item with Open Stock in Invoice Module', { tag: ['@smoke', '@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new ItemPage(page).createItemWithOpeningStock(itemData);
  }));

  // ── Sales Invoice create ──
  test('TC02 - Check the opening stock/current inventory of the created item, then create a sales invoice for it, and verify the updated stock in the Inventory section of the Invoice module', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesInvoicePage(page).createSalesInvoiceAndVerifyStock(salesInvoiceData);
  }));

  test('TC03 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'newtotalqty' });
  }));

  test('TC04 - Verify that the updated stock displayed in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'newtotalqty' });
  }));

  test('TC05 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs in the Inventory module matches the Item Inventory stock', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'newtotalqty' });
  }));

  // ── Sales Invoice edit ──
  test('TC06 - Edit the created Sales Invoice for the selected item, and verify that the updated stock is accurately reflected in the Inventory section of the Invoice module', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesInvoicePage(page).editSalesInvoiceAndVerifyStock(salesInvoiceData);
  }));

  test('TC07 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock after editing the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'updatedTotalqty' });
  }));

  test('TC08 - Verify that the updated stock shown in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock after editing the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'updatedTotalqty' });
  }));

  test('TC09 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs of the Inventory module matches the Item Inventory stock after editing the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'updatedTotalqty' });
  }));

  // ── Sales Invoice cancel ──
  test('TC10 - Cancel the created Sales Invoice for the selected item, and verify that the updated stock is accurately reflected in the Inventory section of the Invoice module', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesInvoicePage(page).cancelSalesInvoiceAndVerifyStock(salesInvoiceData);
  }));

  test('TC11 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock after deleting the Purchase Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'finalTotalqty', allowZero: true });
  }));

  test('TC12 - Verify that the updated stock shown in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock after cancelling the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'finalTotalqty' });
  }));

  test('TC13 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs of the Inventory module matches the Item Inventory stock after cancelling the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'finalTotalqty' });
  }));

  // ── Sales Invoice delete ──
  test('TC14 - Delete the created Sales Invoice for the selected item, and verify that the updated stock is accurately reflected in the Inventory section of the Invoice module', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesInvoicePage(page).deleteSalesInvoiceAndVerifyStock(salesInvoiceData);
  }));

  test('TC15 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock after deleting the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'endTotalqty', allowZero: true });
  }));

  test('TC16 - Verify that the updated stock shown in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock after deleting the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'endTotalqty' });
  }));

  test('TC17 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs of the Inventory module matches the Item Inventory stock after deleting the Sales Invoice', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'endTotalqty' });
  }));

  // ── Sales Invoice amount flow ──
  test('TC18 - Create, edit, and delete the Sales Invoice for the same item, and verify that the invoice amount is accurately reflected in the Customer Due, Closing Balance, and Transaction Statement', { tag: ['@sales'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesInvoicePage(page).createEditCancelDeleteAndVerifyCustomerBalances(salesInvoiceData);
  }));

});
