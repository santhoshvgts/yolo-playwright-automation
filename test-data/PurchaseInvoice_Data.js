const { faker } = require('@faker-js/faker');
const { masterData } = require('./UserData');

// faker v9 ignores the old positional finance.amount(min, max, dec) signature
// (it silently used the 1..1000 default), so the options form is used to honour the intended range.
const decimalQty = (min, max) => parseFloat(faker.finance.amount({ min, max, dec: 2 })).toString();
const intBetween = (min, max) => faker.number.int({ min, max }).toString();

/**
 * Purchase Invoice flow values (moved from support/testData.js PurchaseData).
 * Line quantities: pcs (base unit, decimals allowed), box, bundle.
 */
const generatePurchaseInvoiceData = () => ({
  // ── Stock flow: create PI (TC02) ──
  crPcs:    decimalQty(1, 200),
  crBox:    intBetween(1, 200),
  crBundle: intBetween(1, 200),

  // ── Stock flow: edit PI (TC06) ──
  edPcs:    decimalQty(1, 200),
  edBox:    intBetween(1, 200),
  edBundle: intBetween(1, 200),

  // ── Amount flow: create PI (TC14) ──
  crPcs2:          decimalQty(1, 100),
  crBox2:          intBetween(1, 20),
  crBundle2:       intBetween(1, 10),
  // Purchase rate per UOM — the item has none, so without these the PI is worth ₹0
  pcsRate:         decimalQty(5, 50),
  boxRate:         intBetween(50, 300),
  bundleRate:      intBetween(30, 200),
  pcsDiscount:     intBetween(1, 10),
  boxDiscount:     intBetween(1, 10),
  bundleDiscount:  intBetween(1, 10),
  summaryDiscount: intBetween(1, 10),
  shippingCost:    intBetween(1, 500),
  adjustment:      intBetween(1, 100),

  // ── Amount flow: edit PI (TC14) ──
  edPcs2:            decimalQty(1, 20),
  edBox2:            intBetween(1, 20),
  edBundle2:         intBetween(1, 10),
  edPcsRate:         decimalQty(5, 50),
  edBoxRate:         intBetween(50, 300),
  edBundleRate:      intBetween(30, 200),
  edPcsDiscount:     intBetween(1, 10),
  edBoxDiscount:     intBetween(1, 10),
  edBundleDiscount:  intBetween(1, 10),
  edSummaryDiscount: intBetween(1, 10),
  edShippingCost:    intBetween(1, 500),
  edAdjustment:      intBetween(1, 100),

  // ── Master data — must already exist in the environment ──
  vendorName:    masterData.vendorName,   // 'New Vendor 1'
  placeOfSupply: 'Tamil',                 // typed; option "Tamil Nadu" is picked
});

module.exports = { generatePurchaseInvoiceData };
