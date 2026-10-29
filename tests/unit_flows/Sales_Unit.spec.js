const { test } = require('../../fixtures/base-test');
const { ItemPage } = require('../../pages/inventory/ItemPage');
const { SalesInvoicePage } = require('../../pages/sales/SalesInvoicePage');
const { PurchaseInvoicePage } = require('../../pages/purchase/PurchaseInvoicePage');
const { StockStatementPage } = require('../../pages/reports/StockStatementPage');
const { SalesStockAlertPage } = require('../../pages/sales/SalesStockAlertPage');
const { StockAdjustmentPage } = require('../../pages/inventory/StockAdjustmentPage');
const { masterData } = require('../../test-data/UserData');
const { generateItemData } = require('../../test-data/Item_Data');
const { generateSalesInvoiceData } = require('../../test-data/SalesInvoice_Data');

const moduleName = 'Sales_Unit';

// Unit-style version of tests/sales/01_SalesInvoiceFlow.spec.js.
//
// Every test gets its own browser context and logs in for itself (the POMs call
// openApp). Tests share nothing in memory — only the Rundata section below, so any
// single TC can be run alone once the TC that writes its inputs has run:
//
//   TC01        → itemName, boxconversion, bundleconversion (+ stock via a Purchase Invoice)
//   TC02        → initialtotalqty, newtotalqty           (TC03–05 read newtotalqty)
//   TC06        → editTotalqty, updatedTotalqty          (TC07–09 read updatedTotalqty)
//   TC10        → finalTotalqty                          (TC11–13 read finalTotalqty)
//   TC14        → billNo, endTotalqty                    (TC15–17 read endTotalqty)
//   TC18        → cbExistingDue/Advance/Closing, siAmount
//   TC19        → edsiAmount, cbUpdatedDue
//   TC20        → cbFinalAdvance, cbFinalClosing         (TC21 reads all cb* keys)
//
// A test whose inputs are missing fails at once with
// "[flowStore] Section "unitSalesData" is ... Run the test that produces it first."

const SECTION = 'unitSalesData';
const itemData = { ...generateItemData(), section: SECTION };
const salesInvoiceData = { ...generateSalesInvoiceData(), section: SECTION };

test.describe(moduleName, () => {
  // Fixed size: the top menu folds "Reports" into "…" on narrow windows.
  test.use({ viewport: { width: 1800, height: 900 } });
  // No retries: a retry would create a second item / invoice and skew the stock maths.
  test.describe.configure({ retries: 0, timeout: 600_000 });

  // ── Item ──
  test('TC01 - Create an item with Opening Stock and stock it up through a purchase invoice', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC01' } }, async ({ page }) => {
    await new ItemPage(page).createItemWithOpeningStock(itemData);
    // New item has no stock — the app blocks a Sales Invoice that exceeds it, so stock up first
    await new PurchaseInvoicePage(page).addStockViaPurchaseInvoice({
      section: SECTION, vendorName: masterData.vendorName, pcs: '100', box: '50', bundle: '50',
    });
  });

  // ── SI create ──
  test('TC02 - Create a sales invoice for the item and verify the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC02' } }, async ({ page }) => {
    await new SalesInvoicePage(page).createSalesInvoiceAndVerifyStock(salesInvoiceData);
  });

  test('TC03 - After the sales invoice is created, the Stock Statement (Fieldforce) matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC03' } }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'newtotalqty' });
  });

  test('TC04 - After the sales invoice is created, the sales invoice quantity alert matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC04' } }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'newtotalqty' });
  });

  test('TC05 - After the sales invoice is created, the Stock Adjustment quantities per UOM match the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC05' } }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'newtotalqty' });
  });

  // ── SI edit ──
  test('TC06 - Edit the sales invoice and verify the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC06' } }, async ({ page }) => {
    await new SalesInvoicePage(page).editSalesInvoiceAndVerifyStock(salesInvoiceData);
  });

  test('TC07 - After the sales invoice is edited, the Stock Statement (Fieldforce) matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC07' } }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'updatedTotalqty' });
  });

  test('TC08 - After the sales invoice is edited, the sales invoice quantity alert matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC08' } }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'updatedTotalqty' });
  });

  test('TC09 - After the sales invoice is edited, the Stock Adjustment quantities per UOM match the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC09' } }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'updatedTotalqty' });
  });

  // ── SI cancel ──
  test('TC10 - Cancel the sales invoice and verify the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC10' } }, async ({ page }) => {
    await new SalesInvoicePage(page).cancelSalesInvoiceAndVerifyStock(salesInvoiceData);
  });

  test('TC11 - After the sales invoice is cancelled, the Stock Statement (Fieldforce) matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC11' } }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'finalTotalqty', allowZero: true });
  });

  test('TC12 - After the sales invoice is cancelled, the sales invoice quantity alert matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC12' } }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'finalTotalqty' });
  });

  test('TC13 - After the sales invoice is cancelled, the Stock Adjustment quantities per UOM match the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC13' } }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'finalTotalqty' });
  });

  // ── SI delete ──
  test('TC14 - Delete the sales invoice and verify the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC14' } }, async ({ page }) => {
    await new SalesInvoicePage(page).deleteSalesInvoiceAndVerifyStock(salesInvoiceData);
  });

  test('TC15 - After the sales invoice is deleted, the Stock Statement (Fieldforce) matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC15' } }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'endTotalqty', allowZero: true });
  });

  test('TC16 - After the sales invoice is deleted, the sales invoice quantity alert matches the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC16' } }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'endTotalqty' });
  });

  test('TC17 - After the sales invoice is deleted, the Stock Adjustment quantities per UOM match the Inventory stock', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC17' } }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'endTotalqty' });
  });

  // ── SI amount → customer balances ──
  test('TC18 - Create a sales invoice with discounts, shipping, TDS and adjustment and verify customer Due, Closing Balance and Transaction Statement', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC18' } }, async ({ page }) => {
    await new SalesInvoicePage(page).createSalesInvoiceWithChargesAndVerifyCustomerBalances(salesInvoiceData);
  });

  test('TC19 - Edit that sales invoice and verify customer Due, Closing Balance and Transaction Statement', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC19' } }, async ({ page }) => {
    await new SalesInvoicePage(page).editSalesInvoiceWithChargesAndVerifyCustomerBalances(salesInvoiceData);
  });

  test('TC20 - Cancel that sales invoice and verify customer balances return to their original values', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC20' } }, async ({ page }) => {
    await new SalesInvoicePage(page).cancelSalesInvoiceAndVerifyCustomerBalances(salesInvoiceData);
  });

  test('TC21 - Delete the cancelled sales invoice and verify customer balances are unchanged', { tag: ['@unit', '@sales'], annotation: { type: 'cases', description: 'TC21' } }, async ({ page }) => {
    await new SalesInvoicePage(page).deleteCancelledSalesInvoiceAndVerifyCustomerBalances(salesInvoiceData);
  });
});
