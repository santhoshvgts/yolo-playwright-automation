'use strict';

const { expect } = require('@playwright/test');
const { SalesInvoiceStockPage } = require('./SalesInvoiceStockPage');
const { CustomerPaymentPage } = require('./CustomerPaymentPage');
const { getSection, saveSection } = require('../../utils/flowStore');
const { money, expectClose } = require('../../utils/stockMath');

const OPEN_DROPDOWN = '.ant-select-dropdown:not(.ant-select-dropdown-hidden)';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Invoice app → Sales: Sales Invoice edit flow — item rows, rate, line discount (% / ₹),
 * GST / CESS, tax mode, dates, summary discount, shipping, TDS / TCS, adjustment and the
 * Sales list (dashboard). Builds on SalesInvoiceStockPage (items, lines, save, list, preview).
 *
 * Totals are checked against computeTotals(), the app's formula as observed:
 *   line net     = rate × qty − line discount (% of rate × qty, or ₹)
 *   taxable      = net (Excluding Tax) or net ÷ (1 + GST% + CESS%) (Including Tax)
 *   base         = Σ taxable; summary discount = % of base or ₹
 *   tax          = Σ taxable × (1 − summary discount ÷ base) × (GST% + CESS%)
 *   TDS          = section % × (base − summary discount)
 *   total        = base − summary discount + tax + shipping − TDS ± adjustment
 */
class SalesInvoiceEditPage extends SalesInvoiceStockPage {

