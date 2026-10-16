# YOLO invoice app — facts for automation (test org "Automation Testing Org PVT")

Learned while automating the Sales Invoice stock (TC01–TC29) and edit-flow (TC-E01–E74) sheets.
Trust these; re-probe only what is missing. Append new findings at the end of the right section.

## Where things live

| Need | Use |
|---|---|
| Item with any base UOM / conversions | `ItemPage.createItemWithUoms({ name, baseUnit, price, alternates:[{unit,qty}] })` |
| Exact opening stock | `StockAdjustmentPage.adjustStock([{ itemName, qty }], { billDate, reopen:false })` |
| Item + stock in one go | `SalesInvoiceStockPage.setupItem(s)` (returns `{ itemName, baseUnit, price, conversions, openingStock }`) |
| Shared priced items (edit flow) | `SalesInvoiceEditPage.ensurePricedItems(E.items())` — cached in Rundata `siEditFlowItems` |
| Inventory stock (base units) | `readStock(item)` / `expectStock(item, n)` (polls) |
| Invoice lines / save / list / preview | `SalesInvoiceStockPage`: startInvoice, addLine(s), setLine, removeLine, save, saveExpectRefused, saveAsDraft, discardForm, openInvoice, editInvoice, cancelInvoice, deleteInvoice, invoiceStatus, readJournal, verifyJournal |
| Pricing, tax, dates, dashboard | `SalesInvoiceEditPage`: setLineRate/Discount/Gst/Cess, readLine, setTaxMode, setDueTerm/DueDate, setSummaryDiscount, setShipping, setTds/removeTds, setAdjustment, readSummary, computeTotals, expectTotals, createPricedInvoice, alignToForm, listRow, readAllListPages, setListDateRange, receiveFullPayment |
| Full payment on an open invoice | `CustomerPaymentPage.receiveFullPaymentOnOpenInvoice(generateCustomerPaymentData())` |
| Existing Sales_Unit coverage | discounts/shipping/TDS/adjustment create+edit, list Bill=Due≈total, customer balances, journal balanced |

## Sales invoice form (new: /sales/sales-bill/add/…, edit: …/add/11/info/<id>)

- Header: `#new_si_bill_no` (read-only, auto), `#bill_date` / `#due_date` (type `Month D, YYYY` + Enter),
  `#new_si_due_term` (custom | 7 | 15 | 30 | 60 days; bill date change recalculates due async → wait with `toHaveValue`),
  `#place_of_supply`, `#select_gst_type` (`Excluding Tax` | `Including Tax `), "Change" button = change customer.
- Lines: ids NOT stable (new 1/3/5…, edit 0/1/2…, edit-added rows jump) → address rows by position
  among `tr:has(input[id^=quantity])` minus the blank "Add item by entering" row.
  Per row: `rate*`, `quantity*`, `unit*` (select), `discount*` + segmented `%`/`₹`, `tax*` (GST5/12/18/28/0),
  `cess*` (CESS0/1/2/4/5/10; none = placeholder "Cess"), amount = last td, remove = `button[id^=item_close_]`.
- New form always has a blank auto-complete row; **edit form needs "Add Row"** first.
- Single-unit item → UOM dropdown offers only its base unit.
- Summary: `#sub_value`, `#discount_type` (Percentage|Amount) → `#discount_percentage` / `#discount_price`,
  `#tax_value`, `#shipping_cost`, TDS row = [TDS|TCS] + section select (rc_select ids shift → anchor on
  `#tax_source`), `#select_addjustment` (Subtract|Addition) + `#adjustment`, total `#sales_total` (div).
- TDS sections: Dividend 10%, Dividend(Reduced) 7.5%, Commission or Bokerage 5%, Payment of contractors for Others 2%.
  Text "TDS of n% is applied". Remove via `.ant-select-clear` on hover. No TDS amount field.
- No Round Off field. No "none" GST/CESS option (use GST0/CESS0).
- Buttons: new form "Save As Draft" / "Save and Send"; edit form "Save"; draft edit "Save" keeps Draft.

