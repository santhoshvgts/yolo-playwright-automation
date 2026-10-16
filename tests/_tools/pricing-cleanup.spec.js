// Safety tool: deactivate every active "ZZ PL" price list and "ZZ OF" offer left by the PriceList / Offers suites,
// then check a sales invoice shows the item's base price again.
//   npx playwright test tests/_tools/pricing-cleanup.spec.js
const { test, expect } = require('../../fixtures/base-test');
const { PricingPage } = require('../../pages/inventory/PricingPage');
const { OffersPage } = require('../../pages/inventory/OffersPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');

test('cleanup: no active ZZ price lists / offers', async ({ page }) => {
  test.setTimeout(900_000);
  const pl = new PricingPage(page);
  await pl.open();
  const [A] = await pl.ensurePricedItems(E.items());
  await pl.deactivateAll('ZZ PL');
  await new OffersPage(page).deactivateAll('ZZ OF');
  expect(await pl.invoiceRate(A), 'base price back on the invoice').toBe(A.price);
});
