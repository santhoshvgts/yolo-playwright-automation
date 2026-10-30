'use strict';

const { expect } = require('@playwright/test');
const { ItemPage } = require('./ItemPage');
const { money } = require('../../utils/stockMath');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Inventory → Products (`/inventory?tab=2&productTab=N`): tabs Items | Asset | Service | Category, one button per
 * tab ("Item" / "Service" / "Category"), "Search", footer "Total Count: N", "Page Size".
 * Items list: Product Name, Stock Status ("<n> pcs Left" | "Out of stocks"), HSN Code, Tax Rate, Sale Price.
 * Item form = ONE drawer "Add New Product" (not a 3-step wizard): #name, #category, #hsn_code (8 digits),
 * #base_unit (pcs), #selling_price, #tax_preference, #tax (GST rate), Add CESS Rate, #sales_account,
 * #cost_per_piece, #purchase_account, Stock Tracking radios, #inventory_account. No opening-stock field.
 * Blank save: "Name is Required", "Selling Price is Required", "Please Select Tax Preference", "Please Select GST".
 * Item detail drawer: Close, Active switch, Edit (basic), Stock (warehouse table), Sale Detail / Tax Preferences /
 * Account Details each with Edit.
 * Service: Service Name, SAC Code, Tax Rate, Sale Price; form #name, #sac_code (6 digits), #base_unit (Nos),
 * #selling_price, #purchase_price, #tax_preference, #tax, #sales_account, #purchase_account (both required).
 * Category: Category Name, Description, Parent Category; form #name, Add Description, #parent.
 */
class InventoryPage extends ItemPage {

  constructor(page) {
    super(page);
    this.formDrawer = this.page.locator('.ant-drawer-content, .ant-modal-content').filter({ visible: true }).last();
    this.listSearchBox = this.page.getByPlaceholder('Search').filter({ visible: true }).first();
    this.rowsLoc = this.page.locator('table tbody tr.ant-table-row').filter({ visible: true });
    this.tabBtn = (tab) => this.page.getByRole('tab', { name: tab, exact: true });
    this.createBtn = (kind) => this.page.getByRole('button', { name: kind, exact: true });
    this.toastLoc = this.page.locator('.ant-message');
    this.formErrors = this.page.locator('.ant-form-item-explain-error').filter({ visible: true });
  }

  async openProducts(tab = 'Items') {
    // By URL when inside the app: an open detail drawer's mask would block the menu link
    const url = this.page.url();
    if (/\.xyz\/[0-9a-f]{20,}/.test(url)) await this.page.goto(`${url.replace(/(\.xyz\/[0-9a-f]+).*/, '$1')}/inventory?tab=2&productTab=1`);
    else { await this.inventoryLink.click(); await this.productsLink.click(); }
    await this.settle(1500, 'products');
    if (!(await this.tabBtn(tab).waitFor({ timeout: 15_000 }).then(() => true, () => false))) {
      console.log('Products tabs not shown — reloading');
      await this.page.reload();
      await this.settle(3000, 'reload');
    }
    await this.tabBtn(tab).click();
    await this.settle(2000, `${tab} list`);
  }

  async searchTab(tab, text) {
    await this.openProducts(tab);
    await this.fillInto(this.listSearchBox, text);
    await this.settle(2500, 'search');
    return this.readRows();
  }

  async readRows() {
    return this.rowsLoc.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
  }

  async totalCount() {
    return parseInt((await this.page.getByText(/Total Count:\s*\d+/).first().innerText()).match(/\d+/)[0], 10);
  }

