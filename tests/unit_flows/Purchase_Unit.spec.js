const { test } = require('../../fixtures/base-test');
const { ItemPage } = require('../../pages/inventory/ItemPage');
const { PurchaseInvoicePage } = require('../../pages/purchase/PurchaseInvoicePage');
const { StockStatementPage } = require('../../pages/reports/StockStatementPage');
const { SalesStockAlertPage } = require('../../pages/sales/SalesStockAlertPage');
const { StockAdjustmentPage } = require('../../pages/inventory/StockAdjustmentPage');
const { generateItemData } = require('../../test-data/Item_Data');
const { generatePurchaseInvoiceData } = require('../../test-data/PurchaseInvoice_Data');

const moduleName = 'Purchase_Unit';

// Unit-style version of tests/purchase/01_PurchaseFlow.spec.js.
//
// Every test gets its own browser context and logs in for itself (the POMs call
// openApp). Tests share nothing in memory — only the Rundata section below, so any
// single TC can be run alone once the TC that writes its inputs has run:
//
//   TC01        → itemName, boxconversion, bundleconversion
//   TC02        → initialtotalqty, newtotalqty           (TC03–05 read newtotalqty)
//   TC06        → editTotalqty, updatedTotalqty          (TC07–09 read updatedTotalqty)
//   TC10        → finalTotalqty, billNo                  (TC11–13 read finalTotalqty)
//   TC14        → vbExistingDue/Advance/Closing, piAmount
//   TC15        → edpiAmount, vbUpdatedDue               (TC16 reads all vb* keys)
//
// A test whose inputs are missing fails at once with
// "[flowStore] Section "unitPurchaseData" is ... Run the test that produces it first."

const SECTION = 'unitPurchaseData';
const itemData = { ...generateItemData(), section: SECTION };
const purchaseData = { ...generatePurchaseInvoiceData(), section: SECTION };

test.describe(moduleName, () => {
  // Fixed size: the top menu folds "Reports" into "…" on narrow windows.
  test.use({ viewport: { width: 1800, height: 900 } });
  // No retries: a retry would create a second item / invoice and skew the stock maths.
  test.describe.configure({ retries: 0, timeout: 600_000 });

  // ── Item ──
  test('TC01 - Create an Item with Opening Stock in the Invoice module', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new ItemPage(page).createItemWithOpeningStock(itemData);
  });

  // ── PI create ──
  test('TC02 - Create a Purchase Invoice for the item and verify the Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new PurchaseInvoicePage(page).createPurchaseInvoiceAndVerifyStock(purchaseData);
  });

  test('TC03 - After PI create: Stock Statement (Fieldforce) matches Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'newtotalqty' });
  });

  test('TC04 - After PI create: Sales Invoice quantity alert matches Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'newtotalqty' });
  });

  test('TC05 - After PI create: Stock Adjustment quantities per UOM match Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'newtotalqty' });
  });

  // ── PI edit ──
  test('TC06 - Edit the Purchase Invoice and verify the Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new PurchaseInvoicePage(page).editPurchaseInvoiceAndVerifyStock(purchaseData);
  });

  test('TC07 - After PI edit: Stock Statement (Fieldforce) matches Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'updatedTotalqty' });
  });

  test('TC08 - After PI edit: Sales Invoice quantity alert matches Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'updatedTotalqty' });
  });

  test('TC09 - After PI edit: Stock Adjustment quantities per UOM match Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'updatedTotalqty' });
  });

  // ── PI delete ──
  test('TC10 - Delete the Purchase Invoice and verify the Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new PurchaseInvoicePage(page).deletePurchaseInvoiceAndVerifyStock(purchaseData);
  });

  test('TC11 - After PI delete: Stock Statement (Fieldforce) matches Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new StockStatementPage(page).verifyClosingStock({ section: SECTION, totalKey: 'finalTotalqty', allowZero: true });
  });

  test('TC12 - After PI delete: Sales Invoice quantity alert matches Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new SalesStockAlertPage(page).verifyStockAlert({ section: SECTION, totalKey: 'finalTotalqty' });
  });

  test('TC13 - After PI delete: Stock Adjustment quantities per UOM match Inventory stock', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new StockAdjustmentPage(page).verifyAdjustmentQuantities({ section: SECTION, totalKey: 'finalTotalqty' });
  });

  // ── PI amount → vendor balances ──
  test('TC14 - Create a Purchase Invoice with discounts / shipping / TDS / adjustment and verify vendor Due, Closing Balance and Transaction Statement', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new PurchaseInvoicePage(page).createPurchaseInvoiceWithChargesAndVerifyVendorBalances(purchaseData);
  });

  test('TC15 - Edit that Purchase Invoice and verify vendor Due, Closing Balance and Transaction Statement', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new PurchaseInvoicePage(page).editPurchaseInvoiceWithChargesAndVerifyVendorBalances(purchaseData);
  });

  test('TC16 - Delete that Purchase Invoice and verify vendor balances return to their original values', { tag: ['@unit', '@purchase'] }, async ({ page }) => {
    await new PurchaseInvoicePage(page).deletePurchaseInvoiceAndVerifyVendorBalances(purchaseData);
  });
});
