// ═════════════════════════════════════════════════════════════════════════
// Price List (YOLO_BOOKS_PriceList_TC.xlsx: PL_FUNC / POS / NEG / UI / VAL / BND / BL / SF / PAG / SEC / E2E /
// PERF / ACC) + the Sales_Invoice cases deferred here (TC-27…30 / TC-39 price lists on the invoice).
// A General list changes the rate of every sales invoice line, so EVERY list a test creates is deactivated in
// afterEach (lists cannot be deleted — see PL_FUNC_015). Lists are "ZZ PL <unique>". Item A of the shared priced
// items (₹100) is the reference: Markup 10 % → ₹110 on the invoice, Markdown 10 % → ₹90.
// Profile-wise lists target "Rajesh kumar" (not used by other suites); the default customer gets the base price.
//
// Same case as another one here:
//   PL_VAL_001 = PL_NEG_001 · PL_VAL_002 = PL_NEG_002 / 003 · PL_VAL_003 = PL_NEG_006 · PL_VAL_004 = PL_NEG_004
//   PL_VAL_006 / 007 = PL_NEG_005 / 007 · PL_VAL_008 / PL_BND_004 / 005 = PL_NEG_010 · PL_VAL_017 / PL_BL_009 = PL_FUNC_016
//   PL_BL_002 / 014 = PL_FUNC_008 · PL_BL_003 = PL_POS_002 · PL_SEC_004 = SF test · PL_SEC_005 = PL_NEG_013
//
//   npx playwright test tests/inventory/03_PriceList.spec.js --grep @pricelist
// ═════════════════════════════════════════════════════════════════════════

const { test, expect, knownBug, bugCheck } = require('../../fixtures/base-test');
const { PricingPage } = require('../../pages/inventory/PricingPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');

const T = ['@inventory', '@pricelist'];
const PROFILE = 'Rajesh kumar';

