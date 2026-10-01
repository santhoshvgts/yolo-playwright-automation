const { faker } = require('@faker-js/faker');
const { masterData } = require('./UserData');

/** Customer payment (bulk Payment Received + receive payment against a Sales Invoice). */
const generateCustomerPaymentData = () => ({
  // unique per run (same ranges as support/testData.js PurchaseData.ReceiveAmt / EdReceiveAmt)
  receiveAmt:   faker.number.int({ min: 1, max: 100000 }).toString(),
  edReceiveAmt: faker.number.int({ min: 1, max: 100000 }).toString(),

  // master data — must already exist in the environment
  customerName:   masterData.customerName, // 'New Customer 2'
  paymentMode:    'Cash',
  paymentAccount: 'Petty Cash',
});

module.exports = { generateCustomerPaymentData };
