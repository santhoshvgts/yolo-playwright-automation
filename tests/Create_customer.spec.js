const { test, expect } = require('@playwright/test');
const { Create_customer } = require('../pages/Create_customer');
const { generateCreateCustomerData } = require('../test-data/Create_customer-data');

const moduleName = 'Create_customer';

function generateTestData() {
  return generateCreateCustomerData();
}

test.describe(moduleName, () => {
  test('Create a business customer with required fields', async ({ page }) => {
    const data = generateTestData();
    const pom = new Create_customer(page);

    // Navigate to login page and log in
    await page.goto('https://invoice.test.vgts.xyz/');
    await pom.fillLoginForm(data);

    // Verify login success with short timeout
    try {
      await expect(page.getByRole('heading', { name: 'Select an organisation' })).toBeVisible({ timeout: 5000 });
    } catch (e) {
      throw new Error('Login failed — dashboard not visible within 5s');
    }

    // Switch business
    await pom.switchToBusiness();

    // Navigate to create customer
    await pom.navigateToCreateCustomer();

    // Fill and submit form
    await pom.fillCreateCustomerForm(data);

    // Verify save success (expect modal to close or success indicator)
    await expect(pom.saveButton).toBeHidden({ timeout: 10000 });
    await expect(page.getByText(/Customer created/i)).toBeVisible({ timeout: 5000 });
  });
});