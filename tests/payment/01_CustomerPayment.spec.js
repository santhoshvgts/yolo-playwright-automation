const { test } = require('@playwright/test');
const { runSafely } = require('../../utils/testHelpers');
const { CustomerPaymentPage } = require('../../pages/sales/CustomerPaymentPage');
const { generateCustomerPaymentData } = require('../../test-data/CustomerPayment_Data');

let page;
let context;
let paymentData;

test.describe.serial('Customer Payment Flow', () => {
  // Never auto-retry: a retry re-runs the whole serial flow (creates duplicate items/invoices).
  test.describe.configure({ retries: 0 });


  test.beforeAll(async ({ browser }) => {
    // Fixed size: the top menu folds "Reports" into "…" on narrow windows, and the
    // host config may use viewport: null (maximized window = screen size).
    context = await browser.newContext({ viewport: { width: 1800, height: 900 } });
    page = await context.newPage();
    paymentData = { ...generateCustomerPaymentData(), section: 'customerPaymentData' };
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('TC01 - Creating a bulk payment against a customers due invoices and ', { tag: ['@smoke', '@payment'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new CustomerPaymentPage(page).createEditDeleteBulkPaymentAndVerifyBalances(paymentData);
  }));

  test('TC02 - Creating payment against sales invoice via receive payment', { tag: ['@payment'] }, runSafely(async () => {
    test.setTimeout(600000);
    await new CustomerPaymentPage(page).receivePaymentAgainstSalesInvoiceAndVerify(paymentData);
  }));

});
