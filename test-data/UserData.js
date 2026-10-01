// Credentials come from .env — never hard-code them here.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const adminData = () => ({
  email:    process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});

// App hosts (one SSO account, three apps)
const appUrls = {
  invoice:    process.env.INVOICE_URL    || process.env.BASE_URL || 'https://invoice.test.vgts.xyz',
  fieldforce: process.env.FIELDFORCE_URL || 'https://fieldforce.test.vgts.xyz',
  inventory:  process.env.INVENTORY_URL  || 'https://inventory.test.vgts.xyz',
};

// Master data — must already exist in the environment
const masterData = {
  organization: process.env.ORG_NAME || 'Automation Testing Org PVT',
  orgSearch:    process.env.ORG_SEARCH || process.env.ORG_NAME || 'Automation Testing Org PVT',
  vendorName:   process.env.VENDOR_NAME   || 'New Vendor 1',
  customerName: process.env.CUSTOMER_NAME || 'New customer 1',   // exists in Automation Testing Org PVT ("New Customer 2" does not)
};

module.exports = { adminData, appUrls, masterData };
