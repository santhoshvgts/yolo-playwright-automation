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

  test('PL_FUNC_001 / PL_UI_001 / PL_UI_002 / PL_POS_015 - List: Price List Name, List Type, Pricing, Status, No Of Items; Active badge text; Total Count', { tag: T }, async ({ page }) => {
    await pl.openPricingList();
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['Price List Name', 'List Type', 'Pricing', 'Status', 'No Of Items']);
    expect(await pl.totalCount()).toBeGreaterThan(0);
    const rows = await pl.plRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
    for (const r of rows) expect(r[3]).toMatch(/^(Active|Not Active)$/);
  });

  test('PL_FUNC_002 / 003 / 004 / 005 / 006 / 007 / PL_UI_003 / 004 / 005 / 013 - Form: name, description, type General / Profile wise / Category wise (profiles; business type & category), Overall Markup (Markup|Markdown + rate) / Item Specific (item list)', { tag: T }, async ({ page }) => {
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

  test('PL_NEG_001 / 006 / 003 - Empty save: Name and Custom Rate required; the rate refuses letters and "-"', { tag: T }, async () => {
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

  test('PL_NEG_002 - Custom rate 0 % is refused', { tag: T }, async () => {
    knownBug('BUG-PL-01', 'custom rate 0 % accepted');
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, rate: 0 });
    const r = await pl.trySaveList();
    expect(r.saved, '0 % must be refused').toBe(false);
    if (!r.saved) await pl.discardList();
  });

  test('PL_NEG_016 - Custom rate above 1000 % is refused or warned about', { tag: T }, async () => {
    knownBug('BUG-PL-01', 'custom rate 1500 % accepted');
    const name = nm();
    created.push(name);
    await pl.openNewList();
    await pl.fillList({ name, rate: 1500 });
    const r = await pl.trySaveList();
    expect(!r.saved || /high|maximum|exceed/i.test(r.message), `1500 % saved silently ("${r.message}")`).toBe(true);
    if (!r.saved) await pl.discardList();
  });

  test('PL_POS_006 / 007 / PL_UI_009 / PL_NEG_010 - Description: counter "N / 300", limited to 300; Remove collapses it', { tag: T }, async ({ page }) => {
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

  test('PL_VAL_012 / PL_BND_011 - Whitespace-only name refused; a 1-character name saves', { tag: T }, async () => {
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
    if (!r.saved) { created.pop(); await pl.discardList(); }
  });

  // QA (BUG-PLO-01): there is no duplicate-name check for price lists (current flow).
  test('PL_VAL_015 - A second list with the same name is accepted', { tag: T }, async () => {
    const name = await make({ rate: 1 });
    await pl.openNewList();
    await pl.fillList({ name, rate: 2 });
    const r = await pl.trySaveList();
    expect(r.saved, `duplicate "${name}" is accepted ("${r.message}")`).toBe(true);
  });

  test('PL_NEG_013 / PL_SEC_005 / 006 - Script text in name / description is not run', { tag: T }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const name = `ZZ PL <img src=x onerror=window.__xss=1> ${uniq()}`;
    await make({ name, desc: '<script>window.__xss=1</script>', rate: 1 });
    await pl.openList(name).catch(() => {});
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  // ── General markup / markdown on the invoice ─────────────────────────────

  test('PL_FUNC_008 / 012 / PL_POS_001 / 009 / 014 / 018 / PL_UI_007 / PL_BL_001 / 002 / 014 / PL_E2E_001 / 010 / TC-27 - General Markup 10 %: list (General, Markup 10 %, Active, All Items), view, ₹100 item → ₹110 on the invoice', { tag: T }, async () => {
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

  test('PL_POS_002 / PL_BL_003 / 015 / PL_E2E_002 / PL_BND_012 / TC-28 - Markdown 10 % → ₹90; Markdown 34 % → ₹66; Markup 10.5 % → ₹110.5', { tag: T }, async () => {
    for (const [prefix, rate, factor] of [['Markdown', 10, 0.9], ['Markdown', 34, 0.66], ['Markup', 10.5, 1.105]]) {
      const name = await make({ prefix, rate });
      expect((await pl.listRowOf(name)).pricing).toBe(`${prefix} ${rate}%`);
      expect(await pl.invoiceRate(A), `${prefix} ${rate}%`).toBe(r2(A.price * factor));
      await pl.setActive(name, false);
    }
  });

  test('PL_BND_002 / 003 / 001 / PL_POS_016 / PL_BL_017 - Markup 100 % doubles; Markdown 100 % → ₹0 (or refused); 0.01 % saves', { tag: T }, async () => {
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

  test('PL_FUNC_016 / 017 / PL_NEG_017 / PL_E2E_007 / TC-29 - Inactive: base price on the invoice; active again: marked-up price', { tag: T }, async () => {
    const name = await make({ rate: 10 });
    await pl.setActive(name, false);
    expect((await pl.listRowOf(name)).status).toBe('Not Active');
    expect(await pl.invoiceRate(A)).toBe(A.price);
    await pl.setActive(name, true);
    expect((await pl.listRowOf(name)).status).toBe('Active');
    expect(await pl.invoiceRate(A)).toBe(r2(A.price * 1.1));
  });

  test('PL_FUNC_013 / 014 / PL_UI_012 / PL_BL_016 / PL_E2E_008 / 012 - Edit: "Edit Price List" prefilled; 10 % → 20 %: list and new invoices follow', { tag: T }, async ({ page }) => {
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

  test('PL_FUNC_004 / 009 / PL_POS_004 / PL_NEG_004 / PL_BND_008 / PL_UI_008 / PL_BL_004 / PL_E2E_003 / TC-30 - Profile wise: refused without a profile; with one, only that customer gets the markup', { tag: T }, async () => {
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

  test('PL_FUNC_010 / PL_POS_003 / PL_E2E_013 / PL_VAL_014 - Category wise Retailer (category All / empty): saved; view shows the business type', { tag: T }, async () => {
    const name = await make({ type: 'Category wise', businessType: 'Retailer', businessCategory: true, rate: 25 });
    expect((await pl.listRowOf(name)).type).toBe('Category wise');
    expect(await pl.openList(name)).toMatch(/Retailer/);
  });

  test('PL_FUNC_011 / PL_POS_005 / PL_NEG_005 / PL_BND_006 / PL_BL_007 / 019 / PL_E2E_005 / TC-39 - Item Specific: refused without items; A at ₹90 → "1 Items"; invoice A ₹90, B base price', { tag: T }, async () => {
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

  test('PL_NEG_015 - The same item twice in an Item Specific list is prevented', { tag: T }, async ({ page }) => {
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

  test('PL_FUNC_015 / PL_NEG_009 / PL_E2E_009 / PL_BL_010 - The view offers Delete (⋮ menu)', { tag: T }, async () => {
    const name = await make({ rate: 1 });
    await pl.openList(name);
    const menu = pl.plDrawer.locator('.ant-dropdown-trigger, [aria-label*="more" i]').first();
    if (await menu.count()) await menu.click();
    await expect(pl.page.getByRole('button', { name: /Delete/ }).or(pl.page.getByRole('menuitem', { name: /Delete/ })).first(), 'Delete option').toBeVisible({ timeout: 5000 });
  });

  test('PL_FUNC_018 / PL_UI_014 / PL_POS_011 - Distributors: "+ Assign" in the view, distributor options on the form', { tag: T }, async () => {
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

  test('PL_SF_001 / 002 / 003 / 004 / 005 / PL_SEC_004 - Search: exact, partial, case, no match, SQL text; clearing restores', { tag: T }, async () => {
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

  test('PL_PAG_002 / 003 / 004 / 005 / 006 / 010 - 20 per page, next / previous, count constant; search back to page 1; newest list first', { tag: T }, async ({ page }) => {
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

  test('PL_SEC_001 / 010 - Without a session the pricing page redirects to login; URLs hold no rates', { tag: T }, async ({ browser, page }) => {
    await pl.openPricingList();
    expect(page.url()).not.toMatch(/rate|markup|%/i);
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/inventory/, { timeout: 30_000 });
    await expect(anon.locator('table tbody tr.ant-table-row')).toHaveCount(0);
    await ctx.close();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [id, title, why] of [
    ['PL_FUNC_019 / 020', 'Several profile tags / remove a tag', 'Covered by one profile (PL_FUNC_009); tag removal needs a second spare customer.'],
    ['PL_FUNC_021 / 022 / PL_UI_006 / PL_VAL_010 / 013 / 016 / PL_BL_008 / 012 / 020 / PL_POS_012 / PL_E2E_006 / 014', 'Auto Calculate / additional UOM prices', 'Needs an item with alternate UOMs in an Item Specific list — UOM pricing is covered by the Sales Invoice stock sheet.'],
    ['PL_POS_008 / 013 / PL_BL_018', 'Beat Routes', 'No Beat Routes field in this build.'],
    ['PL_POS_010', 'Switch Overall Markup → Item Specific on edit', 'Same form as create (both modes checked).'],
    ['PL_POS_017 / PL_UI_010 / PL_SF_007…010', 'Item search inside the view', 'Needs an Item Specific list with many items.'],
    ['PL_NEG_007 / 008 / PL_BND_009 / 010', 'Item Specific price 0 / negative / 0.01 / 99.99', 'Item price field rules follow the custom rate field (PL_NEG_006).'],
    ['PL_NEG_012 / PL_VAL_005 / PL_VAL_019 / PL_BL_005 / 006 / PL_E2E_004', 'Category wise without business type / per-category pricing on invoices', 'Business Type defaults to Retailer; customers with controlled business type / category are needed.'],
    ['PL_BL_011', 'Priority between several active lists', 'The org has 380 lists from other runs; priority needs a clean org.'],
    ['PL_BL_013 / PL_E2E_011 / PL_UI_011', 'Distributor-restricted pricing', 'No distributor customers in this org.'],
    ['PL_BND_007 / PL_PERF_004 / 008', '50-item list', 'Needs 50 items set up for one list.'],
    ['PL_SF_006 / 011 / 012', 'Search by type / pricing keyword; search kept across views', 'Search is by name only.'],
    ['PL_PAG_001 / 007 / 008 / 009 / PL_E2E_015', 'Exact counts (19 / 21) / popup pagination', 'The org has 380+ lists.'],
    ['PL_VAL_009 / 011 / 018', 'Name length / Markup required / scope', 'Markup is the default prefix; scope covered by PL_FUNC_009.'],
    ['PL_NEG_011 / 014 / PL_SEC_002 / 003 / 009 / 013 / 015', 'Role / cross-org restrictions', 'No such users or second org.'],
    ['PL_NEG_018 / PL_SEC_007 / 008 / 011 / 012 / 014', 'Deleted-list URL / CSRF / session / rate limit / API', 'Lists cannot be deleted; API-level checks.'],
    ['PL_PERF_001…010', 'Response-time / concurrency limits', 'Environment-dependent; not a functional check.'],
    ['PL_ACC_001…010', 'Keyboard / screen reader / contrast', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${id} - ${title} (${why})`, async () => {});
  }
});
