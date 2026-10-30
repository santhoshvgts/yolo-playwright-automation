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

// Test orgs. ORG_NAMES="Org A|Org B|Org C|Org D" runs one worker per org (playwright.config.js sets
// workers to the count); each worker uses the org at its parallel index, so workers never share data.
// No name may be the start of another (org pickers match by text).
const ORGS = (process.env.ORG_NAMES || process.env.ORG_NAME || 'Automation Testing Org PVT')
  .split('|').map((s) => s.trim()).filter(Boolean);
const workerOrg = ORGS[Number(process.env.TEST_PARALLEL_INDEX || 0) % ORGS.length];

// Master data — must already exist in every test org
const masterData = {
  organization: workerOrg,
  orgSearch:    ORGS.length > 1 ? workerOrg : (process.env.ORG_SEARCH || workerOrg),
  vendorName:   process.env.VENDOR_NAME   || 'New Vendor 1',
  customerName: process.env.CUSTOMER_NAME || 'New customer 1',   // exists in Automation Testing Org PVT ("New Customer 2" does not)
};

module.exports = { adminData, appUrls, masterData, ORGS };
