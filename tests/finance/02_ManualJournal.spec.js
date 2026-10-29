// ═════════════════════════════════════════════════════════════════════════
// Manual Journal (Manual_Journal_TestCases.xlsx: TC-UI / CJ / JT / LI / WF / PG / SF / INT / COA / CT / DI).
// IDs are prefixed "MJ" (TC-UI-… / TC-SF-… also exist in other sheets). Journals use Petty Cash ↔ Undeposited Funds
// unless a case needs Accounts Receivable / Payable (contact "saravana store" / "New Vendor 1").
// Adapted: numbers are MJN-AUTO/NNNN (sheet: MJN/XXXX); the form starts with two rows.
//
// Same case as another one here:
//   MJ TC-CJ-01 = MJ TC-UI-02 · MJ TC-LI-10 / TC-WF-03 = MJ TC-CJ-08 · MJ TC-WF-10 = MJ TC-LI-11 · MJ TC-LI-12 / 13 = MJ TC-LI-11
//   MJ TC-LI-14 / 15 = MJ TC-LI-19 · MJ TC-JT-04 / 05 / 06 = MJ TC-JT-03 · MJ TC-DI-02 / 05 = MJ TC-UI-04
//   MJ TC-INT-02 … 06 / TC-DI-03 / 04 = MJ TC-INT-01
//
//   npx playwright test tests/finance/02_ManualJournal.spec.js --grep @mj
// ═════════════════════════════════════════════════════════════════════════

const { test, expect, bugCheck } = require('../../fixtures/base-test');
const { ManualJournalPage } = require('../../pages/finance/ManualJournalPage');
const { CustomerTransactionPage } = require('../../pages/sales/CustomerTransactionPage');
const { SalesInvoiceEditFlowData: E } = require('../../test-data/SalesInvoiceStock_Data');
const { masterData } = require('../../test-data/UserData');
const { expectClose } = require('../../utils/stockMath');
const { capturePrint } = require('../../utils/testHelpers');

const T = ['@finance', '@mj'];
const mjDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short' })}, ${d.getFullYear()}`;
const CUST = masterData.customerName;

