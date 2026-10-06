const { test, expect } = require('../fixtures/base-test');
const { Pricing_general_Create } = require('../pages/Pricing_general_Create');
const { generatePricing_general_CreateData } = require('../test-data/Pricing_Create-data');
const { LoginFlow } = require('../pages/LoginFlow');
const { URLS } = require('../config/urls');

const moduleName = 'Pricing_general_Create';

// URLs live in config/urls.js — override the host with BASE_URL, the org with ORG_ID.
//
// Every test logs in for itself: no session is cached or shared between tests,
// so each one starts from a clean browser context at the login screen.

const data = generatePricing_general_CreateData();

test.describe(moduleName, () => {
  test.beforeEach(async ({ page }) => {
    await new LoginFlow(page, URLS.base).loginAndSelectOrg(data);
  });

  test('TC01 - Create a General price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });
  
  test('TC02 - Create a General price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC03 - Create a General price list with Item Specific pricing', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC04 - Create a General price list with Item Specific pricing by auto calculation', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralItemSpecificPricingByAutoCalculating(data);

    // Logout
    //await pom.logout();

  });

  test('TC05 - Create a Category Wise price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('TC06 - Create a Category Wise price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC07 - Create a Category Wise price list with Item Specific pricing', async ({ page }) => {  
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

    test('TC08 - Create a Category Wise price list with Item Specific pricing by auto calculation', async ({ page }) => {  
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseItemSpecificPricingByAutoCalculating(data);

    // Logout
    //await pom.logout();

  });

  test('TC09 - Create a Profile Wise price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('TC10 - Create a Profile Wise price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC11 - Create a Profile Wise price list with Item Specific pricing', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC12 - Create a Profile Wise price list with Item Specific pricing by auto calculation', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseItemSpecificPricingByAutoCalculating(data);

    // Logout
    //await pom.logout();

  });


  test('TC13 - Edit the General price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC14 - Edit the General price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();


  });

    test('TC15 - Edit the General price list with Item Specific pricing', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC16 - Edit the General price list with Item Specific pricing by auto calculation', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralItemSpecificPricingByAutoCalculating(data);

    // Logout
    //await pom.logout();

  });

   test('TC17 - Edit the Category Wise price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('TC18 - Edit the Category Wise price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC19 - Edit the Category Wise price list with Item Specific pricing', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC20 - Edit the Category Wise price list with Item Specific pricing by auto calculation', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseItemSpecificPricingByAutoCalculating(data);

    // Logout
    //await pom.logout();

  });

    test('TC21 - Edit the Profile Wise price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('TC22 - Edit the Profile Wise price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC23 - Edit the Profile Wise price list with Item Specific pricing', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });
  
  test('TC24 - Edit the Profile Wise price list with Item Specific pricing by auto calculation', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseItemSpecificPricingByAutoCalculating(data);

    // Logout
    //await pom.logout();

  });

    test('TC25 - Delete the edited General price list with Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.deleteGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

  test('TC26 - Inactivate and delete the General price list with Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.inactiveanddeleteGeneralOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

});