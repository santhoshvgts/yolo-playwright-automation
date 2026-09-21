const { test, expect } = require('@playwright/test');
const { Pricing_general_Create } = require('../pages/Pricing_general_Create');
const { generatePricing_general_CreateData } = require('../test-data/Pricing_Create-data');

const moduleName = 'Pricing_general_Create';

const data = generatePricing_general_CreateData();

test.describe(moduleName, () => {
  test('Create a new pricing list - General - overallmarkup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load
    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - General - item specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load
    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitGeneralItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - CategoryWise - Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load
    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitCategoryWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - CategoryWise - Item Specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load

    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitCategoryWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - ProfileWise - Overall Markup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load

    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitProfileWiseOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

  test('Create a new pricing list - ProfileWise - Item Specific', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load

    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitProfileWiseItemSpecificPricing(data);

    // Logout
    //await pom.logout();

  });


  test('Edit a pricing list - General - overallmarkup', async ({ page }) => {
    const pom = new Pricing_general_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    await pom.page.waitForTimeout(2000); // Wait for the page to load
    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.editGeneralOverallMarkupPricing(data);

    // Logout
    //await pom.logout();

  });

});