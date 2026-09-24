const path = require('path');
const { faker } = require('@faker-js/faker');

function generateProduct_item_CreateData() {
  return {
    emailId:'santhosh@yoloworks.com',
    password: process.env.PASSWORD || 'Admin@123$',
    searchByNameOrGST: 'auto', // KEEP literal — searches for existing org
    fieldFile: path.join(__dirname, 'Upload_files', 'MZO9pvcB03.png'), // KEEP literal — uploaded file path
    productName: faker.lorem.words(1),
    productDescription: faker.lorem.sentence(),
    salePricePerPcs: faker.string.numeric(3),
    productName2: faker.lorem.words(1),
    productDescription2: faker.lorem.sentence(),
    salePricePerUnit: faker.string.numeric(3)
  };
}

module.exports = { generateProduct_item_CreateData };


let __saveRunData = () => {};
try { ({ saveSection: __saveRunData } = require('../utils/runtimeDataStore')); } catch { /* store not present — persistence skipped, tests unaffected */ }
const __SECRET_FIELD = /pass(word|wd)?|pwd|secret|token|otp|apikey|api_key|auth/i;

module.exports = Object.fromEntries(Object.entries(module.exports).map(([__exportName, __exported]) => {
  if (typeof __exported !== 'function') return [__exportName, __exported];
  return [__exportName, (...__args) => {
    const __persist = __data => {
      if (__data && typeof __data === 'object') {
        const __safe = Object.fromEntries(Object.entries(__data).map(([__k, __v]) => [__k, __SECRET_FIELD.test(__k) ? '***REDACTED***' : __v]));
        try { __saveRunData(`Product_item_Create:${__exportName}`, __safe); } catch { /* never fail a test over bookkeeping */ }
      }
      return __data;
    };
    const __result = __exported(...__args);
    return __result && typeof __result.then === 'function' ? __result.then(__persist) : __persist(__result);
  }];
}));
