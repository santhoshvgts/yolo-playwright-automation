const path = require('path');
const { faker } = require('@faker-js/faker');

// The app rejects names with punctuation ("Invalid Name") — faker gives e.g. "O'Keefe, Durgan and Koch".
const cleanName = (name) => name.replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim();

function generateVendor_CreateData() {
  return {
    emailId:'santhosh@yoloworks.com',
    password: process.env.PASSWORD || 'Admin@123$',
    searchByNameOrGST: 'auto', // KEEP literal — searches for existing org

    // business vendor
    vendorOrganisationName: cleanName(faker.company.name()),
    openingBalance: String(faker.number.float({ min: 1000, max: 5000 })),
    organisationPhoneNo: faker.string.numeric(10),
    organisationEmailID: faker.internet.email(),
    gstNo: '24AAAGM0289C1ZP',

    vendorOrganisationName1: cleanName(faker.company.name()),
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
    vendorName: cleanName(faker.person.fullName()),
mobileNo: faker.string.numeric(10),
email: faker.internet.email(),
openingBalance: String(
  faker.number.float({
    min: 1000,
    max: 50000,
    fractionDigits: 2
  })
),
    
    //search: 'Turner - Armstrong', // KEEP literal
    displayName: cleanName(faker.person.fullName()),
    fieldFile: 'e35781dd85c7e86ccf98f3647780dbe1.0000000.jpg', // KEEP literal
    emailId_2: faker.internet.email(),
    phoneNumber: faker.string.numeric(10),
    panNumber: 'ABCDE1234Z',
    openingBalance: faker.string.numeric(5),
    contactName: faker.person.fullName(),
    contactMobileNumber: faker.string.numeric(10),
    exampleEmailCom: faker.internet.email(),
    contactName_2: faker.lorem.words(1),
    contactMobileNumber_2: faker.string.numeric(10),
    exampleEmailCom_2: faker.internet.email(),
    addressLine1: faker.location.streetAddress(),
    addressLine2Optional: faker.location.streetAddress(),
    cityTown: faker.location.city(),
    pincode: faker.string.numeric(6),
    bankName: faker.lorem.words(1),
    accountNumber: faker.string.numeric(12),
    ifscCode: 'INDB0001067',
    recipientName: faker.lorem.words(1),
    
  };
}

module.exports = { generateVendor_CreateData };