'use strict';

const { expect } = require('@playwright/test');
const { PricingPage } = require('./PricingPage');

/**
 * Inventory → Offers (`/inventory?tab=5`). List: Scheme Name, Scheme Type, Scheme Application, Status, No Of Schemes;
 * "Total Count: N". "Offers" button → FULL PAGE `/inventory/offers-list` (no app menu): #name, Add Description,
 * #scheme_type (General | Profile wise | Category wise), #distributor_ids, #scheme_application (Bill To Bill),
 * scheme blocks ("scheme" adds one, "Delete" removes one, "Rule" adds an AND / OR row):
 *   IF  #items_<s>_item, #items_<s>_applied_via (Is between | Is minimum | Is Each), #items_<s>_range_from,
 *       #items_<s>_to (Is between), #items_<s>_unit
 *   THEN #items_<s>_applied_item_<r>_combine_with (Then Give | And | Or), _item, _value, _unit
 * Blank save: "Name is Required", "0,item is Required", "0,range From is Required", "Value cannot be 0", …
 * View drawer: Close, Active switch, Edit, ⋮; LIST TYPE, SCHEME APPILICATION, DISTRIBUTORS, ITEMS (# / Buy Items /
 * Free Items, "Rules : every 10 (pcs)"). Same list / switch / search helpers as the price lists.
 */
class OffersPage extends PricingPage {

  constructor(page) {
    super(page);
    this.listTab = 5;
    this.formUrl = /inventory\/offers-list/;
    this.newPricingBtn = this.page.getByRole('button', { name: /Offers/ }).first();
    this.plSave = this.page.getByRole('button', { name: 'Save', exact: true });
    this.addSchemeBtn = this.page.getByRole('button', { name: 'scheme', exact: true });
    this.addRuleBtn = (s = 0) => this.page.getByRole('button', { name: 'Rule', exact: true }).nth(s);
    this.deleteSchemeBtn = (s) => this.page.getByRole('button', { name: 'Delete', exact: true }).nth(s);
  }