### Totals formula (verified)
```
net_i     = rate×qty − disc (% of rate×qty, or ₹)
taxable_i = net_i (Excluding)  |  net_i ÷ (1+GST%+CESS%) (Including)
base = Σ taxable_i ; sd = % of base | ₹ ; tax = Σ taxable_i×(1−sd/base)×(GST%+CESS%)
TDS = section% × (base − sd) ; total = base − sd + tax + shipping − TDS ± adjustment
```

### Input / validation behaviour
- Typing filters: "-" stripped (rate, shipping), >2 decimals truncated (12.557→12.55, 150.999→150.99),
  line % discount >100 rejected (→0), summary % >100 clamped to 100, qty no max/length check.
- Over-stock save → toast `Please check the <item>` + red `<n> <uom> left` hint (hint renders ~1s late).
- Negative total save → `Total amount doesn't have negative value`.
- Due date typed before bill date → cleared → `Due Date is Required`.
- Rate 0: accepted, no warning. Saving with all items removed: impossible — **edit form keeps last line**.
- Success toasts also use `.ant-message-notice` → filter `hasNotText: /success/i`.

### Behaviour that breaks naive tests
- **Reopened invoice lists lines in a different order** (added item first) → `alignToForm(model)`, match by item name.
- **Picking GST/CESS re-prices the line to the item rate** → set GST/CESS before rate/discount.
- Removing rows quickly: wait for row count to drop after each ×.
- After item save the app may redirect to Sales → retry Inventory click until "Stock" tab shows.
- Switching adjustment type resets its amount to 0 (app defect TC-E40).

### Create-form facts (Sales_Invoice_Test_Cases batch)
- Customer step: Next (`.ant-form > .ant-btn`) is **disabled** until a customer is picked (no message).
  Customers in org: `New customer 1` (Chennai), `Rajesh kumar`, `saravana store`, `Test Customer`.
- Invoice header shows customer name, city, "Already N Unpaid Bill", BILLING ADDRESS. "Change" clears the
  customer (header blank, "Add Address" button `#new_si_cus_add_address`) and shows no picker.
- Bill date defaults to today, due term 7 days. Sales Person `#sales_person`: no options (no master data).
- Ref No `#new_si_reference_number`: accepts any chars (no maxlength / validation).
- Place of supply list = Indian states; Tamil Nadu = seller state. Other state (e.g. Kerala) → tax amount
  unchanged, split only visible in the Journal after save (Output IGST vs CGST/SGST).
- Item search: partial text lists matches; no match → no dropdown at all.
- Save buttons are **disabled** with no items. Blank or 0 qty: save refused silently (stays on form, no message).
- ₹ line discount larger than the line amount → rejected (value 0).
- Warehouse: only `Default`. Price lists: `#select_price_list` shows one list; no customer-specific lists configured.
- The org is shared — other users create invoices too; avoid assertions on global counts where possible.

## Payments (Sales_Invoice_Payment batch)

- Invoice preview → "Receive Payment" → modal "Record Payment": Bill Amount, Due Amount, Pending Cheque,
  "Bill No:" (EMPTY until saved), `#date` (`15 Oct 2026` = DD Mon YYYY, defaults today), `#account`
  (Cash, Undeposited Funds, Petty Cash, Bank, …), `#receiveAmount`, `#paymentMode` (Cash | Cheque |
  Bank Transfer | Undeposited fund | UPI; default Cash), "Pay full amount" checkbox, `#Notes`, Save Receipt / Cancel.
  Cheque mode adds `#cheque_no` (required; digits only — letters stripped) and `#cheque_date`;
  UPI adds required textbox "Transaction Id", Bank Transfer "Transfer Id" (message "Transaction Id is Required").
- Validation: blank → "Account is Required", "Receiveamount is Required"; 0 → "Please give valid amount";
  amount > due is capped to the due; "-" refused.