  constructor(page) {
    super(page);
    this.payment = new CustomerPaymentPage(page);

    // Line fields (scoped to one row of this.lineRows)
    this.lineRate = (row) => row.locator('input[id^="rate"]');
    this.lineDiscount = (row) => row.locator('input[id^="discount"]');
    this.lineDiscountMode = (row, mode) => row.locator('.ant-segmented-item').filter({ hasText: mode });
    this.lineDiscountModeSelected = (row) => row.locator('.ant-segmented-item-selected');
    this.lineSelect = (row, idPrefix) => row.locator('.ant-select').filter({ has: this.page.locator(`input[id^="${idPrefix}"]`) });
    this.lineAmount = (row) => row.locator('td').last();

    // Header
    this.dueTermSelect = this.antSelect('#new_si_due_term');
    this.dueDateInput = this.page.locator('#due_date');
    this.taxModeSelect = this.antSelect('#select_gst_type');

    // Summary
    this.subTotal = this.page.locator('#sub_value');
    this.taxAmount = this.page.locator('#tax_value');
    this.summaryDiscountType = this.antSelect('#discount_type');
    this.summaryDiscountPercent = this.page.locator('#discount_percentage');
    this.summaryDiscountAmount = this.page.locator('#discount_price');
    this.shippingInput = this.page.locator('#shipping_cost');
    this.tdsAmount = this.page.locator('#tax_source');
    // TDS row: [TDS | TCS] select + section select; their rc_select_N ids shift, so anchor on #tax_source
    this.tdsRow = this.page.locator('xpath=//input[@id="tax_source"]/ancestor::div[count(.//div[contains(concat(" ",@class," ")," ant-select ")])>=2][1]');
    this.tdsTypeSelect = this.tdsRow.locator('.ant-select').nth(0);
    this.tdsSectionSelect = this.tdsRow.locator('.ant-select').nth(1);
    this.tdsInfo = this.page.getByText(/of [\d.]+% is applied/);
    this.adjustmentTypeSelect = this.antSelect('#select_addjustment');
    this.adjustmentAmount = this.page.locator('#adjustment');
    this.roundOff = this.page.getByText(/round\s*off/i);

    // Create form — customer step / header
    this.customerNextBtn = this.page.locator('.ant-form > .ant-btn');
    this.changeCustomerBtn = this.page.getByRole('button', { name: 'Change' });
    this.customerHeader = this.changeCustomerBtn.locator('xpath=ancestor::div[4]');
    this.refNoInput = this.page.locator('#new_si_reference_number');
    this.placeOfSupplySelect = this.antSelect('#place_of_supply');
    this.salesPersonSelect = this.antSelect('#sales_person');
    this.openOptionTexts = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`);

    // Sales list (dashboard)
    this.listRows = this.page.locator('table tbody tr.ant-table-row');
    this.listTotalCount = this.page.getByText(/Total Count:/);
    this.listFooter = this.page.locator('table tfoot, .ant-table-summary');
    this.listDateStart = this.page.locator('#date_filter_sales_bill');
    this.listDateEnd = this.page.getByPlaceholder('End date');
    this.listNextPage = this.page.locator('li.ant-pagination-next');
  }

  /** The .ant-select root that owns the input `css`. */
  antSelect(css, scope = this.page) {
    return scope.locator('.ant-select').filter({ has: this.page.locator(css) });
  }

  /**
   * Select open but its popup not rendered: walk the options with ArrowDown, reading the active one from
   * the combobox's aria-activedescendant (its option carries the label in aria-label), and Enter on `text`.
   */
  async _pickByKeyboard(root, text) {
    const input = root.locator('input[role="combobox"]').first();
    const label = async () => {
      const id = await input.getAttribute('aria-activedescendant');
      return id ? ((await this.page.locator(`[id="${id}"]`).getAttribute('aria-label')) || '').trim() : '';
    };
    for (let k = 0; k < 80; k++) {
      if ((await label()) === text) { await this.page.keyboard.press('Enter'); return; }
      await this.page.keyboard.press('ArrowDown');
    }
    throw new Error(`Option "${text}" not found in the select (popup not rendered)`);
  }

  /** Pick `text` (exact, trimmed) in the antd select `root`. */
  async pickOption(root, text) {
    // Centre the select first: near the page bottom its dropdown can open outside a small viewport
    const opt = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option`)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(text)}\\s*$`) }).first();
    // The popup sometimes opens without rendering its options (seen on the TDS section) — close and reopen
    for (let attempt = 1; ; attempt++) {
      await root.evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
      await root.locator('.ant-select-selector').click();
      if (await opt.click({ timeout: 6000 }).then(() => true, () => false)) break;
      if (attempt === 3) { await this._pickByKeyboard(root, text); break; }
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    }
    await this.settle(600, 'totals recalculate');
  }

  async selectedText(root) {
    const item = root.locator('.ant-select-selection-item');
    return (await item.count()) ? (await item.first().innerText()).trim() : '';
  }

  /** Type like a user (select all, type, leave the field) — the app filters keystrokes (no "-", 2 decimals). */
  async typeValue(locator, value) {
    await locator.click();
    await locator.press('ControlOrMeta+A');
    if (value === '' || value === null || value === undefined) {
      await locator.press('Backspace');
    } else {
      await this.page.keyboard.type(String(value));
    }
    await locator.blur();
    await this.settle(600, 'totals recalculate');
    return locator.inputValue();
  }

  // ── items for the edit flow ────────────────────────────────────────────────

  /**
   * Shared priced items (pcs, GST18, big stock). Created once and remembered in the
   * runtime store, so the edit-flow tests don't each create items; recreated when missing.
   */
  async ensurePricedItems(specs) {
    const saved = getSection('siEditFlowItems') || {};
    if (Array.isArray(saved.items) && saved.items.length >= specs.length) {
      try {
        await this.readStock(saved.items[0]);
        return saved.items.slice(0, specs.length);
      } catch {
        console.log('Saved edit-flow items not found — creating new ones');
      }
    }
    const items = await this.setupItems(specs);
    saveSection('siEditFlowItems', { items });
    return items;
  }

  // ── line edits ─────────────────────────────────────────────────────────────

  async setLineRate(index, rate) {
    return this.typeValue(this.lineRate(this.lineRows.nth(index)), rate);
  }

  /** mode: '%' | '₹' (omit to keep the current one). */
  async setLineDiscount(index, value, mode) {
    const row = this.lineRows.nth(index);
    if (mode && (await this.lineDiscountModeSelected(row).innerText()).trim() !== mode) {
      await this.lineDiscountMode(row, mode).click();
      await this.settle(400, 'discount mode switches');
    }
    return this.typeValue(this.lineDiscount(row), value);
  }

  async setLineGst(index, gst) {
    await this.pickOption(this.lineSelect(this.lineRows.nth(index), 'tax'), gst);
  }

  async setLineCess(index, cess) {
    await this.pickOption(this.lineSelect(this.lineRows.nth(index), 'cess'), cess);
  }

  /** { text, rate, qty, discount, discountMode, uom, gst, cess, amount } of line `index`. */
  async readLine(index) {
    const row = this.lineRows.nth(index);
    return {
      text: (await row.innerText()).replace(/\s+/g, ' ').trim(),
      rate: parseFloat(await this.lineRate(row).inputValue()),
      qty: parseFloat(await this.lineQty(row).inputValue()),
      discount: parseFloat(await this.lineDiscount(row).inputValue() || '0'),
      discountMode: (await this.lineDiscountModeSelected(row).innerText()).trim(),
      uom: (await this.lineUomShown(row).innerText()).trim(),
      gst: await this.selectedText(this.lineSelect(row, 'tax')),
      cess: await this.selectedText(this.lineSelect(row, 'cess')),
      amount: money(await this.lineAmount(row).innerText()),
    };
  }

  async lineCount() {
    return this.lineRows.count();
  }

  /**
   * A saved invoice does not reopen with its lines in the order they were added, so after
   * opening the edit form re-order the model's lines to the form's order (matched by item name).
   */
  async alignToForm(m) {
    const remaining = [...m.lines];
    const ordered = [];
    const n = await this.lineCount();
    for (let i = 0; i < n; i++) {
      const text = await this.lineRows.nth(i).innerText();
      const at = remaining.findIndex((l) => text.includes(l.item.itemName));
      if (at < 0) throw new Error(`Edit form line ${i + 1} ("${text.slice(0, 60)}") matches no invoice line`);
      ordered.push(remaining.splice(at, 1)[0]);
    }
    expect(remaining, 'invoice lines missing from the edit form').toHaveLength(0);
    m.lines = ordered;
    return m;
  }

  /** Click × on line `index`; returns whether the line went away (the edit form keeps its last line). */
  async tryRemoveLine(index) {
    const before = await this.lineCount();
    await this.lineRemoveBtn(this.lineRows.nth(index)).click();
    const removed = await expect(this.lineRows).toHaveCount(before - 1, { timeout: 5000 }).then(() => true, () => false);
    await this.settle(500, 'line removal settles');
    return removed;
  }

  // ── create form: customer step / header ───────────────────────────────────

  /** Sales → New Sales Invoice, stop on the customer step. */
  async openCustomerStep() {
    await this.salesTab.click();
    await this.newInvoiceBtn.click();
    await expect(this.customerDropdown).toBeVisible();
  }

  async customerHeaderText() {
    return (await this.customerHeader.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Pick a state in Place of Supply (search + exact option). */
  async setPlaceOfSupply(state) {
    await this.placeOfSupplySelect.locator('.ant-select-selector').click();
    await this.page.keyboard.type(state);
    await this.openOptionTexts.filter({ hasText: new RegExp(`^\\s*${escapeRegex(state)}\\s*$`) }).first().click();
    await this.settle(800, 'place of supply applies');
  }

  /** Options the item search lists for `text` ([] when no dropdown opens). */
  async itemSearchOptions(text) {
    if (!(await this.itemSearchRows.count())) await this.addRowBtn.click();
    await this.typeInto(this.itemSearch, text);
    await this.settle(2500, 'item search results');
    const options = this.page.locator(`${OPEN_DROPDOWN} .ant-select-item-option-content`);
    const found = (await options.count()) ? (await options.allInnerTexts()).map((t) => t.split('\n')[0].trim()) : [];
    await this.page.keyboard.press('Escape');
    return found;
  }

  /** Item names on the open form's lines, in form order. */
  async lineItemTexts() {
    const texts = [];
    for (let i = 0; i < await this.lineCount(); i++) texts.push(await this.lineRows.nth(i).innerText());
    return texts;
  }

  // ── header ─────────────────────────────────────────────────────────────────

  async setDueTerm(term) {
    await this.pickOption(this.dueTermSelect, term);
  }

  async setDueDate(date) {
    await this.dueDateInput.click();
    await this.dueDateInput.press('ControlOrMeta+A');
    await this.page.keyboard.type(date);
    await this.page.keyboard.press('Enter');
    await this.settle(600, 'due date applies');
  }

  async readDates() {
    return { billDate: await this.billDateInput.inputValue(), dueDate: await this.dueDateInput.inputValue() };
  }

  /** 'Excluding Tax' | 'Including Tax' */
  async setTaxMode(mode) {
    await this.pickOption(this.taxModeSelect, mode);
  }

  // ── summary ────────────────────────────────────────────────────────────────

  /** type: 'Percentage' | 'Amount' */
  async setSummaryDiscount(type, value) {
    if ((await this.selectedText(this.summaryDiscountType)) !== type) await this.pickOption(this.summaryDiscountType, type);
    return this.typeValue(type === 'Percentage' ? this.summaryDiscountPercent : this.summaryDiscountAmount, value);
  }

  async setShipping(value) {
    return this.typeValue(this.shippingInput, value);
  }

  /** Apply a TDS / TCS section; returns the section rate (%) the app shows. */
  async setTds(section, type = 'TDS') {
    if ((await this.selectedText(this.tdsTypeSelect)) !== type) await this.pickOption(this.tdsTypeSelect, type);
    await this.pickOption(this.tdsSectionSelect, section);
    const info = (await this.tdsInfo.first().innerText()).trim();
    const rate = parseFloat(info.match(/of ([\d.]+)%/)[1]);
    console.log(`${type} section "${section}" → ${rate}%`);
    return rate;
  }

  async removeTds() {
    await this.tdsSectionSelect.hover();
    await this.tdsSectionSelect.locator('.ant-select-clear').click();
    await this.settle(600, 'TDS removed');
  }

  /** type: 'Addition' | 'Subtract' */
  async setAdjustment(type, value) {
    if ((await this.selectedText(this.adjustmentTypeSelect)) !== type) await this.pickOption(this.adjustmentTypeSelect, type);
    if (value !== undefined) return this.typeValue(this.adjustmentAmount, value);
    return this.adjustmentAmount.inputValue();
  }

  /** { sub, tax, tds, total } as shown (tds as a positive amount). */
  async readSummary() {
    await this.settle(800, 'totals recalculate');
    return {
      sub: money(await this.subTotal.inputValue()),
      tax: money(await this.taxAmount.inputValue()),
      tds: (await this.tdsAmount.count()) ? Math.abs(money(await this.tdsAmount.inputValue()) || 0) : 0,   // no TDS row on the purchase order
      total: money(await this.salesTotal.innerText()),
    };
  }

  /**
   * Expected totals for an invoice model:
   * { lines: [{ rate, qty, discount, discountMode: '%'|'₹', gst, cess }], taxMode: 'Excluding Tax'|'Including Tax',
   *   summaryDiscount: { type: 'Percentage'|'Amount', value }, shipping, tdsRate, adjustment: { type, value } }
   * gst / cess are percentages (18, 2 …).
   */
  computeTotals(model) {
    const inclusive = model.taxMode === 'Including Tax';
    const lines = model.lines.map((l) => {
      const gross = Number(l.rate) * Number(l.qty);
      const disc = (l.discountMode || '%') === '%' ? gross * Number(l.discount || 0) / 100 : Number(l.discount || 0);
      const net = gross - disc;
      const t = (Number(l.gst ?? 18) + Number(l.cess || 0)) / 100;
      return { net, t, taxable: inclusive ? net / (1 + t) : net };
    });
    const base = lines.reduce((s, l) => s + l.taxable, 0);
    const sd = model.summaryDiscount
      ? (model.summaryDiscount.type === 'Percentage' ? base * Number(model.summaryDiscount.value) / 100 : Number(model.summaryDiscount.value))
      : 0;
    const factor = base ? 1 - sd / base : 0;
    const tax = lines.reduce((s, l) => s + l.taxable * factor * l.t, 0);
    const tds = Number(model.tdsRate || 0) / 100 * (base - sd);
    const adj = model.adjustment ? Number(model.adjustment.value || 0) * (model.adjustment.type === 'Subtract' ? -1 : 1) : 0;
    const total = base - sd + tax + Number(model.shipping || 0) - tds + adj;
    return { lineNets: lines.map((l) => round2(l.net)), base: round2(base), discount: round2(sd), tax: round2(tax), tds: round2(tds), total: round2(total) };
  }

  /** The open form's tax / TDS / total must match the model. Returns the expected totals. */
  async expectTotals(model, label = '') {
    const expected = this.computeTotals(model);
    const shown = await this.readSummary();
    const tol = 0.02 * (model.lines.length + 1);
    console.log(`Totals ${label}: shown ${JSON.stringify(shown)} expected ${JSON.stringify(expected)}`);
    expectClose(shown.tax, expected.tax, tol, `${label} tax amount`);
    expectClose(shown.tds, expected.tds, tol, `${label} TDS`);
    expectClose(shown.total, expected.total, tol, `${label} grand total`);
    return expected;
  }

  /** Each line's amount cell must equal its net (rate × qty − discount). */
  async expectLineAmounts(model, label = '') {
    const expected = this.computeTotals({ ...model, taxMode: 'Excluding Tax' }).lineNets;
    for (const [i, net] of expected.entries()) {
      expectClose((await this.readLine(i)).amount, net, 0.02, `${label} line ${i + 1} amount`);
    }
  }

  // ── invoices ───────────────────────────────────────────────────────────────

  /**
   * Fill the open form's lines and summary from an invoice model (see computeTotals) whose
   * lines also carry `item`. A line's rate / GST / CESS is only touched when it differs from
   * the item default (rate = item price, GST18, no CESS). opts.tds: TDS section name.
   */
  async fillInvoice(model, { tds } = {}) {
    const start = await this.lineCount();
    for (const [i, l] of model.lines.entries()) {
      await this.addLine(l.item, l.qty);
      const at = start + i;
      // Taxes first: picking a GST / CESS re-prices the line back to the item rate
      if (l.gst !== undefined && Number(l.gst) !== 18) await this.setLineGst(at, `GST${l.gst}`);
      if (Number(l.cess || 0)) await this.setLineCess(at, `CESS${l.cess}`);
      if (l.rate !== undefined && Number(l.rate) !== Number(l.item.price)) await this.setLineRate(at, l.rate);
      if (Number(l.discount || 0)) await this.setLineDiscount(at, l.discount, l.discountMode || '%');
    }
    if (model.taxMode && model.taxMode !== 'Excluding Tax') await this.setTaxMode(model.taxMode);
    if (model.summaryDiscount) await this.setSummaryDiscount(model.summaryDiscount.type, model.summaryDiscount.value);
    if (model.shipping) await this.setShipping(model.shipping);
    if (tds) model.tdsRate = await this.setTds(tds);
    if (model.adjustment) await this.setAdjustment(model.adjustment.type, model.adjustment.value);
  }

  /**
   * Create + save an invoice from a model. opts: { tds, billDate, dueTerm, draft, customerName }.
   * Sets model.tdsRate when a TDS section is applied. Returns { billNo, total } (total as shown).
   */
  async createPricedInvoice(model, opts = {}) {
    const billNo = await this.startInvoice({ billDate: opts.billDate, customerName: opts.customerName });
    // A customer without an address leaves Place of Supply empty, and the save is then refused silently
    if (!(await this.selectedText(this.placeOfSupplySelect))) await this.setPlaceOfSupply('Tamil Nadu');
    if (opts.dueTerm) await this.setDueTerm(opts.dueTerm);
    await this.fillInvoice(model, opts);
    await this.expectTotals(model, `${billNo} before save`);
    const total = await this.readInvoiceTotal();
    if (opts.draft) await this.saveAsDraft(); else await this.save();
    const saved = await this.confirmSavedNumber(billNo, opts.customerName, total);
    console.log(`Created ${saved} — total ${total}`);
    return { billNo: saved, total };
  }

  /**
   * The number shown on the form is only provisional: when another user saves a document first
   * the app silently gives ours the next free number. Check the list row of `no` belongs to
   * `customerName`; otherwise find our document (same customer and amount, higher number).
   */
  async confirmSavedNumber(no, customerName, total) {
    if (!customerName) return no;
    const cust = customerName.toLowerCase();
    const readRows = () => this.page.locator('table tbody tr.ant-table-row').filter({ visible: true })
      .evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.innerText.trim())));
    await this._searchList(no);
    const own = (await readRows()).find((c) => c.includes(no));
    // Not listed (e.g. a future date outside the list's range) — nothing contradicts the number
    if (!own || own.some((t) => t.toLowerCase() === cust)) return no;
    const prefix = no.replace(/\d+$/, '');
    const n = (x) => parseInt(String(x).match(/(\d+)$/)[1], 10);
    await this._searchList(prefix);
    const mine = (await readRows())
      .map((c) => ({ c, no: c.find((t) => t.startsWith(prefix)) }))
      .filter((r) => r.no && n(r.no) > n(no) && r.c.some((t) => t.toLowerCase() === cust)
        && r.c.some((t) => /₹/.test(t) && Math.abs(money(t) - total) < 0.05))
      .sort((a, b) => n(a.no) - n(b.no));
    if (!mine.length) throw new Error(`${no} was saved under another number and could not be found (customer ${customerName}, total ${total})`);
    console.log(`${no} was taken by another user — saved as ${mine[0].no}`);
    return mine[0].no;
  }

  /** The Sales list row of the saved invoice must show the model's grand total (bill and due). */
  async expectListAmount(billNo, model, label = '') {
    const expected = this.computeTotals(model).total;
    const row = await this.listRow(billNo);
    expectClose(row.bill, expected, 0.02 * (model.lines.length + 1), `${label} list Bill Amount`);
    return row;
  }

  /** Click Save and expect a warning / error matching `pattern` (whether or not the save goes through). */
  async saveExpectWarning(pattern) {
    await this.saveBtn.click();
    await expect(this.validationMessage.filter({ hasText: pattern }).first(), `warning matching ${pattern}`).toBeVisible({ timeout: 10_000 });
    return (await this.validationMessage.allInnerTexts()).join(' | ');
  }

  /** Round Off shown in the summary: { value, total }. */
  async readRoundOff() {
    await expect(this.roundOff.first(), 'Round Off field in the pricing summary').toBeVisible({ timeout: 5000 });
    const text = await this.roundOff.first().locator('xpath=ancestor::div[1]/..').innerText();
    const m = text.replace(/round\s*off/i, '').match(/-?₹?\s*-?[\d,]+(?:\.\d+)?/);
    return { value: m ? money(m[0]) : 0, total: money(await this.salesTotal.innerText()) };
  }

  /**
   * An invalid value must not get through: either the input refuses it (the value shown is
   * not `invalid`), or the save is refused with a validation message. Returns what happened.
   */
  async expectInvalidValueBlocked(locator, invalid, label) {
    const shown = await this.typeValue(locator, invalid);
    if (parseFloat(shown) !== parseFloat(invalid)) {
      console.log(`${label}: input refused "${invalid}" (shows "${shown}")`);
      return { prevented: true, shown };
    }
    const message = await this.saveExpectRefused();
    return { prevented: false, shown, message };
  }

  // ── Sales list (dashboard) ─────────────────────────────────────────────────

  /** { date, billNo, customer, status, bill, due, badgeColor } of the invoice in the Sales list. */
  async listRow(billNo) {
    await this._searchList(billNo);
    const row = this.invoiceRow(billNo).first();
    await expect(row).toBeVisible();
    const cells = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
    return {
      date: cells[1], billNo: cells[2], customer: cells[3], status: cells[4],
      bill: money(cells[5]), due: money(cells[6]),
      badgeColor: await this._badgeColor(row.locator('td').nth(4)),
    };
  }

  /** Background colour of the status badge (the coloured element inside the cell; the cell itself is white). */
  async _badgeColor(cell) {
    return cell.evaluate((td) => {
      const plain = (bg) => !bg || bg === 'transparent' || /^rgba\(0, 0, 0, 0\)$/.test(bg) || /^rgb\(255, 255, 255\)$/.test(bg);
      for (const el of td.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundColor;
        if (!plain(bg)) return bg;
      }
      return getComputedStyle(td).backgroundColor;
    });
  }

  /** Visible list rows as [{ date, billNo, customer, status, bill, due, badgeColor }]. */
  async readListPage() {
    const rows = [];
    const n = await this.listRows.count();
    for (let i = 0; i < n; i++) {
      const row = this.listRows.nth(i);
      const cells = (await row.locator('td').allInnerTexts()).map((t) => t.trim());
      rows.push({
        date: cells[1], billNo: cells[2], customer: cells[3], status: cells[4],
        bill: money(cells[5]), due: money(cells[6]), badgeColor: await this._badgeColor(row.locator('td').nth(4)),
      });
    }
    return rows;
  }

  /** Every page of the Sales list (current search / filter). */
  async readAllListPages() {
    const all = [];
    for (let page = 1; page <= 200; page++) {
      all.push(...(await this.readListPage()));
      const next = this.listNextPage.first();
      if (!(await next.count()) || (await next.getAttribute('aria-disabled')) === 'true' || (await next.getAttribute('class')).includes('disabled')) break;
      await next.click();
      await this.settle(2000, 'next list page');
    }
    return all;
  }

  async openSalesList() {
    await this.salesTab.click();
    await expect(this.listRows.first()).toBeVisible();
    await this.settle(1500, 'list loads');
  }

  /** Dates as Date objects (typed in the list filter's 'DD Mon, YYYY' format). */
  async setListDateRange(startDate, endDate) {
    const [start, end] = [filterDate(startDate), filterDate(endDate)];
    await this.listDateStart.click();
    await this.listDateStart.press('ControlOrMeta+A');
    await this.page.keyboard.type(start);
    await this.page.keyboard.press('Enter');
    await this.listDateEnd.click();
    await this.listDateEnd.press('ControlOrMeta+A');
    await this.page.keyboard.type(end);
    await this.page.keyboard.press('Enter');
    await this.settle(2500, 'filtered list loads');
  }

  async listTotalCountValue() {
    return parseInt((await this.listTotalCount.first().innerText()).match(/\d+/)[0], 10);
  }

  /** Open the invoice and receive its full due (status → Paid). */
  async receiveFullPayment(billNo, paymentData) {
    await this.openInvoice(billNo);
    await this.payment.receiveFullPaymentOnOpenInvoice(paymentData);
  }
}

/** Status badge colour family from an "rgb(r, g, b)" string, by hue. */
function badgeFamily(rgb) {
  const m = String(rgb).match(/(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 'none';
  const [r, g, b] = m.slice(1).map((v) => Number(v) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.05) return 'grey';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 18 || h >= 330) return 'red';
  if (h < 37) return 'orange';
  if (h < 65) return 'yellow';
  if (h < 170) return 'green';
  return 'blue';
}

/** 'Month D, YYYY' for a Date (the picker format). */
function pickerDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** 'DD Mon, YYYY' for a Date (the Sales list date filter, e.g. "05 Oct, 2026"). */
function filterDate(d) {
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${String(d.getDate()).padStart(2, '0')} ${mon}, ${d.getFullYear()}`;
}

/** 'YYYY-MM-DD' for a Date (the list's Date column). */
function listDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

module.exports = { SalesInvoiceEditPage, badgeFamily, pickerDate, filterDate, listDate, addDays };