  /** Pick in a select by id, typing first (item pickers search). */
  async pickItemIn(id, name) {
    await this.page.locator(`.ant-select:has(#${id})`).first().locator('.ant-select-selector').click();
    await this.page.keyboard.type(name);
    await this.settle(1500, 'item search');
    await this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: name }).first().click();
    await this.settle(600, `${id} = ${name}`);
  }

  async pickUnit(id, unit = 'pcs') {
    const sel = this.page.locator(`.ant-select:has(#${id})`).first();
    if ((await sel.innerText()).trim() === unit) return;
    await sel.locator('.ant-select-selector').click();
    const opt = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: unit }).first();
    if (await opt.waitFor({ timeout: 5000 }).then(() => true, () => false)) await opt.click();
    else await this.page.keyboard.press('Escape');
    await this.settle(400, 'unit');
  }

  /**
   * Scheme block s: { buy: itemName, via ('Is minimum' | 'Is between' | 'Is Each'), from, to, unit ('pcs'),
   *   free: [{ item, qty, unit, combine ('And' | 'Or') }] }.
   */
  async fillScheme(s, b) {
    if (s > 0 && !(await this.page.locator(`#items_${s}_item`).count())) { await this.addSchemeBtn.click(); await this.settle(800, 'scheme added'); }
    if (b.buy) await this.pickItemIn(`items_${s}_item`, b.buy);
    if (b.via && b.via !== 'Is between') await this.pickIn(`items_${s}_applied_via`, b.via);
    // Is between: #range_from + #to; Is minimum / Is Each: one #value
    const qtyId = !b.via || b.via === 'Is between' ? `items_${s}_range_from` : `items_${s}_value`;
    if (b.from !== undefined) await this.fillInto(this.page.locator(`#${qtyId}`), String(b.from));
    if (b.to !== undefined) await this.fillInto(this.page.locator(`#items_${s}_to`), String(b.to));
    if (b.buy) await this.pickUnit(`items_${s}_unit`, b.unit || 'pcs');
    for (const [r, f] of (b.free || []).entries()) {
      if (r > 0) { await this.addRuleBtn(s).click(); await this.settle(800, 'rule added'); }
      const p = `items_${s}_applied_item_${r}`;
      if (r > 0 && f.combine) await this.pickIn(`${p}_combine_with`, f.combine);
      if (f.item) await this.pickItemIn(`${p}_item`, f.item);
      if (f.qty !== undefined) await this.fillInto(this.page.locator(`#${p}_value`), String(f.qty));
      if (f.item) await this.pickUnit(`${p}_unit`, f.unit || 'pcs');
    }
  }

  /** Whole form: { name, desc, type, profiles, businessType, schemes: [block] }. */
  async fillOffer(o) {
    if (o.name !== undefined) await this.nameInput.fill(o.name);
    if (o.desc !== undefined) {
      await this.page.getByRole('button', { name: 'Add Description' }).click();
      await this.page.locator('textarea').filter({ visible: true }).first().fill(o.desc);
    }
    if (o.type && o.type !== 'General') await this.pickIn('scheme_type', o.type);
    else if (o.type === 'General') await this.pickIn('scheme_type', 'General');
    if (o.businessType) await this.pickIn('business_type', o.businessType);
    for (const p of o.profiles || []) await this.addProfile(p);
    for (const [s, b] of (o.schemes || []).entries()) await this.fillScheme(s, b);
  }

  async createOffer(o) {
    await this.openNewList();
    await this.fillOffer(o);
    const r = await this.trySaveList();
    if (!r.saved) throw new Error(`Offer ${o.name} not saved: ${r.errors.join(' | ') || r.message}`);
    return o.name;
  }

  /**
   * Sales invoice for `customerName` with `qty` of item; a triggered scheme shows "Claim FOC" on the line, which opens
   * "Select FOC Item" (free item + qty) → "Apply FOC" adds the free line. Returns
   * { claimable, offer (dialog text), lines: [text], qtyOf(item) } (form discarded).
   */
  async invoiceWith(item, qty, customerName) {
    await this.backToApp();
    await this.startInvoice(customerName ? { customerName } : {});
    await this.addLine(item, qty);
    await this.settle(2500, 'offers evaluated');
    const claim = this.lineRows.first().getByText(/Claim FOC/i).first();
    let offer = '';
    let claimable = false;
    if (await claim.isVisible().catch(() => false)) {
      await claim.click();
      const dlg = this.page.locator('.ant-modal-content, .ant-drawer-content').filter({ visible: true }).filter({ hasText: /FOC/ }).last();
      if (await dlg.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
        offer = (await dlg.innerText()).replace(/\s+/g, ' ');
        const apply = dlg.getByRole('button', { name: /Apply FOC/i });
        claimable = (await apply.count()) > 0 && !(await apply.isDisabled());
        if (claimable) await apply.click();
        else await dlg.getByRole('button', { name: 'Cancel' }).click().catch(() => this.page.keyboard.press('Escape'));
        await this.settle(2000, 'FOC applied');
      }
    }
    const rows = await this.lineRows.evaluateAll((rs) => rs.map((r) => ({
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      qty: parseFloat((r.querySelector('input[id^="quantity"]') || {}).value || '0') || 0,
    })));
    await this.discardForm().catch(async () => { await this.page.keyboard.press('Escape'); await this.discardForm(); });
    console.log(`Invoice ${qty} × ${item.itemName}: FOC ${claimable ? 'claimed' : 'none'} "${offer.slice(0, 80)}" — ${rows.length} line(s)`);
    const qtyOf = (it) => rows.filter((r) => r.text.includes(it.itemName) && it.itemName !== item.itemName).reduce((n, r) => n + r.qty, 0);
    return { claimable, offer, lines: rows.map((r) => r.text), qtyOf };
  }
}

module.exports = { OffersPage };
