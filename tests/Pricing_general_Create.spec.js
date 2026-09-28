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

  test('Create a new pricing list - General - overallmarkup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });
  
  test('Create a new pricing list - General - overallmarkdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - General - item specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitGeneralItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - CategoryWise - Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('Create a new pricing list - CategoryWise - Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - CategoryWise - Item Specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitCategoryWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - ProfileWise - Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('Create a new pricing list - ProfileWise - Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - ProfileWise - Item Specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.fillAndSubmitProfileWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });


  test('Edit a pricing list - General - overallmarkup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Edit a pricing list - General - overallmarkdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();


  });

    test('Edit a pricing list - General - item specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editGeneralItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

   test('Edit a pricing list - CategoryWise - Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('Edit a pricing list - CategoryWise - Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Edit a pricing list - CategoryWise - Item Specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editCategoryWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

    test('Edit apricing list - ProfileWise - Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });


    test('Edit a pricing list - ProfileWise - Overall Markdown', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseOverallMarkdownPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Edit a pricing list - ProfileWise - Item Specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Navigate to product creation
    await page.goto(URLS.products);
    await pom.editProfileWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

});