- Saved payment → preview table `Date | Payment# (RCPT-AUTO/NNNN) | Payment Mode | Amount | Actions(delete icon)`.
  Cheque payment leaves Due unchanged (pending cheque) until cleared (Cheque Tracker).
- Payment Received tab (`/sales/?sales=2`): columns Date, Bill No (RCPT), Customer, Mode, Received, Excess;
  search `#search_sales_bill`. Detail drawer: Close, Print, Edit, Delete; shows Pending Cheque, invoices paid,
  journal (Petty Cash Dr / Cheque in Hand Cr …).
- Receipt edit = bulk "New Receipt" form `/sales-payment/sales-payment-bill/edit/11/info/<id>`: `#bill_no` ro,
  `#date`, `#receiveAmount`, `#paymentmode` (select), `#cheque_no`, `#cheque_date`, `#account`, `#reference_number`,
  Due Invoices table with a payment input per invoice. Bulk flow automated in CustomerPayment_Unit TC01–03.
- Deleting an invoice with payments → "Payments or Credits or Debit Notes have been applied … delete all the
  associated payments … proceed?" (CustomerPaymentPage.paymentLinkedDeleteMsg) → Yes → preview shows
  "You must delete all the associated payments" + payments table; remove them (`_unlinkAllPayments`), then delete.
- Unlinking / deleting a payment → its amount becomes customer **advance**.
- An invoice with a payment **cannot be cancelled** (Cancel → Yes opens no reason box).
- A fully paid invoice **can** be edited (qty up → due again; qty down → stays Paid, overpaid → advance) and set to ₹0, no warning.
- Receipt edit: changing Received Amount pops "Would you like this amount to be reflected in the Payment field?"
  (tooltip, OK) — OK applies it to the invoice row; don't also type the row amount (used > received blocks save silently).
- Receipt save can take 20–60 s (button "loading Save Receipt").
- The Record Payment popup is a **drawer** (`.ant-drawer-content` with "Record Payment"), not a modal.
- Account dropdown is long/lazy → type the account name before picking.
- **New Receipt (bulk)**: Payment Received tab → "New Payment Received " → customer → Next →
  `/sales-payment/sales-payment-bill/add/10/info`. Header: customer + Change, "Due amount", "Pending Cheque".
  `#bill_no` RCPT ro, `#date` (Month D, YYYY), `#receiveAmount`, `#paymentmode` (NO default, required:
  "Paymentmode is Required"), "Received Full Amount" checkbox, `#account` (default Petty Cash),
  `#reference_number`, `#notes`, Due Invoices table (S.No, Bill Date, Description #SINV…, Amount, Balance,
  Payment input), summary `#amount_paid` / `#full_amount` (used) / `#excess_amount` — amounts are in the
  PLACEHOLDER ("₹ 500.75"), the input value is empty.
  Blank → "Received Amount is required"; 0 accepted silently; "-" stripped; letters → empty.
- Receipt Additional Notes is NOT saved (reopens empty). Paid invoices are NOT listed in Due Invoices.
  A receipt above the total due is accepted (excess → advance). Deleting a bulk receipt does NOT restore the
  invoices' due (app defects TC-UI-36 / UI-27 / BP-04 / IS-06).
