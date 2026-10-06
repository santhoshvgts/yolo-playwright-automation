const { test, expect } = require('../fixtures/base-test');
const { Vendor_Create } = require('../pages/Vendor_Create');
const { LoginFlow } = require('../pages/LoginFlow');
const { generateVendor_CreateData } = require('../test-data/Vendor_Create-data');
const { getSection } = require('../utils/runtimeDataStore');
const { URLS } = require('../config/urls');

const moduleName = 'Vendor_Create';


const data = generateVendor_CreateData();


test.describe(moduleName, () => {
  test.beforeEach(async ({ page }) => {
    await new LoginFlow(page, URLS.base).loginAndSelectOrg(data);
  });

  test('TC01 - Create a Business Vendor with GST', async ({ page }) => {
    const pom = new Vendor_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.createBusinessVendorwithGST(data);
    
  });

  test('TC02 - Create a Business Vendor without GST', async ({ page }) => {
    const pom = new Vendor_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.createBusinessVendorwithoutGST(data);
    
  });

  test('TC03 - Create an Individual Vendor', async ({ page }) => {
    const pom = new Vendor_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.createIndividualVendor(data);
    
  });

  test('TC04 - Edit the Business Vendor with GST', async ({ page }) => {

    const pom = new Vendor_Create(page);

    await page.goto(URLS.products);

    await pom.editBusinessVendorwithGST(data);
  });

});
