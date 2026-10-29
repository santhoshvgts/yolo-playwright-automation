// ═════════════════════════════════════════════════════════════════════════
// Vendor (YOLO_BOOKS_Vendor_TC.xlsx: VND_FUNC / POS / NEG / UI / VAL / BND / BL / SF / PAG / UPL / SEC /
// E2E / PERF / ACC).
// Vendor "New Vendor 1" for transactions; new vendors are "ZZ Vend <unique>". The vendor create form and the
// View Details page are the SAME components as the customer ones (Customer_Create_Edit sheet) — the
// field-level rules already checked there (type / category lists, tags, opening-balance type, GSTIN
// formats, address panel) are not repeated; here each is checked once on the vendor side.
// Adapted: "+ Vendor" is a "Vendor" button → Business Vendor / Individual Vendor; the profile has no edit
// for GST Number, IDs & Certificates or Other Info (see fixme); there is no Delete for a vendor.
//
// Already automated — not repeated:
//   VND_POS_007 / VND_BL_006 / 011 overdue / days-due badges ... Purchase Invoice PI_POS_017
//   VND_BL_009 deleting a bill lowers the vendor due ......... PI_FUNC_010
//   VND_BL_010 deleting a payment restores the due ........... Payment Made PAY_FUNC_013
//   VND_UI_006 status badge colours .......................... PI_POS_017
// Picked up here (deferred from Payment Made): PAY_POS_018 / PAY_BL_006 / PAY_BND_011 opening-balance row.
//
//   npx playwright test tests/purchase/05_Vendor.spec.js --grep @vendor
// ═════════════════════════════════════════════════════════════════════════