- `Test Customer` has NO billing address: invoices for it cannot be saved (silent; "Add Address" shown) — do not use it.
  Bulk tests use `saravana store`. (Old note:
  invoice Place of Supply is empty and the save is refused silently → set Place of Supply (Tamil Nadu) first.

## Customer transaction page (Customer_Transaction batch)

- Sales → "Customer" (`//span[text()="Customer"]`) → customer name → `/sales/customer/<id>?status=1`
  (wait for `/client/client-info/` response). Header: `Due: ₹ x`, `Advance: ₹ x`, `Closing Balance: ₹ x`,
  `Pending Cheque: ₹ x`; buttons View Details, Export.
- Tabs: Transaction Statement | Sales Invoice | Sales Order | Payment Report | Credit Notes | Delivery Note.
  Statement columns: Date (`15 October, 2026`), Transaction No, Transaction Detail (Opening Balance /
  Generated Invoice / Payment Made …), Amount, Payment, Balance Due (running); 20 rows / page, oldest first.
  Sales Invoice tab: Date, Bill No, Status, Bill Amount, Due Amount. Payment Report: Date, RCPT, Mode, Received, Excess.
- Clicking a Transaction No opens that invoice's preview drawer. View Details → `/sales/customer/<id>/org-info`
  ("Customer Details", Basic Info …).
- `saravana store` has an opening balance (₹4,485) and many test invoices — compare balances before/after.

## Sales Order (Sales_Order batch)

- Sales → tab "Sales Order" (`/sales?sales=3`) → "New Sales Order" → customer → Next →
  `/sales-order/sales-order-bill/add/13/info`. SAME form component as the Sales Invoice (same ids:
  `#new_si_bill_no` = `SO-AUTO/NNNN` ro, `#bill_date`, `#new_si_due_term` = Payment Term, lines, summary,
  `#sales_total`; NOTE Ref No ALSO has id `new_si_bill_no` → use `.first()` for SO No) plus `#transport_mode` (Road / Rail / Air / Ship, required: "Please Select Mode Of
  Transport"), `#delivery_date` (optional), `#expected_delivery_date` (defaults today), `#reference_date`.
- Only "Save and Send" — NO Save As Draft. Save → `/sales/?sales=3`. List: Order Date, Order No,
  Customer Name, Sales Person, Status (Pending / Converted), Bill Amount.
- Preview: Close, Print, Edit, Delete (plain button → "Are you sure you want to delete the order ?" Yes/No),
  Convert To Invoice → SI form `/sales/sales-bill/add/13/info?so=<order id>` prefilled (Ref No = SO no, same lines);
  after saving it the order shows "Converted" and can STILL be deleted.

## Credit Note (Credit_Note batch) — POM pages/sales/CreditNotePage.js (extends SalesOrderPage)
- Sales → tab "Credit Notes" (/sales?sales=4), button "New Credit Notes" → same customer step → form /credit-notes/credit-notes-bill/add/13/info (edit: …/info/<id>).
- Same form component: `#new_si_bill_no` CN-AUTO/NNNN (.first(); .nth(1) = Ref No), `#bill_date`, `#invoice` (Invoice No, optional; options = this customer's invoices), `#notes` = Reason, `#warehouse` Default, `#place_of_supply`, `#sales_person`.
- Buttons: Cancel / Save As Draft / Save and Send (`#new_si_save_and_send`, disabled with no items); edit form has "Save". Toast "Credit note created successfully".
- Linking an invoice copies NO lines. No qty-vs-invoice validation seen (qty 5 vs invoiced 1 saved).
- On save a linked CN is auto-applied to that invoice up to its due; rest = Remaining Amount. List cols: Credit Date, Credit No, Customer, Invoice, Status (Open), Credit Amount, Remaining Amount.
- Preview buttons: Close, Print, Edit, Delete, Apply to Invoices; collapse "Invoices Credited" (getByRole button 'Edit' also matches it — use exact).
- Clearing OR changing Invoice No on a saved CN (edit) removes ALL its lines and disables Save — re-add lines.
- Linked CN preview has a second small "delete" button (credited invoice) — use exact 'Delete'.
- Apply to Invoices = modal "Apply Excess Amount to Invoice": rows (S.No, Bill Date, Description=invoice no, Amount, Balance, Amount Used input), 5 per page, sorted by date asc; footer inputs "Amount used for Payments" / "Remaining Amount"; Cancel / Save. Escape does NOT close it — click Cancel.

## Customer (Customer_Create_Edit batch) — POM pages/sales/CustomerPage.js
- Sales → Customer → button "Customer" → "Business Customer": ONE form (#name, business_type / business_category (required!) / business_tags selects, opening_balance_type (only "Debit") + #opening_balance, #country display, #phone (no validation), #email, registration_type + #gst_num), Add Address panel (#billing_address1/2, #billing_city, billing_state select, #billing_pincode, "Use Billing address as your Shipping Address" ticked), Save → "Customer created successfully". The address panel covers Close — click its Back first.
- Details: customer page → View Details → /customer/<id>/org-info: per-field Edit (DISPLAY NAME, EMAIL, PHONE NUMBER, BUSINESS TYPE / CATEGORY = clickable radio rows, BUSINESS TAG select #business_tag, PAN, OPENING BALANCE) opening a role=dialog with Back / Save; Edit Address; Inactive (hides the customer from the list, no prompt). No GST status edit, no Delete. GST STATUS shows the GSTIN for registered customers.
- Duplicate customer names are accepted. New customer list dropdown in documents only loads 10 → pickCustomer types to search. CN "Change" uses its own "Select Customer" picker.
- Receipt edit form date (#date) uses the picker format 'Month D, YYYY' (the Record Payment drawer uses 'DD Mon YYYY').

## Inventory / item

- Item drawer: no opening-stock field. Alt UOM rows `#unit_array_<i>_alter_unit|_quantity|_price`
  (first via "Add Alternate UOM's", then "Add UOM"); row can drop its qty on re-render → fill until it sticks.
  UOM master: box, bundle, mm, ml, mg, inch, bag, Nos, cm, m (no `box2`).
- Products list stock cell: `"<n> <baseUom> Left"` or `Out of stocks`.
- Stock Adjustment: Inventory → Stock → Stock Adjustment → "Adjustment"; warehouse `Default`,
  reason `Stock Adjustment`; signed qty in base units (decimals ok); more items via "Add Item";
  toast `Adjustment Created Successfully`; `Bill Date` textbox for back-dating.

## Sales list (dashboard)

- `#search_sales_bill` (bill no / name); find a row by exact Bill No cell, never by position.
- Columns: [_, Date YYYY-MM-DD, Bill No, Customer, Status, Bill Amount "₹ 1,180", Due Amount].
- Status: `N days due`, `N days overdue`, `Draft`, `Paid`. Badge = colored div inside the (white) td:
  Paid green rgb(190,233,186), Draft yellow (252,223,161), due orange (247,200,163), overdue red (253,195,187).
- Date filter `#date_filter_sales_bill` + "End date": type `DD Mon, YYYY` (e.g. `05 Oct, 2026`) + Enter.
- Pagination 20/page, `li.ant-pagination-next`; "Total Count: N"; no footer amount totals.
- Preview: Edit, Cancel (→ Yes, `#comments`, Save, Close), Receive Payment; Delete under `svg.ant-dropdown-trigger`
  (cancelled invoice: plain Delete), confirm "Yes", toast `Successfully deleted`. Draft preview: no Journal.
- Journal rows `.ant-collapse-content-active tbody tr` → Accounts Receivable Dr, Output CGST/SGST Cr, Sales Cr,
  Cost of Goods Sold Dr, Inventory Asset Cr.

## Running

```bash
S=<scratchpad>
npx playwright test <spec> --grep "<regex> " --reporter=list > "$S/run.log" 2>&1; echo "EXIT $?" >> "$S/run.log"   # run_in_background
# Monitor (failures only):
tail -n +1 -f "$S/run.log" | grep -E --line-buffered "^\s+x\s+[0-9]+ |passed|failed|EXIT"
```
- Trailing space in `--grep "TC05 "` avoids prefix matches. `--list | tail -1` to count.
- One worker. Code edits made DURING a run are NOT picked up (workers keep the old modules) → stop the run
  (TaskStop + kill node workers) and start again after fixing.
- ~1 min per test; item creation ~30 s each.

- Other users work in the same org: the bill no shown on a new form is provisional — if someone saves first, ours is silently renumbered. `createPricedInvoice` / `createCreditNote` call `confirmSavedNumber` (list row must match customer + amount). Never trust the pre-save number elsewhere.
- NEVER run two Playwright runs at once: every run logs in with the same user and the logins kick each other out (page lands on accounts…/signin, shows up as "org-select button not found" / random timeouts). One run at a time; probes (scratch specs) only between runs. Use `--output=test-results/<name>` per run anyway.
- Customer-specific API: CN Invoice No options come from `bills/invoice-list/<clientId>/?search=` (server-side search, open invoices only).

- Run queue: `bash .claude/skills/excel-testcase-automation/scripts/queue.sh "$SCRATCH"` (background). Append lines `name;;grep;;spec` to `$SCRATCH/queue.txt`; it runs them one at a time (waits for any other `cli.js test` run and for the app to answer 200), log per run `$SCRATCH/<name>.log`, events in `$SCRATCH/queue.log`. Probes (scratch specs under tests/_explore) go through the queue too.
- A network / DNS drop shows as `net::ERR_NAME_NOT_RESOLVED` and fails every test in < 1 s — re-run, don't triage.

## Housekeeping (stuck runs = 0-byte log)

- `TaskStop` does not kill node children. Kill leftovers:
  `Get-CimInstance Win32_Process -Filter "name='node.exe'" | ? { $_.CommandLine -match 'workerProcessEntry|02_Sales' -and $_.CommandLine -match 'yolo-playwright' } | % { Stop-Process -Id $_.ProcessId -Force }`
  (only when no wanted run is active).
- MCP seed: after exploring, `browser_close`, delete `tests/_explore`, kill the paused worker.

### Seed template (tests/_explore/seed.spec.js)
```js
const { test } = require('../../fixtures/base-test');
const { LoginPage } = require('../../pages/common/LoginPage');
test('seed', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  const login = new LoginPage(page);
  await login.openApp('invoice');
  await login.selectOrg();
});
```
Exploration item with stock: `ZZ Explore SI my9d` (pcs, box 61, bundle 625). MCP file writes only allowed inside the repo.

## Purchase side (Payment Made / Vendor / Expense) — see the POM headers for ids
- Payment Made `/purchase?purchase=2` = PaymentMadePage (same component as the sales bulk receipt; Save Payment;
  Pay Full checkbox is NOT inside a label; journal split over several DEBIT tables; notes ≤ 250 chars).
- Vendor `/purchase/vendor/<id>` = VendorPage (extends CustomerPage; "Vendor" → Business Vendor; details
  `/vendor/<id>/info` or `/org-info`; vendor list loads lazily — a vendor may be absent until searched).
- Expense `/purchase?purchase=5` = ExpensePage. Tax is DISABLED for GST Treatment "Unregistered Business" —
  taxed rows need "Registered Business" + GSTIN and every row then needs a tax (GST0 for none). List dates MM/DD/YYYY.
  Row ids differ between new (amount_row-<n>) and edit forms — locate rows by `input[placeholder="0"]`.
- Purchase helpers: never override `_searchList` in a subclass of PurchaseInvoiceFlowPage — bill flows use it.
  Past bill dates / converted orders can open with an empty Due Date → PurchaseInvoiceFlowPage._ensureDueDate().

## Inventory (Products / Pricing / Offers) and Finance
- Products `/inventory?tab=2&productTab=N` = InventoryPage: ONE drawer form (no wizard, no opening stock).
- Pricing `/inventory?tab=4` = PricingPage; form is a FULL PAGE without the app menu (go back by URL). Status text
  "Active" / "Not Active". A General list changes EVERY sales invoice rate → deactivate in afterEach;
  `tests/_explore/plclean.spec.js` deactivates any active "ZZ PL" list (ofclean.spec.js: "ZZ OF" offers).
- Offers `/inventory?tab=5` = OffersPage (full-page form `/inventory/offers-list`, ids items_<s>_…).
- Cheque Tracker `/finance/cheque-tracker` = ChequeTrackerPage; Manual Journal `/finance/manual-journal` = ManualJournalPage.
- Field Force (fieldforce.test.vgts.xyz) is NOT set up for the test org (feature onboarding) → Van Sales load sheets
  cannot run; only warehouse "Default" exists.
