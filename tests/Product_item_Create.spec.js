const { test, expect } = require('@playwright/test');
const { Product_item_Create } = require('../pages/Product_item_Create');
const { generateProduct_item_CreateData } = require('../test-data/Product_item_Create-data');

const moduleName = 'Product_item_Create';

const data = generateProduct_item_CreateData();

test.describe(moduleName, () => {
  test('Create a new product item and verify', async ({ page }) => {
    const pom = new Product_item_Create(page);

    // Login
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.loginButton.click();
    await pom.emailField.fill(data.emailId);
    await pom.passwordField.fill(data.password);
    await pom.showPasswordCheckbox.check();
    await pom.loginButtonFinal.click();

    // Verify org selection screen appears (precondition check)
    await expect(pom.orgHeading).toBeVisible({ timeout: 5000 });

    // Select org
    await pom.orgSearchField.fill(data.searchByNameOrGST);
    await pom.orgResult.click();
    await pom.switchButton.click();

    // Navigate to product creation
    await page.goto('https://invoice.test.vgts.xyz/2d9d0527d0d94b1ab010cc24eca9a5ab/sales?sales=1');
    await pom.fillAndSubmitProduct(data);

    // Verify product appears in list (name/HSN/GST/price read back from Rundata)
    await pom.verifyAndCloseProduct();

    // Logout
    await pom.logout();
  });
});