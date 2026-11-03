// Safety tool: deactivate every active "ZZ PL" / "Z" price list and "ZZ OF" offer left by the PriceList / Offers suites,
// and every "Price List …" list left by Pricing_general_Create (General / Category / Profile wise, 42–50 %),
// in EVERY test org (ORG_NAMES), then check a sales invoice in this worker's org shows the item's base price again.
// One leaked active list re-prices every later sales invoice of its org (e.g. a 1 % markup: ₹100 → ₹101).
// Switches lists off through the app's API (utils/pricingApi, seconds per org); anything the API leaves active
// is switched off in the UI instead.
//   npx playwright test tests/tools/pricing-cleanup.spec.js
const fs = require('fs');
const { test, expect } = require('../../fixtures/base-test');
const { PricingPage } = require('../../pages/inventory/PricingPage');
const { OffersPage } = require('../../pages/inventory/OffersPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { appUrls, masterData } = require('../../test-data/UserData');
const { ORG_FILE } = require('../../config/auth');
const { apiSession, deactivate } = require('../../utils/pricingApi');

// What the suites leave behind: [kind, name prefix, exact name?]
const LEFTOVERS = [
  ['priceList', 'ZZ PL', false],
  ['priceList', 'Z', true],            // 1-character list saved by the PriceList name-boundary test
  ['priceList', 'Price List ', false],
  ['offer', 'ZZ OF', false],
];

test('cleanup: no active ZZ price lists / offers', async ({ page }) => {
  test.setTimeout(3_600_000);   // the UI fallback on an org with hundreds of old lists takes a while
  const pl = new PricingPage(page);
  await pl.open();
  // One session covers every org: the org id in the URL picks the org
  const { orgIds = {} } = JSON.parse(fs.readFileSync(ORG_FILE, 'utf8'));
  for (const [org, id] of Object.entries(orgIds)) {
    console.log(`Cleaning "${org}"`);
    let api = null;
    try { api = await apiSession(page, id); } catch (e) { console.log(`API not available (${e.message.split('\n')[0]}) — using the UI`); }
    for (const [kind, prefix, exact] of LEFTOVERS) {
      const viaApi = api && await deactivate(api, kind, { prefix, exact }).catch((e) => { console.log(`API: ${e.message}`); return null; });
      if (viaApi && !viaApi.stuck.length) continue;
      await page.goto(`${appUrls.invoice}/${id}`);
      await expect(page.locator('//a[text()="Sales"]')).toBeVisible({ timeout: 60_000 });
      await (kind === 'offer' ? new OffersPage(page) : pl).deactivateAllInUi(prefix, { exact });
    }
  }
  await page.goto(`${appUrls.invoice}/${orgIds[masterData.organization]}`);
  const [A] = await pl.ensurePricedItems(E.items());
  expect(await pl.invoiceRate(A), 'base price back on the invoice').toBe(A.price);
});
