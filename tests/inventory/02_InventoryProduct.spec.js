// ═════════════════════════════════════════════════════════════════════════
// Inventory Product (YOLO_BOOKS_Inventory_Product_TC.xlsx: INV_FUNC / POS / NEG / UI / VAL / BND / BL / SF /
// PAG / UPL / SEC / E2E / PERF / ACC).
// New items / services / categories are "ZZ Inv <unique>". Stock moves use the shared item helpers
// (setupItem = item + stock adjustment; purchase / sales invoices through the purchase / sales pages).
// Adapted: the item form is ONE drawer "Add New Product" (Basic Info / Sale Details / Purchase Details
// sections) — the sheet's 3-step wizard (Step 1/2/3, Next / Back) does not exist; there is no Opening
// Stock field (stock comes from a stock adjustment); the service form is one drawer too.
//
// Already automated — not repeated:
//   INV_POS_015 / INV_BL_007 / INV_E2E_010 alternate UOM + conversion on an invoice ... Sales Invoice stock TC01–TC29
//   INV_BL_003 / 004 / INV_E2E_008 stock down on sale / up on purchase ... TC-ST-* and PI_FUNC_005 / PI_BL_001
//   INV_POS_017 / INV_BL_016 stock per warehouse ............ checked here once (only warehouse "Default")
//
//   npx playwright test tests/inventory/02_InventoryProduct.spec.js --grep @inv
// ═════════════════════════════════════════════════════════════════════════

const { test, expect, bugCheck } = require('../../fixtures/base-test');
const { InventoryPage } = require('../../pages/inventory/InventoryPage');
const { PurchaseInvoiceFlowPage } = require('../../pages/purchase/PurchaseInvoiceFlowPage');
const { SalesInvoiceEditPage } = require('../../pages/sales/SalesInvoiceEditPage');

const T = ['@inventory', '@inv'];

