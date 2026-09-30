const { SelfHealingBasePage } = require('./self-healing-base-page');
const { expect } = require('@playwright/test');
const { saveSection, getSection } = require('../utils/runtimeDataStore');

class Vendor_Create extends SelfHealingBasePage {
  constructor(page) {
    super(page);

    this.purchaseLink = this.page.getByRole('link', { name: 'Purchase' });
    this.vendorLink = this.page.locator('div').filter({ hasText: /^Vendor$/ }).nth(1);
    this.vendorCreateButton = this.page.getByRole('button', { name: 'Vendor' });

    this.businessVendorLink = this.page.locator('div').filter({ hasText: /^Business Vendor$/ }).first();
    this.individualVendorLink = this.page.locator('div').filter({ hasText: /^Individual Vendor$/ }).first();

    // business vendor 
    this.vendorOrganisationNameField = this.page.getByRole('textbox', { name: 'Organisation Name' });
    this.businessTypeDropdown = this.page.getByRole('combobox', { name: 'Business Type' });
    this.retailerOptionBusinessType = this.page.getByTitle('Retailer', { exact: true });
    this.businessCategoryDropdown = this.page.getByRole('combobox', { name: 'Business Category' });
    this.cosmeticsOptionBusinessType = this.page.getByTitle('Cosmetics', { exact: true });
    this.businessTagDropdown = this.page.locator('.ant-select-selection-overflow');
    this.addBusinessTagButton = this.page.getByRole('button', { name: 'Add Business Tag' });
    this.selectTagOption = this.page.getByText('Tag XJ13OP');
    this.tagNameField = this.page.getByRole('dialog').filter({ hasText: 'CloseSaveCreate Business' }).locator('#name');
    this.tagDescriptionField = this.page.getByRole('textbox', { name: 'Description' });
    this.tagSaveButton = this.page.getByRole('button', { name: 'Save' }).nth(1);
    this.tagSearchField = this.page.locator('(//div[@class="ant-select-selector"])[3]');
    this.openingBalanceField = this.page.locator('#opening_balance');
    this.organisationPhoneNoField = this.page.getByRole('textbox', { name: 'Organisation Phone Number  (' });
    this.organisationEmailID = this.page.getByRole('textbox', { name: 'Email Id  (Optional)' });
    this.addAddressButton = this.page.getByRole('button', { name: 'Add Address' });
    this.addressLine1 = this.page.locator('#billing_address1');
    this.addressLine2 = this.page.locator('#billing_address2');
    this.cityField = this.page.locator('#billing_city');
    this.stateDropdown = this.page.locator('.ant-select.ant-select-lg.ant-select-outlined.ant-select-in-form-item.css-mncuj7.ant-select-single.ant-select-show-arrow.ant-select-show-search > .ant-select-selector > .ant-select-selection-wrap > .ant-select-selection-item');
    this.stateOption = this.page.getByTitle('Meghalaya', { exact: true });
    this.shippingStateOption = this.page.getByTitle('Haryana').nth(1);
    this.pincodeField = this.page.locator('#billing_pincode');
    this.sameAddressCheckbox = this.page.getByRole('checkbox', { name: 'Use Billing address as your' });
    this.shippingaddressLine1 = this.page.locator('#shipping_address1');
    this.shippingaddressLine2 = this.page.locator('#shipping_address2');
    this.shippingcityField = this.page.locator('#shipping_city');
    this.shippingstateDropdown = this.page.locator('div:nth-child(11) > .ant-form-item > .ant-row > .ant-col.ant-form-item-control > .ant-form-item-control-input > .ant-form-item-control-input-content > .ant-select > .ant-select-selector > .ant-select-selection-wrap > .ant-select-selection-item');
    this.shippingpincodeField = this.page.locator('#shipping_pincode');
    this.saveAddressButton = this.page.getByRole('button', { name: 'Save Address' });
    this.gstDropdown = this.page.getByRole('combobox', { name: 'GST Status' });
    this.registederedOptionGST = this.page.getByTitle('Registered', { exact: true });
    this.unregistederedOptionGST = this.page.getByTitle('UnRegistered', { exact: true });
    this.gstNoField = this.page.locator('//input[@id="gst_num"]');
    this.saveButton = this.page.getByRole('button', { name: 'Save', exact: true });  
    this.vendorCreateSuccessMsg = this.page.getByText('Vendor created successfully', { exact: true }); 

    // individual vendor
    this.vendorNameField = this.page.locator('#name');
    this.vendorMobileNo = this.page.locator('#phone');
    


  }

