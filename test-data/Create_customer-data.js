function generateCreateCustomerData() {
  return {
    email: process.env.ADMIN_EMAIL || 'santhosh@yoloworks.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123$',
    orgName: 'vgtsone',
    openingBalance: '10000',
    phone: '7266527625',
    emailOptional: 'vgts@yopmail.com'
  };
}

module.exports = { generateCreateCustomerData };