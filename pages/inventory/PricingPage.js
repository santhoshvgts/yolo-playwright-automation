'use strict';

const { expect } = require('@playwright/test');
const { SalesInvoiceEditPage } = require('../sales/SalesInvoiceEditPage');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Inventory → Pricing (`/inventory?tab=4`). List: Price List Name, List Type, Pricing ("Markup 10%",
 * "Markdown 10%", "Custom Price"), Status (Active / Not Active), No Of Items ("All Items" | "N Items");
 * "Search", "Total Count: N". "Pricing" button → FULL PAGE `/inventory/price-list` (no app menu — go back by URL):
 * #name, "Add Description" (counter "N / 300"), #pricelist_type (General | Profile wise | Category wise),
 * #distributor_ids, "Overall Markup" | "Item Specific", #custom_rate_prefix (Markup | Markdown), #custom_rate;
 * Profile wise → "+ Add Profile"; Category wise → #business_type (Retailer), #business_category;
 * Item Specific → item search ("Add item by entering product name or product code") + Item List.
 * Cancel / "Save Price List" → toast "Price List Created Successfully", back on the list.
 * Blank save: "Name is Required", "Custom Rate is Required". View drawer: Close, Active switch, Edit;
 * LIST TYPE, CUSTOM RATE, DISTRIBUTORS. A General list changes the rate of EVERY sales invoice line —
 * tests must deactivate what they create.
 */
class PricingPage extends SalesInvoiceEditPage {

  constructor(page) {
    super(page);
    this.listTab = 4;
    this.formUrl = /inventory\/price-list/;
    this.newPricingBtn = this.page.getByRole('button', { name: /Pricing/ }).first();
    this.plSearch = this.page.getByPlaceholder('Search').filter({ visible: true }).first();
    this.plRows = this.page.locator('table tbody tr.ant-table-row').filter({ visible: true });
    this.plSave = this.page.getByRole('button', { name: 'Save Price List' });
    this.plCancel = this.page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.plDrawer = this.page.locator('.ant-drawer-content').filter({ visible: true }).last();
    this.plErrors = this.page.locator('.ant-form-item-explain-error').filter({ visible: true });
    this.plToast = this.page.locator('.ant-message');
    this.rateInput = this.page.locator('#custom_rate');
    this.nameInput = this.page.locator('#name');
  }

  base() { return this.page.url().replace(/(\.xyz\/[0-9a-f]+).*/, '$1'); }

  async openPricingList() {
    if (!/\.xyz\/[0-9a-f]{20,}/.test(this.page.url())) await this.open();
    await this.page.goto(`${this.base()}/inventory?tab=${this.listTab}`);
    await expect(this.page.locator('table thead th').first()).toBeVisible();
    await this.settle(2000, 'pricing list');
  }

  /** Back to the app shell (the price-list form page has no menu). */
  async backToApp() {
    await this.page.goto(this.base());
    await this.settle(3000, 'app shell');
  }

  async searchLists(text) {
    await this.openPricingList();
    await this.fillInto(this.plSearch, text);
    await this.settle(2500, 'pricing search');
    return this.plRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
  }

  async totalCount() {
    return parseInt((await this.page.getByText(/Total Count:\s*\d+/).first().innerText()).match(/\d+/)[0], 10);
  }

  /** { name, type, pricing, status, items } of list `name` (null when absent). */
  async listRowOf(name) {
    const r = (await this.searchLists(name)).find((c) => c[0] === name);
    return r ? { name: r[0], type: r[1], pricing: r[2], status: r[3], items: r[4] } : null;
  }

  async openNewList() {
    await this.openPricingList();
    await this.newPricingBtn.click();
    await expect(this.page).toHaveURL(this.formUrl);
    await expect(this.nameInput).toBeVisible();
    await this.settle(1500, 'price list form');
  }