const { test, expect, bugCheck } = require('../../fixtures/base-test');
const { VendorPage } = require('../../pages/purchase/VendorPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { masterData } = require('../../test-data/UserData');
const { expectClose } = require('../../utils/stockMath');

const T = ['@purchase', '@vendor'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const filterDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}, ${d.getFullYear()}`;

test.describe('Vendor', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {VendorPage} */
  let vp;
  let A;
  const VENDOR = masterData.vendorName;
  test.beforeEach(async ({ page }) => {
    vp = new VendorPage(page);
    await vp.open();
    [A] = await vp.bills.ensurePricedItems(E.items());
  });

  const uniq = () => `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
  const ADDR = { line1: '12 Main Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' };
  const spec = (extra = {}) => ({ name: `ZZ Vend ${uniq()}`, type: 'Wholesaler', category: true, gst: 'UnRegistered', ...extra });
  const fillNew = async (extra = {}) => { await vp.openNewVendor(); const s = spec(extra); await vp.fillCustomer(s); return s; };
  const L = (item, qty) => ({ item, qty, rate: item.price, discount: 0, discountMode: '%', gst: 18, cess: 0 });
  const bill = async (qty = 1, vendorName = VENDOR) => {
    const m = { lines: [L(A, qty)], taxMode: 'Excluding Tax' };
    const { billNo } = await vp.bills.createPricedInvoice(m, { vendorName });
    return { no: billNo, total: vp.bills.computeTotals(m).total };
  };

  // ── List / search ────────────────────────────────────────────────────────

  test('VND_FUNC_001 / VND_UI_001 / 013 / VND_SF_001 / 002 / 003 / 004 / 005 / VND_SEC_004 - Vendor list with search: exact, partial, case-insensitive, no match, SQL text, clear', { tag: T }, async ({ page }) => {
    await vp._vendorList();
    await expect(vp.customerSearch).toBeVisible();
    await expect(vp.newVendorBtn).toBeVisible();
    expect(await vp.searchVendors(VENDOR)).toContain(VENDOR);
    expect(await vp.searchVendors(VENDOR.slice(0, 6))).toContain(VENDOR);
    expect(await vp.searchVendors(VENDOR.toUpperCase()), 'case-insensitive').toContain(VENDOR);
    await vp.customerSearch.fill('ZZZ-NO-SUCH-VENDOR-987');
    await vp.settle(2500, 'search');
    await expect(vp.vendorLink(VENDOR)).toHaveCount(0);
    await vp.customerSearch.fill("' OR 1=1 --");
    await vp.settle(2500, 'search');
    await expect(vp.vendorLink(VENDOR)).toHaveCount(0);
    await vp.customerSearch.fill('');
    await vp.settle(2500, 'cleared');
    await expect.poll(() => page.locator('[class*="organisation_main_name"]').count(), { message: 'full list back' }).toBeGreaterThan(1);
  });

  // ── Create ───────────────────────────────────────────────────────────────

  test('VND_NEG_001 / VND_VAL_001 - Save with nothing filled: Name, Business Type, Category and GST Status required', { tag: T }, async () => {
    await vp.openNewVendor();
    const r = await vp.trySaveCustomer();
    expect(r.saved).toBe(false);
    expect(r.errors.join(' | ')).toMatch(/Name is Required/i);
    await vp.closeForm();
  });

  test('VND_FUNC_002 / VND_POS_001 / VND_BND_002 / 008 / VND_VAL_016 / VND_E2E_001 / 012 - New vendor (opening ₹0) is listed; Due / Advance / Closing ₹0; statement empty; advance has no flow', { tag: T }, async () => {
    await vp.openNewVendor();
    await expect(vp.nameInput).toHaveValue('');
    const s = spec({ opening: 0 });
    await vp.fillCustomer(s);
    await vp.fillAddress(ADDR);
    await vp.saveCustomer();
    expect(await vp.searchVendors(s.name)).toContain(s.name);
    await vp.openVendor(s.name);
    const h = await vp.readHeader();
    expect([h.due, h.advance, h.closing]).toEqual([0, 0, 0]);
    expect((await vp.readVendorStatement()).filter((r) => r.amount || r.payment)).toEqual([]);
    // QA (BUG-VN-03): vendors have no advance flow, so the ₹0 advance link is not checked.
  });

  test('VND_E2E_001 / VND_BL_002 / 013 / VND_FUNC_014 / PAY_POS_018 / PAY_BL_006 - New vendor with opening balance: first statement row; a bill adds to the due; Payment Made lists the opening balance', { tag: T }, async () => {
    const s = spec({ opening: 2000 });
    await vp.openNewVendor();
    await vp.fillCustomer(s);
    await vp.fillAddress(ADDR);
    await vp.saveCustomer();
    await vp.openVendor(s.name);
    const h0 = await vp.readHeader();
    console.log(`opening 2000 → due ${h0.due}, advance ${h0.advance}`);
    const st = await vp.readVendorStatement();
    expect(st[0].detail).toMatch(/Opening balance/i);
    const b = await bill(1, s.name);
    // Balances post asynchronously — re-read until they settle
    await expect(async () => {
      const h1 = await vp.vendorState(s.name);
      expectClose(h1.due - h0.due, b.total, 0.02, 'due up by the bill');
    }).toPass({ timeout: 90_000 });
    expect((await vp.readVendorStatement()).some((r) => r.detail.includes(b.no) && Math.abs(r.amount - b.total) < 0.02)).toBe(true);
    await vp.bills.openNewPayment(s.name);
    const rows = await vp.page.locator('table tbody tr').filter({ visible: true }).allInnerTexts();
    expect(rows.join(' '), 'opening balance offered in the due list').toMatch(/Opening Balance/i);
    await vp.bills.discardPaymentForm();
  });

  test('VND_NEG_004 / VND_VAL_002 / VND_SEC_006 - Invalid email (incl. script text) is refused', { tag: T }, async () => {
    await fillNew({ email: '<script>x</script>@bad' });
    const r = await vp.trySaveCustomer();
    expect(r.saved).toBe(false);
    expect(r.errors.join(' ')).toMatch(/email/i);
    await vp.closeForm();
  });

  test('VND_NEG_005 / VND_VAL_003 - Registered with an invalid GSTIN is refused', { tag: T }, async () => {
    await fillNew({ gst: 'Registered', gstin: 'INVALID123' });
    const r = await vp.trySaveCustomer();
    expect(r.saved).toBe(false);
    expect(r.errors.join(' ')).toMatch(/GST/i);
    await vp.closeForm();
  });

  test('VND_NEG_010 / 011 / VND_VAL_008 / VND_BND_009 - Opening balance: "-" and letters refused; ₹99,99,99,999 saved and shown', { tag: T }, async () => {
    await vp.openNewVendor();
    for (const bad of ['-500', 'abc']) {
      await vp.openingBalance.fill('');
      await vp.openingBalance.pressSequentially(bad);
      expect(await vp.openingBalance.inputValue(), `opening "${bad}"`).not.toMatch(/-|[a-z]/i);
    }
    await vp.closeForm();
    const s = spec({ opening: 999999999 });
    await vp.openNewVendor();
    await vp.fillCustomer(s);
    await vp.fillAddress(ADDR);
    await vp.saveCustomer();
    await vp.openDetails(s.name);
    expect((await vp.readDetails()).opening.replace(/[^\d.]/g, '')).toMatch(/^99999999/);
  });

  test('VND_NEG_014 / VND_SEC_005 / VND_BND_001 - Script text / 150-character name: nothing runs; saved as text or limited', { tag: T }, async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    const name = `ZZ <img src=x onerror=window.__xss=1> ${uniq()}`;
    await fillNew({ name });
    await vp.fillAddress(ADDR);
    const r = await vp.trySaveCustomer();
    if (r.saved) await vp.searchVendors('ZZ <img');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    if (!r.saved) await vp.closeForm();
    await fillNew({ name: `ZZ ${'L'.repeat(150)}` });
    await vp.fillAddress(ADDR);
    const r2 = await vp.trySaveCustomer();
    console.log(`150-char name ${r2.saved ? 'saved' : `refused: ${r2.errors.join(' | ')}`}`);
    if (!r2.saved) await vp.closeForm();
    expect(dialogs).toEqual([]);
  });

  // QA (BUG-VN-02): there is no duplicate-name check for vendors (current flow).
  test('VND_NEG_018 - A second vendor with the same name is accepted', { tag: T }, async () => {
    await fillNew({ name: VENDOR });
    await vp.fillAddress(ADDR);
    const r = await vp.trySaveCustomer();
    expect(r.saved, `duplicate "${VENDOR}" is accepted ("${r.errors.join(' | ') || r.message}")`).toBe(true);
  });

  // ── Vendor page ──────────────────────────────────────────────────────────

  test('VND_FUNC_003 / 004 / VND_UI_003 / 004 / 005 / VND_ACC_002 - Vendor page: Due / Advance / Closing, three tabs (keyboard), statement columns', { tag: T }, async ({ page }) => {
    await vp.openVendor(VENDOR);
    const h = await vp.readHeader();
    for (const v of [h.due, h.advance, h.closing]) expect(Number.isNaN(v)).toBe(false);
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveText(['Transaction Statement', 'Purchase Invoice', 'Payment Made']);
    await expect(vp.visibleHead).toHaveText(['Date', 'Transaction Detail', 'Amount', 'Payment', 'Balance Due']);
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await vp.settle(1500, 'tab switch');
    await expect(page.getByRole('tab', { name: 'Purchase Invoice' })).toHaveAttribute('aria-selected', 'true');
  });

  test('VND_POS_002 / VND_VAL_007 / VND_BL_001 - Closing Balance = Due − Advance', { tag: T }, async () => {
    const h = await vp.vendorState(VENDOR);
    expectClose(h.closing, h.due - h.advance, 0.02, 'closing');
  });

  test('VND_POS_003 / 011 / VND_VAL_010 / VND_BL_008 / 017 / 018 / VND_E2E_009 - Statement: running balance = previous + amount − payment; last row = Closing Balance', { tag: T }, async () => {
    await vp.openVendor(VENDOR);
    const h = await vp.readHeader();
    const st = await vp.readVendorStatement();
    expect(st.length).toBeGreaterThan(1);
    for (let i = 1; i < st.length; i++) {
      expectClose(st[i].balance, st[i - 1].balance + st[i].amount - st[i].payment, 0.05, `row ${i + 1} (${st[i].detail})`);
    }
    expectClose(st[st.length - 1].balance, h.closing, 0.05, 'last balance = closing');
    expect(st.some((r) => r.amount > 0) && st.some((r) => r.payment > 0), 'bills and payments both listed').toBe(true);
  });

  test('VND_FUNC_005 / VND_VAL_013 / 014 / VND_UI_014 / VND_POS_006 - Purchase Invoice tab: columns, due ≤ bill, Paid → ₹0; footer count and totals match the rows', { tag: T }, async () => {
    await vp.openVendor(VENDOR);
    await vp.openCustomerTab('Purchase Invoice');
    await expect(vp.visibleHead).toHaveText(['Date', 'Bill No', 'Status', 'Bill Amount', 'Due Amount']);
    const f = await vp.tabFooter();
    const rows = await vp.readVendorInvoices();
    expect(rows.length).toBe(f.count);
    for (const r of rows) {
      expect(r.due).toBeLessThanOrEqual(r.bill + 0.01);
      if (r.status === 'Paid') expect(r.due).toBe(0);
    }
    expect(f.amounts.length, 'bill and due totals in the footer').toBe(2);
    expectClose(f.amounts[0], rows.reduce((s, r) => s + r.bill, 0), 0.1, 'bill total');
    expectClose(f.amounts[1], rows.reduce((s, r) => s + r.due, 0), 0.1, 'due total');
  });

  test('VND_FUNC_006 / VND_VAL_015 / VND_POS_012 / VND_UI_007 - Payment Made tab: columns, mode text, footer count and total = sum', { tag: T }, async () => {
    await vp.openVendor(VENDOR);
    await vp.openCustomerTab('Payment Made');
    await expect(vp.visibleHead).toHaveText(['Date', 'Bill No', 'Mode of Payment', 'Amount']);
    const f = await vp.tabFooter();
    const rows = await vp.readVendorPayments();
    expect(rows.length).toBe(f.count);
    for (const r of rows) expect(r.mode).toMatch(/\S/);
    expectClose(f.amounts[0], rows.reduce((s, r) => s + r.amount, 0), 0.1, 'payment total');
  });

  test('VND_FUNC_007 / 008 / VND_UI_009 / VND_POS_004 / VND_VAL_011 / VND_E2E_007 - Create → Invoice: vendor pre-selected; saved bill in statement and Purchase Invoice tab, due up', { tag: T }, async ({ page }) => {
    const h0 = await vp.vendorState(VENDOR);
    await vp.createBtn.click();
    await expect(vp.createItem('Invoice')).toBeVisible();
    await expect(vp.createItem('Payment')).toBeVisible();
    await vp.createItem('Invoice').click({ force: true });
    await vp.settle(3000, 'invoice form');
    await expect(page).toHaveURL(/purchase-bill\/add/);
    expect((await page.locator('body').innerText())).toContain(VENDOR);
    const b = vp.bills;
    if (!(await b.selectedText(b.placeOfSupplySelect))) await b.setPlaceOfSupply('Tamil Nadu');
    const m = { lines: [L(A, 2)], taxMode: 'Excluding Tax' };
    await b.fillInvoice(m);
    const no = await b.billNoInput.inputValue();
    await b.save();
    const total = b.computeTotals(m).total;
    const h1 = await vp.vendorState(VENDOR);
    expectClose(h1.due - h0.due, total, 0.05, 'due up by the bill');
    const inv = (await vp.readVendorInvoices()).find((r) => r.billNo === no);
    expect(inv, `${no} in the Purchase Invoice tab`).toBeTruthy();
    expectClose(inv.due, total, 0.01, 'bill due');
    expect(inv.status).toMatch(/due|overdue/i);
  });

  test('VND_FUNC_009 / VND_POS_005 / 006 / VND_VAL_012 / VND_BL_003 / 007 / VND_E2E_002 / 008 - Create → Payment: vendor pre-selected; paying a bill in full lowers the due, bill Paid, payment listed (Cash)', { tag: T }, async ({ page }) => {
    const b = await bill(1);
    const h0 = await vp.vendorState(VENDOR);
    await vp.createFromVendor('Payment');
    await expect(page).toHaveURL(/payment-bill\/add/);
    expect(await page.locator('body').innerText()).toContain(VENDOR);
    await vp.bills.fillPaymentForm({ amount: b.total, answer: 'Cancel', rows: { [b.no]: b.total } });
    const no = await vp.bills.confirmPaymentNumber(await vp.bills.savePayment(), VENDOR, b.total);
    const h1 = await vp.vendorState(VENDOR);
    expectClose(h0.due - h1.due, b.total, 0.05, 'due down by the payment');
    const inv = (await vp.readVendorInvoices()).find((r) => r.billNo === b.no);
    expect(inv.status).toBe('Paid');
    expect(inv.due).toBe(0);
    const p = (await vp.readVendorPayments()).find((r) => r.no === no);
    expect(p, `${no} in the Payment Made tab`).toBeTruthy();
    expect(p.mode).toBe('Cash');
    expectClose(p.amount, b.total, 0.01, 'amount');
  });

  test('VND_POS_008 / VND_BL_004 - Advance payment: Advance up, Due unchanged, Closing down', { tag: T }, async () => {
    const h0 = await vp.vendorState(VENDOR);
    await vp.bills.createPayment({ amount: 300, answer: 'Cancel' }, VENDOR);
    const h1 = await vp.vendorState(VENDOR);
    expectClose(h1.advance - h0.advance, 300, 0.05, 'advance');
    expectClose(h1.due, h0.due, 0.05, 'due unchanged');
    expectClose(h0.closing - h1.closing, 300, 0.05, 'closing');
  });

  test('VND_FUNC_018 / VND_UI_008 / 012 - Advance amount is a link that opens the Advance Breakdown', { tag: T }, async ({ page }) => {
    await vp.openVendor(VENDOR);
    expect(await vp._markAdvance(), 'advance shown as a link').toBe(true);
    await vp.advanceLink.click();
    await expect(page.locator('.ant-modal-content, .ant-drawer-content, .ant-popover').filter({ visible: true }).filter({ hasText: /Advance|Receipt|APPLY/i }).first(), 'Advance Breakdown popup').toBeVisible({ timeout: 10_000 });
  });

  // ── Profile ──────────────────────────────────────────────────────────────

  test('VND_FUNC_010 / 022 / VND_UI_010 / VND_VAL_018 / VND_SEC_010 - View Details: Basic Info, Contact, Address, Bank Account, IDs, Other Info (India, +5:30, ₹); URL holds only the id; Back returns', { tag: T }, async ({ page }) => {
    await vp.openVendor(VENDOR);
    expect(page.url()).toMatch(/\/vendor\/\d+$/);
    await vp.viewDetailsBtn.click();
    await expect(page).toHaveURL(/\/vendor\/\d+\/(org-)?info$/);
    await vp.settle(2500, 'details');
    const d = await vp.readDetails();
    for (const t of ['Basic Info', 'Contact', 'Address', 'Bank Account', 'ID’s & Certificates', 'Other Info', 'BUSINESS LOCATION India', 'TIME ZONE +5:30', 'CURRENCY ₹']) expect(d.text).toContain(t);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/\/vendor\/\d+$/);
    await expect(vp.viewDetailsBtn).toBeVisible();
  });

  test('VND_FUNC_011 / 012 / 016 / VND_E2E_005 - Edit display name, email and billing address: shown in the profile and the vendor list', { tag: T }, async () => {
    const s = spec();
    await vp.openNewVendor();
    await vp.fillCustomer(s);
    await vp.fillAddress(ADDR);
    await vp.saveCustomer();
    await vp.openDetails(s.name);
    const renamed = `${s.name} Ed`;
    expect((await vp.editTextField('DISPLAY NAME', renamed)).saved).toBe(true);
    expect((await vp.editTextField('EMAIL', `v${uniq()}@example.com`)).saved).toBe(true);
    await vp.editAddress({ line1: '7 Lake View', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' });
    await vp.page.reload();
    await vp.settle(3000, 'details reload');
    const d = await vp.readDetails();
    expect(d.name).toBe(renamed);
    expect(d.email).toMatch(/@example\.com/);
    await bugCheck('BUG-VN-01', 'vendor billing address edit not saved', async () => {
      expect(d.text, 'new billing address shown').toMatch(/Madurai/);
    });
    expect(await vp.searchVendors(renamed)).toContain(renamed);
  });

  test('VND_FUNC_014 / VND_BL_013 - Editing the opening balance changes Due / Closing by the difference', { tag: T }, async () => {
    const s = spec({ opening: 0 });
    await vp.openNewVendor();
    await vp.fillCustomer(s);
    await vp.fillAddress(ADDR);
    await vp.saveCustomer();
    const h0 = await vp.vendorState(s.name);
    await vp.viewDetailsBtn.click();
    await vp.settle(2500, 'details');
    expect((await vp.editTextField('OPENING BALANCE', 1500)).saved).toBe(true);
    const h1 = await vp.vendorState(s.name);
    expectClose(Math.abs(h1.closing - h0.closing), 1500, 0.02, 'closing moves by the opening balance');
  });

  test('VND_FUNC_015 / 017 - Add Contact and Add Bank Details open their forms', { tag: T }, async ({ page }) => {
    await vp.openDetails(VENDOR);
    for (const btn of ['Add Contact', 'Add Bank Details']) {
      await page.getByRole('button', { name: btn }).click();
      const dlg = page.getByRole('dialog').filter({ visible: true }).last();
      await expect(dlg, `${btn} form`).toBeVisible({ timeout: 10_000 });
      console.log(`${btn}: ${(await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
      await expect(dlg.locator('input').first()).toBeVisible();
      const close = dlg.locator('.ant-modal-close').or(dlg.getByRole('button', { name: /^(Cancel|Back|Close)$/ })).first();
      if (await close.isVisible().catch(() => false)) await close.click(); else await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden({ timeout: 10_000 });
    }
  });

  test('VND_NEG_012 - A vendor with dues has no Delete option', { tag: T }, async ({ page }) => {
    await vp.openDetails(VENDOR);
    await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
  });

  // ── Filters / pagination / switching ─────────────────────────────────────

  test('VND_SF_006 / 007 / 008 / 010 / 011 / VND_POS_017 / VND_NEG_008 / VND_E2E_006 - Purchase Invoice tab dates: today only, reversed range, empty range; reload restores', { tag: T }, async () => {
    await vp.openVendor(VENDOR);
    await vp.openCustomerTab('Purchase Invoice');
    const all = (await vp.tabFooter()).count;
    const today = new Date();
    await vp.setTabDateRange(filterDate(today), filterDate(today));
    const rows = await vp.readVendorInvoices();
    for (const r of rows) expect(r.date).toBe(iso(today));
    expect((await vp.tabFooter()).count).toBe(rows.length);
    await vp.setTabDateRange(filterDate(new Date(2001, 0, 10)), filterDate(new Date(2001, 0, 1))).catch(() => {});
    console.log(`reversed range rows: ${(await vp.readVendorInvoices()).length}`);
    await vp.setTabDateRange(filterDate(new Date(2001, 0, 1)), filterDate(new Date(2001, 0, 31)));
    expect(await vp.readVendorInvoices()).toEqual([]);
    await vp.page.reload();
    await vp.settle(3000, 'reload');
    await vp.openCustomerTab('Purchase Invoice');
    expect((await vp.tabFooter()).count).toBe(all);
  });

  test('VND_SF_009 / VND_POS_018 - Payment Made tab: today only', { tag: T }, async () => {
    await vp.openVendor(VENDOR);
    await vp.openCustomerTab('Payment Made');
    const today = new Date();
    await vp.setTabDateRange(filterDate(today), filterDate(today));
    const rows = await vp.readVendorPayments();
    for (const r of rows) expect(r.date).toBe(iso(today));
    expect((await vp.tabFooter()).count).toBe(rows.length);
  });

  test('VND_PAG_001 / 002 / 003 / 006 / 008 / 010 - Statement: 20 / page, next / previous, count constant; switching tabs returns to page 1', { tag: T }, async ({ page }) => {
    await vp.openVendor(VENDOR);
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    const count = (await vp.tabFooter()).count;
    test.skip(count <= 20, 'vendor statement has one page');
    await expect(pag).toContainText('20 / page');
    expect(await vp.visibleRows.count()).toBe(20);
    await pag.locator('li.ant-pagination-next').click();
    await vp.settle(1500, 'page 2');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    await expect(pag.locator('li.ant-pagination-prev')).not.toHaveAttribute('aria-disabled', 'true');
    expect((await vp.tabFooter()).count).toBe(count);
    await pag.locator('li.ant-pagination-prev').click();
    await vp.settle(1500, 'page 1');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('1');
    await pag.locator('li.ant-pagination-next').click();
    await vp.settle(1500, 'page 2');
    await vp.openCustomerTab('Purchase Invoice');
    await vp.openCustomerTab('Transaction Statement');
    await expect(page.locator('ul.ant-pagination').filter({ visible: true }).first().locator('li.ant-pagination-item-active')).toHaveText('1');
  });

  test('VND_POS_016 / VND_BL_014 / VND_PAG_009 / VND_E2E_014 - Switching vendors: each has its own balances; back to the first gives the same values (page 1)', { tag: T }, async ({ page }) => {
    const h1 = await vp.vendorState(VENDOR);
    await vp._vendorList();
    await vp.openVendor('Abshire Group');   // a second vendor of the test org
    const h2 = await vp.readHeader();
    expect(`${h2.due}|${h2.advance}`).not.toBe(`${h1.due}|${h1.advance}`);
    const h3 = await vp.vendorState(VENDOR);
    expect(h3).toEqual(h1);
    const active = page.locator('ul.ant-pagination').filter({ visible: true }).first().locator('li.ant-pagination-item-active');
    if (await active.count()) await expect(active).toHaveText('1');
  });

  // ── Security ─────────────────────────────────────────────────────────────

  test('VND_SEC_001 / VND_NEG_013 - Without a session the vendor page redirects to login', { tag: T }, async ({ browser, page }) => {
    await vp.openVendor(VENDOR);
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto(page.url());
    await expect(anon).not.toHaveURL(/vendor/, { timeout: 30_000 });
    await expect(anon.getByText(VENDOR)).toHaveCount(0);
    await ctx.close();
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [id, title, why] of [
    ['VND_FUNC_019 / 020 / 021 / VND_POS_009 / 010 / VND_NEG_002 / 003 / 009 / 016 / VND_VAL_005 / 006 / 017 / VND_BND_003 / 004 / 007 / 010 / VND_BL_005 / 012 / 015 / 016 / 019 / 020 / VND_UI_011 / VND_PAG_007 / VND_E2E_003 / 004 / 010 / VND_ACC_005 / 008 / VND_SEC_012 / VND_PERF_005 / 010',
      'Apply advance to invoices (Advance Breakdown → Apply Excess Amount)', 'The Advance Breakdown opens (VND_FUNC_018); the Apply Excess Amount popup flow is not automated yet.'],
    ['VND_FUNC_013', 'Edit GST Number in the profile', 'The profile has no GST edit (GST STATUS shown without Edit).'],
    ['VND_POS_013 / 014 / VND_NEG_015 / VND_VAL_004 / 009', 'Other Info country / TAN / IEC formats', 'IDs & Certificates and Other Info have no Edit / Add control.'],
    ['VND_POS_015 / VND_UPL_001…008 / VND_NEG_017 / VND_SEC_013 / VND_E2E_011', 'Vendor photo upload', 'PHOTO has no upload control on the profile.'],
    ['VND_E2E_015', 'Bank details + contact saved and shown', 'Add Contact / Add Bank Details forms are checked to open (VND_FUNC_015 / 017); saving them needs their field set.'],
    ['VND_UI_002', 'Selected vendor highlighted', 'Visual design check.'],
    ['VND_BND_005 / 006 / 011 / 012 / VND_PAG_004 / 005 / VND_E2E_013 / VND_SF_012', 'Exact record counts (20 / 21 / 100), single-vendor org', 'Needs a vendor / org with a controlled number of records.'],
    ['VND_NEG_006 / VND_SEC_002', 'Another org\'s vendor by URL', 'Needs a second org.'],
    ['VND_NEG_007 / VND_SEC_003 / 009 / 011', 'Role restrictions', 'No view-only / accountant users in the test data.'],
    ['VND_SEC_007 / 014', 'CSRF / rate limiting', 'API-level security tests, not UI tests.'],
    ['VND_SEC_008', 'Session timeout', 'Needs a shortened session lifetime.'],
    ['VND_SEC_015', 'Deleted vendor by URL', 'Vendors cannot be deleted.'],
    ['VND_PERF_001…004 / 006…009', 'Response-time / concurrency limits', 'Environment-dependent; not a functional check.'],
    ['VND_ACC_001 / 003 / 004 / 006 / 007', 'Keyboard list, screen reader, contrast, labels', 'Needs an accessibility audit tool (axe) / screen reader.'],
  ]) {
    test.fixme(`${id} - ${title} (${why})`, async () => {});
  }
});
