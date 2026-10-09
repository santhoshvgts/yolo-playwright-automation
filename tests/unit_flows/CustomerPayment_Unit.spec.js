const { test } = require('../../fixtures/base-test');
const { CustomerPaymentPage } = require('../../pages/sales/CustomerPaymentPage');
const { generateCustomerPaymentData } = require('../../test-data/CustomerPayment_Data');

const moduleName = 'CustomerPayment_Unit';

// Unit-style version of tests/payment/01_CustomerPayment.spec.js.
//
// Every test gets its own browser context and logs in for itself (the POM calls
// openApp). Tests share nothing in memory — only the Rundata section below:
//
//   TC01 → paymentNumber, existingDue/Advance/ClosingBalance, amtReceived, amtUsedForPayment, excessAmt
//   TC02 → updatedamtReceived/UsedForPayment/excessAmt, updatedDue, updatedAdvance (TC03 reads these)
//   TC04 → independent (works on the latest Sales Invoice with a payment status)

const SECTION = 'unitCustomerPaymentData';
const paymentData = { ...generateCustomerPaymentData(), section: SECTION };

test.describe(moduleName, () => {
  // Fixed size: the top menu folds "Reports" into "…" on narrow windows.
  test.use({ viewport: { width: 1800, height: 900 } });
  // No retries: a retry would record a second payment and skew the balance maths.
  test.describe.configure({ retries: 0, timeout: 600_000 });

  // ── Bulk Payment Received ──
  test('TC01 - Create a bulk payment against the customer\'s due invoices and verify invoice dues and customer balances', { tag: ['@unit', '@payment'] }, async ({ page }) => {
    await new CustomerPaymentPage(page).createBulkPaymentAndVerifyBalances(paymentData);
  });

  test('TC02 - Edit the bulk payment and verify invoice dues and customer balances', { tag: ['@unit', '@payment'] }, async ({ page }) => {
    await new CustomerPaymentPage(page).editBulkPaymentAndVerifyBalances(paymentData);
  });

  test('TC03 - Delete the bulk payment and verify customer balances return to their original values', { tag: ['@unit', '@payment'] }, async ({ page }) => {
    await new CustomerPaymentPage(page).deleteBulkPaymentAndVerifyBalances(paymentData);
  });

  // ── Receive Payment against a Sales Invoice ──
  test('TC04 - Receive a payment against a Sales Invoice, verify its due, then unlink it and verify the due is restored', { tag: ['@unit', '@payment'] }, async ({ page }) => {
    await new CustomerPaymentPage(page).receivePaymentAgainstSalesInvoiceAndVerify(paymentData);
  });
});