  /** Select by input id inside the open form: type when `type`, pick the option starting with `text`. */
  async formPick(id, text, { type = false } = {}) {
    await this.formDrawer.locator(`.ant-select:has(#${id})`).first().locator('.ant-select-selector').click();
    if (type) await this.page.keyboard.type(text);
    const opt = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: new RegExp(`^\\s*${esc(text)}`) }).first();
    // Selects without search (e.g. Parent Category) render only the ~10 options in view — scroll until it shows
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).first().waitFor({ timeout: 10_000 }).catch(() => {});
    const holder = this.page.locator(`${OPEN_DROPDOWN} .rc-virtual-list-holder`).last();
    for (let i = 0; i < 300 && !(await opt.isVisible().catch(() => false)); i++) {
      const moved = await holder.evaluate((e) => { const before = e.scrollTop; e.scrollTop += e.clientHeight * 0.8; return e.scrollTop !== before; }).catch(() => false);
      if (!moved) break;
      await this.page.waitForTimeout(150);
    }
    await opt.waitFor({ timeout: 10_000 });
    await opt.click();
    await this.settle(400, `${id} = ${text}`);
  }

  async formOptions(id) {
    await this.formDrawer.locator(`.ant-select:has(#${id})`).first().locator('.ant-select-selector').click();
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).first().waitFor({ timeout: 5000 }).catch(() => {});
    const o = (await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return o;
  }

  input(id) { return this.formDrawer.locator(`#${id}`); }

  async openNew(kind) {
    const tab = kind === 'Item' ? 'Items' : kind;
    await this.openProducts(tab);
    await this.createBtn(kind).click();
    await expect(this.formDrawer.getByText(new RegExp(`Add New (Product|${kind})`))).toBeVisible();
    await this.settle(1000, `${kind} form`);
  }

  /** Item / service form: { name, category, hsn, sac, unit, price, cost, taxPref ('Taxable'), gst ('GST18'), cess, salesAccount, purchaseAccount, desc }. */
  async fillProduct(p) {
    if (p.name !== undefined) await this.input('name').fill(p.name);
    if (p.category) await this.formPick('category', p.category, { type: true });
    if (p.desc !== undefined) {
      await this.formDrawer.getByRole('button', { name: 'Add Description' }).click().catch(() => {});
      await this.formDrawer.locator('textarea').filter({ visible: true }).first().fill(p.desc);
    }
    if (p.hsn !== undefined) await this.input('hsn_code').fill(String(p.hsn));
    if (p.sac !== undefined) await this.input('sac_code').fill(String(p.sac));
    if (p.unit) await this.formPick('base_unit', p.unit, { type: true });
    if (p.price !== undefined) await this.fillInto(this.input('selling_price'), String(p.price));
    if (p.cost !== undefined) await this.fillInto(this.formDrawer.locator('#cost_per_piece, #purchase_price').first(), String(p.cost));
    if (p.taxPref !== null) await this.formPick('tax_preference', p.taxPref || 'Taxable');
    if (p.gst !== null && (p.taxPref || 'Taxable') === 'Taxable') await this.formPick('tax', p.gst || 'GST18');
    if (p.cess !== undefined) {
      await this.formDrawer.getByRole('button', { name: 'Add CESS Rate' }).click();
      await this.settle(500, 'cess field');
      const cess = this.formDrawer.locator('.ant-select:has(input[id*="cess" i])').first();
      if (await cess.count()) {
        await cess.locator('.ant-select-selector').click();
        await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: new RegExp(`(^|\\D)${p.cess}(\\D|$)`) }).first().click();
      } else await this.fillInto(this.formDrawer.locator('[id*="cess" i]').filter({ visible: true }).first(), String(p.cess));
    }
    if (p.salesAccount) await this.formPick('sales_account', p.salesAccount, { type: true });
    if (p.purchaseAccount) await this.formPick('purchase_account', p.purchaseAccount, { type: true });
  }

  /** Save the open form: { saved, errors, message }. */
  async trySave() {
    // New forms: "Save"; edit panels: "Save Changes" (they may close without a toast)
    const btn = this.formDrawer.getByRole('button', { name: /^Save( Changes)?$/ }).first();
    const isEdit = /Changes/.test(await btn.innerText());
    await btn.click();
    let saved = await this.toastLoc.filter({ hasText: /success|updated/i }).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
    if (!saved && isEdit) saved = !(await this.page.getByRole('button', { name: 'Save Changes' }).isVisible().catch(() => false));
    const errors = await this.formErrors.allInnerTexts().catch(() => []);
    const message = (await this.toastLoc.allInnerTexts().catch(() => [])).join(' | ');
    console.log(`Save ${saved ? 'accepted' : 'refused'}: ${errors.join(' | ') || message || 'no message'}`);
    if (saved) await this.settle(2000, 'saved');
    return { saved, errors, message };
  }

  async save() {
    const r = await this.trySave();
    if (!r.saved) throw new Error(`Not saved: ${r.errors.join(' | ') || r.message}`);
  }

  async closeForm() {
    const back = this.formDrawer.getByRole('button', { name: 'Back', exact: true });
    if (await back.isVisible().catch(() => false)) { await back.click(); await this.settle(600, 'edit closed'); }
    const c = this.formDrawer.getByRole('button', { name: 'Close', exact: true });
    if (await c.isVisible().catch(() => false)) await c.click();
    else await this.page.keyboard.press('Escape');
    await this.settle(800, 'form closed');
  }

  /** kind 'Item' | 'Service'. Defaults: price 100, GST18 taxable; service accounts Sales / Cost of Goods Sold. */
  async createProduct(kind, p) {
    await this.openNew(kind);
    const base = kind === 'Service' ? { salesAccount: 'Sales', purchaseAccount: 'Cost of Goods Sold' } : {};
    await this.fillProduct({ price: 100, ...base, ...p });
    await this.save();
    console.log(`Created ${kind} ${p.name}`);
    return p.name;
  }

  async createCategory({ name, desc, parent }) {
    await this.openNew('Category');
    await this.input('name').fill(name);
    if (desc !== undefined) {
      await this.formDrawer.getByRole('button', { name: 'Add Description' }).click();
      await this.formDrawer.locator('textarea').filter({ visible: true }).first().fill(desc);
    }
    if (parent) await this.formPick('parent', parent, { type: true });
    await this.save();
    return name;
  }

  /** Search the tab and open the row named `name` → detail drawer. */
  async openRow(tab, name) {
    await this.searchTab(tab, name);
    await this.rowsLoc.filter({ has: this.page.locator('td').first().filter({ hasText: name }) }).first().locator('td').first().click();
    await expect(this.formDrawer).toBeVisible();
    await this.settle(2000, 'detail');
    return (await this.formDrawer.innerText()).replace(/\s+/g, ' ');
  }

  /** Row cells of `name` in `tab` (null when absent). */
  async rowOf(tab, name) {
    const rows = await this.searchTab(tab, name);
    return rows.find((r) => r[0] === name) || null;
  }

  activeSwitch() { return this.formDrawer.locator('.ant-switch').first(); }

  /** Edit button of a detail section ('Sale Detail' | 'Tax Preferences' | 'Account Details'; null = basic). */
  sectionEdit(section) {
    if (!section) return this.formDrawer.getByRole('button', { name: 'Edit', exact: true }).first();
    return this.formDrawer.locator('div').filter({ hasText: new RegExp(`^${esc(section)}\\s*Edit`) }).last().getByRole('button', { name: 'Edit' });
  }

  async closeDetail() {
    await this.formDrawer.getByRole('button', { name: 'Close' }).first().click();
    await this.settle(800, 'detail closed');
  }

  stockOf(row) { const m = (row[1] || '').match(/([\d.]+)\s*\S+\s*Left/); return m ? Number(m[1]) : 0; }
  price(row) { return money(row[row.length - 1]); }
}

module.exports = { InventoryPage };
