const { SelfHealingBasePage } = require('./self-healing-base-page');
const { expect } = require('@playwright/test');
const { saveSection, getSection } = require('../utils/runtimeDataStore');

class Pricing_general_Create extends SelfHealingBasePage {
  constructor(page) {
    super(page);

    // Login locators (stable role-based)
    this.loginButton = this.page.getByRole('button', { name: 'Log In' });
    this.emailField = this.page.getByRole('textbox', { name: 'Email Id' });
    this.passwordField = this.page.getByRole('textbox', { name: 'Password' });
    this.showPasswordCheckbox = this.page.getByRole('checkbox', { name: 'Show Password' });
    this.loginButtonFinal = this.page.getByRole('button', { name: 'Log in' });
    this.orgHeading = this.page.getByRole('heading', { name: 'Select an organisation' });
    this.orgSearchField = this.page.getByRole('textbox', { name: 'Search by name or GST…' });
    this.orgResult = this.page.getByRole('button', { name: 'Automation Testing Org PVT' });
    this.switchButton = this.page.getByRole('button', { name: 'Switch' });

    // Inventory/Product locators
    this.inventoryLink = this.page.getByRole('link', { name: 'Inventory' });
    this.pricingLink = this.page.getByText('Pricing');
    this.addPricingButton = this.page.getByRole('button', { name: 'Pricing' });
    this.priceListNameField = this.page.getByRole('textbox', { name: 'List Name' });
    this.addDescriptionButton = this.page.getByRole('button', { name: 'Add Description' });
    this.removeDescriptionButton = this.page.getByRole('button', { name: 'Remove Description' }); 
    this.descriptionInput = this.page.getByPlaceholder('Enter Description');
    this.priceListTypeDropdown = this.page.locator('div').filter({ hasText: /^General$/ }).nth(4);
    this.priceListTypeOption1 = this.page.getByTitle('Category wise');
    this.priceListTypeOption2 = this.page.getByTitle('Profile wise');
    this.assignPriceListToDropdown = this.page.locator('.ant-select-selection-overflow');
    this.assignPriceListOption = this.page.getByText('All', { exact: true });
    this.customRateField = this.page.locator('#custom_rate');
    this.savePriceListButton = this.page.getByRole('button', { name: 'Save Price List' });
    this.markUpDropdown = this.page.getByText('Markup', { exact: true });
    this.itemSpecificCard = this.page.locator('div').filter({ hasText: /^Item Specific$/ }).nth(1);
    this.generalPriceListSuccessMsg = this.page.getByText('Price List Created Successfully', { exact: true });
    this.itemSelectionOption = this.page.locator('.ant-select-item-option-content > div');
    this.itemAmountField = this.page.getByRole('textbox', { name: '313' });
    this.businessCategoryDropdown = this.page.locator('div:nth-child(2) > .ant-row > .ant-col.ant-form-item-control > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-select > .ant-select-selector > .ant-select-selection-wrap > .ant-select-selection-item');
    this.businessCategoryOption = this.page.getByTitle('All').nth(2);
    this.addProfilesField = this.page.locator('div').filter({ hasText: /^\+ Add Profile$/ }).nth(3);
    this.itemSelectionField = this.page.locator('#rc_select_3');
    this.itemSelectionField1 = this.page.locator('#rc_select_5');
    this.itemNameField = this.page.locator('#rc_select_4');
    this.searchField = this.page.getByRole('textbox', { name: 'Search' });
    this.searchedField = this.page.locator('(//div[@class="Product_Name_Class"])[1]');
    this.editPricingButton = this.page.getByRole('button', { name: 'Edit' });
    this.markupDropdown = this.page.getByText('Markup', { exact: true });
    this.markdownDropdown = this.page.getByTitle('Markdown');
    
  }


