const { test } = require('@playwright/test');
const { runSafely } = require('../../utils/testHelpers');
const { ItemPage } = require('../../pages/inventory/ItemPage');
const { PurchaseInvoicePage } = require('../../pages/purchase/PurchaseInvoicePage');
const { StockStatementPage } = require('../../pages/reports/StockStatementPage');
const { SalesStockAlertPage } = require('../../pages/sales/SalesStockAlertPage');
const { StockAdjustmentPage } = require('../../pages/inventory/StockAdjustmentPage');
const { generateItemData } = require('../../test-data/Item_Data');
const { generatePurchaseInvoiceData } = require('../../test-data/PurchaseInvoice_Data');

const SECTION = 'purchaseFlowData';

let page;
let context;
let itemData;
let purchaseData;

test.describe.serial('Purchase Module Flow', () => {
  // Never auto-retry: a retry re-runs the whole serial flow (creates duplicate items/invoices).
  test.describe.configure({ retries: 0 });


  test.beforeAll(async ({ browser }) => {
    // Fixed size: the top menu folds "Reports" into "…" on narrow windows, and the
    // host config may use viewport: null (maximized window = screen size).
    context = await browser.newContext({ viewport: { width: 1800, height: 900 } });
    page = await context.newPage();
    itemData = { ...generateItemData(), section: SECTION };
    purchaseData = { ...generatePurchaseInvoiceData(), section: SECTION };
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ── Item ──
  test('TC01 - Creating an Item with Open Stock in Invoice Module', { tag: ['@smoke', '@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new ItemPage(page).createItemWithOpeningStock(itemData);
  }));

  // ── PI create ──
  test('TC02 - Check the opening stock/current inventory of the created item, then create a purchase invoice for it, and verify the updated stock in the Inventory section of the Invoice module', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new PurchaseInvoicePage(page).createPurchaseInvoiceAndVerifyStock(purchaseData);
  }));

  test('TC03 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'newtotalqty' });
  }));

  test('TC04 - Verify that the updated stock displayed in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'newtotalqty' });
  }));

  test('TC05 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs in the Inventory module matches the Item Inventory stock', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'newtotalqty' });
  }));

  // ── PI edit ──
  test('TC06 - Edit the created Purchase Invoice for the selected item, and verify that the updated stock is accurately reflected in the Inventory section of the Invoice module', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new PurchaseInvoicePage(page).editPurchaseInvoiceAndVerifyStock(purchaseData);
  }));

  test('TC07 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock after editing the Purchase Invoice', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'updatedTotalqty' });
  }));

  test('TC08 - Verify that the updated stock shown in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock after editing the Purchase Invoice', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'updatedTotalqty' });
  }));

  test('TC09 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs of the Inventory module matches the Item Inventory stock after editing the Purchase Invoice', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'updatedTotalqty' });
  }));

  // ── PI delete ──
  test('TC10 - Delete the created Purchase Invoice for the selected item, and verify that the updated stock is accurately reflected in the Inventory section of the Invoice module', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new PurchaseInvoicePage(page).deletePurchaseInvoiceAndVerifyStock(purchaseData);
  }));

  test('TC11 - Verify that the updated stock in the Stock Statement of the Fieldforce module matches the Inventory stock after deleting the Purchase Invoice', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'finalTotalqty', allowZero: true });
  }));

  test('TC12 - Verify that the updated stock shown in the Sales Invoice quantity alert of the Invoice module matches the Inventory stock after deleting the Purchase Invoice', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'finalTotalqty' });
  }));

  test('TC13 - Verify that the updated stock in the Stock Adjustment quantities against the respective UOMs of the Inventory module matches the Item Inventory stock after deleting the Purchase Invoice', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'finalTotalqty' });
  }));

  // ── PI amount flow ──
  test('TC14 - Create, edit, and delete the Purchase Invoice for the same item, and verify that the invoice amount is accurately reflected in the Vendor Due, Closing Balance, and Transaction Statement', { tag: ['@purchase'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new PurchaseInvoicePage(page).createEditDeletePurchaseInvoiceAndVerifyVendorBalances(purchaseData);
  }));

});
