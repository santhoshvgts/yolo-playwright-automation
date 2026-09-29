const path = require('path');
const { faker } = require('@faker-js/faker');

function generateVendor_CreateData() {
  return {
    emailId:'santhosh@yoloworks.com',
    password: process.env.PASSWORD || 'Admin@123$',
    searchByNameOrGST: 'auto', // KEEP literal — searches for existing org

    // business vendor
    vendorOrganisationName: faker.company.name(),
    openingBalance: String(faker.number.float({ min: 1000, max: 5000 })),
    organisationPhoneNo: faker.string.numeric(10),
    organisationEmailID: faker.internet.email(),
    gstNo: '24AAAGM0289C1ZP',

    vendorOrganisationName1: faker.company.name(),
    openingBalance1: String(faker.number.float({ min: 1000, max: 5000 })),
    organisationPhoneNo1: faker.string.numeric(10),
    organisationEmailID1: faker.internet.email(),

    tagName: `Tag ${faker.string.alphanumeric(6).toUpperCase()}`,
tagDescription: faker.lorem.sentence(),

    addressLine1: faker.location.streetAddress(),
    addressLine2: faker.location.secondaryAddress(),
    city: faker.location.city(),
    pincode: faker.string.numeric(6),
    shippingaddressLine1: faker.location.streetAddress(),
    shippingaddressLine2: faker.location.secondaryAddress(),
    shippingcity: faker.location.city(),
    shippingpincode: faker.string.numeric(6),

    // individual 
    vendorName: faker.company.name(),
mobileNo: faker.string.numeric(10),
email: faker.internet.email(),
openingBalance: String(
  faker.number.float({
    min: 1000,
    max: 50000,
    fractionDigits: 2
  })
),
    
    
  };
}

module.exports = { generateVendor_CreateData };