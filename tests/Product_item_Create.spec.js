const { test, expect } = require('../fixtures/base-test');
const { Product_item_Create } = require('../pages/Product_item_Create');
const { LoginFlow } = require('../pages/LoginFlow');
const { generateProduct_item_CreateData } = require('../test-data/Product_item_Create-data');
const { getSection } = require('../utils/runtimeDataStore');
const { URLS } = require('../config/urls');

const moduleName = 'Product_item_Create';

// URLs live in config/urls.js — override the host with BASE_URL, the org with ORG_ID.
//
// Every test logs in for itself: no session is cached or shared between tests,
// so each one starts from a clean browser context at the login screen.

const data = generateProduct_item_CreateData();


test.describe(moduleName, () => {
  test.beforeEach(async ({ page }) => {
    await new LoginFlow(page, URLS.base).loginAndSelectOrg(data);
  });

  test('Create a new product item and verify', async ({ page }) => {
    const pom = new Product_item_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProduct(data);

    // Verify product appears in list (name/HSN/GST/price read back from Rundata)
    await pom.verifyAndCloseProduct();

    // Modal closed cleanly
    await expect(page.getByRole('dialog', { name: /product/i })).toBeHidden({ timeout: 5000 });
    await expect(pom.closeButton).toBeHidden({ timeout: 5000 });

    // Run data persisted for downstream tests
    const savedData = getSection('productItemCreateData');
    expect(savedData.productName).toBe(data.productName);
  });

  test('Edit a new product item with all tabs', async ({ page }) => {
    const pom = new Product_item_Create(page);

    await page.goto(URLS.products);

    // Open the product created by the first test
    const savedData = getSection('productItemCreateData');
    await pom.productRow(savedData.productName).click();
  });
});
