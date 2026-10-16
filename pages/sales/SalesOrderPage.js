'use strict';

const { expect } = require('@playwright/test');
const { CustomerTransactionPage } = require('./CustomerTransactionPage');
const { masterData } = require('../../test-data/UserData');
const { money } = require('../../utils/stockMath');

const FORM_URL = /sales-order-bill\//;

/**
 * Invoice app → Sales → Sales Order. The order form is the same component as the Sales Invoice
 * form (same field ids, lines, summary) plus Mode Of Transport / Delivery Date / Expected Delivery
 * Date, so this page object reuses SalesInvoiceEditPage (through CustomerTransactionPage) and only
 * overrides navigation, save and the list. Convert To Invoice opens a prefilled Sales Invoice form.
 */
class SalesOrderPage extends CustomerTransactionPage {

  constructor(page) {
    super(page);
    // The order form reuses id "new_si_bill_no" for both SO No (read-only, first) and Ref No (second)
    this.billNoInput = this.page.locator('#new_si_bill_no').first();
    this.orderRefNo = this.page.locator('#new_si_bill_no').nth(1);
    this.salesOrderTab = this.page.getByRole('tab', { name: 'Sales Order' });
    this.newOrderBtn = this.page.getByRole('button', { name: /New Sales Order/ });
    this.transportSelect = this.antSelect('#transport_mode');
    this.deliveryDate = this.page.locator('#delivery_date');
    this.expectedDeliveryDate = this.page.locator('#expected_delivery_date');
    this.warehouseSelect = this.antSelect('#warehouse');
    this.convertBtn = this.page.getByRole('button', { name: 'Convert To Invoice' });
    this.previewDrawer = this.page.locator('.ant-drawer-content').filter({ visible: true }).last();
  }

  /** Sales → Sales Order → New → customer → Next. opts: { customerName, billDate, transport ('Road' default, null = leave empty) }. */
  async startInvoice({ customerName = masterData.customerName, billDate, transport = 'Road' } = {}) {
    await this.salesTab.click();
    await this.salesOrderTab.click();
    await this.newOrderBtn.click();
    await this.pickCustomer(customerName);
    await this.customerProceedBtn.click();
    await expect(this.billNoInput).not.toHaveValue('');
    await this.settle(2000, 'order form loads');
    if (billDate) await this.setBillDate(billDate);
    if (transport) await this.setTransport(transport);
    const no = await this.billNoInput.inputValue();
    console.log(`New Sales Order ${no}`);
    return no;
  }

  async setTransport(mode) {
    await this.pickOption(this.transportSelect, mode);
  }

  async setDeliveryDate(date) {
    await this.deliveryDate.click();
    await this.deliveryDate.press('Control+A');
    await this.page.keyboard.type(date);
    await this.page.keyboard.press('Enter');
    await this.settle(500, 'delivery date applies');
  }

  /** { soDate, term, transport, deliveryDate, expectedDeliveryDate, warehouse } of the open form. */
  async readOrderHeader() {
    return {
      soDate: await this.billDateInput.inputValue(),
      term: await this.selectedText(this.dueTermSelect),
      transport: await this.selectedText(this.transportSelect),
      deliveryDate: await this.deliveryDate.inputValue(),
      expectedDeliveryDate: await this.expectedDeliveryDate.inputValue(),
      warehouse: await this.selectedText(this.warehouseSelect),
    };
  }

  async save() {
    await this.saveBtn.click();
    try {
      await expect(this.page).not.toHaveURL(FORM_URL, { timeout: 20_000 });
    } catch {
      const msgs = await this.validationMessage.allInnerTexts().catch(() => []);
      throw new Error(`Sales Order was not saved — form still open. Messages: ${msgs.join(' | ') || 'none'}`);
    }
    await this.settle(2500, 'order saved');
  }

  async saveExpectRefused() {
    await this.saveBtn.click();
    await expect(this.validationMessage.first()).toBeVisible();
    const message = (await this.validationMessage.allInnerTexts()).join(' | ');
    await this.settle(1500, 'give a wrong save time to navigate');
    await expect(this.page).toHaveURL(FORM_URL);
    console.log(`Order save refused: "${message}"`);
    return message;
  }

  async discardForm() {
    await this.formCancelBtn.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await expect(this.page).not.toHaveURL(FORM_URL);
  }

  async _searchList(no) {
    await this.salesTab.click();
    await this.salesOrderTab.click();
    await this.fillInto(this.listSearch, no);
    await this.settle(2500, 'order search');
  }

  /** { date, no, customer, salesPerson, status, bill } from the Sales Order list. */
  async listRow(no) {
    await this._searchList(no);
    const row = this.invoiceRow(no).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    return { date: c[1], no: c[2], customer: c[3], salesPerson: c[4], status: c[5], bill: money(c[6]) };
  }

  /** Delete the order from its preview; it must leave the list. */
  async deleteOrder(no) {
    await this.openInvoice(no);
    await this.previewDrawer.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.yesBtn.click();
    await this.settle(3000, 'order deleted');
    await this.page.keyboard.press('Escape');
    await this._searchList(no);
    await expect(this.invoiceRow(no), `${no} deleted`).toHaveCount(0);
  }

  /** Delete click on the order preview; returns the confirmation / message text shown. */
  async tryDeleteOrder(no) {
    await this.openInvoice(no);
    await this.previewDrawer.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.settle(1200, 'delete prompt');
    return (await this.page.locator('.ant-modal-content, .ant-popover, .ant-message-notice').filter({ visible: true }).allInnerTexts()).join(' | ');
  }

  /** Convert To Invoice from the order preview → prefilled Sales Invoice form. Returns the invoice no. */
  async convertToInvoice(no) {
    await this.openInvoice(no);
    await this.convertBtn.click();
    await expect(this.page).toHaveURL(/sales-bill\/add.*[?&]so=\d+/);
    await expect(this.billNoInput).not.toHaveValue('');
    await this.settle(2500, 'invoice form prefilled from the order');
    return this.billNoInput.inputValue();
  }

  /** Save the Sales Invoice opened by Convert To Invoice. */
  async saveConvertedInvoice() {
    await this.saveBtn.click();
    await expect(this.page, 'converted invoice saved').not.toHaveURL(/\/sales-bill\/add/, { timeout: 20_000 });
    await this.settle(3000, 'invoice posts stock');
  }

  /** { status, bill, due } of a Sales Invoice in the Sales Invoice list. */
  async invoiceListRow(billNo) {
    await this.salesTab.click();
    await this.page.getByRole('tab', { name: 'Sales Invoice' }).click();
    await this.fillInto(this.listSearch, billNo);
    await this.settle(2500, 'invoice search');
    const row = this.invoiceRow(billNo).first();
    await expect(row).toBeVisible();
    const c = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    return { status: c[4], bill: money(c[5]), due: money(c[6]) };
  }

  /** Customer page → Sales Order tab: [{ cells, text }] rows. */
  async readCustomerOrders() {
    await this.openCustomerTab('Sales Order');
    return (await this._readAllVisibleRows()).map((cells) => ({ cells, text: cells.join(' | ') }));
  }
}

module.exports = { SalesOrderPage };
