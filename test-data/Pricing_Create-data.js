const path = require('path');
const { faker } = require('@faker-js/faker');

function generatePricing_general_CreateData() {
  return {
    emailId:'santhosh@yoloworks.com',
    password: process.env.PASSWORD || 'Admin@123$',
    searchByNameOrGST: 'auto', // KEEP literal — searches for existing org
    priceListName1: `Price List ${faker.commerce.productName()}`,
    priceListName2: `Price List ${faker.commerce.productName()}`,
    priceListName3: `Price List ${faker.commerce.productName()}`,
    priceListName4: `Price List ${faker.commerce.productName()}`,
    priceListName5: `Price List ${faker.commerce.productName()}`,
    priceListName6: `Price List ${faker.commerce.productName()}`,
    description: faker.commerce.productDescription(),
    priceListType: 'General',
    assignPriceListTo: 'All',
    customRate: String(faker.number.int({ min: 1, max: 99 })),
    primaryUOM: '100',
    profileName: `Profile ${faker.commerce.productName()}`,
    profileName1: `Profile ${faker.commerce.productName()}`,
  };
}

module.exports = { generatePricing_general_CreateData };