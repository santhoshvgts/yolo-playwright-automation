'use strict';

const { expect } = require('@playwright/test');
const { ChequeTrackerPage } = require('./ChequeTrackerPage');
const { money } = require('../../utils/stockMath');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const FORM_URL = /manual-journal\/(new|edit)/;

/**
 * Finance → Manual Journal (`/finance/manual-journal`). List: Date, Journal#, Reference Number, Status, Notes, Amount,
 * Created By; "Search ...", Start / End date (#date_filter_sales_bill); "Total Count: N"; "New Journal" →
 * `/finance/manual-journal/new`: #journal (MJN-AUTO/NNNN, ro), date ("16 Oct, 2026"), #reference, #notes (required:
 * "Notes is Required!"), Journal Type radios Accrual Only (1, default) / Cash Only (2) / Accrual and Cash (3),
 * Journal Items rows #account-<i>, #description-<i>, #client-<i> (contact), #debit-<i>, #credit-<i> (two rows to start,
 * "Add Row"), Sub Total / Total (₹) / Difference; Cancel, Save as Draft, Save.
 */
class ManualJournalPage extends ChequeTrackerPage {

  constructor(page) {
    super(page);
    this.mjSearch = this.page.getByPlaceholder('Search ...').filter({ visible: true }).first();
    this.mjRows = this.page.locator('table tbody tr.ant-table-row').filter({ visible: true });
    this.newJournalBtn = this.page.getByRole('button', { name: /New Journal/ });
    this.journalNo = this.page.locator('#journal');
    this.mjRef = this.page.locator('#reference');
    this.mjNotes = this.page.locator('#notes');
    this.mjSave = this.page.getByRole('button', { name: 'Save', exact: true });
    this.mjDraft = this.page.getByRole('button', { name: 'Save as Draft' });
    this.mjCancel = this.page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.addRowBtn2 = this.page.getByRole('button', { name: 'Add Row' });
    this.mjDrawer = this.page.locator('.ant-drawer-content').filter({ visible: true }).last();
    this.mjDate = this.page.getByPlaceholder('Select date').filter({ visible: true }).first();
  }

  async openJournals() {
    await this.page.goto(`${this.base()}/finance/manual-journal`);
    await expect(this.newJournalBtn).toBeVisible();
    await this.settle(2000, 'journal list');
  }

  async searchJournals(text) {
    await this.openJournals();
    await this.fillInto(this.mjSearch, text);
    await this.settle(2500, 'journal search');
    return this.readMjRows();
  }

