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
    markdownPriceListName1: `Price List ${faker.commerce.productName()}`,
    markdownPriceListName2: `Price List ${faker.commerce.productName()}`,
    markdownPriceListName3: `Price List ${faker.commerce.productName()}`,

    editedPriceListName1: `Price List ${faker.commerce.productName()}`,
    editedPriceListName2: `Price List ${faker.commerce.productName()}`,
    editedPriceListName3: `Price List ${faker.commerce.productName()}`,
    editedPriceListName4: `Price List ${faker.commerce.productName()}`,
    editedPriceListName5: `Price List ${faker.commerce.productName()}`,
    editedPriceListName6: `Price List ${faker.commerce.productName()}`,
    editedMarkdownPriceListName1: `Price List ${faker.commerce.productName()}`,
    editedMarkdownPriceListName2: `Price List ${faker.commerce.productName()}`,
    editedMarkdownPriceListName3: `Price List ${faker.commerce.productName()}`,

    description: faker.commerce.productDescription(),
    editedDescription: faker.commerce.productDescription(),
    priceListType: 'General',
    assignPriceListTo: 'All',
    customRate: '42',
    editedCustomRate: '50',
    editedProductName: 'Sonyu',
    editedPrimaryUOM: '150',
    primaryUOM: '100',
    profileName: `Profile ${faker.commerce.productName()}`,
    profileName1: `Profile ${faker.commerce.productName()}`,
    
  };
}

module.exports = { generatePricing_general_CreateData };