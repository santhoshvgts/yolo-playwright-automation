const path = require('path');
const { faker } = require('@faker-js/faker');

/**
 * Product (item) for the Inventory → Products → Item drawer:
 * image, name, description, HSN via search, sale price per pcs,
 * alternate UOMs box + bundle, taxable GST18.
 */
const generateItemData = () => {
  const productName = `${faker.commerce.productName()} ${faker.string.alpha(4)}`;
  return {
    // unique per run
    productName,
    itemName:           productName,                                        // alias used by the stock flows
    productDescription: faker.commerce.productDescription().slice(0, 120),
    salePricePerPcs:    faker.number.int({ min: 1, max: 100 }).toString(),
    quantity:           faker.number.int({ min: 6, max: 20 }).toString(),  // pcs per alternate UOM (box and bundle)

    // fixed
    fieldFile:     path.join(__dirname, 'files', 'product.png'),
    hsnCode:       '01011010',   // first result of the HSN search
    gstRate:       'GST18',
    gstPercent:    '18%',
    altUnit1:      'box',
    altUnit2:      'bundle',
  };
};

module.exports = { generateItemData };
