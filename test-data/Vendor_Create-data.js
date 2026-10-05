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
    
    displayName: faker.person.fullName(),
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

    editinviDisplayName: faker.person.fullName(),

editinviEmailId_2: faker.internet.email(),

editinviPhoneNumber: faker.string.numeric(10),

editinviPanNumber: 'ABCDE1234Z',

editinviOpeningBalance: faker.string.numeric(5),

editinviContactName: faker.person.fullName(),

editinviContactMobileNumber: faker.string.numeric(10),

editinviExampleEmailCom: faker.internet.email(),

editinviContactName_2: faker.lorem.words(1),

editinviContactMobileNumber_2: faker.string.numeric(10),

editinviExampleEmailCom_2: faker.internet.email(),

editinviAddressLine1: faker.location.streetAddress(),

editinviAddressLine2Optional: faker.location.streetAddress(),

editinviCityTown: faker.location.city(),

editinviPincode: faker.string.numeric(6),

editinviBankName: faker.lorem.words(1),

editinviAccountNumber: faker.string.numeric(12),

editinviIfscCode: 'INDB0001067',

editinviRecipientName: faker.lorem.words(1),
    
  };
}

module.exports = { generateVendor_CreateData };