    async fillAndSubmitGeneralOverallMarkupPricing(data) {   // fillAndSubmitGeneralOverallMarkdownPricing
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.priceListName1);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();
    await this.customRateField.fill(data.customRate);
    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('GeneralOverallMarkupPricing', {
      priceListName: data.priceListName1,
      customRate: data.customRate
    });

  }


    async fillAndSubmitGeneralOverallMarkdownPricing(data) {   
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.markdownPriceListName1);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();
    
    await this.markupDropdown.click();
    await this.page.waitForTimeout(2000);
    await this.markdownDropdown.click();
    await this.page.waitForTimeout(2000);
    await this.customRateField.fill(data.customRate);

    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('GeneralOverallMarkdownPricing', {
      priceListName: data.markdownPriceListName1,
      customRate: data.customRate
    });

  }

  // async editGeneralOverallMarkupPricing(data) { 
  //   // Navigate to pricing creation
  //   await this.inventoryLink.click();
  //   await this.page.waitForTimeout(2000);
  //   await this.pricingLink.click();

  //   const jsondata_editproductItem= getSection('GeneralOverallMarkupPricing');

  //   await this.searchField.fill(jsondata_editproductItem.priceListName);
  //   await this.page.waitForTimeout(2000); // Wait for modal to appear

  //   await this.searchedField.click();
  //   await this.page.waitForTimeout(2000); // Wait for modal to appear
  //   await this.editPricingButton.click();
  //   await this.page.waitForTimeout(2000); // Wait for modal to appear


  //   await this.priceListNameField.fill(data.editedPriceListName1);
  //   await this.addDescriptionButton.click();
  //   await this.removeDescriptionButton.click(); // Remove description if it exists
  //   await this.addDescriptionButton.click();
  //   await this.descriptionInput.fill(data.description);
  //   await this.assignPriceListToDropdown.click();
  //   await this.assignPriceListOption.click();
  //   await this.customRateField.fill(data.customRate);
  //   await this.savePriceListButton.click();  
  //   await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

  //   saveSection('GeneralOverallMarkupPricing', {
  //     priceListName: data.priceListName1,
  //     customRate: data.customRate
  //   });

  // }

  async fillAndSubmitGeneralItemSpecificPricing(data) {   // fillAndSubmitCategoryWiseOverallMarkupPricing
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.priceListName2);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();

    const jsondata_productItem= getSection('productItemCreateData');

    await this.itemSpecificCard.click();
    await this.page.waitForTimeout(2000); // Wait for item-specific section to appear
    await this.itemSelectionField.fill(jsondata_productItem.productName);
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.itemSelectionOption.first().click();
    await this.page.waitForTimeout(2000);
    await this.itemAmountField.fill(data.primaryUOM);
    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('GeneralItemSpecificPricing', {
      priceListName: data.priceListName2,
      customRate: data.customRate,
      itemName: jsondata_productItem.productName,
      itemAmount: data.primaryUOM

    });

  }


  async fillAndSubmitCategoryWiseOverallMarkupPricing(data) {      // fillAndSubmitCategoryWiseOverallMarkdownPricing
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.priceListName3);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.priceListTypeDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.priceListTypeOption1.click();
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();
    await this.businessCategoryDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.businessCategoryOption.click();
    await this.customRateField.fill(data.customRate);
    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

        saveSection('CategoryWiseOverallMarkupPricing', {
          priceListName: data.priceListName3,
          customRate: data.customRate
        });

  }

    async fillAndSubmitCategoryWiseOverallMarkdownPricing(data) {      
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.markdownPriceListName2);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.priceListTypeDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.priceListTypeOption1.click();
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();
    await this.businessCategoryDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.businessCategoryOption.click();

    await this.markupDropdown.click();
    await this.page.waitForTimeout(2000);
    await this.markdownDropdown.click();
    await this.page.waitForTimeout(2000);

    await this.customRateField.fill(data.customRate);
    await this.savePriceListButton.click();  

    saveSection('CategoryWiseOverallMarkdownPricing', {
          priceListName: data.markdownPriceListName2,
          customRate: data.customRate
        });

    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

  }

    async fillAndSubmitCategoryWiseItemSpecificPricing(data) {     
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.priceListName4);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.priceListTypeDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.priceListTypeOption1.click();
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();
    await this.businessCategoryDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.businessCategoryOption.click();

    const jsondata_productItem= getSection('productItemCreateData');

    await this.itemSpecificCard.click();
    await this.page.waitForTimeout(2000); // Wait for item-specific section to appear
    await this.itemSelectionField1.fill(jsondata_productItem.productName);
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.itemSelectionOption.first().click();
    await this.page.waitForTimeout(2000);
    await this.itemAmountField.fill(data.primaryUOM);
    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('CategoryWiseItemSpecificPricing', {
      priceListName: data.priceListName4,
      customRate: data.customRate,
      itemName: jsondata_productItem.productName,
      itemAmount: data.primaryUOM

    });

  }

  async fillAndSubmitProfileWiseOverallMarkupPricing(data) {     
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.priceListName5);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.priceListTypeDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.priceListTypeOption2.click();
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();

    await this.itemSelectionField.fill(data.profileName);
    await this.customRateField.fill(data.customRate);
    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('ProfileWiseOverallMarkupPricing', {
      priceListName: data.priceListName5,
      customRate: data.customRate
    });

  }

    async fillAndSubmitProfileWiseOverallMarkdownPricing(data) {     
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.markdownPriceListName3);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.priceListTypeDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.priceListTypeOption2.click();
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();

    await this.itemSelectionField.fill(data.profileName);

    await this.markupDropdown.click();
    await this.page.waitForTimeout(2000);
    await this.markdownDropdown.click();
    await this.page.waitForTimeout(2000);

    await this.customRateField.fill(data.customRate);
    await this.savePriceListButton.click();  

    saveSection('ProfileWiseOverallMarkdownPricing', {
      priceListName: data.markdownPriceListName3,
      customRate: data.customRate
    });

    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });


  }

  async fillAndSubmitProfileWiseItemSpecificPricing(data) {     
    // Navigate to pricing creation
    await this.inventoryLink.click();
    await this.page.waitForTimeout(2000);
    await this.pricingLink.click();
    await this.addPricingButton.click();
    await this.page.waitForTimeout(2000); // Wait for modal to appear

    await this.priceListNameField.fill(data.priceListName6);
    await this.addDescriptionButton.click();
    await this.removeDescriptionButton.click(); // Remove description if it exists
    await this.addDescriptionButton.click();
    await this.descriptionInput.fill(data.description);
    await this.priceListTypeDropdown.click();
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.priceListTypeOption2.click();
    await this.assignPriceListToDropdown.click();
    await this.assignPriceListOption.click();
    await this.itemSelectionField.fill(data.profileName1);

    const jsondata_productItem= getSection('productItemCreateData');

    await this.itemSpecificCard.click();
    await this.page.waitForTimeout(2000); // Wait for item-specific section to appear
    await this.itemNameField.fill(jsondata_productItem.productName);
    await this.page.waitForTimeout(2000); // Wait for the dropdown to populate
    await this.itemSelectionOption.first().click();
    await this.page.waitForTimeout(2000);
    await this.itemAmountField.fill(data.primaryUOM);
    await this.savePriceListButton.click();  
    await expect(this.generalPriceListSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('ProfileWiseItemSpecificPricing', {
      priceListName: data.priceListName6,
      customRate: data.customRate,
      itemName: jsondata_productItem.productName,
      itemAmount: data.primaryUOM

    });

  }

  // async logout() {
  //   await this.profileImage.click();
  //   await this.logoutLink.click();
  // }


}


module.exports = { Pricing_general_Create };