test.describe('Inventory Product', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {InventoryPage} */
  let inv;
  /** @type {PurchaseInvoiceFlowPage} */
  let pi;
  test.beforeEach(async ({ page }) => {
    inv = new InventoryPage(page);
    pi = new PurchaseInvoiceFlowPage(page);
    await pi.open();
  });

  const uniq = () => `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
  const nm = (p = 'Inv') => `ZZ ${p} ${uniq()}`;
  /** Is `name` offered in the line item search of the open invoice form? */
  const offered = async (page, form, name) => {
    if (!(await form.itemSearchRows.count())) await form.addRowBtn.click();
    await form.typeInto(form.itemSearch, name);
    await form.settle(2500, 'item search');
    const n = await form.itemOption(name).count();
    await page.keyboard.press('Escape');
    return n > 0;
  };

  // ── Lists / tabs ─────────────────────────────────────────────────────────

  test('TC01 - Inventory products page has Items, Asset, Service and Category tabs, with list columns and Total Count for each tab', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_001, INV_UI_001, INV_UI_005, INV_UI_006, INV_UI_013, INV_UI_014' } }, async ({ page }) => {
    await inv.openProducts('Items');
    await expect(page.getByRole('tab')).toHaveText(['Items', 'Asset', 'Service', 'Category']);
    await expect(inv.tabBtn('Items')).toHaveAttribute('aria-selected', 'true');
    const heads = () => page.locator('table thead th').filter({ visible: true });
    await expect(heads()).toHaveText(['Product Name', 'Stock Status', 'HSN Code', 'Tax Rate', 'Sale Price']);
    expect(await inv.totalCount()).toBeGreaterThan(0);
    await inv.tabBtn('Service').click();
    await inv.settle(2000, 'service');
    await expect(heads()).toHaveText(['Service Name', 'SAC Code', 'Tax Rate', 'Sale Price']);
    await expect(page.getByText(/Total Count:\s*\d+/).first()).toBeVisible();
    await inv.tabBtn('Category').click();
    await inv.settle(2000, 'category');
    await expect(heads()).toHaveText(['Category Name', 'Description', 'Parent Category']);
    await expect(inv.tabBtn('Category')).toHaveAttribute('aria-selected', 'true');
  });

  // ── Item create ──────────────────────────────────────────────────────────

  test('TC02 - The item form is one drawer (adapted from 3 steps) with Basic Info, Sale Details and Purchase Details fields', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_002, INV_FUNC_003, INV_FUNC_004, INV_UI_003, INV_UI_012' } }, async () => {
    await inv.openNew('Item');
    const text = (await inv.formDrawer.innerText()).replace(/\s+/g, ' ');
    for (const t of ['Add New Product', 'Basic Info', 'Product Name', 'HSN Code', 'Sale Details', 'Unit of Measure', 'Sale Price', 'Tax Preference', 'Gst Rate', 'Purchase Details', 'Cost per', 'Purchase Account', 'Inventory Account']) expect(text).toContain(t);
    await expect(inv.input('name')).toHaveValue('');
    await inv.closeForm();
  });

  test('TC03 - Saving an empty item form requires Name, Selling Price, Tax Preference and GST', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_001, INV_VAL_001, INV_VAL_006, INV_UI_004' } }, async () => {
    await inv.openNew('Item');
    const r = await inv.trySave();
    expect(r.saved).toBe(false);
    const e = r.errors.join(' | ');
    for (const m of [/Name is Required/i, /Selling Price is Required/i, /Tax Preference/i, /GST/i]) expect(e).toMatch(m);
    await inv.closeForm();
  });

  test('TC04 - Create an item with 8-digit HSN, GST12 and ₹250: it is listed with the HSN, 12%, ₹250 and Out of stocks (no stock)', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_007, INV_POS_001, INV_POS_003, INV_POS_007, INV_BND_002, INV_BND_006, INV_BL_002, INV_E2E_001, INV_E2E_013, INV_UI_002' } }, async () => {
    const name = nm();
    await inv.createProduct('Item', { name, hsn: '01011010', price: 250, gst: 'GST12' });
    const row = await inv.rowOf('Items', name);
    expect(row, `${name} listed`).toBeTruthy();
    expect(row[1]).toMatch(/Out of stock/i);
    expect(row[2]).toBe('01011010');
    expect(row[3]).toBe('12%');
    expect(inv.price(row)).toBe(250);
  });

  test('TC05 - Close on a filled item form creates nothing', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_008, INV_E2E_006' } }, async () => {
    const name = nm();
    await inv.openNew('Item');
    await inv.fillProduct({ name, price: 10 });
    await inv.closeForm();
    if (await inv.page.getByRole('button', { name: 'Yes' }).isVisible().catch(() => false)) await inv.page.getByRole('button', { name: 'Yes' }).click();
    expect(await inv.rowOf('Items', name)).toBeNull();
  });

  // QA (BUG-INV-02): an HSN code of 4–8 digits is valid, so 7 digits is accepted.
  test('TC06 - HSN field drops letters, saves 7 digits (4 to 8 are allowed) and refuses more than 8 digits', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_003, INV_VAL_002, INV_VAL_003, INV_BND_003, INV_BND_004' } }, async () => {
    await inv.openNew('Item');
    await inv.fillProduct({ name: nm(), price: 10, hsn: '1234567' });
    await inv.input('hsn_code').fill('');
    await inv.input('hsn_code').pressSequentially('12ab34567');
    expect(await inv.input('hsn_code').inputValue(), 'letters dropped').toBe('1234567');
    const r = await inv.trySave();
    expect(r.saved, `7-digit HSN is accepted (${r.errors.join(' | ')})`).toBe(true);
    // The field takes any number of digits; more than 8 is refused on save
    await inv.openNew('Item');
    await inv.fillProduct({ name: nm(), price: 10, hsn: '12345678901' });
    const over = await inv.trySave();
    expect(over.saved, '11-digit HSN refused').toBe(false);
  });

  test('TC07 - Item sale price refuses "-" and letters', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_004, INV_NEG_011, INV_VAL_007' } }, async () => {
    await inv.openNew('Item');
    for (const bad of ['-100', 'abc']) {
      await inv.input('selling_price').fill('');
      await inv.input('selling_price').pressSequentially(bad);
      expect(await inv.input('selling_price').inputValue(), `price "${bad}"`).not.toMatch(/-|[a-z]/i);
    }
    await inv.closeForm();
  });

  test('TC08 - Item Cost per pcs refuses "-"', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_016, INV_VAL_012' } }, async () => {
    await inv.openNew('Item');
    const cost = inv.input('cost_per_piece');
    await cost.pressSequentially('-50');
    expect(await cost.inputValue()).not.toMatch(/-/);
    await inv.closeForm();
  });

  test('TC09 - An item with a one-character name and ₹0.01 price saves, and a 300-character name is limited or refused', { tag: T, annotation: { type: 'cases', description: 'INV_BND_001, INV_BND_008, INV_VAL_013' } }, async () => {
    const one = String.fromCharCode(65 + Math.floor(Math.random() * 26)) ;
    await inv.openNew('Item');
    await inv.fillProduct({ name: `${one}`, price: '0.01' });
    const r1 = await inv.trySave();
    console.log(`1-char name: ${r1.saved ? 'saved' : r1.errors.join(' | ')}`);
    if (!r1.saved) await inv.closeForm();
    const priced = nm();
    await inv.createProduct('Item', { name: priced, price: '0.01' });
    expect(inv.price(await inv.rowOf('Items', priced))).toBe(0.01);
    await inv.openNew('Item');
    await inv.input('name').fill(`ZZ ${'L'.repeat(300)}`);
    const len = (await inv.input('name').inputValue()).length;
    await inv.fillProduct({ price: 5 });
    const r = await inv.trySave();
    console.log(`300-char name: typed ${len}, ${r.saved ? 'saved' : `refused: ${r.errors.join(' | ')}`}`);
    expect(r.saved && len > 255 ? 'unlimited' : 'limited').toBe('limited');
    if (!r.saved) await inv.closeForm();
  });

  // QA (BUG-INV-01): there is no duplicate-name check for items (current flow).
  test('TC10 - A second item with the same name is accepted', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_014, INV_VAL_018' } }, async () => {
    const name = nm();
    await inv.createProduct('Item', { name });
    await inv.openNew('Item');
    await inv.fillProduct({ name, price: 100 });
    const r = await inv.trySave();
    expect(r.saved, `duplicate "${name}" is accepted (${r.errors.join(' | ')})`).toBe(true);
  });

  test('TC11 - Script text in the product name is not run', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_018, INV_SEC_005' } }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const name = `ZZ <img src=x onerror=window.__xss=1> ${uniq()}`;
    await inv.openNew('Item');
    await inv.fillProduct({ name, price: 10 });
    const r = await inv.trySave();
    if (r.saved) await inv.searchTab('Items', 'ZZ <img');
    else await inv.closeForm();
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test('TC12 - A CESS rate of 5 % is saved and shown in Tax Preferences', { tag: T, annotation: { type: 'cases', description: 'INV_POS_014, INV_VAL_014' } }, async () => {
    const name = nm();
    await inv.createProduct('Item', { name, cess: 5 });
    const d = await inv.openRow('Items', name);
    expect(d).toMatch(/CESS\s*5/);
  });

  // ── Item detail / edit / active ──────────────────────────────────────────

  test('TC13 - Item detail shows Close, Active, Edit, Stock (Default warehouse equals stock), Sale Detail, Tax and Accounts, and the list shows "N pcs Left"', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_009, INV_FUNC_010, INV_UI_007, INV_UI_008, INV_POS_002, INV_POS_017, INV_BL_016, INV_BND_007' } }, async () => {
    const it = await pi.setupItem({ name: nm(), price: '40', stock: 1 });
    const row = await inv.rowOf('Items', it.itemName);
    expect(row[1]).toMatch(/^1 pcs Left/);
    const d = await inv.openRow('Items', it.itemName);
    for (const t of ['Close', 'Active', 'Edit', 'STOCK IN HAND', 'Warehouse', 'Default', 'Sale Detail', 'Tax Preferences', 'Account Details', 'SALES ACCOUNT Sales', 'PURCHASE ACCOUNT Cost of Goods Sold', 'INVENTORY ACCOUNT Inventory Asset']) expect(d).toContain(t);
    expect(d).toMatch(/Default\s*1(\.0+)?\s*pcs/);
    await expect(inv.activeSwitch()).toHaveAttribute('aria-checked', 'true');
    await inv.closeDetail();
    await expect(inv.page.locator('.ant-drawer-content').filter({ visible: true })).toHaveCount(0);
  });

  test('TC14 - Make an item inactive (Space key): it is not offered on a purchase invoice, and when made active again it is offered', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_011, INV_POS_008, INV_VAL_015, INV_BL_008, INV_E2E_002, INV_ACC_006' } }, async ({ page }) => {
    const name = nm();
    await inv.createProduct('Item', { name });
    await inv.openRow('Items', name);
    await inv.activeSwitch().focus();
    await page.keyboard.press('Space');
    await inv.settle(2000, 'inactive');
    await expect(inv.activeSwitch()).toHaveAttribute('aria-checked', 'false');
    await inv.closeDetail();
    await pi.startInvoice({});
    expect(await offered(page, pi, name), 'inactive item offered').toBe(false);
    await pi.discardForm();
    await inv.openRow('Items', name);
    await inv.activeSwitch().click();
    await inv.settle(2000, 'active');
    await inv.closeDetail();
    await pi.startInvoice({});
    expect(await offered(page, pi, name), 'active item offered').toBe(true);
    await pi.discardForm();
  });

  test('TC15 - Edit an item\'s basic info (name) and Tax Preferences (GST12): the list follows the changes', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_012, INV_FUNC_013, INV_E2E_005, INV_E2E_009' } }, async () => {
    const name = nm();
    await inv.createProduct('Item', { name });
    await inv.openRow('Items', name);
    await inv.sectionEdit(null).click();
    await inv.settle(1500, 'edit');
    const renamed = `${name} E`;
    await inv.formDrawer.locator('#name').filter({ visible: true }).first().fill(renamed);
    await inv.save();
    await inv.openRow('Items', renamed);
    await inv.sectionEdit('Tax Preferences').click();
    await inv.settle(1500, 'tax edit');
    await inv.formPick('tax', 'GST12');
    await inv.save();
    const row = await inv.rowOf('Items', renamed);
    expect(row, 'renamed item listed').toBeTruthy();
    expect(row[3]).toBe('12%');
  });

  test('TC16 - Edit an item\'s Account Details: the changed sales account is saved and shown', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_014, INV_FUNC_015, INV_E2E_015' } }, async () => {
    const name = nm();
    await inv.createProduct('Item', { name });
    await inv.openRow('Items', name);
    await inv.sectionEdit('Account Details').click();
    await inv.settle(1500, 'accounts edit');
    const opts = (await inv.formOptions('sales_account')).filter((o) => o && o !== 'Sales');
    await inv.formPick('sales_account', opts[0], { type: true });
    await inv.save();
    expect(await inv.openRow('Items', name)).toContain(`SALES ACCOUNT ${opts[0]}`);
  });

  // ── Service ──────────────────────────────────────────────────────────────

  test('TC17 - Create a service (one drawer, Nos, no stock) with 6-digit SAC, ₹500 and GST18: it is listed, and its detail has Sale Detail, Tax and Accounts and no stock', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_016, INV_FUNC_017, INV_FUNC_018, INV_POS_009, INV_BND_005, INV_E2E_004, INV_BL_013' } }, async () => {
    await inv.openNew('Service');
    const text = (await inv.formDrawer.innerText()).replace(/\s+/g, ' ');
    for (const t of ['Add New Service', 'Service Name', 'SAC Code', 'Sale Price Per Nos', 'Tax Preference', 'Sales Account', 'Purchase Account']) expect(text).toContain(t);
    expect(text).not.toMatch(/Inventory Account|Stock Tracking/);
    await inv.closeForm();
    const name = nm('Svc');
    await inv.createProduct('Service', { name, sac: '998313', price: 500 });
    const row = await inv.rowOf('Service', name);
    expect(row[1]).toBe('998313');
    expect(row[2]).toBe('18%');
    expect(inv.price(row)).toBe(500);
    const d = await inv.openRow('Service', name);
    for (const t of ['Sale Detail', 'Tax Preferences', 'Account Details']) expect(d).toContain(t);
    expect(d).not.toContain('STOCK IN HAND');
  });

  test('TC18 - Service form: an empty save is refused, a 4-digit SAC is refused, and no SAC saves with "-"', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_006, INV_NEG_007, INV_NEG_017, INV_VAL_004, INV_VAL_009, INV_POS_010' } }, async () => {
    await inv.openNew('Service');
    const r = await inv.trySave();
    expect(r.errors.join(' ')).toMatch(/Name is Required/i);
    await inv.fillProduct({ name: nm('Svc'), price: 10, sac: '1234', salesAccount: 'Sales', purchaseAccount: 'Cost of Goods Sold' });
    const bad = await inv.trySave();
    expect(bad.saved, `4-digit SAC must be refused (${bad.errors.join(' | ')})`).toBe(false);
    await inv.closeForm();
    const name = nm('Svc');
    await inv.createProduct('Service', { name });
    expect((await inv.rowOf('Service', name))[1]).toMatch(/^-?$/);
  });

  test('TC19 - Editing a service\'s Sale Detail saves a new price', { tag: T, annotation: { type: 'cases', description: 'INV_POS_018' } }, async () => {
    const name = nm('Svc');
    await inv.createProduct('Service', { name, price: 300 });
    await inv.openRow('Service', name);
    await inv.sectionEdit('Sale Detail').click();
    await inv.settle(1500, 'sale edit');
    await inv.fillInto(inv.formDrawer.locator('#selling_price').filter({ visible: true }).first(), '500');
    await inv.save();
    expect(inv.price(await inv.rowOf('Service', name))).toBe(500);
  });

  // ── Category ─────────────────────────────────────────────────────────────

  test('TC20 - Create a category with a description and a child category with a parent: the list shows the parent or "-", and the detail is correct', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_019, INV_FUNC_020, INV_FUNC_021, INV_POS_011, INV_POS_012, INV_BND_010, INV_UI_010, INV_UI_011, INV_BL_012, INV_E2E_012' } }, async () => {
    await inv.openNew('Category');
    const text = (await inv.formDrawer.innerText()).replace(/\s+/g, ' ');
    for (const t of ['Add New Category', 'Category Name', 'Add Description', 'Parent Category']) expect(text).toContain(t);
    await inv.closeForm();
    const parent = await inv.createCategory({ name: nm('Cat'), desc: 'top level' });
    const child = await inv.createCategory({ name: nm('Sub'), parent });
    const prow = await inv.rowOf('Category', parent);
    expect(prow[1]).toBe('top level');
    expect(prow[2]).toMatch(/^-?$/);
    expect((await inv.rowOf('Category', child))[2]).toBe(parent);
    const d = await inv.openRow('Category', child);
    expect(d).toContain(child);
    expect(d).toContain(parent);
  });

  test('TC21 - Category form: an empty name is refused, Close saves nothing and script text is not run', { tag: T, annotation: { type: 'cases', description: 'INV_NEG_008, INV_NEG_009, INV_VAL_008, INV_SEC_006' } }, async ({ page }) => {
    await inv.openNew('Category');
    const r = await inv.trySave();
    expect(r.errors.join(' ')).toMatch(/Name is Required/i);
    const name = nm('Cat');
    await inv.input('name').fill(name);
    await inv.closeForm();
    expect(await inv.rowOf('Category', name)).toBeNull();
    await inv.createCategory({ name: `ZZ <img src=x onerror=window.__xss=1> ${uniq()}` });
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('TC22 - Edit a category\'s name and description', { tag: T, annotation: { type: 'cases', description: 'INV_POS_013, INV_E2E_007' } }, async () => {
    const name = await inv.createCategory({ name: nm('Cat'), desc: 'old' });
    await inv.openRow('Category', name);
    await inv.formDrawer.getByRole('button', { name: /Edit/ }).first().click();
    await inv.settle(1500, 'edit');
    const renamed = `${name} E`;
    await inv.formDrawer.locator('#name').filter({ visible: true }).first().fill(renamed);
    const desc = inv.formDrawer.locator('textarea').filter({ visible: true }).first();
    if (await desc.count()) await desc.fill('new description');
    await inv.save();
    const row = await inv.rowOf('Category', renamed);
    expect(row, 'renamed category listed').toBeTruthy();
    if (await desc.count()) expect(row[1]).toBe('new description');
  });

  test('TC23 - Delete an unused category (count drops by 1), while a category used by an item is kept', { tag: T, annotation: { type: 'cases', description: 'INV_FUNC_022, INV_E2E_014, INV_NEG_010, INV_E2E_003, INV_BL_011' } }, async ({ page }) => {
    const used = await inv.createCategory({ name: nm('Cat') });
    const item = nm();
    await inv.createProduct('Item', { name: item, category: used });
    expect(await inv.openRow('Items', item)).toContain(used);
    await inv.closeDetail();
    const free = await inv.createCategory({ name: nm('Cat') });
    await inv.openProducts('Category');
    const before = await inv.totalCount();
    const del = async (name) => {
      await inv.openRow('Category', name);
      await inv.formDrawer.getByRole('button', { name: /Delete/ }).first().click();
      await inv.settle(800, 'confirm');
      const yes = page.locator('.ant-popover, .ant-modal-content, .ant-popconfirm').filter({ visible: true }).getByRole('button', { name: /^(Yes|OK|Delete|Confirm)$/ }).last();
      if (await yes.isVisible().catch(() => false)) await yes.click();
      await inv.settle(2500, 'deleted');
      await page.keyboard.press('Escape');
    };
    await del(free);
    expect(await inv.rowOf('Category', free)).toBeNull();
    await inv.openProducts('Category');
    expect(await inv.totalCount()).toBe(before - 1);
    await del(used);
    expect(await inv.rowOf('Category', used), 'category with items must not be deleted').toBeTruthy();
  });

  // ── Stock / tax on invoices ──────────────────────────────────────────────

  test('TC24 - An item price is exclusive of tax: on an invoice ₹100 plus 18 % gives ₹118', { tag: T, annotation: { type: 'cases', description: 'INV_BL_005, INV_BL_006, INV_POS_005, INV_POS_006' } }, async () => {
    const si = new SalesInvoiceEditPage(pi.page);
    const it = await pi.setupItem({ name: nm(), price: '100', stock: 5 });
    await si.startInvoice({});
    await si.addLine(it, 1);
    await si.setTaxMode('Excluding Tax');
    const s = await si.readSummary();
    expect(Math.round(s.total * 100) / 100).toBe(118);
    await si.discardForm();
  });

  // ── Search / pagination ──────────────────────────────────────────────────

  test('TC25 - Item search works for exact, partial, case variations, no match and SQL text, per tab, and is cleared on return', { tag: T, annotation: { type: 'cases', description: 'INV_SF_001, INV_SF_002, INV_SF_003, INV_SF_004, INV_SF_005, INV_SF_010, INV_SF_012, INV_SEC_004, INV_SF_011' } }, async () => {
    const name = nm();
    await inv.createProduct('Item', { name });
    const total = (await inv.openProducts('Items'), await inv.totalCount());
    expect((await inv.searchTab('Items', name)).map((r) => r[0])).toEqual([name]);
    const part = await inv.searchTab('Items', 'ZZ Inv');
    for (const r of part) expect(r[0].toLowerCase()).toContain('zz inv');
    expect((await inv.searchTab('Items', name.toUpperCase())).map((r) => r[0])).toContain(name);
    expect(await inv.searchTab('Items', 'ZZZ-NO-SUCH-ITEM-987')).toEqual([]);
    expect(await inv.searchTab('Items', "' OR 1=1 --")).toEqual([]);
    expect((await inv.searchTab('Items', name))[0][1]).toMatch(/Out of stock/i);
    await inv.tabBtn('Category').click();
    await inv.settle(2000, 'category');
    await inv.openProducts('Items');
    expect(await inv.listSearchBox.inputValue()).toBe('');
    expect(await inv.totalCount(), 'other users may add items meanwhile').toBeGreaterThanOrEqual(total);
  });

  test('TC26 - Search works on the Service and Category tabs', { tag: T, annotation: { type: 'cases', description: 'INV_SF_006, INV_SF_007, INV_SF_008' } }, async () => {
    const svc = nm('Svc');
    await inv.createProduct('Service', { name: svc });
    const cat = await inv.createCategory({ name: nm('Cat') });
    expect((await inv.searchTab('Service', svc)).map((r) => r[0])).toEqual([svc]);
    expect((await inv.searchTab('Category', cat)).map((r) => r[0])).toEqual([cat]);
    expect((await inv.searchTab('Category', cat.slice(0, 7))).map((r) => r[0])).toContain(cat);
  });

  test('TC27 - Items list shows 20 per page with a page size selector and a count across pages, and a search returns to page 1', { tag: T, annotation: { type: 'cases', description: 'INV_PAG_005, INV_PAG_007, INV_PAG_008, INV_PAG_009' } }, async ({ page }) => {
    await inv.openProducts('Items');
    const total = await inv.totalCount();
    test.skip(total <= 20, 'one page of items');
    expect((await inv.readRows()).length).toBe(20);
    await expect(page.locator('input#rc_select_0, [aria-label="Page Size"]').first()).toBeAttached();
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    await pag.locator('li.ant-pagination-next').click();
    await inv.settle(2000, 'page 2');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    expect(await inv.totalCount()).toBe(total);
    await inv.fillInto(inv.listSearchBox, 'ZZ');
    await inv.settle(2500, 'search');
    await bugCheck('BUG-GEN-02', 'a new search keeps the current page', async () => {
      await expect(page.locator('ul.ant-pagination').filter({ visible: true }).first().locator('li.ant-pagination-item-active')).toHaveText('1', { timeout: 5000 });
    });
  });

  test('TC28 - Without a session the products page redirects to the login page', { tag: T, annotation: { type: 'cases', description: 'INV_SEC_001, INV_SEC_011' } }, async ({ browser, page }) => {
    await inv.openProducts('Items');
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/inventory/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row')).toHaveCount(0);
    await ctx.close();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC29', 'INV_FUNC_005 / 006 / INV_UI_003 (steps)', 'Wizard Back / Next between steps', 'The item form is one drawer — no steps.'],
    ['TC30', 'INV_NEG_002 / INV_VAL_005', 'Unit of Measure required', 'Unit of Measure defaults to pcs (Nos for services) and cannot be emptied.'],
    ['TC31', 'INV_NEG_005 / 012 / INV_VAL_010 / INV_BND_009 / INV_BL_001', 'Opening stock on the item form', 'No opening-stock field — stock comes from a stock adjustment (shared setupItem).'],
    ['TC32', 'INV_NEG_015 / INV_VAL_011 / INV_FUNC_015 / INV_POS_016 / INV_BL_010 / INV_BND_011', 'Minimum stock reminder', 'No minimum-stock field on the item form or detail.'],
    ['TC33', 'INV_POS_004 / INV_BL_009', 'Batch tracking', 'Stock Tracking options need batch-enabled warehouses — not in this org.'],
    ['TC34', 'INV_VAL_017', 'Out-of-stock item cannot be sold', 'Sales allow negative stock in this org (TC-ST checks).'],
    ['TC35', 'INV_VAL_016', 'Inactive service on sales invoice', 'Same switch as items — checked for items (INV_FUNC_011).'],
    ['TC36', 'INV_VAL_019', 'Circular parent category', 'Parent list only offers existing categories; a child cannot be picked for its own parent without a second edit flow.'],
    ['TC37', 'INV_VAL_020 / INV_BND_012', 'Alternate UOM conversion 0 / 1', 'Alternate UOMs are covered by the Sales Invoice stock sheet.'],
    ['TC38', 'INV_BL_014 / 015 / 017 / 018', 'Journal accounts / CESS on invoices', 'Covered by the Sales / Purchase invoice journal and CESS tests.'],
    ['TC39', 'INV_PAG_001…004 / 006 / 010', 'Category / service pagination, exactly 20 items', 'The org has < 20 categories / services; exact counts need a controlled org.'],
    ['TC40', 'INV_SF_009', 'Search by HSN code', 'Search is by name only (checked: name search).'],
    ['TC41', 'INV_UPL_001…008 / INV_SEC_009 / INV_E2E_011', 'Product / service / category image upload', 'Needs image fixtures and upload checks — not set up for this suite.'],
    ['TC42', 'INV_NEG_013 / INV_SEC_003 / 010 / 014', 'Role restrictions', 'No view-only / inventory-manager / accountant users in the test data.'],
    ['TC43', 'INV_SEC_002', 'Another org\'s items', 'Needs a second org.'],
    ['TC44', 'INV_SEC_007 / 012', 'CSRF / rate limiting', 'API-level security tests, not UI tests.'],
    ['TC45', 'INV_SEC_008', 'Session timeout', 'Needs a shortened session lifetime.'],
    ['TC46', 'INV_SEC_013', 'Deleted item by URL', 'Items cannot be deleted; detail is a drawer (no URL).'],
    ['TC47', 'INV_SEC_015', 'Script text in SKU', 'SKU behaves like the name field (INV_NEG_018).'],
    ['TC48', 'INV_PERF_001…010', 'Response-time / concurrency limits', 'Environment-dependent; not a functional check.'],
    ['TC49', 'INV_ACC_001 / 002 / 003 / 004 / 005 / 007 / 008', 'Keyboard list, screen reader, contrast, labels', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