  async createBusinessVendorwithGST(data){     

    await this.purchaseLink.click();
    await this.vendorLink.click();
    await this.vendorCreateButton.click();
    await this.businessVendorLink.click();
    await this.vendorOrganisationNameField.fill(data.vendorOrganisationName);
    await this.businessTypeDropdown.click();
    await this.retailerOptionBusinessType.click();
    await this.businessCategoryDropdown.click();
    await this.cosmeticsOptionBusinessType.click();
    await this.businessTagDropdown.click();
    await this.selectTagOption.click();
    //await this.addBusinessTagButton.click();
    // await this.page.waitForTimeout(2000);
    // await this.tagNameField.fill(data.tagName);
    // await this.tagDescriptionField.fill(data.tagDescription);
    // await this.tagSaveButton.click();
    await this.openingBalanceField.fill(data.openingBalance);
    await this.organisationPhoneNoField.fill(data.organisationPhoneNo);
    await this.organisationEmailID.fill(data.organisationEmailID);

    await this.addAddressButton.click();
    await this.addressLine1.fill(data.addressLine1);
    await this.addressLine2.fill(data.addressLine2);
    await this.cityField.fill(data.city);
    await this.stateDropdown.click();
    await this.stateOption.click();
    await this.pincodeField.fill(data.pincode);
    await this.sameAddressCheckbox.click();
    await this.page.waitForTimeout(2000);
    await this.shippingaddressLine1.fill(data.shippingaddressLine1);
    await this.shippingaddressLine2.fill(data.shippingaddressLine2);
    await this.shippingcityField.fill(data.shippingcity);
    await this.shippingstateDropdown.click();
    await this.shippingStateOption.click();
    await this.shippingpincodeField.fill(data.shippingpincode);
    await this.saveAddressButton.click();

    // registered
    await this.gstDropdown.click();
    await this.registederedOptionGST.click();
    await this.gstNoField.fill(data.gstNo);
    await this.saveButton.click();
    await expect(this.vendorCreateSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('Business_Vendor_withGST', {
      vendorOrganisationName: data.vendorOrganisationName,
      openingBalance: data.openingBalance,
      organisationMobileNo: data.organisationPhoneNo,
      organisationEmail: data.organisationEmailID,
      gstValue: data.gstNo

    });

  }

    async createBusinessVendorwithoutGST(data){     

    await this.purchaseLink.click();
    await this.vendorLink.click();
    await this.vendorCreateButton.click();
    await this.businessVendorLink.click();
    await this.vendorOrganisationNameField.fill(data.vendorOrganisationName1);
    await this.businessTypeDropdown.click();
    await this.retailerOptionBusinessType.click();
    await this.businessCategoryDropdown.click();
    await this.cosmeticsOptionBusinessType.click();
    await this.businessTagDropdown.click();
    await this.selectTagOption.click();
    //await this.addBusinessTagButton.click();
    // await this.page.waitForTimeout(2000);
    // await this.tagNameField.fill(data.tagName);
    // await this.tagDescriptionField.fill(data.tagDescription);
    // await this.tagSaveButton.click();
    await this.openingBalanceField.fill(data.openingBalance1);
    await this.organisationPhoneNoField.fill(data.organisationPhoneNo1);
    await this.organisationEmailID.fill(data.organisationEmailID1);

    await this.addAddressButton.click();
    await this.addressLine1.fill(data.addressLine1);
    await this.addressLine2.fill(data.addressLine2);
    await this.cityField.fill(data.city);
    await this.stateDropdown.click();
    await this.stateOption.click();
    await this.pincodeField.fill(data.pincode);
    await this.sameAddressCheckbox.click();
    await this.page.waitForTimeout(2000);
    await this.shippingaddressLine1.fill(data.shippingaddressLine1);
    await this.shippingaddressLine2.fill(data.shippingaddressLine2);
    await this.shippingcityField.fill(data.shippingcity);
    await this.shippingstateDropdown.click();
    await this.shippingStateOption.click();
    await this.shippingpincodeField.fill(data.shippingpincode);
    await this.saveAddressButton.click();

    // registered
    await this.gstDropdown.click();
    await this.unregistederedOptionGST.click();
    await this.saveButton.click();
    await expect(this.vendorCreateSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('Business_Vendor_withoutGST', {
      vendorOrganisationName: data.vendorOrganisationName1,
      openingBalance: data.openingBalance1,
      organisationMobileNo: data.organisationPhoneNo1,
      organisationEmail: data.organisationEmailID1,

    });

  }

  async createIndividualVendor(data){     

    await this.purchaseLink.click();
    await this.vendorLink.click();
    await this.vendorCreateButton.click();
    await this.individualVendorLink.click();
    await this.page.waitForTimeout(2000);
    await this.vendorNameField.fill(data.vendorName);
    await this.vendorMobileNo.fill(data.mobileNo);
    await this.openingBalanceField.fill(data.openingBalance);
    await this.organisationEmailID.fill(data.email);
    await this.businessTagDropdown.click();
    await this.selectTagOption.click();
    await this.vendorNameField.click();
    await this.addAddressButton.click();
    await this.addressLine1.fill(data.addressLine1);
    await this.addressLine2.fill(data.addressLine2);
    await this.cityField.fill(data.city);
    await this.stateDropdown.click();
    await this.stateOption.click();
    await this.pincodeField.fill(data.pincode);
    await this.sameAddressCheckbox.click();
    await this.page.waitForTimeout(2000);
    await this.shippingaddressLine1.fill(data.shippingaddressLine1);
    await this.shippingaddressLine2.fill(data.shippingaddressLine2);
    await this.shippingcityField.fill(data.shippingcity);
    await this.shippingstateDropdown.click();
    await this.shippingStateOption.click();
    await this.shippingpincodeField.fill(data.shippingpincode);
    await this.saveAddressButton.click();

    await this.saveButton.click();
    await expect(this.vendorCreateSuccessMsg).toBeVisible({ timeout: 5000 });

    saveSection('Individual_Vendor', {
      vendorName: data.vendorName,
      openingBalance: data.openingBalance,
      mobileNo: data.mobileNo,
      organisationEmail: data.email,

    });

    
  }
}

module.exports = { Vendor_Create };