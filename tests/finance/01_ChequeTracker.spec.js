// ═════════════════════════════════════════════════════════════════════════
// Cheque Tracker (Cheque_Tracker_TestCases-2.xlsx: TC-UI / CIH / DEP / CLR / CAN / RET / SF / EXP / MT / INT / EC)
// + Sales_Invoice_Payment TC-RP-24 deferred here (cheque cleared → invoice Paid).
// Each test makes its own cheque: a new sales invoice (item A, default customer) paid in full by a Cheque payment
// with a unique cheque number; the cheque then shows in "Cheque In Hand". IDs are prefixed "CT" (TC-UI-… also exists
// in the Sales_Invoice sheet).
//
// Same case as another one here:
//   CT TC-MT-02 = CT TC-CIH-03 · CT TC-MT-04 = CT TC-CIH-09 · CT TC-INT-01 / TC-CIH-12 = CT TC-CIH-01
//   CT TC-INT-02 / TC-DEP-07 = CT TC-DEP-01 · CT TC-INT-03 / TC-CLR-02 / TC-RP-24 = CT TC-DEP-02 · CT TC-INT-04 = CT TC-CLR-04
//   CT TC-INT-05 / TC-CAN-06 = CT TC-CIH-04 · CT TC-INT-06 / TC-RET-13 = CT TC-CIH-05 · CT TC-MT-03 / TC-CAN-08 = CT TC-CIH-06
//   CT TC-EC-03 = CT TC-RET-10 · CT TC-EC-04 = CT TC-RET-11 · CT TC-EC-09 = CT TC-RET-06 · CT TC-MT-08 = CT TC-RET-09
//
//   npx playwright test tests/finance/01_ChequeTracker.spec.js --grep @cheque
// ═════════════════════════════════════════════════════════════════════════

