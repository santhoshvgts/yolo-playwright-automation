const { test } = require("@playwright/test");
const { LoginPage } = require("../../pages/common/LoginPage");

test.describe.serial("Login", () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0 });

  test('TC01 - Verify admin can log in and switch into the test organisation', { tag: ['@smoke'] }, async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.openApp('invoice');
    await loginPage.selectOrg();
  });

});
