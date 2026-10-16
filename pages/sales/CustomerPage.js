'use strict';

const { expect } = require('@playwright/test');
const { CustomerTransactionPage } = require('./CustomerTransactionPage');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Invoice app → Sales → Customer. "Customer" button → "Business Customer" opens ONE form
 * (not a 3-step wizard): Organisation Name, Business Type / Category / Tag, Opening Balance
 * (type + amount), Business Location (display), Phone, Email, GST Status / GST Number,
 * Add Address (billing + "Use Billing address as your Shipping Address"), Save.
 * Editing is on the customer's View Details page (…/customer/<id>/org-info): one "Edit" button
 * per field (Display Name, Email, Phone, Business Type, Category, Tag, PAN, Opening Balance),
 * "Edit Address", "Inactive" — no GST Status edit and no Delete.
 */
class CustomerPage extends CustomerTransactionPage {

  constructor(page) {
    super(page);
    this.newCustomerBtn = this.page.getByRole('button', { name: 'Customer', exact: true });
    this.businessCustomerOption = this.page.locator('div').filter({ hasText: /^Business Customer$/ }).first();
    this.nameInput = this.page.locator('#name');
    this.openingBalance = this.page.locator('#opening_balance');
    this.phoneInput = this.page.locator('#phone');
    this.emailInput = this.page.locator('#email');
    this.countryInput = this.page.locator('#country');
    this.gstNumber = this.page.locator('#gst_num');
    this.addAddressBtn = this.page.getByRole('button', { name: 'Add Address' });
    this.editAddressBtn = this.page.getByRole('button', { name: 'Edit Address' });
    this.saveAddressBtn = this.page.getByRole('button', { name: 'Save Address' });
    this.sameShipping = this.page.getByRole('checkbox', { name: /Use Billing address as your Shipping Address/ });
    this.customerSaveBtn = this.page.getByRole('button', { name: 'Save', exact: true }).last();
    this.closeBtn = this.page.getByRole('button', { name: 'Close', exact: true });
    this.formErrorsLoc = this.page.locator('.ant-form-item-explain-error').filter({ visible: true });
    this.customerSearch = this.page.getByPlaceholder('Search').first();
    this.editModal = this.page.getByRole('dialog').filter({ visible: true }).last();
    this.inactiveBtn = this.page.getByRole('button', { name: 'Inactive' });
  }

  select(id) {
    return this.page.locator(`.ant-select:has(#${id})`).first();
  }

  /** Options of the select `id` (waits for them to load). */
  async selectOptions(id) {
    await this.select(id).locator('.ant-select-selector').click();
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).first().waitFor({ timeout: 5000 }).catch(() => {});
    const opts = (await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    await this.settle(300, 'dropdown closes');
    return opts;
  }

