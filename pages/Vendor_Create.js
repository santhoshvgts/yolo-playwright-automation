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
    this.cityField = this.page.getByRole('textbox', { name: 'City/Town' });
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
    // Edit Business Vendor

    // Vendor search
    this.searchVendorInput = this.page.getByRole('textbox', { name: 'Search' });
    this.vendorResult = this.page.locator('(//div[@class="_organisation_main_1ly08_1"])[2]');

    // Vendor Details
    this.viewDetailsButton = this.page.getByRole('button', { name: 'View Details' });
    this.editButtons = this.page.getByRole('button', { name: 'Edit' });

    // Edit Display Name
    this.displayNameInput = this.page.getByRole('textbox', { name: 'Display Name' });

    // Edit Email
    this.emailInput = this.page.getByRole('textbox', { name: 'Email Id' });

    // Edit Phone Number
    this.phoneNumberInput = this.page.getByRole('textbox', { name: 'Phone Number' });

    // Edit GST
    this.gstCheckbox = this.page.getByLabel('', { exact: true }).nth(1);

    // Edit Tags
    this.businessTagDropdown = this.page.locator('.ant-select-selection-overflow');
    this.tagOption = this.page.getByText('Tag XJ13OP');

    // Edit PAN
    this.panButton = this.page.locator('div:nth-child(9) > .ant-btn');
    this.panInput = this.page.getByRole('textbox', { name: 'PAN Number' });

    // Edit Opening Balance
    this.openingBalanceButton = this.page.locator('div:nth-child(11) > .ant-btn');
    this.openingBalanceInput = this.page.getByRole('textbox', { name: 'Opening Balance' });

    // Edit Contact
    this.contactInfoButton = this.page.locator('div:nth-child(13) > div > .menu_popover');
    this.contactEditButton = this.page.locator('.ant-popover-inner-content > div > .ant-btn');

    this.contactNameInput = this.page.getByRole('textbox', { name: 'Contact Name' });
    this.contactMobileInput = this.page.getByRole('textbox', { name: 'Contact Mobile Number' });
    this.contactEmailInput = this.page.getByRole('textbox', { name: 'example@email.com' });

    // Add Contact
    this.addContactButton = this.page.getByRole('button', { name: 'Add Contact' });

    // Edit Address
    this.editAddressButton = this.page.getByRole('button', { name: 'Edit Address' });

    this.addressLine1Input = this.page.getByRole('textbox', { name: 'Address Line 1' });
    this.addressLine2Input = this.page.getByRole('textbox', { name: 'Address Line 2 (Optional)' });
    this.cityInput = this.page.getByRole('textbox', { name: 'City/Town' });

    this.stateMeghalaya = this.page.getByText('Meghalaya', { exact: true });
    this.statePuducherry = this.page.getByTitle('Puducherry');

    this.pincodeInput = this.page.getByRole('textbox', { name: 'Pincode' });
    this.saveAddressButton = this.page.getByRole('button', { name: 'Save Address' });

    // Bank Details
    this.addBankButton = this.page.getByRole('button', { name: 'Add Bank Details' });

    this.bankNameInput = this.page.getByRole('textbox', { name: 'Bank Name' });
    this.accountNumberInput = this.page.getByRole('textbox', { name: 'Account Number' });
    this.ifscCodeInput = this.page.getByRole('textbox', { name: 'IFSC Code' });
    this.recipientNameInput = this.page.getByRole('textbox', { name: 'Recipient Name' });

    this.saveBankButton = this.page.getByRole('button', { name: 'Save' });
    this.backFromBankDialog = this.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Back' });

    // Common Save / Close
    //this.saveButton = this.page.getByRole('button', { name: 'Save' });
    this.closeButton = this.page.getByRole('button', { name: 'close-circle' }).first();
    this.verifyEditedVendorName = this.page.locator('._organisation_main_name_1ly08_30').nth(1);



  }

  async createBusinessVendorwithGST(data) {

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

  async createBusinessVendorwithoutGST(data) {

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

  async createIndividualVendor(data) {

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

  async editBusinessVendorwithGST(data) {

  // Navigate to Vendor
  await this.purchaseLink.click();
  await this.vendorLink.click();

  const jsondata_editVendor= getSection('Business_Vendor_withGST');
  // Search Vendor
  await this.searchVendorInput.fill(jsondata_editVendor.vendorOrganisationName);
  await this.vendorResult.click();

  // View Vendor Details
  await this.viewDetailsButton.click();

  await this.page.waitForTimeout(5000);

  // Edit Display Name
  await this.editButtons.first().click();
  await this.displayNameInput.fill(data.displayName);
  await this.saveButton.click();

  // Edit Email
  await this.editButtons.nth(1).click();
  await this.emailInput.fill(data.emailId_2);
  await this.saveButton.click();

  // Edit Phone Number
  await this.editButtons.nth(2).click();
  await this.phoneNumberInput.fill(data.phoneNumber);
  await this.saveButton.click();

  // Edit GST
  await this.editButtons.nth(4).click();
  await this.gstCheckbox.check();
  await this.saveButton.click();

  // Edit Tags
  await this.editButtons.nth(5).click();
  await this.businessTagDropdown.click();
  await this.tagOption.click();
  await this.saveButton.click();

  // Edit PAN Number
  await this.panButton.click();
  await this.panInput.fill(data.panNumber);
  await this.saveButton.click();

  // Edit Opening Balance
  await this.openingBalanceButton.click();
  await this.openingBalanceInput.fill(data.openingBalance);
  await this.saveButton.click();

  // Edit Contact Info
  await this.contactInfoButton.click();
  await this.contactEditButton.click();

  await this.contactNameInput.fill(data.contactName);
  await this.contactMobileInput.fill(data.contactMobileNumber);
  await this.contactEmailInput.fill(data.exampleEmailCom);

  await this.saveButton.click();

  // Add Contact
  await this.addContactButton.click();

  await this.contactNameInput.fill(data.contactName_2);
  await this.contactMobileInput.fill(data.contactMobileNumber_2);
  await this.contactEmailInput.fill(data.exampleEmailCom_2);

  await this.saveButton.click();

  // Edit Address
  await this.editAddressButton.click();

  await this.addressLine1Input.fill(data.addressLine1);
  await this.addressLine2Input.fill(data.addressLine2Optional);
  await this.cityInput.fill(data.cityTown);

  await this.stateMeghalaya.click();
  await this.statePuducherry.click();

  await this.pincodeInput.fill(data.pincode);

  await this.saveAddressButton.click();

  // Back from Address
  const backFromAddressDialog = this.page
    .getByRole('dialog')
    .getByRole('button', { name: 'Back' });

  await backFromAddressDialog.click();

  // Add Bank Details
  await this.addBankButton.click();

  await this.bankNameInput.fill(data.bankName);
  await this.accountNumberInput.fill(data.accountNumber);
  await this.ifscCodeInput.fill(data.ifscCode);
  await this.recipientNameInput.fill(data.recipientName);

  await this.saveBankButton.click();
  await this.backFromBankDialog.click();

  // Close Vendor Details
  await this.closeButton.click();

  saveSection('Business_Vendor_withGST', {  
      editedVendorOrganisationName: data.displayName,
      editedopeningBalance: data.openingBalance,
      editedOrganisationMobileNo: data.contactMobileNumber_2,
      editedOrganisationEmail: data.exampleEmailCom_2

    });

    const jsondata_editVendor1= getSection('Business_Vendor_withGST');

    await this.searchVendorInput.fill(jsondata_editVendor1.editedVendorOrganisationName);

await expect(this.verifyEditedVendorName).toContainText(data.displayName);


}

async editIndividualVendor(data) {

  // Navigate to Vendor
  await this.purchaseLink.click();
  await this.vendorLink.click();

  // Get existing Individual Vendor data
  const jsondata_editVendor = getSection('Individual_Vendor');

  // Search Vendor
  await this.searchVendorInput.fill(
    jsondata_editVendor.vendorName
  );

  await this.vendorResult.click();

  // View Vendor Details
  await this.viewDetailsButton.click();

  await this.page.waitForTimeout(5000);

  // Edit Display Name
  await this.editButtons.first().click();
  await this.displayNameInput.fill(data.editinviDisplayName);
  await this.saveButton.click();

  // Edit Email
  await this.editButtons.nth(1).click();
  await this.emailInput.fill(data.editinviEmailId_2);
  await this.saveButton.click();

  // Edit Phone Number
  await this.editButtons.nth(2).click();
  await this.phoneNumberInput.fill(data.editinviPhoneNumber);
  await this.saveButton.click();

  // Edit GST
  await this.editButtons.nth(4).click();
  await this.gstCheckbox.check();
  await this.saveButton.click();

  // Edit Tags
  await this.editButtons.nth(5).click();
  await this.businessTagDropdown.click();
  await this.tagOption.click();
  await this.saveButton.click();

  // Edit PAN Number
  await this.panButton.click();
  await this.panInput.fill(data.editinviPanNumber);
  await this.saveButton.click();

  // Edit Opening Balance
  await this.openingBalanceButton.click();
  await this.openingBalanceInput.fill(data.editinviOpeningBalance);
  await this.saveButton.click();

  // Edit Contact Info
  //await this.contactInfoButton.click();
  // await this.contactEditButton.click();

  // await this.contactNameInput.fill(data.editinviContactName);
  // await this.contactMobileInput.fill(data.editinviContactMobileNumber);
  // await this.contactEmailInput.fill(data.editinviExampleEmailCom);

  // await this.saveButton.click();

  // Add Contact
  await this.addContactButton.click();

  await this.contactNameInput.fill(data.editinviContactName_2);
  await this.contactMobileInput.fill(data.editinviContactMobileNumber_2);
  await this.contactEmailInput.fill(data.editinviExampleEmailCom_2);

  await this.saveButton.click();

  // Edit Address
  await this.editAddressButton.click();

  await this.addressLine1Input.fill(data.editinviAddressLine1);
  await this.addressLine2Input.fill(data.editinviAddressLine2Optional);
  await this.cityInput.fill(data.editinviCityTown);

  await this.stateMeghalaya.click();
  await this.statePuducherry.click();

  await this.pincodeInput.fill(data.editinviPincode);

  await this.saveAddressButton.click();

  // Back from Address
  const backFromAddressDialog = this.page
    .getByRole('dialog')
    .getByRole('button', { name: 'Back' });

  await backFromAddressDialog.click();

  // Add Bank Details
  await this.addBankButton.click();

  await this.bankNameInput.fill(data.editinviBankName);
  await this.accountNumberInput.fill(data.editinviAccountNumber);
  await this.ifscCodeInput.fill(data.editinviIfscCode);
  await this.recipientNameInput.fill(data.editinviRecipientName);

  await this.saveBankButton.click();
  await this.backFromBankDialog.click();

  // Close Vendor Details
  await this.closeButton.click();

  // Save edited Individual Vendor data
  saveSection('Edit_Individual_Vendor', {
    editedVendorOrganisationName: data.editinviDisplayName,
    editedOpeningBalance: data.editinviOpeningBalance,
    editedOrganisationMobileNo: data.editinviContactMobileNumber_2,
    editedOrganisationEmail: data.editinviExampleEmailCom_2
  });

  // Get edited Individual Vendor data
  const jsondata_editVendor1 = getSection(
    'Edit_Individual_Vendor'
  );

  // Search edited vendor
  await this.searchVendorInput.fill(
    jsondata_editVendor1.editedVendorOrganisationName
  );

  // Verify edited vendor name
  await expect(this.verifyEditedVendorName)
    .toContainText(
      jsondata_editVendor1.editedVendorOrganisationName
    );
}

}

module.exports = { Vendor_Create };