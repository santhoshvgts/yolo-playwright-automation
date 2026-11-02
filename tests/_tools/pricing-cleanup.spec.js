// Safety tool: deactivate every active "ZZ PL" / "Z" price list and "ZZ OF" offer left by the PriceList / Offers suites
// in EVERY test org (ORG_NAMES), then check a sales invoice in this worker's org shows the item's base price again.
// One leaked active list re-prices every later sales invoice of its org (e.g. a 1 % markup: ₹100 → ₹101).
//   npx playwright test tests/_tools/pricing-cleanup.spec.js
const fs = require('fs');
const { test, expect } = require('../../fixtures/base-test');
const { PricingPage } = require('../../pages/inventory/PricingPage');
const { OffersPage } = require('../../pages/inventory/OffersPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { appUrls, masterData } = require('../../test-data/UserData');
const { ORG_FILE } = require('../../config/auth');

test('cleanup: no active ZZ price lists / offers', async ({ page }) => {
  test.setTimeout(900_000);
  const pl = new PricingPage(page);
  await pl.open();
  // One session covers every org: the org id in the URL picks the org
  const { orgIds = {} } = JSON.parse(fs.readFileSync(ORG_FILE, 'utf8'));
  for (const [org, id] of Object.entries(orgIds)) {
    console.log(`Cleaning "${org}"`);
    await page.goto(`${appUrls.invoice}/${id}`);
    await expect(page.locator('//a[text()="Sales"]')).toBeVisible({ timeout: 60_000 });
    await pl.deactivateAll('ZZ PL');
    await pl.deactivateAll('Z', { exact: true });   // 1-character list saved by the PriceList name-boundary test
    await new OffersPage(page).deactivateAll('ZZ OF');
  }
  await page.goto(`${appUrls.invoice}/${orgIds[masterData.organization]}`);
  const [A] = await pl.ensurePricedItems(E.items());
  expect(await pl.invoiceRate(A), 'base price back on the invoice').toBe(A.price);
});