  /** Pick `text` in select `id` (the first option when text === true). */
  async pick(id, text) {
    await this.select(id).locator('.ant-select-selector').click();
    const opts = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`);
    await opts.first().waitFor({ timeout: 10_000 });
    if (text === true) await opts.first().click();
    else await opts.filter({ hasText: new RegExp(`^\\s*${escapeRegex(text)}\\s*$`) }).first().click();
    await this.settle(500, `${id} picked`);
  }

  /** Multi-select: open once, click every option, close. */
  async pickMany(id, texts) {
    await this.select(id).locator('.ant-select-selector').click();
    const opts = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`);
    await opts.first().waitFor({ timeout: 10_000 });
    for (const t of texts) {
      await opts.filter({ hasText: new RegExp(`^\\s*${escapeRegex(t)}\\s*$`) }).first().click();
      await this.settle(400, `${t} picked`);
    }
    await this.page.keyboard.press('Escape');
    await this.settle(400, 'dropdown closes');
  }

  async picked(id) {
    const item = this.select(id).locator('.ant-select-selection-item');
    return (await item.count()) ? (await item.allInnerTexts()).map((t) => t.trim()).join(', ') : '';
  }

  // ── create ─────────────────────────────────────────────────────────────────

  async openNewCustomer() {
    await this.salesTab.click();
    await this.customerTab.click();
    await this.settle(1500, 'customer list');
    await this.newCustomerBtn.click();
    await this.businessCustomerOption.click();
    await expect(this.nameInput).toBeVisible();
    await this.settle(1000, 'customer form');
  }

  /**
   * Fill the open customer form. c: { name, type, category (text | true = first), tags [],
   * obType, opening, phone, email, gst ('UnRegistered' default | 'Registered' | null), gstin,
   * address: { line1, line2, city, state, pincode, shipping: { line1, line2, city, state, pincode } } }
   */
  async fillCustomer(c) {
    if (c.name !== undefined) await this.nameInput.fill(c.name);
    if (c.type) await this.pick('business_type', c.type);
    if (c.category) await this.pick('business_category', c.category);
    if (c.tags?.length) await this.pickMany('business_tags', c.tags);
    if (c.obType) await this.pick('opening_balance_type', c.obType);
    if (c.opening !== undefined) await this.openingBalance.fill(String(c.opening));
    if (c.phone !== undefined) await this.phoneInput.fill(c.phone);
    if (c.email !== undefined) await this.emailInput.fill(c.email);
    const gst = c.gst === undefined ? 'UnRegistered' : c.gst;
    if (gst) await this.pick('registration_type', gst);
    if (c.gstin !== undefined) await this.gstNumber.fill(c.gstin);
    if (c.address) await this.fillAddress(c.address);
  }

  async fillAddress(a, { save = true } = {}) {
    if (await this.addAddressBtn.isVisible().catch(() => false)) await this.addAddressBtn.click();
    else await this.editAddressBtn.click();
    await expect(this.page.locator('#billing_address1')).toBeVisible();
    await this._fillAddressBlock('billing', a);
    if (a.shipping) {
      if (await this.sameShipping.isChecked()) await this.sameShipping.uncheck();
      await this._fillAddressBlock('shipping', a.shipping);
    } else if (a.sameShipping === false) {
      if (await this.sameShipping.isChecked()) await this.sameShipping.uncheck();
    } else if (!(await this.sameShipping.isChecked())) {
      await this.sameShipping.check();
    }
    if (save) {
      await this.saveAddressBtn.click();
      await this.settle(1000, 'address saved');
    }
  }

  async _fillAddressBlock(kind, a) {
    if (a.line1 !== undefined) await this.page.locator(`#${kind}_address1`).fill(a.line1);
    if (a.line2 !== undefined) await this.page.locator(`#${kind}_address2`).fill(a.line2);
    if (a.city !== undefined) await this.page.locator(`#${kind}_city`).fill(a.city);
    if (a.state) {
      await this.select(`${kind}_state`).locator('.ant-select-selector').click();
      await this.page.keyboard.type(a.state);
      await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: new RegExp(`^\\s*${escapeRegex(a.state)}\\s*$`) }).first().click();
    }
    if (a.pincode !== undefined) await this.page.locator(`#${kind}_pincode`).fill(a.pincode);
  }

  async formErrors() {
    await this.settle(800, 'validation renders');
    return (await this.formErrorsLoc.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  /** Save the new customer: must show "Customer created successfully". */
  async saveCustomer() {
    await this.customerSaveBtn.click();
    await expect(this.toast.filter({ hasText: /Customer created successfully/i }).first(), 'customer created').toBeVisible({ timeout: 15_000 });
    await this.settle(2000, 'customer saved');
  }

  /** Save that may be refused: { saved, errors, message }. */
  async trySaveCustomer() {
    await this.customerSaveBtn.click();
    const saved = await this.toast.filter({ hasText: /created successfully/i }).first().waitFor({ timeout: 6000 }).then(() => true, () => false);
    const errors = await this.formErrors();
    const message = (await this.toast.allInnerTexts().catch(() => [])).join(' | ');
    console.log(`Customer save ${saved ? 'accepted' : 'refused'}: ${errors.join(' | ') || message || 'no message'}`);
    if (saved) await this.settle(2000, 'customer saved');
    return { saved, errors, message };
  }

  async closeForm() {
    // The address panel covers the form's Close — leave it first
    if (await this.saveAddressBtn.isVisible().catch(() => false)) {
      await this.page.getByRole('button', { name: 'Back', exact: true }).last().click();
      await this.settle(800, 'address panel closed');
    }
    if (await this.closeBtn.isVisible().catch(() => false)) await this.closeBtn.click({ force: true });
    await this.settle(800, 'form closed');
  }

  async createCustomer(c) {
    await this.openNewCustomer();
    await this.fillCustomer(c);
    await this.saveCustomer();
    console.log(`Created customer ${c.name}`);
    return c.name;
  }

  /** Customer names in the customer list matching `text`. */
  async searchCustomers(text) {
    await this.salesTab.click();
    await this.customerTab.click();
    await this.settle(1500, 'customer list');
    await this.customerSearch.fill(text);
    await this.settle(2500, 'customer search');
    return this.page.locator('div').filter({ hasText: new RegExp(`^${escapeRegex(text)}`) })
      .evaluateAll((es) => [...new Set(es.filter((e) => !e.children.length).map((e) => e.innerText.trim()))]);
  }

  async openCustomer(name) {
    await this.salesTab.click();
    await this.customerTab.click();
    await this.settle(1500, 'customer list');
    await this.customerSearch.fill(name);
    await this.settle(2000, 'customer search');
    const info = this.page.waitForResponse((r) => r.url().includes('/client/client-info/') && r.ok(), { timeout: 15_000 }).catch(() => null);
    await this.customerLink(name).first().click();
    await info;
    await expect(this.viewDetailsBtn).toBeVisible();
    await this.settle(2500, 'customer page renders');
  }

  // ── details / edit ─────────────────────────────────────────────────────────

  async openDetails(name) {
    await this.openCustomer(name);
    await this.viewDetailsBtn.click();
    await expect(this.page).toHaveURL(/org-info/);
    await this.settle(2500, 'customer details');
  }

  /** The label → value rows of Basic Info (DISPLAY NAME, EMAIL, …), plus billing / shipping text. */
  async readDetails() {
    const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const grab = (label, next) => {
      const m = text.match(new RegExp(`${label} (.*?) (?:Edit )?(?=${next})`));
      return m ? m[1].trim() : '';
    };
    return {
      name: grab('DISPLAY NAME', 'EMAIL'),
      email: grab('EMAIL', 'PHONE NUMBER'),
      phone: grab('PHONE NUMBER', 'BUSINESS TYPE'),
      type: grab('BUSINESS TYPE', 'BUSINESS CATEGORY'),
      category: grab('BUSINESS CATEGORY', 'BUSINESS TAG'),
      tags: grab('BUSINESS TAG', 'PAN NUMBER'),
      gst: grab('GST STATUS', 'OPENING BALANCE'),
      opening: grab('OPENING BALANCE', 'Credit control|Contact'),
      billing: grab('BILLING ADDRESS', 'SHIPPING ADDRESS'),
      shipping: grab('SHIPPING ADDRESS', 'Edit Address|Bank Account'),
      text,
    };
  }

  /** The row's Edit button of a Basic Info field (label as shown, e.g. 'PHONE NUMBER'). */
  editButtonOf(label) {
    return this.page.locator('div').filter({ hasText: new RegExp(`^${escapeRegex(label)}`) })
      .filter({ has: this.page.getByRole('button', { name: 'Edit', exact: true }) })
      .last().getByRole('button', { name: 'Edit', exact: true });
  }

  /** Click the field's Edit and return the edit modal. */
  async openFieldEdit(label) {
    await this.editButtonOf(label).click();
    await expect(this.editModal).toBeVisible();
    await this.settle(800, 'edit modal');
    return this.editModal;
  }

  /** Save the edit modal: { saved, errors, message }. */
  async saveFieldEdit() {
    await this.editModal.getByRole('button', { name: 'Save', exact: true }).click();
    const dialogs = this.page.getByRole('dialog').filter({ visible: true });
    const saved = await expect(dialogs).toHaveCount(0, { timeout: 12_000 }).then(() => true, () => false)
      || (await this.toast.filter({ hasText: /updated|success/i }).count()) > 0;
    const errors = await this.formErrors();
    const message = (await this.toast.allInnerTexts().catch(() => [])).join(' | ');
    console.log(`Field edit ${saved ? 'saved' : 'refused'}: ${errors.join(' | ') || message || 'no message'}`);
    if (saved) await this.settle(2000, 'customer updated');
    return { saved, errors, message };
  }

  async cancelFieldEdit() {
    await this.editModal.getByRole('button', { name: 'Back' }).click();
    await this.settle(800, 'edit cancelled');
  }

  /** Edit one text field (input inside the modal) and save. */
  async editTextField(label, value) {
    const m = await this.openFieldEdit(label);
    await m.locator('input:not([type=search])').filter({ visible: true }).first().fill(String(value));
    return this.saveFieldEdit();
  }

  /** Business Type / Category edit: a radio list in the modal. */
  async editRadioField(label, text) {
    const m = await this.openFieldEdit(label);
    await m.getByText(text, { exact: true }).first().click();
    return this.saveFieldEdit();
  }

  /** Radio options of the Business Type / Category edit modal (cancelled afterwards). */
  async radioOptions(label) {
    const m = await this.openFieldEdit(label);
    const opts = await m.locator('input[type=radio]').evaluateAll((rs) => rs.map((r) => {
      let el = r;
      while (el.parentElement && !el.innerText.trim()) el = el.parentElement;
      return el.innerText.trim();
    }));
    await this.cancelFieldEdit();
    return opts;
  }

  /** Add a Business Tag on the details page. */
  async addTag(tag) {
    await this.openFieldEdit('BUSINESS TAG');
    await this.pick('business_tag', tag);
    await this.page.keyboard.press('Escape');
    return this.saveFieldEdit();
  }

  /** Edit the address from the details page (same form as on create). */
  async editAddress(a) {
    await this.fillAddress(a);
    await this.settle(2000, 'address updated');
  }
}

module.exports = { CustomerPage };