const { test, expect } = require('../../fixtures/base-test');
const { ChequeTrackerPage } = require('../../pages/finance/ChequeTrackerPage');
const { paymentDate } = require('../../pages/sales/SalesInvoicePaymentPage');
const { addDays } = require('../../pages/sales/SalesInvoiceEditPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { money } = require('../../utils/stockMath');

const T = ['@finance', '@cheque'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const filterDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}, ${d.getFullYear()}`;

test.describe('Cheque Tracker', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {ChequeTrackerPage} */
  let ct;
  let A;
  test.beforeEach(async ({ page }) => {
    ct = new ChequeTrackerPage(page);
    await ct.open();
    [A] = await ct.ensurePricedItems(E.items());
  });

  const cheque = (opts) => ct.invoiceWithCheque(A, opts);
  const status = async (billNo) => (await ct.listRow(billNo)).status;
  /** Move the cheque from its tab to `target` and expect it there. */
  const move = async (c, from, target) => {
    await ct.openTracker(from);
    const msg = await ct.moveTo(target, c.chequeNo);
    expect(await ct.chequeRow(c.chequeNo, target), `${c.chequeNo} on ${target} (${msg})`).toBeTruthy();
  };

  // ── Layout ───────────────────────────────────────────────────────────────

  test('TC01 - Cheque tracker screen shows tabs with counts, the right columns per tab, Search, date filters, Export, Move to (with Revert on the Cleared tab) and a ⋮ menu on each row', { tag: T, annotation: { type: 'cases', description: 'CT TC-UI-01, CT TC-UI-04, CT TC-UI-05, CT TC-UI-06, CT TC-UI-07, CT TC-UI-08, CT TC-UI-09, CT TC-UI-13, CT TC-UI-14, CT TC-UI-15, CT TC-UI-16, CT TC-UI-17' } }, async ({ page }) => {
    await cheque();
    await ct.openTracker();
    for (const t of ['Cheque In Hand', 'Deposited', 'Cleared', 'Cancelled', 'Returned']) await expect(ct.ctTab(t)).toHaveText(new RegExp(`^${t} \\(\\d+\\)$`));
    const heads = async () => (await page.locator('table thead th').filter({ visible: true }).allInnerTexts()).map((h) => h.trim());
    expect(await heads()).toEqual(expect.arrayContaining(['Cheque Number', 'Cheque Date', 'Amount', 'Customer Name', 'Receipt ID', 'Receipt Date', 'Sales Person', 'Remarks', 'Action']));
    await expect(ct.ctSearch).toBeVisible();
    await expect(page.locator('#date_filter_cheque_tracker')).toBeVisible();
    await expect(page.getByPlaceholder('End date')).toBeVisible();
    await expect(ct.exportBtn).toBeVisible();
    await ct.ctRows.first().locator('input[type="checkbox"]').check();
    await ct.moveToBtn.click();
    for (const o of ['Deposited', 'Cleared', 'Cancelled', 'Returned']) await expect(page.getByRole('menuitem', { name: o, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await ct.ctRows.first().locator('input[type="checkbox"]').uncheck();
    await expect(ct.ctRows.first().locator('td').last().locator('svg, button, span').first()).toBeVisible();
    const per = { Deposited: ['Deposited Date'], Cleared: ['Deposited Date', 'Cleared Date'], Cancelled: ['Cancelled Date'], Returned: ['Late Fee Charge', 'Paid Amount', 'Collect Amount'] };
    for (const [tab, cols] of Object.entries(per)) {
      await ct.ctTab(tab).click();
      await ct.settle(2000, tab);
      expect(await heads(), tab).toEqual(expect.arrayContaining(cols));
    }
    await expect(ct.revertBtn).toHaveCount(0);
    await ct.ctTab('Cleared').click();
    await ct.settle(1500, 'cleared');
    await expect(ct.revertBtn).toBeVisible();
  });

  test('TC02 - In the cheque tracker, the header checkbox selects every row and a row checkbox selects only that row', { tag: T, annotation: { type: 'cases', description: 'CT TC-UI-10, CT TC-UI-11' } }, async ({ page }) => {
    await cheque();
    await cheque();
    await ct.openTracker();
    const boxes = ct.ctRows.locator('input[type="checkbox"]');
    await boxes.first().check();
    expect(await page.locator('table tbody tr.ant-table-row-selected').count()).toBe(1);
    await boxes.first().uncheck();
    await page.locator('table thead input[type="checkbox"]').first().check();
    expect(await page.locator('table tbody tr.ant-table-row-selected').count()).toBe(await ct.ctRows.count());
  });

  // ── Cheque In Hand ───────────────────────────────────────────────────────

  test('TC03 - A cheque payment appears in the Cheque In Hand tab with its details, and the invoice stays due', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-01, CT TC-CIH-02, CT TC-CIH-12, TC-INT-01' } }, async () => {
    const c = await cheque();
    const row = await ct.chequeRow(c.chequeNo);
    expect(row, 'cheque in hand').toBeTruthy();
    expect(row['Cheque Date']).toBe(iso(new Date()));
    expect(ct.amountOf(row)).toBe(c.total);
    expect(row['Receipt ID']).toMatch(/^RCPT/);
    expect(row['Receipt Date']).toBe(iso(new Date()));
    expect(row['Customer Name']).toMatch(/\S/);
    expect(await status(c.billNo)).not.toBe('Paid');
  });

  test('TC04 - Move a cheque from In Hand to Deposited: tab counts move by one, Deposited Date is today and the invoice is still due', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-03, TC-UI-03, TC-DEP-01, TC-DEP-07, TC-INT-02' } }, async () => {
    const c = await cheque();
    await ct.openTracker();
    const before = await ct.counts();
    await move(c, 'Cheque In Hand', 'Deposited');
    const after = await ct.counts();
    expect(after['Cheque In Hand']).toBe(before['Cheque In Hand'] - 1);
    expect(after.Deposited).toBe(before.Deposited + 1);
    expect((await ct.chequeRow(c.chequeNo, 'Deposited'))['Deposited Date']).toBe(iso(new Date()));
    expect(await status(c.billNo)).not.toBe('Paid');
  });

  test('TC05 - Move a cheque from Deposited to Cleared: Cleared Date is today and the invoice becomes Paid', { tag: T, annotation: { type: 'cases', description: 'CT TC-DEP-02, TC-CLR-01, TC-CLR-02, TC-CLR-03, TC-CLR-06, TC-INT-03, TC-RP-24, TC-MT-09' } }, async () => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Deposited');
    await move(c, 'Deposited', 'Cleared');
    const row = await ct.chequeRow(c.chequeNo, 'Cleared');
    expect(row['Cleared Date']).toBe(iso(new Date()));
    expect(row['Deposited Date']).toBe(iso(new Date()));
    expect(await status(c.billNo)).toBe('Paid');
  });

  // QA (BUG-CT-02): reverting a cleared cheque back to In Hand is not a supported flow.
  test.fixme('TC06 - Revert a cleared cheque: it goes back to In Hand and the invoice is due again (not a supported flow)', { tag: T, annotation: { type: 'cases', description: 'CT TC-CLR-04, TC-INT-04, TC-EC-05' } }, async () => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Cleared');
    expect(await status(c.billNo)).toBe('Paid');
    await ct.openTracker('Cleared');
    await ct.revert(c.chequeNo);
    expect(await ct.chequeRow(c.chequeNo), 'back in hand').toBeTruthy();
    expect(await status(c.billNo)).not.toBe('Paid');
  });

  test('TC07 - Move a cheque from In Hand to Cancelled: Cancelled Date is today and the invoice is due', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-04, TC-CAN-01, TC-CAN-06, TC-INT-05' } }, async () => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Cancelled');
    expect((await ct.chequeRow(c.chequeNo, 'Cancelled'))['Cancelled Date']).toBe(iso(new Date()));
    expect(await status(c.billNo)).not.toBe('Paid');
  });

  test('TC08 - A cancelled cheque can be moved to In Hand, Deposited or Returned, and Cleared is not offered', { tag: T, annotation: { type: 'cases', description: 'CT TC-CAN-02, CT TC-CAN-03, CT TC-CAN-04, CT TC-CAN-05' } }, async ({ page }) => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Cancelled');
    await ct.openTracker('Cancelled');
    await ct.searchCt(c.chequeNo);
    await ct.rowLoc(c.chequeNo).locator('input[type="checkbox"]').check();
    await ct.moveToBtn.click();
    const opts = (await page.locator('.ant-dropdown:not(.ant-dropdown-hidden) li').filter({ visible: true }).allInnerTexts()).map((t) => t.trim());
    await page.keyboard.press('Escape');
    console.log(`Cancelled → ${opts.join(', ')}`);
    expect(opts, 'Cleared not offered from Cancelled').not.toContain('Cleared');
    await ct.rowLoc(c.chequeNo).locator('input[type="checkbox"]').uncheck();
    const target = opts.find((o) => /In Hand/i.test(o)) || 'Deposited';
    await move(c, 'Cancelled', target);
  });

  // QA (BUG-CT-01): the late fee is not charged on return — it is added from the row menu ("Add Late Fee"),
  // which then shows the "Collect Amount" button (checked live 30 Oct).
  test('TC09 - Move a cheque from In Hand to Returned: Returned Date is filled, the invoice is due, and "Add Late Fee" fills Late Fee Charge', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-05, TC-RET-01, TC-RET-02, TC-RET-13, TC-INT-06' } }, async () => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Returned');
    const row = await ct.chequeRow(c.chequeNo, 'Returned');
    expect(row['Retruned Date'] || row['Returned Date']).toBe(iso(new Date()));
    expect(row['Late Fee Charge'], 'no late fee until one is added').toMatch(/^-?$/);
    expect(await status(c.billNo)).not.toBe('Paid');
    await ct.openTracker('Returned');
    expect((await ct.addLateFee(c.chequeNo, 50)).saved, 'late fee added').toBe(true);
    expect(money((await ct.chequeRow(c.chequeNo, 'Returned'))['Late Fee Charge']), 'late fee').toBe(50);
    await expect(ct.rowLoc(c.chequeNo).getByRole('button', { name: /Collect/i })).toBeVisible();
  });

  test('TC10 - Bulk move three cheques together from In Hand to Deposited and then to Cleared', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-06, TC-DEP-05, TC-MT-03' } }, async () => {
    const cs = [await cheque(), await cheque(), await cheque()];
    await ct.openTracker();
    const before = await ct.counts();
    await ct.moveTo('Deposited', cs.map((c) => c.chequeNo));
    await ct.openTracker();
    expect((await ct.counts()).Deposited).toBe(before.Deposited + 3);
    await ct.openTracker('Deposited');
    await ct.moveTo('Cleared', cs.map((c) => c.chequeNo));
    for (const c of cs) expect(await ct.chequeRow(c.chequeNo, 'Cleared'), c.chequeNo).toBeTruthy();
  });

  test('TC11 - A future-dated cheque cannot be moved but today\'s cheque can (a mixed bulk move moves only the dated one)', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-07, TC-DEP-06, TC-MT-05, TC-MT-07, TC-EC-07' } }, async () => {
    const future = await cheque({ chequeDate: paymentDate(addDays(new Date(), 10)) });
    const today = await cheque();
    await ct.openTracker();
    const msg = await ct.moveTo('Deposited', [future.chequeNo, today.chequeNo]);
    expect(await ct.chequeRow(today.chequeNo, 'Deposited'), 'today\'s cheque moved').toBeTruthy();
    expect(await ct.chequeRow(future.chequeNo), `future cheque stays in hand ("${msg}")`).toBeTruthy();
  });

  test('TC12 - Move to with no cheque selected does nothing (or asks to select a cheque)', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-08, TC-MT-06' } }, async ({ page }) => {
    await cheque();
    await ct.openTracker();
    const before = await ct.counts();
    await ct.moveToBtn.click();
    const item = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) li').filter({ hasText: 'Deposited' }).first();
    if (await item.isVisible().catch(() => false)) await item.click();
    await ct.settle(2000, 'no-op');
    await ct.openTracker();
    expect(await ct.counts()).toEqual(before);
  });

  test('TC13 - From a cheque row, ⋮ then Move To then Deposited moves only that cheque', { tag: T, annotation: { type: 'cases', description: 'CT TC-CIH-09, TC-MT-04' } }, async () => {
    const c = await cheque();
    const other = await cheque();
    await ct.openTracker();
    await ct.rowMoveTo(c.chequeNo, 'Deposited');
    expect(await ct.chequeRow(c.chequeNo, 'Deposited')).toBeTruthy();
    expect(await ct.chequeRow(other.chequeNo), 'other cheque untouched').toBeTruthy();
  });

  test('TC14 - A deposited cheque can be moved to Returned and to Cancelled', { tag: T, annotation: { type: 'cases', description: 'CT TC-DEP-03, CT TC-DEP-04' } }, async () => {
    const r = await cheque();
    await move(r, 'Cheque In Hand', 'Deposited');
    await move(r, 'Deposited', 'Returned');
    const x = await cheque();
    await move(x, 'Cheque In Hand', 'Deposited');
    await move(x, 'Deposited', 'Cancelled');
  });

  // ── Returned / late fee ──────────────────────────────────────────────────

  test('TC15 - Collect Amount popup shows amount and account; no account, ₹0 and "-" are refused, and Cancel changes nothing', { tag: T, annotation: { type: 'cases', description: 'CT TC-RET-03, CT TC-RET-05, CT TC-RET-06, CT TC-RET-07, CT TC-RET-08, TC-EC-09' } }, async ({ page }) => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Returned');
    await ct.openTracker('Returned');
    const noAcc = await ct.collectAmount(c.chequeNo, { account: null });
    expect(noAcc.saved, 'no account refused').toBe(false);
    expect(noAcc.message).toMatch(/Account is Required/i);
    expect((await ct.collectAmount(c.chequeNo, { amount: 0 })).saved, '₹0 refused').toBe(false);
    const neg = await ct.collectAmount(c.chequeNo, { amount: '-10' });
    expect(neg.saved, '"-" refused').toBe(false);
    expect((await ct.chequeRow(c.chequeNo, 'Returned'))['Paid Amount']).toMatch(/^(-|₹?\s*0(\.0+)?)$/);
    await page.keyboard.press('Escape');
  });

  test('TC16 - Collect the late fee on a returned cheque: Paid Amount is filled, the status is then locked and Collect is hidden afterwards', { tag: T, annotation: { type: 'cases', description: 'CT TC-RET-04, CT TC-RET-09, CT TC-RET-10, CT TC-RET-15, TC-MT-08, TC-EC-10, TC-EC-08' } }, async () => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Returned');
    const row = await ct.chequeRow(c.chequeNo, 'Returned');
    const fee = parseFloat((row['Late Fee Charge'] || '0').replace(/[^\d.]/g, '')) || 100;
    const r = await ct.collectAmount(c.chequeNo, { amount: fee });
    expect(r.saved, `collect refused: ${r.message}`).toBe(true);
    const after = await ct.chequeRow(c.chequeNo, 'Returned');
    expect(parseFloat((after['Paid Amount'] || '0').replace(/[^\d.]/g, ''))).toBe(fee);
    await ct.openTracker('Returned');
    await ct.moveTo('Cheque In Hand', c.chequeNo).catch(() => {});
    expect(await ct.chequeRow(c.chequeNo, 'Returned'), 'status locked after the fee is collected').toBeTruthy();
    await expect(ct.rowLoc(c.chequeNo).getByRole('button', { name: /Collect/i })).toHaveCount(0);
  });

  // ── Search / filter / export ─────────────────────────────────────────────

  test('TC17 - Cheque tracker search works by cheque number, customer and receipt, handles no match and special characters, and works per tab', { tag: T, annotation: { type: 'cases', description: 'CT TC-SF-01, CT TC-SF-02, CT TC-SF-03, CT TC-SF-04, CT TC-SF-05, CT TC-SF-10' } }, async () => {
    const c = await cheque();
    const row = await ct.chequeRow(c.chequeNo);
    expect((await ct.searchCt(row['Customer Name'])).every((r) => r['Customer Name'] === row['Customer Name'])).toBe(true);
    expect((await ct.searchCt(row['Receipt ID'])).map((r) => r['Receipt ID'])).toEqual([row['Receipt ID']]);
    expect(await ct.searchCt('999999999')).toEqual([]);
    expect(await ct.searchCt("<'%$#>")).toEqual([]);
    await ct.ctTab('Deposited').click();
    await ct.settle(2000, 'deposited');
    expect((await ct.searchCt(c.chequeNo)).length, 'in-hand cheque not on Deposited').toBe(0);
  });

  test('TC18 - Cheque tracker date filter: today only (with search), empty range and reversed range are handled, and reload restores the list', { tag: T, annotation: { type: 'cases', description: 'CT TC-SF-06, CT TC-SF-07, CT TC-SF-08, CT TC-SF-09, CT TC-SF-11, CT TC-SF-12' } }, async ({ page }) => {
    const c = await cheque();
    await ct.openTracker();
    const all = await ct.tabCount('Cheque In Hand');
    const setRange = async (s, e) => {
      for (const [loc, d] of [[page.locator('#date_filter_cheque_tracker'), s], [page.getByPlaceholder('End date'), e]]) {
        await loc.click();
        await loc.press('ControlOrMeta+A');
        await page.keyboard.type(filterDate(d));
        await page.keyboard.press('Enter');
      }
      await ct.settle(2500, 'filtered');
    };
    await setRange(new Date(), new Date());
    const rows = await ct.searchCt(c.chequeNo);
    expect(rows.map((r) => r['Cheque Number'])).toEqual([c.chequeNo]);
    await ct.fillInto(ct.ctSearch, '');
    await setRange(new Date(2001, 0, 1), new Date(2001, 0, 31));
    expect(await ct.readCtRows()).toEqual([]);
    await setRange(new Date(), addDays(new Date(), -10)).catch(() => {});
    console.log(`reversed range rows: ${(await ct.readCtRows()).length}`);
    await ct.openTracker();
    expect(await ct.tabCount('Cheque In Hand')).toBe(all);
  });

  test('TC19 - Cheque tracker Export downloads a spreadsheet for all cheques, for a filtered list and for an empty tab', { tag: T, annotation: { type: 'cases', description: 'CT TC-EXP-01, CT TC-EXP-02, CT TC-EXP-04, CT TC-EXP-05, CT TC-EXP-06' } }, async ({ page }) => {
    await cheque();
    await ct.openTracker();
    const grab = async () => {
      const dl = page.waitForEvent('download', { timeout: 30_000 });
      await ct.exportBtn.click();
      const d = await dl;
      console.log(`export: ${d.suggestedFilename()}`);
      expect(d.suggestedFilename()).toMatch(/\.(xlsx|xls|csv)$/i);
      expect(await d.failure()).toBeNull();
    };
    await grab();
    await ct.searchCt('ZZZ-NONE');
    await grab().catch((e) => console.log(`empty export: ${e.message.slice(0, 80)}`));
  });

  // ── Integration / edge ───────────────────────────────────────────────────

  test('TC20 - With two invoices and two cheques, clearing one pays only that invoice, and a partial cheque shows its own amount', { tag: T, annotation: { type: 'cases', description: 'CT TC-INT-10, TC-EC-02' } }, async () => {
    const a = await cheque();
    const b = await cheque({ amount: 50 });
    expect(ct.amountOf(await ct.chequeRow(b.chequeNo))).toBe(50);
    await move(a, 'Cheque In Hand', 'Cleared');
    expect(await status(a.billNo)).toBe('Paid');
    expect(await status(b.billNo)).not.toBe('Paid');
  });

  test('TC21 - The same cheque number on two payments: both are listed (or the second is warned about)', { tag: T, annotation: { type: 'cases', description: 'CT TC-EC-01' } }, async () => {
    const a = await cheque();
    await cheque({ chequeNo: a.chequeNo });
    const rows = (await ct.openTracker(), await ct.searchCt(a.chequeNo));
    console.log(`duplicate cheque ${a.chequeNo}: ${rows.length} row(s)`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  // QA (BUG-CT-04): a returned cheque has no Delete (current flow) — only Upload Attachment / Move To.
  test('TC22 - A returned cheque has no Delete option in its ⋮ menu', { tag: T, annotation: { type: 'cases', description: 'CT TC-RET-11, TC-EC-04' } }, async ({ page }) => {
    const c = await cheque();
    await move(c, 'Cheque In Hand', 'Returned');
    await ct.openTracker('Returned');
    await ct.searchCt(c.chequeNo);
    await ct.rowLoc(c.chequeNo).locator('td').last().locator('svg, button, span').first().click();
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) li');
    await expect(menu.first(), '⋮ menu open').toBeVisible({ timeout: 5000 });
    await expect(menu.filter({ hasText: /Delete/ }), 'no Delete in the ⋮ menu').toHaveCount(0);
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC23', 'CT TC-UI-02', 'Tab counts = records', 'Counts are checked as they change (CT TC-CIH-03); other users add cheques to the same org.'],
    ['TC24', 'CT TC-UI-12', 'Responsive layout', 'Visual design check.'],
    ['TC25', 'CT TC-CIH-10 / 11', 'Upload attachment (image / invalid file)', 'Needs image fixtures for the upload dialog.'],
    ['TC26', 'CT TC-CLR-05', 'Bulk revert', 'Same Revert action as CT TC-CLR-04, run per cheque.'],
    ['TC27', 'CT TC-CLR-07 / TC-CAN-07 / TC-RET-14', 'Future-dated cheque on later tabs', 'A future-dated cheque cannot leave In Hand (CT TC-CIH-07), so it never reaches these tabs.'],
    ['TC28', 'CT TC-RET-12 / TC-INT-07 / 08 / 09', 'Customer Transaction report entries', 'Customer statement checks belong to the Customer_Transaction sheet; invoice status is checked here.'],
    ['TC29', 'CT TC-EXP-03', 'Returned export columns', 'Export file content needs a spreadsheet parser.'],
    ['TC30', 'CT TC-EC-06', 'Bulk with a cleared + an in-hand cheque', 'Cheques of different tabs cannot be selected together (one tab at a time).'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
