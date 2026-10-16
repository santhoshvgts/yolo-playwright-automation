'use strict';

const { expect } = require('@playwright/test');
const { PurchaseInvoiceFlowPage } = require('./PurchaseInvoiceFlowPage');
const { masterData } = require('../../test-data/UserData');
const { money } = require('../../utils/stockMath');
const { pickerDate, addDays } = require('../sales/SalesInvoiceEditPage');

const FORM_URL = /purchase-order-bill\/add/;
const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';

/**
 * Purchase → Purchase Order. Same form component as the purchase invoice, with Mode of Transport
 * (#transport_mode: Road / Rail / Air / Ship), Delivery Date (#delivery_date, required to save) and
 * no Due Period / Save as Draft. List: Order Date, Order No, Vendor Name, Status, Bill Amount (no
 * checkbox column). Preview: Close, Print, Edit, Delete, Convert To Invoice → purchase invoice form
 * (…/purchase-bill/add/…?po=<id>) with the items and Reference Bill No = PO number.
 */
class PurchaseOrderFlowPage extends PurchaseInvoiceFlowPage {

  constructor(page) {
    super(page);
    this.purchaseOrderTab = this.page.getByRole('tab', { name: 'Purchase Order' });
    this.newOrderBtn = this.page.getByRole('button', { name: /New Purchase Order/ });
    this.transportSelect = this.antSelect('#transport_mode');
    this.deliveryDate = this.page.locator('#delivery_date');
    this.convertBtn = this.page.getByRole('button', { name: /Convert To Invoice/i });
  }

  /** Purchase → Purchase Order → New → vendor → Next; sets transport and delivery date (+5 days) unless null. */
  async startInvoice({ vendorName = masterData.vendorName, customerName, billDate, transport = 'Road', deliveryDate = pickerDate(addDays(new Date(), 5)) } = {}) {
    const vendor = customerName || vendorName;
    await this.purchaseTab.click();
    await this.purchaseOrderTab.click();
    await this.newOrderBtn.click();
    await this.vendorSelect.click();
    await this.page.keyboard.type(vendor);
    await this.settle(1500, 'vendor search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: vendor }).first().click();
    await this.vendorNextBtn.click();
    await expect(this.billNoInput).not.toHaveValue('');
    await this.settle(2000, 'order form loads');
    if (!(await this.selectedText(this.placeOfSupplySelect))) await this.setPlaceOfSupply('Tamil Nadu');
    if (billDate) await this.setBillDate(billDate);
    if (transport) await this.pickOption(this.transportSelect, transport);
    if (deliveryDate) await this.setDeliveryDate(deliveryDate);
    const no = await this.billNoInput.inputValue();
    console.log(`New Purchase Order ${no}`);
    return no;
  }

  async setDeliveryDate(date) {
    await this.deliveryDate.click();
    await this.deliveryDate.press('Control+A');
    await this.page.keyboard.type(date);
    await this.page.keyboard.press('Enter');
    await this.settle(500, 'delivery date applies');
    return this.deliveryDate.inputValue();
  }

  /** { transport, deliveryDate, poDate, ref } of the open form. */
  async readOrderHeader() {
    return {
      transport: await this.selectedText(this.transportSelect),
      deliveryDate: await this.deliveryDate.inputValue(),
      poDate: await this.billDateInput.inputValue(),
      ref: await this.refNoInput.inputValue(),
    };
  }

  async save() {
    await this.saveBtn.click();
    try {
      await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 20_000 });
    } catch {
      const msgs = await this.validationMessage.allInnerTexts().catch(() => []);
      throw new Error(`Purchase Order was not saved — form still open. Messages: ${msgs.join(' | ') || 'none'}`);
    }
    await this.settle(2500, 'order saved');
  }

  async trySave() {
    await this.saveBtn.click();
    const saved = await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 8000 }).then(() => true, () => false);
    const message = (await this.validationMessage.allInnerTexts().catch(() => [])).join(' | ');
    if (saved) await this.settle(2500, 'order saved');
    console.log(`Order save ${saved ? 'accepted' : 'refused'}: "${message}"`);
    return { saved, message };
  }

  async discardForm() {
    await this.formCancelBtn.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL);
  }

  async _searchList(no) {
    await this.purchaseTab.click();
    await this.purchaseOrderTab.click();
    await this.fillInto(this.listSearch, no);
    await this.settle(2500, 'order search');
  }

  /** { date, no, vendor, status, bill } from the Purchase Order list. */
  async listRow(no) {
    await this._searchList(no);
    const row = this.invoiceRow(no).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    const i = c.indexOf(no);
    return { date: c[i - 1], no, vendor: c[i + 1], status: c[i + 2], bill: money(c[c.length - 1]), cells: c };
  }

  async deleteOrder(no) {
    await this.openInvoice(no);
    await this.previewDrawer.getByRole('button', { name: 'Delete', exact: true }).click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await this.settle(3000, 'order deleted');
    await this.page.keyboard.press('Escape');
    await this._searchList(no);
    return (await this.invoiceRow(no).count()) === 0;
  }

  /** Convert To Invoice from the preview → purchase invoice form; returns the invoice no shown. */
  async convertToInvoice(no) {
    await this.openInvoice(no);
    await this.convertBtn.click();
    await expect(this.page).toHaveURL(/purchase-bill\/add.*[?&]po=\d+/);
    await expect(this.billNoInput).not.toHaveValue('');
    await this.settle(2500, 'invoice form prefilled from the order');
    return this.billNoInput.inputValue();
  }

  /** Save the converted invoice (Save and Send, or Save as Draft). */
  async saveConvertedInvoice({ draft = false } = {}) {
    // App defect: the converted invoice opens with an empty Due Date ("Due Date is Required")
    if (await this.dueDateInput.count() && !(await this.dueDateInput.inputValue())) console.log('Converted invoice opened with an empty Due Date');
    await this._ensureDueDate();
    await (draft ? this.saveDraftBtn : this.saveBtn).click();
    await expect(this.page, 'converted invoice saved').not.toHaveURL(/purchase-bill\/add/, { timeout: 20_000 });
    await this.settle(3000, 'invoice posts');
  }

  /** { status, bill, due } of a bill in the Purchase Invoice list. */
  async invoiceListRow(billNo) {
    await this.purchaseTab.click();
    await this.purchaseInvoiceTab.click();
    await this.fillInto(this.listSearch, billNo);
    await this.settle(2500, 'invoice search');
    const row = this.invoiceRow(billNo).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    return { vendor: c[3], status: c[4], bill: money(c[5]), due: money(c[6]) };
  }
}

module.exports = { PurchaseOrderFlowPage };