  async pickIn(id, text, { type = false } = {}) {
    await this.page.locator(`.ant-select:has(#${id})`).first().locator('.ant-select-selector').click();
    if (type) await this.page.keyboard.type(text);
    const opt = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: new RegExp(`^\\s*${esc(text)}`) }).first();
    await opt.waitFor({ timeout: 10_000 });
    await opt.click();
    await this.settle(500, `${id} = ${text}`);
  }

  async optionsOf(id) {
    await this.page.locator(`.ant-select:has(#${id})`).first().locator('.ant-select-selector').click();
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).first().waitFor({ timeout: 5000 }).catch(() => {});
    const o = (await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return o;
  }

  /**
   * Fill the form: { name, desc, type ('General'), mode ('Overall Markup' | 'Item Specific'), prefix ('Markup'),
   * rate, businessType, businessCategory, profiles: [customer], items: [{ name, price }] }.
   */
  async fillList(l) {
    if (l.name !== undefined) await this.nameInput.fill(l.name);
    if (l.desc !== undefined) {
      await this.page.getByRole('button', { name: 'Add Description' }).click();
      await this.page.locator('textarea').filter({ visible: true }).first().fill(l.desc);
    }
    if (l.type && l.type !== 'General') await this.pickIn('pricelist_type', l.type);
    if (l.businessType) await this.pickIn('business_type', l.businessType);
    if (l.businessCategory === true) {
      await this.page.locator('.ant-select:has(#business_category)').first().locator('.ant-select-selector').click();
      await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).first().click();
      await this.page.keyboard.press('Escape');
    } else if (l.businessCategory) await this.pickIn('business_category', l.businessCategory);
    for (const p of l.profiles || []) await this.addProfile(p);
    if (l.mode === 'Item Specific') {
      await this.page.getByText('Item Specific', { exact: true }).first().click();
      await this.settle(800, 'item specific');
      for (const it of l.items || []) await this.addListItem(it);
    } else {
      await this.page.getByText('Overall Markup', { exact: true }).first().click().catch(() => {});
      if (l.prefix && l.prefix !== 'Markup') await this.pickIn('custom_rate_prefix', l.prefix);
      if (l.rate !== undefined) await this.rateInput.fill(String(l.rate));
    }
  }

  async addProfile(customer) {
    await this.page.getByText(/\+?\s*Add Profile/).first().click({ force: true });
    await this.settle(1500, 'profile picker');
    const scope = this.page.locator('.ant-modal-content, .ant-drawer-content, .ant-popover, .ant-select-dropdown').filter({ visible: true }).last();
    const search = scope.locator('input').filter({ visible: true }).first();
    if (await search.count()) await search.fill(customer);
    else await this.page.keyboard.type(customer);
    await this.settle(2000, 'profile search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option, .ant-modal-content label, .ant-modal-content li, .ant-modal-content tr`)
      .filter({ hasText: new RegExp(esc(customer), 'i') }).first().click();
    const ok = this.page.locator('.ant-modal-content').filter({ visible: true }).getByRole('button', { name: /^(Add|Save|OK|Done|Apply)$/ }).last();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.settle(800, 'profile added');
  }

  /** Item Specific: search the item, pick it, set its primary UOM price. */
  async addListItem({ name, price }) {
    const box = this.page.locator('.ant-select').filter({ hasText: /Add item by entering/ }).first();
    await box.locator('.ant-select-selector').click();
    await this.page.keyboard.type(name);
    await this.settle(2000, 'item search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: name }).first().click();
    await this.settle(1000, 'item added');
    if (price !== undefined) {
      const row = this.page.locator('table tbody tr').filter({ hasText: name }).first();
      await this.fillInto(row.locator('input[type="text"], input:not([type])').filter({ visible: true }).first(), String(price));
    }
  }

  /** Save Price List: { saved, errors, message }. */
  async trySaveList() {
    if (await this.plSave.isDisabled().catch(() => false)) {
      console.log('Save button disabled — save refused');
      return { saved: false, errors: ['Save disabled'], message: 'Save disabled' };
    }
    await this.plSave.click();
    const saved = await this.plToast.filter({ hasText: /success/i }).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
    const errors = await this.plErrors.allInnerTexts().catch(() => []);
    const message = (await this.plToast.allInnerTexts().catch(() => [])).join(' | ');
    console.log(`Price list save ${saved ? 'accepted' : 'refused'}: ${errors.join(' | ') || message || 'no message'}`);
    if (saved) await this.settle(2000, 'list saved');
    return { saved, errors, message };
  }

  async createList(l) {
    await this.openNewList();
    await this.fillList(l);
    const r = await this.trySaveList();
    if (!r.saved) throw new Error(`Price list ${l.name} not saved: ${r.errors.join(' | ') || r.message}`);
    return l.name;
  }

  async discardList() {
    await this.plCancel.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await this.settle(1500, 'form closed');
  }

  /** Open list `name` → view drawer text. */
  async openList(name) {
    await this.searchLists(name);
    await this.plRows.filter({ has: this.page.locator('td').first().filter({ hasText: name }) }).first().locator('td').first().click();
    await expect(this.plDrawer).toBeVisible();
    await this.settle(2000, 'price list view');
    return (await this.plDrawer.innerText()).replace(/\s+/g, ' ');
  }

  plSwitch() { return this.plDrawer.locator('.ant-switch').first(); }

  /** Set the list active / inactive from its view. */
  async setActive(name, active) {
    await this.openList(name);
    const sw = this.plSwitch();
    if (((await sw.getAttribute('aria-checked')) === 'true') !== active) {
      await sw.click();
      await this.settle(1500, 'status change');
      const yes = this.page.locator('.ant-popover, .ant-modal-content').filter({ visible: true }).getByRole('button', { name: /^(Yes|OK|Confirm)$/ }).last();
      if (await yes.isVisible().catch(() => false)) await yes.click();
      await this.settle(1500, 'status saved');
    }
    await this.page.keyboard.press('Escape');
  }

  /** Deactivate EVERY active list whose name contains `prefix` (all pages, duplicate names included). Returns how many. */
  async deactivateAll(prefix) {
    let n = 0;
    for (let round = 0; round < 40; round++) {
      await this.searchLists(prefix);
      let hit = -1;
      for (let pageNo = 0; pageNo < 30; pageNo++) {
        const rows = await this.plRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
        hit = rows.findIndex((r) => r[3] === 'Active');
        if (hit >= 0) break;
        const next = this.page.locator('li.ant-pagination-next').filter({ visible: true }).first();
        if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true') break;
        await next.click();
        await this.settle(1500, 'next page');
      }
      if (hit < 0) break;
      await this.plRows.nth(hit).locator('td').first().click({ force: true });
      await expect(this.plDrawer).toBeVisible();
      await this.settle(1500, 'view');
      const sw = this.plSwitch();
      if ((await sw.getAttribute('aria-checked')) === 'true') { await sw.click(); await this.settle(2000, 'deactivated'); n += 1; }
      await this.page.keyboard.press('Escape');
      await this.settle(800, 'view closed');
    }
    console.log(`Deactivated ${n} "${prefix}" entr${n === 1 ? 'y' : 'ies'}`);
    return n;
  }

  async editList(name) {
    await this.openList(name);
    await this.plDrawer.getByRole('button', { name: 'Edit' }).click();
    await expect(this.nameInput).toBeVisible();
    await this.settle(2000, 'edit price list');
  }

  /** Rate of `item` on a new sales invoice for `customerName` (form discarded). */
  async invoiceRate(item, customerName) {
    await this.backToApp();
    await this.startInvoice(customerName ? { customerName } : {});
    await this.addLine(item, 1);
    const { rate } = await this.readLine(0);
    await this.discardForm();
    console.log(`Rate of ${item.itemName} for ${customerName || 'default customer'}: ${rate}`);
    return rate;
  }
}

module.exports = { PricingPage };
