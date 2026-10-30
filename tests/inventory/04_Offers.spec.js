// ═════════════════════════════════════════════════════════════════════════
// Offers (YOLO_BOOKS_Offers_TC.xlsx: OFR_FUNC / POS / NEG / UI / VAL / BND / BL / SF / PAG / SEC / E2E / PERF / ACC).
// Schemes are "ZZ OF <unique>"; every scheme a test creates is deactivated in afterEach (an active General scheme
// would add free items to other suites' invoices). Buy item = shared priced item A, free items = B / C.
// Adapted: the form is a full page (/inventory/offers-list); "+ Scheme" is a button named "scheme"; required
// messages are "Name is Required", "0,item is Required", "0,range From is Required", "Value cannot be 0".
//
// Same case as another one here:
//   OFR_VAL_002 = OFR_FUNC_016 · OFR_VAL_003 / OFR_SEC_003 / 004 = OFR_NEG_015 (script / SQL name) · OFR_VAL_004 / 006 = OFR_NEG_006 / 007 / 009
//   OFR_BND_005 / OFR_E2E_001 / OFR_BL_001 = OFR_POS_001 (invoice) · OFR_NEG_011 / OFR_E2E_007 = OFR_FUNC_023
//
//   npx playwright test tests/inventory/04_Offers.spec.js --grep @offers
// ═════════════════════════════════════════════════════════════════════════

const { test, expect } = require('../../fixtures/base-test');
const { OffersPage } = require('../../pages/inventory/OffersPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');

const T = ['@inventory', '@offers'];

