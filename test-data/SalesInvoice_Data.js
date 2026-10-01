const { faker } = require('@faker-js/faker');
const { masterData } = require('./UserData');

// parseFloat(faker.finance.amount(min, max, 2)).toString() — same as support/testData.js
const decimalQty = (min, max) => parseFloat(faker.finance.amount({ min, max, dec: 2 })).toString();
const intStr = (min, max) => faker.number.int({ min, max }).toString();

/**
 * Sales Invoice flow (pcs / box / bundle lines on one invoice, then edit / cancel / delete).
 * Ranges copied from support/testData.js PurchaseData (SICr*, SIEd*, discounts, shipping, adjustment).
 */
const generateSalesInvoiceData = () => ({
  // create quantities
  crPcs:    decimalQty(1, 20),   // SICrPcs
  crBox:    intStr(5, 10),       // SICrBox
  crBundle: intStr(1, 5),        // SICrBundle

  // edit quantities
  edPcs:    decimalQty(1, 10),   // SIEdPcs
  edBox:    intStr(1, 10),       // SIEdBox
  edBundle: intStr(1, 5),        // SIEdBundle

  // create amounts (amount flow)
  pcsDiscount:     intStr(1, 10),
  boxDiscount:     intStr(1, 10),
  bundleDiscount:  intStr(1, 10),
  summaryDiscount: intStr(1, 10),
  shippingCost:    intStr(1, 500),
  adjustment:      intStr(1, 100),

  // edit amounts (amount flow)
  edPcsDiscount:     intStr(1, 10),
  edBoxDiscount:     intStr(1, 10),
  edBundleDiscount:  intStr(1, 10),
  edSummaryDiscount: intStr(1, 10),
  edShippingCost:    intStr(1, 500),
  edAdjustment:      intStr(1, 100),

  cancelComments: faker.lorem.sentences(3),

  // master data — must already exist in the environment
  customerName:       masterData.customerName, // 'New Customer 2'
  placeOfSupplyQuery: 'Tamil',
  placeOfSupply:      'Tamil Nadu',
  discountType:       'Amount',
  tdsOption:          'Dividend',
  adjustmentType:     'Addition',
});

module.exports = { generateSalesInvoiceData };