test.describe('Price List', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {PricingPage} */
  let pl;
  let A; let B;
  let created = [];
  test.beforeEach(async ({ page }) => {
    pl = new PricingPage(page);
    await pl.open();
    [A, B] = await pl.ensurePricedItems(E.items());
    created = [];
  });
  // Safety net: no list created here may stay active (it would change other suites' invoice rates)
  test.afterEach(async () => {
    // Safety net: deactivate every active "ZZ PL" entry (duplicate names included)
    if (created.length) await pl.deactivateAll('ZZ PL').catch((e) => console.log(`cleanup failed: ${e.message.slice(0, 80)}`));
  });

  const uniq = () => `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
  const nm = () => `ZZ PL ${uniq()}`;
  const make = async (l) => { const name = l.name || nm(); created.push(name); await pl.createList({ ...l, name }); return name; };
  const r2 = (n) => Math.round(n * 100) / 100;

  // ── List / form ──────────────────────────────────────────────────────────

  test('TC01 - Price list screen shows Price List Name, List Type, Pricing, Status and No Of Items columns, Active badge text and Total Count', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_001, PL_UI_001, PL_UI_002, PL_POS_015' } }, async ({ page }) => {
    await pl.openPricingList();
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['Price List Name', 'List Type', 'Pricing', 'Status', 'No Of Items']);
    expect(await pl.totalCount()).toBeGreaterThan(0);
    const rows = await pl.plRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
    for (const r of rows) expect(r[3]).toMatch(/^(Active|Not Active)$/);
  });

  test('TC02 - Price list form has name, description, type General, Profile wise or Category wise (profiles; business type and category), and Overall Markup (Markup or Markdown plus rate) or Item Specific (item list)', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_002, PL_FUNC_003, PL_FUNC_004, PL_FUNC_005, PL_FUNC_006, PL_FUNC_007, PL_UI_003, PL_UI_004, PL_UI_005, PL_UI_013' } }, async ({ page }) => {
    await pl.openNewList();
    expect(await pl.optionsOf('pricelist_type')).toEqual(['General', 'Profile wise', 'Category wise']);
    await page.getByText('Overall Markup', { exact: true }).first().click();
    expect(await pl.optionsOf('custom_rate_prefix')).toEqual(expect.arrayContaining(['Markup', 'Markdown']));
    await expect(pl.rateInput).toBeVisible();
    await page.getByText('Item Specific', { exact: true }).first().click();
    await expect(page.getByText(/Add item by entering product name or product code/)).toBeVisible();
    for (const t of ['Item Name', 'Primary UOM', 'Additional UOMs']) await expect(page.getByText(t).first()).toBeVisible();
    await pl.pickIn('pricelist_type', 'Profile wise');
    await expect(page.getByText(/Add Profile/).first()).toBeVisible();
    await pl.pickIn('pricelist_type', 'Category wise');
    await expect(page.locator('#business_type')).toBeAttached();
    await expect(page.locator('#business_category')).toBeAttached();
    await expect(pl.plSave).toBeVisible();
    await pl.discardList();
  });

  test('TC03 - Saving an empty price list requires Name and Custom Rate, and the rate refuses letters and "-"', { tag: T, annotation: { type: 'cases', description: 'PL_NEG_001, PL_NEG_006, PL_NEG_003' } }, async () => {
    await pl.openNewList();
    const r = await pl.trySaveList();
    expect(r.saved).toBe(false);
    expect(r.errors.join(' | ')).toMatch(/Name is Required/i);
    expect(r.errors.join(' | ')).toMatch(/Custom Rate is Required/i);
    for (const bad of ['abc', '-10']) {
      await pl.rateInput.fill('');
      await pl.rateInput.pressSequentially(bad);
      expect(await pl.rateInput.inputValue(), `rate "${bad}"`).not.toMatch(/-|[a-z]/i);
    }
    await pl.discardList();
  });

  test('TC04 - A custom rate of 0 % is refused', { tag: T, annotation: { type: 'cases', description: 'PL_NEG_002' } }, async () => {
    knownBug('BUG-PL-01', 'custom rate 0 % accepted');
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, rate: 0 });
    const r = await pl.trySaveList();
    expect(r.saved, '0 % must be refused').toBe(false);
    if (!r.saved) await pl.discardList();
  });

  test('TC05 - A custom rate above 1000 % is refused or warned about', { tag: T, annotation: { type: 'cases', description: 'PL_NEG_016' } }, async () => {
    knownBug('BUG-PL-01', 'custom rate 1500 % accepted');
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, rate: 1500 });
    const r = await pl.trySaveList();
    expect(!r.saved || /high|maximum|exceed/i.test(r.message), `1500 % saved silently ("${r.message}")`).toBe(true);
    if (!r.saved) await pl.discardList();
  });

  test('TC06 - Price list description shows a counter "N / 300" and is limited to 300 characters, and Remove collapses it', { tag: T, annotation: { type: 'cases', description: 'PL_POS_006, PL_POS_007, PL_UI_009, PL_NEG_010' } }, async ({ page }) => {
    await pl.openNewList();
    await page.getByRole('button', { name: 'Add Description' }).click();
    const ta = page.locator('textarea').filter({ visible: true }).first();
    await ta.fill('Testing');
    await expect(page.getByText(/7\s*\/\s*300/)).toBeVisible();
    await ta.fill('D'.repeat(320));
    expect((await ta.inputValue()).length).toBeLessThanOrEqual(300);
    const remove = page.getByRole('button', { name: /Remove Description/i });
    if (await remove.count()) {
      await remove.click();
      await expect(page.getByRole('button', { name: 'Add Description' })).toBeVisible();
    }
    await pl.discardList();
  });

  test('TC07 - A whitespace-only price list name is refused, and a 1-character name saves', { tag: T, annotation: { type: 'cases', description: 'PL_VAL_012, PL_BND_011' } }, async () => {
    await pl.openNewList();
    await pl.fillList({ name: '   ', rate: 1 });
    expect((await pl.trySaveList()).saved, 'whitespace name refused').toBe(false);
    await pl.discardList();
    const one = `Z${uniq().slice(-1)}`.slice(0, 1);
    created.push(one);
    await pl.openNewList();
    await pl.fillList({ name: one, rate: 1 });
    const r = await pl.trySaveList();
    console.log(`1-character name: ${r.saved ? 'saved' : r.errors.join(' | ')}`);
    // "Z" is outside the "ZZ PL" cleanup, and an active 1 % list for All marks up every later invoice
    if (r.saved) await pl.deactivateAll(one, { exact: true });
    else { created.pop(); await pl.discardList(); }
  });

  // QA (BUG-PLO-01): there is no duplicate-name check for price lists (current flow).
  test('TC08 - A second price list with the same name is accepted', { tag: T, annotation: { type: 'cases', description: 'PL_VAL_015' } }, async () => {
    const name = await make({ rate: 1 });
    await pl.openNewList();
    await pl.fillList({ name, rate: 2 });
    const r = await pl.trySaveList();
    expect(r.saved, `duplicate "${name}" is accepted ("${r.message}")`).toBe(true);
  });

  test('TC09 - Script text in the price list name or description is not run', { tag: T, annotation: { type: 'cases', description: 'PL_NEG_013, PL_SEC_005, PL_SEC_006' } }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const name = `ZZ PL <img src=x onerror=window.__xss=1> ${uniq()}`;
    await make({ name, desc: '<script>window.__xss=1</script>', rate: 1 });
    await pl.openList(name).catch(() => {});
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  // ── General markup / markdown on the invoice ─────────────────────────────

  test('TC10 - General price list with Markup 10 % is listed (General, Markup 10 %, Active, All Items), shown in the view, and a ₹100 item becomes ₹110 on the invoice', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_008, PL_FUNC_012, PL_POS_001, PL_POS_009, PL_POS_014, PL_POS_018, PL_UI_007, PL_BL_001, PL_BL_002, PL_BL_014, PL_E2E_001, PL_E2E_010, TC-27' } }, async () => {
    const name = await make({ rate: 10 });
    const row = await pl.listRowOf(name);
    expect(row).toEqual({ name, type: 'General', pricing: 'Markup 10%', status: 'Active', items: 'All Items' });
    const v = await pl.openList(name);
    for (const t of ['Close', 'Edit', 'LIST TYPE General', 'CUSTOM RATE Markup 10%', 'DISTRIBUTORS']) expect(v).toContain(t);
    await expect(pl.plSwitch()).toHaveAttribute('aria-checked', 'true');
    await pl.plDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(pl.plDrawer).toBeHidden();
    expect(await pl.invoiceRate(A)).toBe(r2(A.price * 1.1));
  });

  test('TC11 - Price list rates on an invoice: Markdown 10 % gives ₹90, Markdown 34 % gives ₹66 and Markup 10.5 % gives ₹110.5', { tag: T, annotation: { type: 'cases', description: 'PL_POS_002, PL_BL_003, PL_BL_015, PL_E2E_002, PL_BND_012, TC-28' } }, async () => {
    for (const [prefix, rate, factor] of [['Markdown', 10, 0.9], ['Markdown', 34, 0.66], ['Markup', 10.5, 1.105]]) {
      const name = await make({ prefix, rate });
      expect((await pl.listRowOf(name)).pricing).toBe(`${prefix} ${rate}%`);
      expect(await pl.invoiceRate(A), `${prefix} ${rate}%`).toBe(r2(A.price * factor));
      await pl.setActive(name, false);
    }
  });

  test('TC12 - Markup 100 % doubles the price, Markdown 100 % gives ₹0 (or is refused), and 0.01 % saves', { tag: T, annotation: { type: 'cases', description: 'PL_BND_002, PL_BND_003, PL_BND_001, PL_POS_016, PL_BL_017' } }, async () => {
    const dbl = await make({ rate: 100 });
    expect(await pl.invoiceRate(A)).toBe(r2(A.price * 2));
    expect(await pl.invoiceRate(B)).toBe(r2(B.price * 2));
    await pl.setActive(dbl, false);
    const zero = nm();
    created.push(zero);
    await pl.openNewList();
    await pl.fillList({ name: zero, prefix: 'Markdown', rate: 100 });
    const r = await pl.trySaveList();
    if (r.saved) { expect(await pl.invoiceRate(A)).toBe(0); await pl.setActive(zero, false); } else await pl.discardList();
    const tiny = await make({ rate: 0.01 });
    expect((await pl.listRowOf(tiny)).pricing).toBe('Markup 0.01%');
  });

  test('TC13 - With the price list inactive the invoice uses the base price, and when active again it uses the marked-up price', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_016, PL_FUNC_017, PL_NEG_017, PL_E2E_007, TC-29' } }, async () => {
    const name = await make({ rate: 10 });
    await pl.setActive(name, false);
    expect((await pl.listRowOf(name)).status).toBe('Not Active');
    expect(await pl.invoiceRate(A)).toBe(A.price);
    await pl.setActive(name, true);
    expect((await pl.listRowOf(name)).status).toBe('Active');
    expect(await pl.invoiceRate(A)).toBe(r2(A.price * 1.1));
  });

  test('TC14 - Edit a price list: "Edit Price List" is pre-filled, and changing 10 % to 20 % updates the list and new invoices', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_013, PL_FUNC_014, PL_UI_012, PL_BL_016, PL_E2E_008, PL_E2E_012' } }, async ({ page }) => {
    const name = await make({ rate: 10, desc: 'first' });
    await pl.editList(name);
    await expect(page.getByText('Edit Price List').first()).toBeVisible();
    await expect(pl.nameInput).toHaveValue(name);
    await expect(pl.rateInput).toHaveValue('10');
    await pl.rateInput.fill('20');
    expect((await pl.trySaveList()).saved).toBe(true);
    expect((await pl.listRowOf(name)).pricing).toBe('Markup 20%');
    expect(await pl.invoiceRate(A)).toBe(r2(A.price * 1.2));
  });

  // ── Profile / category / item specific ───────────────────────────────────

  test('TC15 - Profile wise price list is refused without a profile, and with a profile only that customer gets the markup', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_004, PL_FUNC_009, PL_POS_004, PL_NEG_004, PL_BND_008, PL_UI_008, PL_BL_004, PL_E2E_003, TC-30' } }, async () => {
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, type: 'Profile wise', rate: 20 });
    const r = await pl.trySaveList();
    await bugCheck('BUG-PL-02', 'Profile wise list saved without a profile', async () => {
      expect(r.saved, 'Profile wise without a profile must be refused').toBe(false);
    });
    // While the bug is open the list is already saved without a profile, so the rest cannot run.
    if (r.saved) return;
    await pl.addProfile(PROFILE);
    await expect(pl.page.getByText(PROFILE).first()).toBeVisible();
    expect((await pl.trySaveList()).saved).toBe(true);
    expect((await pl.listRowOf(name)).type).toBe('Profile wise');
    expect(await pl.invoiceRate(A, PROFILE)).toBe(r2(A.price * 1.2));
    expect(await pl.invoiceRate(A)).toBe(A.price);
  });

  test('TC16 - Category wise price list for Retailer (category All or empty) is saved, and the view shows the business type', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_010, PL_POS_003, PL_E2E_013, PL_VAL_014' } }, async () => {
    const name = await make({ type: 'Category wise', businessType: 'Retailer', businessCategory: true, rate: 25 });
    expect((await pl.listRowOf(name)).type).toBe('Category wise');
    expect(await pl.openList(name)).toMatch(/Retailer/);
  });

  test('TC17 - Item Specific price list is refused without items; with item A at ₹90 it shows "1 Items", and on an invoice A is ₹90 and B stays at the base price', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_011, PL_POS_005, PL_NEG_005, PL_BND_006, PL_BL_007, PL_BL_019, PL_E2E_005, TC-39' } }, async () => {
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, mode: 'Item Specific' });
    const r = await pl.trySaveList();
    expect(r.saved, 'Item Specific without items must be refused').toBe(false);
    await pl.addListItem({ name: A.itemName, price: 90 });
    expect((await pl.trySaveList()).saved).toBe(true);
    const row = await pl.listRowOf(name);
    expect(row.items).toBe('1 Items');
    expect(await pl.invoiceRate(A)).toBe(90);
    expect(await pl.invoiceRate(B)).toBe(B.price);
  });

  test('TC18 - Adding the same item twice to an Item Specific price list is prevented', { tag: T, annotation: { type: 'cases', description: 'PL_NEG_015' } }, async ({ page }) => {
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, mode: 'Item Specific', items: [{ name: A.itemName, price: 95 }] });
    await pl.addListItem({ name: A.itemName }).catch(() => {});
    const rows = await page.locator('table tbody tr').filter({ hasText: A.itemName }).count();
    expect(rows, 'item listed once').toBe(1);
    await pl.discardList();
  });

  // ── Delete / distributors ────────────────────────────────────────────────

  test('TC19 - The price list view offers Delete in its ⋮ menu', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_015, PL_NEG_009, PL_E2E_009, PL_BL_010' } }, async () => {
    const name = await make({ rate: 1 });
    await pl.openList(name);
    const menu = pl.plDrawer.locator('.ant-dropdown-trigger, [aria-label*="more" i]').first();
    if (await menu.count()) await menu.click();
    await expect(pl.page.getByRole('button', { name: /Delete/ }).or(pl.page.getByRole('menuitem', { name: /Delete/ })).first(), 'Delete option').toBeVisible({ timeout: 5000 });
  });

  test('TC20 - Price list distributors: the view has "+ Assign" and the form shows distributor options', { tag: T, annotation: { type: 'cases', description: 'PL_FUNC_018, PL_UI_014, PL_POS_011' } }, async () => {
    await pl.openNewList();
    const opts = await pl.optionsOf('distributor_ids');
    console.log(`distributors: ${opts.join(', ') || 'none'}`);
    await pl.discardList();
    const name = await make({ rate: 1 });
    await pl.openList(name);
    // QA (BUG-PLO-02): the assign control is there — with no distributors it reads "No distributors assigned".
    await expect(pl.plDrawer.getByRole('button', { name: /assign/i }).first(), 'assign distributors in the view').toBeVisible({ timeout: 10_000 });
  });

  // ── Search / pagination ──────────────────────────────────────────────────

  test('TC21 - Price list search works for exact, partial, case variations, no match and SQL text, and clearing restores the list', { tag: T, annotation: { type: 'cases', description: 'PL_SF_001, PL_SF_002, PL_SF_003, PL_SF_004, PL_SF_005, PL_SEC_004' } }, async () => {
    const name = await make({ rate: 1 });
    const total = (await pl.searchLists(''), await pl.totalCount());
    expect((await pl.searchLists(name)).map((r) => r[0])).toEqual([name]);
    for (const r of await pl.searchLists('ZZ PL')) expect(r[0]).toMatch(/ZZ PL/i);
    expect((await pl.searchLists(name.toLowerCase())).map((r) => r[0])).toContain(name);
    expect(await pl.searchLists('ZZZ-NO-SUCH-LIST-987')).toEqual([]);
    expect(await pl.searchLists("' OR 1=1 --")).toEqual([]);
    await pl.searchLists('');
    expect(await pl.totalCount()).toBe(total);
  });

  test('TC22 - Price list shows 20 per page with next and previous and a constant count, a search goes back to page 1, and the newest list is first', { tag: T, annotation: { type: 'cases', description: 'PL_PAG_002, PL_PAG_003, PL_PAG_004, PL_PAG_005, PL_PAG_006, PL_PAG_010' } }, async ({ page }) => {
    const name = await make({ rate: 1 });
    await pl.searchLists('');
    const total = await pl.totalCount();
    const first = await pl.plRows.first().locator('td').first().innerText();
    expect(first.trim(), 'newest first').toBe(name);
    test.skip(total <= 20, 'one page');
    expect(await pl.plRows.count()).toBe(20);
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    await pag.locator('li.ant-pagination-next').click();
    await pl.settle(2000, 'page 2');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    expect(await pl.totalCount()).toBe(total);
    await pag.locator('li.ant-pagination-prev').click();
    await pl.settle(2000, 'page 1');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('1');
    await pag.locator('li.ant-pagination-next').click();
    await pl.settle(2000, 'page 2');
    await pl.fillInto(pl.plSearch, 'ZZ');
    await pl.settle(2500, 'search');
    await bugCheck('BUG-GEN-02', 'a new search keeps the current page', async () => {
      await expect(page.locator('ul.ant-pagination').filter({ visible: true }).first().locator('li.ant-pagination-item-active')).toHaveText('1', { timeout: 5000 });
    });
  });

  test('TC23 - Without a session the pricing page redirects to the login page, and the URLs hold no rates', { tag: T, annotation: { type: 'cases', description: 'PL_SEC_001, PL_SEC_010' } }, async ({ browser, page }) => {
    await pl.openPricingList();
    expect(page.url()).not.toMatch(/rate|markup|%/i);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });   // no saved session
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/inventory/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row')).toHaveCount(0);
    await ctx.close();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC24', 'PL_FUNC_019 / 020', 'Several profile tags / remove a tag', 'Covered by one profile (PL_FUNC_009); tag removal needs a second spare customer.'],
    ['TC25', 'PL_FUNC_021 / 022 / PL_UI_006 / PL_VAL_010 / 013 / 016 / PL_BL_008 / 012 / 020 / PL_POS_012 / PL_E2E_006 / 014', 'Auto Calculate / additional UOM prices', 'Needs an item with alternate UOMs in an Item Specific list — UOM pricing is covered by the Sales Invoice stock sheet.'],
    ['TC26', 'PL_POS_008 / 013 / PL_BL_018', 'Beat Routes', 'No Beat Routes field in this build.'],
    ['TC27', 'PL_POS_010', 'Switch Overall Markup → Item Specific on edit', 'Same form as create (both modes checked).'],
    ['TC28', 'PL_POS_017 / PL_UI_010 / PL_SF_007…010', 'Item search inside the view', 'Needs an Item Specific list with many items.'],
    ['TC29', 'PL_NEG_007 / 008 / PL_BND_009 / 010', 'Item Specific price 0 / negative / 0.01 / 99.99', 'Item price field rules follow the custom rate field (PL_NEG_006).'],
    ['TC30', 'PL_NEG_012 / PL_VAL_005 / PL_VAL_019 / PL_BL_005 / 006 / PL_E2E_004', 'Category wise without business type / per-category pricing on invoices', 'Business Type defaults to Retailer; customers with controlled business type / category are needed.'],
    ['TC31', 'PL_BL_011', 'Priority between several active lists', 'The org has 380 lists from other runs; priority needs a clean org.'],
    ['TC32', 'PL_BL_013 / PL_E2E_011 / PL_UI_011', 'Distributor-restricted pricing', 'No distributor customers in this org.'],
    ['TC33', 'PL_BND_007 / PL_PERF_004 / 008', '50-item list', 'Needs 50 items set up for one list.'],
    ['TC34', 'PL_SF_006 / 011 / 012', 'Search by type / pricing keyword; search kept across views', 'Search is by name only.'],
    ['TC35', 'PL_PAG_001 / 007 / 008 / 009 / PL_E2E_015', 'Exact counts (19 / 21) / popup pagination', 'The org has 380+ lists.'],
    ['TC36', 'PL_VAL_009 / 011 / 018', 'Name length / Markup required / scope', 'Markup is the default prefix; scope covered by PL_FUNC_009.'],
    ['TC37', 'PL_NEG_011 / 014 / PL_SEC_002 / 003 / 009 / 013 / 015', 'Role / cross-org restrictions', 'No such users or second org.'],
    ['TC38', 'PL_NEG_018 / PL_SEC_007 / 008 / 011 / 012 / 014', 'Deleted-list URL / CSRF / session / rate limit / API', 'Lists cannot be deleted; API-level checks.'],
    ['TC39', 'PL_PERF_001…010', 'Response-time / concurrency limits', 'Environment-dependent; not a functional check.'],
    ['TC40', 'PL_ACC_001…010', 'Keyboard / screen reader / contrast', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