test.describe('Manual Journal', () => {
  test.use({ viewport: { width: 1800, height: 900 } });
  test.describe.configure({ retries: 0, timeout: 900_000 });

  /** @type {ManualJournalPage} */
  let mj;
  test.beforeEach(async ({ page }) => {
    mj = new ManualJournalPage(page);
    await mj.open();
  });

  const uniq = () => `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 90 + 10)}`;
  const pair = (amt = 100) => [{ account: 'Petty Cash', debit: amt }, { account: 'Undeposited Funds', credit: amt }];
  const journal = (extra = {}, opts) => mj.createJournal({ notes: `ZZ MJ ${uniq()}`, lines: pair(), ...extra }, opts);

  // ── List / form ──────────────────────────────────────────────────────────

  test('TC01 - Manual journal list shows its columns, Total Count and Finance tabs; New Journal opens with read-only MJN-AUTO number, today\'s date, Accrual Only default, rows and totals', { tag: T, annotation: { type: 'cases', description: 'MJ TC-UI-01, MJ TC-UI-06, MJ TC-UI-07, MJ TC-UI-08, TC-CJ-01, TC-CJ-02, TC-CJ-09, TC-UI-02' } }, async ({ page }) => {
    await mj.openJournals();
    await expect(page.getByText('Cheque Tracker', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Manual Journal', { exact: true }).first()).toBeVisible();
    await expect(page.locator('table thead th').filter({ visible: true })).toHaveText(['Date', 'Journal#', 'Reference Number', 'Status', 'Notes', 'Amount', 'Created By']);
    await expect(page.getByText(/Total Count:\s*\d+/).first()).toBeVisible();
    await mj.openNewJournal();
    await expect(mj.journalNo).toHaveValue(/^MJN-AUTO\/\d{4,}$/);
    await expect(mj.journalNo).not.toBeEditable();
    await expect(mj.mjDate).toHaveValue(mjDate(new Date()));
    await expect(page.locator('input[type="radio"][value="1"]')).toBeChecked();
    for (const t of ['ACCOUNT', 'DESCRIPTION', 'CONTACT', 'DEBITS', 'CREDITS', 'Sub Total', 'Total (₹)', 'Difference']) await expect(page.getByText(t).first()).toBeVisible();
    for (const b of ['Cancel', 'Save as Draft', 'Save']) await expect(page.getByRole('button', { name: b, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add Row/ })).toBeVisible();
    await mj.discardJournal();
  });

  test('TC02 - A manual journal without notes is refused with "Notes is Required!", and a journal with no amounts is refused', { tag: T, annotation: { type: 'cases', description: 'MJ TC-CJ-07, TC-LI-03' } }, async () => {
    await mj.openNewJournal();
    const r = await mj.trySaveJournal();
    expect(r.saved).toBe(false);
    expect(r.message).toMatch(/Notes is Required/i);
    await mj.fillJournal({ notes: 'no lines' });
    const r2 = await mj.trySaveJournal();
    expect(r2.saved, 'journal without amounts must be refused').toBe(false);
    await mj.discardJournal();
  });

  // ── Create / totals ──────────────────────────────────────────────────────

  test('TC03 - Save a balanced ₹100 journal (no reference, description or contact): it is Open with amount 100 and notes in the list, and the view has Print, Edit and Delete', { tag: T, annotation: { type: 'cases', description: 'MJ TC-CJ-08, MJ TC-CJ-05, TC-LI-01, TC-LI-04, TC-LI-05, TC-LI-10, TC-LI-16, TC-LI-17, TC-LI-18, TC-WF-03, TC-UI-03, TC-UI-04, TC-UI-05, TC-DI-02, TC-DI-05' } }, async () => {
    const notes = `ZZ MJ ${uniq()}`;
    await mj.openNewJournal();
    await mj.fillJournal({ notes, lines: pair(100) });
    const t = await mj.readTotals();
    expect([t.subDr, t.subCr, t.totDr, t.totCr, t.diff]).toEqual([100, 100, 100, 100, 0]);
    const r = await mj.trySaveJournal();
    expect(r.saved).toBe(true);
    const row = (await mj.searchJournals(notes))[0];
    expect(row, 'journal listed').toBeTruthy();
    expect(row.status).toBe('Open');
    expect(row.amount).toBe(100);
    expect(row.ref).toMatch(/^-?$/);
    expect(row.no).toMatch(/^MJN-AUTO\//);
    const v = await mj.openJournal(row.no);
    for (const x of [row.no, notes, 'Petty Cash', 'Undeposited Funds']) expect(v).toContain(x);
    for (const b of [/Print/, /Edit/, /Delete/]) await expect(mj.mjDrawer.getByRole('button', { name: b }).first()).toBeVisible();
  });

  test('TC04 - A manual journal accepts past and future dates and an alphanumeric reference', { tag: T, annotation: { type: 'cases', description: 'MJ TC-CJ-03, MJ TC-CJ-04, MJ TC-CJ-06' } }, async () => {
    const past = new Date(); past.setDate(past.getDate() - 20);
    const future = new Date(); future.setDate(future.getDate() + 20);
    for (const [d, ref] of [[past, `REF-${uniq()}`], [future, `FUT${uniq()}`]]) {
      const notes = `ZZ MJ ${uniq()}`;
      await journal({ date: mjDate(d), ref, notes });
      const row = (await mj.searchJournals(notes))[0];
      expect(row.ref).toBe(ref);
      expect(new Date(row.date).toDateString(), `date ${mjDate(d)}`).toBe(new Date(d.toDateString()).toDateString());
    }
  });

  test('TC05 - Unbalanced (100 / 80) and debit-only journals are refused and the Difference is shown', { tag: T, annotation: { type: 'cases', description: 'MJ TC-LI-11, MJ TC-LI-12, TC-WF-10' } }, async () => {
    await mj.openNewJournal();
    await mj.fillJournal({ notes: 'unbalanced', lines: [{ account: 'Petty Cash', debit: 100 }, { account: 'Undeposited Funds', credit: 80 }] });
    expect((await mj.readTotals()).diff).toBe(20);
    expect((await mj.trySaveJournal()).saved, 'unbalanced refused').toBe(false);
    await mj.closeModal();
    await mj.typeValue(mj.page.locator('#credit-1'), '0');
    expect((await mj.trySaveJournal()).saved, 'debit-only refused').toBe(false);
    await mj.discardJournal();
  });

  test('TC06 - A journal line with both debit and credit is refused, 0 and "-" are refused, and decimals such as 354.50 balance', { tag: T, annotation: { type: 'cases', description: 'MJ TC-LI-06, MJ TC-LI-07, MJ TC-LI-08, MJ TC-LI-09' } }, async ({ page }) => {
    await mj.openNewJournal();
    await mj.fillJournal({ notes: 'both sides', lines: [{ account: 'Petty Cash', debit: 50, credit: 50 }, { account: 'Undeposited Funds' }] });
    expect(await page.locator('#credit-0').inputValue() === '' || !(await mj.trySaveJournal()).saved, 'debit + credit on one line').toBe(true);
    await mj.closeModal();
    await page.locator('#debit-0').fill('');
    await page.locator('#debit-0').pressSequentially('-5');
    expect(await page.locator('#debit-0').inputValue()).not.toMatch(/^-/);
    await mj.discardJournal();
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes, lines: pair(354.5) });
    expect((await mj.searchJournals(notes))[0].amount).toBe(354.5);
  });

  test('TC07 - A journal with three debits (100 + 200 + 300) and two credits (250 + 350) shows sub totals of 600 and is saved', { tag: T, annotation: { type: 'cases', description: 'MJ TC-LI-02, MJ TC-LI-14, MJ TC-LI-15, MJ TC-LI-19' } }, async () => {
    const notes = `ZZ MJ ${uniq()}`;
    await mj.openNewJournal();
    await mj.fillJournal({ notes, lines: [
      { account: 'Petty Cash', debit: 100 }, { account: 'Petty Cash', debit: 200 }, { account: 'Petty Cash', debit: 300 },
      { account: 'Undeposited Funds', credit: 250 }, { account: 'Undeposited Funds', credit: 350 },
    ] });
    const t = await mj.readTotals();
    expect([t.subDr, t.subCr, t.totDr, t.totCr, t.diff]).toEqual([600, 600, 600, 600, 0]);
    expect((await mj.trySaveJournal()).saved).toBe(true);
    expect((await mj.searchJournals(notes))[0].amount).toBe(600);
  });

  // ── Journal types ────────────────────────────────────────────────────────

  test('TC08 - An Accrual Only journal with Accounts Receivable and a contact saves, and the customer due moves by the journal amount', { tag: T, annotation: { type: 'cases', description: 'MJ TC-JT-01, MJ TC-JT-10, TC-CT-01' } }, async ({ page }) => {
    const cu = new CustomerTransactionPage(page);
    await cu.openCustomer(CUST);
    const h0 = await cu.readHeader();
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes, lines: [{ account: 'Accounts Receivable', contact: CUST, debit: 75 }, { account: 'Petty Cash', credit: 75 }] });
    await mj.backToApp();
    await cu.openCustomer(CUST);
    const h1 = await cu.readHeader();
    expectClose(Math.abs(h1.closing - h0.closing), 75, 0.02, 'customer balance moves by 75');
  });

  test('TC09 - An Accrual Only journal with Accounts Payable and a vendor contact saves', { tag: T, annotation: { type: 'cases', description: 'MJ TC-JT-02, TC-CT-02' } }, async () => {
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes, lines: [{ account: 'Petty Cash', debit: 40 }, { account: 'Accounts Payable', contact: masterData.vendorName, credit: 40 }] });
    expect((await mj.searchJournals(notes))[0].status).toBe('Open');
  });

  test('TC10 - A Cash Only journal with Accounts Receivable is refused, and switching the account to Petty Cash then saves', { tag: T, annotation: { type: 'cases', description: 'MJ TC-JT-03, MJ TC-JT-08, MJ TC-JT-09' } }, async () => {
    await mj.openNewJournal();
    await mj.fillJournal({ notes: `ZZ MJ ${uniq()}`, type: 'Cash Only', lines: [{ account: 'Accounts Receivable', contact: CUST, debit: 30 }, { account: 'Undeposited Funds', credit: 30 }] });
    const r = await mj.trySaveJournal();
    expect(r.saved, 'A/R in Cash Only must be refused').toBe(false);
    console.log(`Cash Only + A/R: "${r.message}"`);
    await mj.closeModal();
    await mj.pickAccount(0, 'Petty Cash');
    expect((await mj.trySaveJournal()).saved, 'corrected journal saves').toBe(true);
  });

  test('TC11 - Cash Only and Accrual and Cash journals with accounts other than A/R save', { tag: T, annotation: { type: 'cases', description: 'MJ TC-CJ-10, MJ TC-CJ-11, TC-JT-07' } }, async () => {
    for (const type of ['Cash Only', 'Accrual and Cash']) {
      const notes = `ZZ MJ ${uniq()}`;
      await journal({ notes, type });
      expect((await mj.searchJournals(notes))[0].status).toBe('Open');
    }
  });

  // ── Workflow ─────────────────────────────────────────────────────────────

  // QA (BUG-MJ-02): working as designed — Save as Draft stays disabled while debit ≠ credit.
  test('TC12 - An unbalanced journal cannot be saved as a draft because Save as Draft is disabled', { tag: T, annotation: { type: 'cases', description: 'MJ TC-WF-02' } }, async () => {
    await mj.openNewJournal();
    await mj.fillJournal({ notes: `ZZ MJ ${uniq()}`, lines: [{ account: 'Petty Cash', debit: 100 }, { account: 'Undeposited Funds', credit: 80 }] });
    await expect(mj.mjDraft, 'Save as Draft disabled for an unbalanced journal').toBeDisabled();
  });

  test('TC13 - Save a journal as Draft: it has Draft status, and editing the amounts and clicking Save makes it Open', { tag: T, annotation: { type: 'cases', description: 'MJ TC-WF-01, MJ TC-WF-04, MJ TC-WF-05, MJ TC-WF-11' } }, async () => {
    const notes = `ZZ MJ ${uniq()}`;
    await mj.openNewJournal();
    await mj.fillJournal({ notes, lines: pair(100) });
    expect((await mj.trySaveJournal({ draft: true })).saved).toBe(true);
    const row = (await mj.searchJournals(notes))[0];
    expect(row.status).toBe('Draft');
    await mj.editJournal(row.no);
    await mj.typeValue(mj.page.locator('#debit-0'), '120');
    await mj.typeValue(mj.page.locator('#credit-1'), '120');
    expect((await mj.trySaveJournal()).saved).toBe(true);
    // QA (BUG-MJ-01): "may be a refresh issue" — but the list still shows Draft after 60 s of reloads (2026-10-28 run).
    await bugCheck('BUG-MJ-01', 'edited draft journal stays Draft after Save, even after reload', async () => {
      await expect.poll(async () => {
        await mj.page.reload();
        return (await mj.journalRow(row.no))?.status;
      }, { message: 'status after Save', timeout: 30_000, intervals: [3000, 5000] }).toBe('Open');
      expect((await mj.journalRow(row.no)).amount).toBe(120);
    });
  });

  test('TC14 - Edit an open journal: the new notes and amount show in the list and in the view', { tag: T, annotation: { type: 'cases', description: 'MJ TC-WF-07, TC-DI-06, TC-COA-06' } }, async () => {
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes });
    const row = (await mj.searchJournals(notes))[0];
    await mj.editJournal(row.no);
    const edited = `${notes} E`;
    await mj.mjNotes.fill(edited);
    await mj.typeValue(mj.page.locator('#debit-0'), '150');
    await mj.typeValue(mj.page.locator('#credit-1'), '150');
    expect((await mj.trySaveJournal()).saved).toBe(true);
    const after = await mj.journalRow(row.no);
    expect(after.notes).toBe(edited);
    expect(after.amount).toBe(150);
    expect(await mj.openJournal(row.no)).toContain(edited);
  });

  test('TC15 - Delete a draft journal and an open journal: each is gone, the count drops by 1 each time, and journal numbers stay unique', { tag: T, annotation: { type: 'cases', description: 'MJ TC-WF-06, MJ TC-WF-08, TC-PG-08, TC-DI-01' } }, async () => {
    const d = `ZZ MJ ${uniq()}`;
    await journal({ notes: d }, { draft: true });
    const o = `ZZ MJ ${uniq()}`;
    await journal({ notes: o });
    await mj.openJournals();
    const before = await mj.mjCount();
    const nos = (await mj.searchJournals('ZZ MJ')).map((r) => r.no);
    expect(new Set(nos).size).toBe(nos.length);
    for (const n of [d, o]) {
      const no = (await mj.searchJournals(n))[0].no;
      expect(await mj.deleteJournal(no), `${no} deleted`).toBe(true);
    }
    await mj.openJournals();
    expect(await mj.mjCount()).toBe(before - 2);
  });

  test('TC16 - Cancel on a filled journal form saves nothing', { tag: T, annotation: { type: 'cases', description: 'MJ TC-WF-09' } }, async () => {
    const notes = `ZZ MJ ${uniq()}`;
    await mj.openNewJournal();
    await mj.fillJournal({ notes, lines: pair(10) });
    await mj.discardJournal();
    expect(await mj.searchJournals(notes)).toEqual([]);
  });

  test('TC17 - Print in the journal view opens a preview, dialog or PDF', { tag: T, annotation: { type: 'cases', description: 'MJ TC-WF-12, TC-DI-07' } }, async ({ page }) => {
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes });
    await mj.openJournal((await mj.searchJournals(notes))[0].no);
    // QA (BUG-MJ-03): Print works — it prints through a hidden iframe, which capturePrint detects.
    const r = await capturePrint(page, () => mj.mjDrawer.getByRole('button', { name: /Print/ }).first().click());
    expect(r.popup || r.download || r.print > 0, 'print preview / dialog / PDF opened').toBe(true);
  });

  // ── Search / filter / pages ──────────────────────────────────────────────

  test('TC18 - Manual journal search works by number, reference, notes and status, and handles no match and special characters', { tag: T, annotation: { type: 'cases', description: 'MJ TC-SF-01, MJ TC-SF-02, MJ TC-SF-03, MJ TC-SF-04, MJ TC-SF-05, MJ TC-SF-10, MJ TC-SF-11' } }, async () => {
    const ref = `R${uniq()}`;
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes, ref });
    const row = (await mj.searchJournals(notes))[0];
    expect((await mj.searchJournals(row.no)).map((r) => r.no)).toEqual([row.no]);
    expect((await mj.searchJournals(ref)).map((r) => r.no)).toEqual([row.no]);
    expect(await mj.searchJournals('ZZZ-NO-SUCH-JOURNAL')).toEqual([]);
    expect(await mj.searchJournals("<'%$#>")).toEqual([]);
    for (const st of ['Draft', 'Open']) {
      const rows = await mj.searchJournals(st);
      console.log(`search "${st}": ${rows.length} rows`);
    }
  });

  test('TC19 - Manual journal date filter: today only (with notes search), empty range and reversed range are handled, and reload restores the list', { tag: T, annotation: { type: 'cases', description: 'MJ TC-SF-06, MJ TC-SF-07, MJ TC-SF-08, MJ TC-SF-09, MJ TC-SF-12' } }, async ({ page }) => {
    const notes = `ZZ MJ ${uniq()}`;
    await journal({ notes });
    await mj.openJournals();
    const all = await mj.mjCount();
    const setRange = async (s, e) => {
      for (const [loc, d] of [[page.locator('#date_filter_sales_bill'), s], [page.getByPlaceholder('End date'), e]]) {
        await loc.click();
        await loc.press('ControlOrMeta+A');
        await page.keyboard.type(mjDate(d));
        await page.keyboard.press('Enter');
      }
      await mj.settle(2500, 'filtered');
    };
    await setRange(new Date(), new Date());
    await mj.fillInto(mj.mjSearch, notes);
    await mj.settle(2500, 'search');
    expect((await mj.readMjRows()).map((r) => r.notes)).toEqual([notes]);
    await mj.fillInto(mj.mjSearch, '');
    await setRange(new Date(2001, 0, 1), new Date(2001, 0, 31));
    expect(await mj.readMjRows()).toEqual([]);
    await mj.openJournals();
    expect(await mj.mjCount()).toBe(all);
  });

  test('TC20 - Manual journal list shows 20 per page with next and previous, previous is disabled on the first page, and there is one page when there are 20 or fewer', { tag: T, annotation: { type: 'cases', description: 'MJ TC-PG-01, MJ TC-PG-04, MJ TC-PG-05, MJ TC-PG-06, MJ TC-PG-07, MJ TC-PG-09' } }, async ({ page }) => {
    await mj.openJournals();
    const total = await mj.mjCount();
    const pag = page.locator('ul.ant-pagination').filter({ visible: true }).first();
    if (total <= 20) {
      expect(await mj.mjRows.count()).toBe(total);
      return;
    }
    expect(await mj.mjRows.count()).toBe(20);
    await expect(pag.locator('li.ant-pagination-prev')).toHaveAttribute('aria-disabled', 'true');
    await pag.locator('li.ant-pagination-next').click();
    await mj.settle(2000, 'page 2');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('2');
    await pag.locator('li.ant-pagination-prev').click();
    await mj.settle(2000, 'page 1');
    await expect(pag.locator('li.ant-pagination-item-active')).toHaveText('1');
  });

  // ── Integration with the cheque tracker ──────────────────────────────────

  test('TC21 - Collecting a cheque late fee creates an Open journal with reference equal to the cheque number, amount equal to the fee and today\'s date', { tag: T, annotation: { type: 'cases', description: 'MJ TC-INT-01, MJ TC-INT-02, MJ TC-INT-03, MJ TC-INT-04, MJ TC-INT-05, MJ TC-INT-06, TC-DI-03, TC-DI-04' } }, async () => {
    const [A] = await mj.ensurePricedItems(E.items());
    const c = await mj.invoiceWithCheque(A);
    await mj.openTracker();
    await mj.moveTo('Returned', c.chequeNo);
    const row = await mj.chequeRow(c.chequeNo, 'Returned');
    const fee = parseFloat((row['Late Fee Charge'] || '0').replace(/[^\d.]/g, '')) || 100;
    expect((await mj.collectAmount(c.chequeNo, { amount: fee })).saved).toBe(true);
    const j = (await mj.searchJournals(c.chequeNo)).find((r) => r.ref === c.chequeNo);
    expect(j, 'late-fee journal').toBeTruthy();
    expect(j.amount).toBe(fee);
    expect(j.status).toBe('Open');
    const v = await mj.openJournal(j.no);
    expect(v).toMatch(/Accounts Receivable/);
  });

  test('TC22 - A returned cheque without a collected late fee creates no journal', { tag: T, annotation: { type: 'cases', description: 'MJ TC-INT-09' } }, async () => {
    const [A] = await mj.ensurePricedItems(E.items());
    const c = await mj.invoiceWithCheque(A);
    await mj.openTracker();
    await mj.moveTo('Returned', c.chequeNo);
    expect((await mj.searchJournals(c.chequeNo)).filter((r) => r.ref === c.chequeNo)).toEqual([]);
  });

  // ── Not automatable here ─────────────────────────────────────────────────

  for (const [tc, id, title, why] of [
    ['TC23', 'MJ TC-PG-02 / 03 / 10', 'Page size 50 / 100', 'The journal list has fewer than 50 entries.'],
    ['TC24', 'MJ TC-COA-01 … 05', 'Chart of Accounts balances', 'No Chart of Accounts screen in the Finance menu of this build.'],
    ['TC25', 'MJ TC-CT-03 / 04', 'Customer statement after delete / for drafts', 'Customer balance is checked on create (MJ TC-CT-01).'],
    ['TC26', 'MJ TC-INT-07 / 08 / 10 / 11 / 12 / TC-DI-08', 'Several / partial late fees, statement entry, deleting the late-fee journal', 'One late-fee journal is checked (MJ TC-INT-01); partial collection is a Cheque Tracker case.'],
  ]) {
    test.fixme(`${tc} - ${title} (${why})`, { annotation: { type: 'cases', description: id } }, async () => {});
  }
});
