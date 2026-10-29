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

  test('TC01 - Create a bulk payment against a customer\'s due invoices', { tag: ['@smoke', '@payment'], annotation: { type: 'cases', description: 'TC01' } }, runSafely(async () => {
    test.setTimeout(600000);
    await new CustomerPaymentPage(page).createEditDeleteBulkPaymentAndVerifyBalances(paymentData);
  }));

  test('TC02 - Create a payment against a sales invoice using receive payment', { tag: ['@payment'], annotation: { type: 'cases', description: 'TC02' } }, runSafely(async () => {
    test.setTimeout(600000);
    await new CustomerPaymentPage(page).receivePaymentAgainstSalesInvoiceAndVerify(paymentData);
  }));

});