test.describe('Offers', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {OffersPage} */
  let of;
  let A; let B; let C;
  let created = [];
  test.beforeEach(async ({ page }) => {
    of = new OffersPage(page);
    await of.open();
    [A, B, C] = await of.ensurePricedItems(E.items());
    created = [];
  });
  test.afterEach(async () => {
    // Safety net: deactivate every active "ZZ OF" entry (duplicate names included)
    if (created.length) await of.deactivateAll('ZZ OF').catch((e) => console.log(`cleanup failed: ${e.message.slice(0, 80)}`));
  });

  const uniq = () => `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
  const nm = () => `ZZ OF ${uniq()}`;
  /** Is-minimum scheme: buy `min` A → `free` B. */
  const minScheme = (min = 5, free = 1) => ({ buy: A.itemName, via: 'Is minimum', from: min, free: [{ item: B.itemName, qty: free }] });
  const make = async (o) => { const name = o.name || nm(); created.push(name); await of.createOffer({ ...o, name }); return name; };
  /** Free qty of `item` on the invoice after Claim FOC → Apply FOC (0 when not offered). */
  const freeOf = (inv, item) => inv.qtyOf(item) || (inv.offer.includes(item.itemName) ? 1 : 0);

  // ── List / form ──────────────────────────────────────────────────────────

  test('TC01 - Offers list shows Scheme Name, Scheme Type, Scheme Application, Status (text) and No Of Schemes columns, the Offers button and Total Count', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_001, OFR_UI_001, OFR_UI_002, OFR_UI_003, OFR_ACC_005' } }, async ({ page }) => {
    await of.openPricingList();
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['Scheme Name', 'Scheme Type', 'Scheme Application', 'Status', 'No Of Schemes']);
    await expect(of.newPricingBtn).toBeVisible();
    expect(await of.totalCount()).toBeGreaterThan(0);
    for (const r of await of.plRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())))) expect(r[3]).toMatch(/Active/);
  });

  test('TC02 - Offer form has name, description, types, Bill To Bill, IF item with condition (between: 2 qty, minimum or each: 1) and unit, THEN item with qty and unit, and scheme and Rule buttons', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_002, OFR_FUNC_003, OFR_FUNC_004, OFR_FUNC_005, OFR_FUNC_006, OFR_FUNC_007, OFR_FUNC_008, OFR_FUNC_009, OFR_FUNC_010, OFR_FUNC_011, OFR_FUNC_012, OFR_UI_004, OFR_UI_005, OFR_UI_007' } }, async ({ page }) => {
    await of.openNewList();
    expect(await of.optionsOf('scheme_type')).toEqual(expect.arrayContaining(['General', 'Profile wise', 'Category wise']));
    await expect(page.locator('.ant-select:has(#scheme_application)')).toContainText(/Bill To Bill/i);
    await page.getByRole('button', { name: 'Add Description' }).click();
    await expect(page.locator('textarea').filter({ visible: true }).first()).toBeVisible();
    expect(await of.optionsOf('items_0_applied_via')).toEqual(expect.arrayContaining(['Is between', 'Is minimum', 'Is Each']));
    await expect(page.locator('#items_0_range_from')).toBeVisible();
    await expect(page.locator('#items_0_to')).toBeVisible();
    for (const via of ['Is minimum', 'Is Each']) {
      await of.pickIn('items_0_applied_via', via);
      await expect(page.locator('#items_0_to'), `${via}: one qty`).toBeHidden();
    }
    for (const id of ['#items_0_item', '#items_0_unit', '#items_0_applied_item_0_item', '#items_0_applied_item_0_value', '#items_0_applied_item_0_unit']) await expect(page.locator(id), id).toBeAttached();
    await expect(of.addSchemeBtn).toBeVisible();
    await expect(of.addRuleBtn(0)).toBeVisible();
    await of.pickIn('scheme_type', 'Profile wise');
    await expect(page.getByText(/Add Profile/).first()).toBeVisible();
    await of.pickIn('scheme_type', 'Category wise');
    await expect(page.locator('#business_type')).toBeAttached();
    await of.discardList();
  });

  test('TC03 - On the offer form, Rule adds an And or Or row, scheme adds Scheme 2, and Delete removes it', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_013, OFR_FUNC_014, OFR_FUNC_015, OFR_UI_006' } }, async ({ page }) => {
    await of.openNewList();
    await of.addRuleBtn(0).click();
    await expect(page.locator('#items_0_applied_item_1_combine_with')).toBeAttached();
    expect(await of.optionsOf('items_0_applied_item_1_combine_with')).toEqual(expect.arrayContaining(['And', 'Or']));
    await of.addSchemeBtn.click();
    await expect(page.locator('#items_1_item')).toBeAttached();
    await expect(page.getByText('Scheme 2')).toBeVisible();
    await of.deleteSchemeBtn(1).click();
    await of.settle(800, 'scheme removed');
    await expect(page.locator('#items_1_item')).toHaveCount(0);
    await of.discardList();
  });

  test('TC04 - Saving an empty offer requires name, buy item, qty, unit and free item', { tag: T, annotation: { type: 'cases', description: 'OFR_NEG_001, OFR_NEG_002, OFR_NEG_003' } }, async () => {
    await of.openNewList();
    const r = await of.trySaveList();
    expect(r.saved).toBe(false);
    const e = r.errors.join(' | ');
    expect(e).toMatch(/Name is Required/i);
    await of.nameInput.fill(nm());
    const r2 = await of.trySaveList();
    expect(r2.saved, 'no buy / free item → refused').toBe(false);
    await of.discardList();
  });

  test('TC05 - Is between with min greater than max, and with min equal to max, are refused', { tag: T, annotation: { type: 'cases', description: 'OFR_NEG_004, OFR_NEG_005' } }, async () => {
    for (const [from, to] of [[20, 10], [10, 10]]) {
      const name = nm();
      created.push(name);
      await of.openNewList();
      await of.fillOffer({ name, schemes: [{ buy: A.itemName, from, to, free: [{ item: B.itemName, qty: 1 }] }] });
      const r = await of.trySaveList();
      expect(r.saved, `between ${from}–${to} must be refused`).toBe(false);
      await of.discardList();
    }
  });

  test('TC06 - Offer qty 0 is refused ("Value cannot be 0"), and "-" and decimals are not accepted in qty', { tag: T, annotation: { type: 'cases', description: 'OFR_NEG_006, OFR_NEG_007, OFR_NEG_009, OFR_VAL_008' } }, async ({ page }) => {
    await of.openNewList();
    await of.fillOffer({ name: nm(), schemes: [{ buy: A.itemName, via: 'Is minimum', from: 0, free: [{ item: B.itemName, qty: 0 }] }] });
    const r = await of.trySaveList();
    expect(r.saved, `qty 0 must be refused (${r.errors.join(' | ')})`).toBe(false);
    const q = page.locator('#items_0_value');
    await q.fill('');
    await q.pressSequentially('-5');
    expect(await q.inputValue()).not.toMatch(/^-/);
    await of.discardList();
  });

  // QA (BUG-PLO-01): there is no duplicate-name check for schemes (current flow).
  test('TC07 - Script text in the offer name is not run, and a duplicate name is accepted', { tag: T, annotation: { type: 'cases', description: 'OFR_NEG_015, OFR_SEC_004, OFR_NEG_008' } }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const name = await make({ name: `ZZ OF <img src=x onerror=window.__xss=1> ${uniq()}`, schemes: [minScheme(50)] });
    await of.openList(name).catch(() => {});
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
    await of.openNewList();
    await of.fillOffer({ name, schemes: [minScheme(60)] });
    const r = await of.trySaveList();
    if (!r.saved) await of.discardList(); else created.push(name);
    expect(r.saved, `duplicate scheme name is accepted ("${r.message}")`).toBe(true);
  });

  // ── Save / view / edit / status ──────────────────────────────────────────

  test('TC08 - General Is minimum offer is listed as Active, General, Bill to Bill with 1 scheme, and its view shows Close, Active, Edit, ITEMS #, Buy Items and Free Items', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_016, OFR_FUNC_017, OFR_FUNC_018, OFR_FUNC_026, OFR_POS_001, OFR_UI_008' } }, async () => {
    const name = await make({ desc: 'promo', schemes: [minScheme(5, 1)] });
    const row = await of.listRowOf(name);
    expect(row).toEqual({ name, type: 'General', pricing: 'Bill to Bill', status: 'Active', items: '1' });
    const v = await of.openList(name);
    for (const t of ['Close', 'Edit', 'LIST TYPE General', 'ITEMS', 'Buy Items', 'Free Items', A.itemName, B.itemName, 'promo']) expect(v).toContain(t);
    await expect(of.plSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  test('TC09 - Offers with Is between 10–20, Is Each 20 (And and Or free items) and two scheme blocks save, and No Of Schemes is 2', { tag: T, annotation: { type: 'cases', description: 'OFR_POS_002, OFR_POS_003, OFR_POS_006, OFR_POS_007, OFR_POS_008' } }, async () => {
    const between = await make({ schemes: [{ buy: A.itemName, from: 10, to: 20, free: [{ item: B.itemName, qty: 1 }] }] });
    expect(await of.openList(between)).toMatch(/between|10.*20/i);
    const each = await make({ schemes: [{ buy: A.itemName, via: 'Is Each', from: 20, free: [{ item: B.itemName, qty: 1 }, { combine: 'And', item: C.itemName, qty: 1 }] }] });
    expect(await of.openList(each)).toMatch(/\(And\)/);
    const two = await make({ schemes: [minScheme(30), { buy: B.itemName, via: 'Is minimum', from: 30, free: [{ item: C.itemName, qty: 1 }, { combine: 'Or', item: A.itemName, qty: 1 }] }] });
    expect((await of.listRowOf(two)).items).toBe('2');
    expect(await of.openList(two)).toMatch(/\(Or\)/);
  });

  test('TC10 - Edit an offer: it is pre-filled, Cancel keeps the old data, and a new name and description are saved', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_019, OFR_FUNC_020, OFR_FUNC_021, OFR_POS_009, OFR_POS_010' } }, async ({ page }) => {
    const name = await make({ schemes: [minScheme(40)] });
    await of.editList(name);
    await expect(of.nameInput).toHaveValue(name);
    await of.nameInput.fill(`${name} X`);
    await of.discardList();
    expect(await of.listRowOf(name)).toBeTruthy();
    await of.editList(name);
    const renamed = `${name} V2`;
    created.push(renamed);
    await of.nameInput.fill(renamed);
    const add = page.getByRole('button', { name: 'Add Description' });
    if (await add.count()) await add.click();
    await page.locator('textarea').filter({ visible: true }).first().fill('edited description');
    expect((await of.trySaveList()).saved).toBe(true);
    expect(await of.listRowOf(renamed)).toBeTruthy();
    expect(await of.openList(renamed)).toContain('edited description');
  });

  test('TC11 - Offer Active switch: turning it off shows Not Active in the list, and turning it on again shows Active', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_023, OFR_FUNC_024, OFR_UI_003' } }, async () => {
    const name = await make({ schemes: [minScheme(45)] });
    await of.setActive(name, false);
    expect((await of.listRowOf(name)).status).toMatch(/Not Active|Inactive/);
    await of.setActive(name, true);
    expect((await of.listRowOf(name)).status).toBe('Active');
  });

  test('TC12 - Delete an offer from the ⋮ menu (with confirmation) removes the scheme', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_022, OFR_UI_009, OFR_NEG_012, OFR_E2E_009' } }, async ({ page }) => {
    const name = await make({ schemes: [minScheme(55)] });
    await of.openPricingList();
    const before = await of.totalCount();
    await of.openList(name);
    await of.plDrawer.locator('svg.ant-dropdown-trigger, .ant-dropdown-trigger').first().click();
    await page.getByRole('menuitem', { name: /Delete/ }).or(page.getByText('Delete', { exact: true })).first().click();
    const yes = page.locator('.ant-popover, .ant-modal-content').filter({ visible: true }).getByRole('button', { name: /^(Yes|OK|Delete|Confirm)$/ }).last();
    await expect(yes, 'delete confirmation').toBeVisible({ timeout: 5000 });
    await yes.click();
    await of.settle(2500, 'deleted');
    created = created.filter((n) => n !== name);
    expect(await of.listRowOf(name)).toBeNull();
    await of.openPricingList();
    expect(await of.totalCount()).toBe(before - 1);
  });

  test('TC13 - "+ Assign" in the offer view opens the distributor picker', { tag: T, annotation: { type: 'cases', description: 'OFR_FUNC_025' } }, async () => {
    const name = await make({ schemes: [minScheme(65)] });
    await of.openList(name);
    // QA (BUG-PLO-02): the assign control is there — with no distributors it reads "No distributors assigned".
    await expect(of.plDrawer.getByRole('button', { name: /assign/i }).first(), 'assign distributors in the view').toBeVisible({ timeout: 10_000 });
  });

  // ── On the sales invoice ─────────────────────────────────────────────────

  test('TC14 - Offer Is minimum 5: 5 of item A on an invoice adds a free item B, 4 of A does not, and with the offer inactive nothing is added', { tag: T, annotation: { type: 'cases', description: 'OFR_POS_001, OFR_BND_005, OFR_BND_006, OFR_NEG_014, OFR_E2E_001, OFR_BL_001' } }, async () => {
    const name = await make({ schemes: [minScheme(5, 1)] });
    expect(freeOf(await of.invoiceWith(A, 5), B), 'free B at the threshold').toBeGreaterThan(0);
    expect(freeOf(await of.invoiceWith(A, 4), B), 'no free B below it').toBe(0);
    await of.setActive(name, false);
    expect(freeOf(await of.invoiceWith(A, 5), B), 'inactive scheme gives nothing').toBe(0);
  });

  test('TC15 - Offer Is Each 20: 40 of item A gives 2 free and 35 of A gives 1 free', { tag: T, annotation: { type: 'cases', description: 'OFR_BND_007, OFR_BND_008, OFR_BL_006, OFR_E2E_002' } }, async () => {
    await make({ schemes: [{ buy: A.itemName, via: 'Is Each', from: 20, free: [{ item: B.itemName, qty: 1 }] }] });
    const freeQty = (inv) => inv.qtyOf(B) || Number((inv.offer.match(/Qty:\s*(\d+)/) || [0, 0])[1]);
    expect(freeQty(await of.invoiceWith(A, 40))).toBe(2);
    expect(freeQty(await of.invoiceWith(A, 35))).toBe(1);
  });

  test('TC16 - Offer Is between 10–20: quantities 10 and 20 trigger the offer, and 9 and 21 do not', { tag: T, annotation: { type: 'cases', description: 'OFR_BND_001, OFR_BND_002, OFR_BND_003, OFR_BND_004, OFR_E2E_003' } }, async () => {
    await make({ schemes: [{ buy: A.itemName, from: 10, to: 20, free: [{ item: B.itemName, qty: 1 }] }] });
    for (const [q, hit] of [[10, true], [20, true], [9, false], [21, false]]) {
      expect(freeOf(await of.invoiceWith(A, q), B) > 0, `${q} A`).toBe(hit);
    }
  });

  test('TC17 - Offer with an And rule adds both free items on the invoice', { tag: T, annotation: { type: 'cases', description: 'OFR_POS_006, OFR_BL_004, OFR_E2E_005' } }, async () => {
    await make({ schemes: [{ buy: A.itemName, via: 'Is minimum', from: 6, free: [{ item: B.itemName, qty: 1 }, { combine: 'And', item: C.itemName, qty: 1 }] }] });
    const inv = await of.invoiceWith(A, 6);
    expect(freeOf(inv, B)).toBeGreaterThan(0);
    expect(freeOf(inv, C)).toBeGreaterThan(0);
  });

  // ── Search ───────────────────────────────────────────────────────────────

  test('TC18 - Offer search works for exact, case variations, partial and no match, and clearing restores the list', { tag: T, annotation: { type: 'cases', description: 'OFR_SF_001, OFR_SF_002, OFR_SF_003, OFR_SF_004, OFR_SF_005' } }, async () => {
    const name = await make({ schemes: [minScheme(70)] });
    const total = (await of.searchLists(''), await of.totalCount());
    expect((await of.searchLists(name)).map((r) => r[0])).toContain(name);
    expect((await of.searchLists(name.toLowerCase())).map((r) => r[0])).toContain(name);
    for (const r of await of.searchLists('ZZ OF')) expect(r[0]).toMatch(/ZZ OF/i);
    expect(await of.searchLists('ZZZ-NO-SUCH-SCHEME')).toEqual([]);
    await of.searchLists('');
    expect(await of.totalCount()).toBe(total);
  });

  test('TC19 - Without a session the offers page redirects to the login page', { tag: T, annotation: { type: 'cases', description: 'OFR_SEC_001' } }, async ({ browser, page }) => {
    await of.openPricingList();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });   // no saved session
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/inventory/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row')).toHaveCount(0);
    await ctx.close();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC20', 'OFR_POS_004 / 005 / OFR_BL_002 / 003 / OFR_E2E_004', 'Profile / category-wise schemes on invoices', 'Needs customers with controlled profiles / business categories; price-list scoping is covered in the PriceList sheet.'],
    ['TC21', 'OFR_POS_007 / OFR_BL_005 / OFR_E2E_006', 'Or rule: customer chooses the free item on the invoice', 'The invoice-side choice prompt is not identified yet; the Or rule is saved and shown (OFR_POS_008).'],
    ['TC22', 'OFR_NEG_010', 'Deleting the only scheme block', 'Covered by the empty save (no buy item → refused).'],
    ['TC23', 'OFR_NEG_013 / OFR_BL_007 / OFR_VAL_005', 'UOM mismatch / UOM list per item', 'Needs an item with alternate UOMs in a scheme.'],
    ['TC24', 'OFR_BL_008 / 009 / 010 / 011 / 012 / OFR_E2E_008 / 010', 'Several active schemes / blocks / edits across invoices', 'Combinations of the invoice cases above — 11+ other schemes are active in this org.'],
    ['TC25', 'OFR_VAL_001 / 007 / OFR_BND_009 / 010 / 011 / 012', 'Name / description length, 99999 qty, block limit', 'Field-length checks — same inputs as the price list form.'],
    ['TC26', 'OFR_SF_006', 'Search by scheme type', 'Search is by name only.'],
    ['TC27', 'OFR_PAG_001…005', 'Pagination with 20 / 21+ schemes', 'The org has ~11 schemes.'],
    ['TC28', 'OFR_UI_010', 'Responsive layout 1366×768', 'Visual design check.'],
    ['TC29', 'OFR_SEC_002 / 005 / 006 / 007 / 008 / 009', 'Roles / CSRF / cross-org / session', 'No such users or second org; API-level checks.'],
    ['TC30', 'OFR_PERF_001…005', 'Response-time / concurrency limits', 'Environment-dependent; not a functional check.'],
    ['TC31', 'OFR_ACC_001…004 / 006 / 007', 'Labels, keyboard, screen reader, contrast', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