  async readMjRows() {
    return (await this.mjRows.evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim()))))
      .map((c) => ({ date: c[0], no: c[1], ref: c[2], status: c[3], notes: c[4], amount: money(c[5]), by: c[6], cells: c }));
  }

  async journalRow(no) {
    return (await this.searchJournals(no)).find((r) => r.no === no) || null;
  }

  async mjCount() {
    return parseInt((await this.page.getByText(/Total Count:\s*\d+/).first().innerText()).match(/\d+/)[0], 10);
  }

  async openNewJournal() {
    await this.openJournals();
    await this.newJournalBtn.click();
    await expect(this.page).toHaveURL(FORM_URL);
    await expect(this.journalNo).not.toHaveValue('');
    await this.settle(1500, 'journal form');
    return this.journalNo.inputValue();
  }

  async setType(type) {
    const value = { 'Accrual Only': '1', 'Cash Only': '2', 'Accrual and Cash': '3' }[type];
    await this.page.locator(`input[type="radio"][value="${value}"]`).check({ force: true });
  }

  async pickAccount(i, account) {
    await this.page.locator(`.ant-select:has(#account-${i})`).first().locator('.ant-select-selector').click();
    await this.page.keyboard.type(account);
    await this.settle(1200, 'account search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: new RegExp(`^\\s*${account}\\s*$`) }).first().click();
    await this.settle(400, 'account');
  }

  async pickContact(i, contact) {
    await this.page.locator(`.ant-select:has(#client-${i})`).first().locator('.ant-select-selector').click();
    await this.page.keyboard.type(contact);
    await this.settle(1500, 'contact search');
    await this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`).filter({ hasText: contact }).first().click();
    await this.settle(400, 'contact');
  }

  /** { ref, notes, type, date, lines: [{ account, debit, credit, desc, contact }] } */
  async fillJournal(j) {
    if (j.date) {
      await this.mjDate.click();
      await this.mjDate.press('Control+A');
      await this.page.keyboard.type(j.date);
      await this.page.keyboard.press('Enter');
    }
    if (j.ref !== undefined) await this.fillInto(this.mjRef, j.ref);
    if (j.notes !== undefined) await this.mjNotes.fill(j.notes);
    if (j.type) await this.setType(j.type);
    for (const [i, l] of (j.lines || []).entries()) {
      while (!(await this.page.locator(`#account-${i}`).count())) { await this.addRowBtn2.click(); await this.settle(500, 'row added'); }
      if (l.account) await this.pickAccount(i, l.account);
      if (l.desc !== undefined) await this.page.locator(`#description-${i}`).fill(l.desc);
      if (l.contact) await this.pickContact(i, l.contact);
      if (l.debit !== undefined) await this.typeValue(this.page.locator(`#debit-${i}`), String(l.debit));
      if (l.credit !== undefined) await this.typeValue(this.page.locator(`#credit-${i}`), String(l.credit));
    }
  }

  /** Sub Total / Total / Difference numbers: { subDr, subCr, totDr, totCr, diff }. */
  async readTotals() {
    const t = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const two = (label) => { const m = t.match(new RegExp(`${label}\\s*(-?[\\d,.]+)\\s+(-?[\\d,.]+)`)); return m ? [money(m[1]), money(m[2])] : [NaN, NaN]; };
    const [subDr, subCr] = two('Sub Total');
    const [totDr, totCr] = two('Total \\(₹\\)');
    const d = t.match(/Difference\s*(-?[\d,.]+)/);
    return { subDr, subCr, totDr, totCr, diff: d ? money(d[1]) : NaN };
  }

  /** Save / draft: { saved, message, no }. */
  async trySaveJournal({ draft = false } = {}) {
    const no = await this.journalNo.inputValue().catch(() => '');
    const btn = draft ? this.mjDraft : this.mjSave;
    if (await btn.isDisabled().catch(() => false)) {
      console.log(`Journal ${no}: ${draft ? 'Save as Draft' : 'Save'} disabled — refused`);
      return { saved: false, message: 'Save disabled', no };
    }
    await btn.click();
    const seen = new Set();
    const t0 = Date.now();
    let saved = false;
    while (Date.now() - t0 < 20_000) {
      for (const m of await this.page.locator('.ant-message, .ant-form-item-explain-error, .ant-modal-content').filter({ visible: true }).allInnerTexts().catch(() => [])) seen.add(m.replace(/\s+/g, ' ').trim());
      if (!FORM_URL.test(this.page.url())) { saved = true; break; }
      await this.page.waitForTimeout(500);
    }
    const message = [...seen].filter(Boolean).join(' | ');
    if (saved) await this.settle(2000, 'journal saved');
    console.log(`Journal ${no} ${saved ? 'saved' : 'refused'}${draft ? ' (draft)' : ''}: "${message}"`);
    return { saved, message, no };
  }

  async createJournal(j, opts) {
    await this.openNewJournal();
    await this.fillJournal(j);
    const r = await this.trySaveJournal(opts);
    if (!r.saved) throw new Error(`Journal ${r.no} not saved: ${r.message}`);
    return r.no;
  }

  async closeModal() {
    const btn = this.page.locator('.ant-modal-content').filter({ visible: true }).getByRole('button').first();
    if (await btn.isVisible().catch(() => false)) await btn.click();
    await this.page.keyboard.press('Escape');
  }

  async discardJournal() {
    await this.closeModal();
    await this.mjCancel.click();
    if (await this.yesBtn.isVisible().catch(() => false)) await this.yesBtn.click();
    await this.settle(1500, 'form closed');
  }

  async openJournal(no) {
    await this.searchJournals(no);
    await this.mjRows.filter({ hasText: no }).first().locator('td').nth(1).click();
    await expect(this.mjDrawer).toBeVisible();
    await this.settle(2000, 'journal view');
    return (await this.mjDrawer.innerText()).replace(/\s+/g, ' ');
  }

  async editJournal(no) {
    await this.openJournal(no);
    await this.mjDrawer.getByRole('button', { name: /Edit/ }).first().click();
    await expect(this.page).toHaveURL(FORM_URL);
    await this.settle(2500, 'journal edit');
  }

  /** Delete from the view: true when gone. */
  async deleteJournal(no) {
    await this.openJournal(no);
    const del = this.mjDrawer.getByRole('button', { name: /Delete/ });
    if (await del.count()) await del.first().click();
    else { await this.mjDrawer.locator('.ant-dropdown-trigger').first().click(); await this.page.getByText('Delete', { exact: true }).first().click(); }
    await this._confirm();
    await this.page.keyboard.press('Escape');
    return !(await this.journalRow(no));
  }
}

module.exports = { ManualJournalPage };
