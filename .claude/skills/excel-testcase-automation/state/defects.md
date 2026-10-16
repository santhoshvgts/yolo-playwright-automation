# App defects found by the automated sheets

One line per defect: test ID → what the app does (vs what the sheet expects). The failing test is
the evidence — keep it failing until the app is fixed. Append new rows at the end of the right section.

## Sales Invoice — edit flow (@si-edit-flow)
| Test | What the app does |
|---|---|
| TC-E14 | Line discount 12.557 is truncated to 12.55 (sheet: rounded to 12.56) |
| TC-E50 | Shipping 150.999 truncated to 150.99 (sheet: 151.00) |
| TC-E15 / E16 / E17 | Rate 0 accepted with no warning |
| TC-E40 | Switching adjustment Add → Subtract resets the amount to 0 |
| TC-E58 / E59 / E60 | No Round Off field |
| TC-E70 | Sales list has no Bill / Due footer totals |

## Sales Invoice — create (@si-create)
| Test | What the app does |
|---|---|
| TC-02 | "Change" customer clears the customer but opens no picker |
| TC-23 | Ref No accepts special characters |
| TC-46 | Blank quantity: save refused silently ("Quantity is required" never shown) |
| TC-66 | Overall discount 5.555 truncated to 5.55 (sheet: 5.56) |

## Sales Invoice — payment (@si-payment)
| Test | What the app does |
|---|---|
| TC-RP-04 | Record Payment popup shows no RCPT number before saving |
| TC-SC-01 / 09 | Fully paid invoice can be edited — no "adjust the payment first" warning (sheet contradicts TC-SC-10/11) |
| TC-SC-05 | Paid invoice can be set to ₹0 — no "payments exist" warning |

## Bulk payment — New Receipt (@si-bulk)
| Test | What the app does |
|---|---|
| TC-UI-08 | "Change" on the receipt opens no customer picker |
| TC-UI-36 | Additional Notes not saved with the receipt |
| TC-UI-27 | Fully paid invoice not listed in Due Invoices (sheet: listed with balance ₹0) |
| TC-BP-04 | Receipt above the total due accepted (excess → advance); sheet expects an error (contradicts TC-BP-18) |
| TC-IS-06 | Deleting a bulk receipt does not restore the invoices' due |

## Sales Order (@so)
| Test | What the app does |
|---|---|
| TC-SO-19 / TC-OE-22 | Delivery date before the order date accepted — no validation (create and edit) |
| TC-SO-39 | Rate 0 saved with no warning |
| TC-SO-40 | Empty rate saved with no "Rate is required" |
| TC-SO-56 | Saving an order neither reserves nor reduces stock (sheet expects reservation) |
| TC-SO-98 | No "Save As Draft" on the order form |
| CT TC-SO-08 | A converted sales order can be deleted |

## Credit Note (@cn)
| Test | What the app does |
|---|---|
| TC-CN-35 | Rate 0 on a credit note saved with no warning |
| TC-LCN-06 | CN qty above the linked invoice qty accepted |
| TC-LCN-08 / CT TC-CN-06 | CN total above the linked invoice total accepted (create and edit) |
| TC-LCN-16 | Item on a linked CN replaced by one not on the invoice — saved with no warning |

## Customer Create / Edit (@customer)
| Test | What the app does |
|---|---|
| TC-S1-09 / TC-S3-13 | Duplicate customer name accepted |
| TC-S1-17 | Business Category is mandatory (sheet: optional) |
| TC-S1-23 / 28 / TC-OB-02 / 14 | Opening balance type offers only "Debit" — no Credit |
| TC-OB-11 / 12 | Opening balance editable after partial / full payment |
| TC-S2-05 / 06 / 07 / TC-CE-12 | Phone not validated (5 digits, 12 digits, +91- accepted on create and edit) |
| TC-CE-21 / 22 / 23 | GST status cannot be edited after creation (no Edit) |
| TC-CE-26 / 27 | No Delete for a customer (only Inactive) |
| TC-S2-24 | Unticking "use billing as shipping" makes every shipping field mandatory — billing-only address cannot be saved |

## Payment & Credit Note (@pcf)
| Test | What the app does |
|---|---|
| PCF TC-PE-16 | Payment of a fully settled invoice can still be edited |
| PCF TC-CI-07 | Credit note for an item with zero stock accepted |
| PCF TC-DE-04 / 05 | Receipt date can be edited to a future date / before the invoice date |
| PCF TC-DE-06 | Invoice date can be edited after a partial payment |
| PCF TC-CC-11 / 17 | Credit note accepted against a fully paid invoice |
| PCF TC-CP-10 | Future-dated credit note can be applied to an earlier invoice |
| PCF TC-CC-22 | Linked credit note dated after the invoice's payment date accepted |

## Credit Note — more
| Test | What the app does |
|---|---|
| TC-LCN-22 | After unlinking, items can be added to the CN |
| TC-LCN-10 / 11 / CT TC-CN-07 | A linked credit note is not deleted after confirming Delete (no message); unlinked ones delete fine |

## Purchase Invoice (@pi)
| Test | What the app does |
|---|---|
| PI_UI_005 | No select-all checkbox in the list header |
| PI_PAG_009 | A new search keeps the current page (page 2) instead of resetting to page 1 |
| PI_NEG_015 / PI_VAL_002 | Bill saved with an empty Bill Date |
| PI_BND_007 / 008 | Changing the bill date empties Due Date → save refused "Due Date is Required" until the term is picked again (tests re-pick it) |
| PI_FUNC_005 / PI_E2E_004 | A draft bill opened for edit only offers "Save" — it stays Draft (no Save and Send) |
| PI_SF_001 (trim) | Search does not trim leading / trailing spaces |
| PI_POS_017 / PI_UI_003 | An overdue bill's status badge is green (should be red) |
| PO_FUNC_001 | Purchase Order list has no separate "Store Status" column |
| PO_UI_009 / PO_BL_011 / PO_BND_014 | Purchase Order form has no TDS / TCS row |
| PO_POS_010 | No Round Off in the order pricing summary |
| PO_NEG_015 | Order saved with an empty PO Date |
| PO_BL_018 | A converted order still offers "Convert To Invoice" |
| PO_POS_011 | Reference No is not shown in the order view |
| PO_SF_001 (trim) | Search does not trim spaces |
| PO_FUNC_008 (converted) | Convert To Invoice opens the invoice with an empty Due Date ("Due Date is Required") — POM fills it |

## Vendor (@vendor)
| Test | What the app does |
|---|---|
| VND_FUNC_002 / E2E_012 | A ₹0 advance is still shown as a clickable (blue) link |
| VND_FUNC_016 / 011 / E2E_005 | Edit Address on the vendor profile is not saved (old billing address stays) |
| VND_NEG_018 | Duplicate vendor name accepted |

## Other observations (environment)
- Other users work in the same org: a new document's number is provisional and is silently renumbered if someone saves first (handled by confirmSavedNumber).
- Two parallel runs with the same user log each other out (seen as org-select / sign-in failures) — run one at a time.
- Clearing or changing Invoice No on a saved credit note silently removes all its lines.

## Other observations (no failing test)
- A saved invoice reopens with its lines in a different order (added item first).
- Choosing a GST rate on a line resets that line's rate to the item price.
- Edit form keeps its last line — no message explains it.
- A customer without a billing address (Test Customer): invoice save refused silently.
- Invoice with a payment cannot be cancelled (no reason box, no message).

## Payment Made (tests/purchase/04_PaymentMade.spec.js, @pm)

| Case | What the app does |
|---|---|
| PAY_FUNC_013 / NEG_010 | Deleting a payment that cleared a bill does not restore the bill's due (stays ₹0 / Paid) |
| PAY_POS_017 / PAG_010 | List footer shows only "Total Count", no total amount |
| PAY_UI_002 | Mode of Payment is plain text, not a coloured badge |
| PAY_NEG_006 / UI_012 | Bill payment above the paid amount: save blocked silently, no error message |
| PAY_SF_001 (trim) | Search does not trim spaces ("  New Vendor 1  " finds nothing) |
| PAY_PAG_001 / 008 | A new search keeps the current page (stays on page 2) |
| PAY_FUNC_010 / EXP_001 | Print in the payment view does nothing (no preview, dialog or PDF) |
| PAY_BL_013 / E2E_010 | Make Payment from the bill creates no entry in the Payment Made list |
| PAY_POS_009 / EXP_008 | Reference No is not saved (edit form reopens empty) |

## Expense (@expense)
| Test | What the app does |
|---|---|
| EXP_FUNC_007 / 018 / EXP_POS_001 / 010 / 014 / EXP_BL_006 / 007 | Expense view shows no journal entries (no Journal section) |
| EXP_NEG_013 | Expense dated a year ahead saved silently |
| EXP_POS_009 / EXP_BL_013 | Expense linked to a customer still shows "Non-Billable" |
| EXP_FUNC_014 | Print in the expense view does nothing |
| EXP_FUNC_012 | Row delete icon does not remove the row (Total Rows unchanged) |
| EXP_FUNC_005 / EXP_VAL_016 | Draft: Reference No not kept when reopened |
| EXP_FUNC_009 / EXP_E2E_013 | Changing Paid Through on edit is not saved (stays Petty Cash) |
| EXP_SF_004 / EXP_PAG_010 | List is not sorted newest date first |

## Payment / Vendor / Inventory additions
| VND_NEG_018 | Second vendor with an existing name accepted ("Vendor created successfully") |
| INV_NEG_014 | Second item with an existing name accepted |
| INV_NEG_003 | 7-digit HSN accepted |
| INV_PAG_005 | A new search keeps the current page |
| INV_FUNC_016 | Service list shows Tax Rate "-" for a GST18 service |

## Cheque Tracker (@cheque)
| Test | What the app does |
|---|---|
| CT TC-CIH-05 / TC-RET-02 | Moving a cheque to Returned charges no late fee ("-") — so no Collect Amount (RET-03/04 blocked) |
| CT TC-CIH-07 / TC-MT-05 / 07 | A cheque dated 10 days ahead can be moved to Deposited |
| CT TC-CLR-04 / TC-INT-04 | Revert on a cleared cheque does not bring it back to Cheque In Hand |
| CT TC-RET-11 / TC-EC-04 | No Delete in a returned cheque's ⋮ menu (only Upload Attachment / Move To) |

## Price List / Offers
| PL_NEG_002 / 016 | 0 % and 1500 % custom rates accepted |
| PL_VAL_015 / OFR_NEG_008 | Duplicate price-list / scheme names accepted |
| PL_FUNC_004 / PL_NEG_004 | Profile-wise price list saved without any profile |
| PL_FUNC_018 / OFR_FUNC_025 | No "+ Assign" (distributors) in the view |
| PL_PAG_002 | A new search keeps the current page |

## Manual Journal (@mj)
| Test | What the app does |
|---|---|
| MJ TC-WF-01 / 05 / 11 | Editing a draft journal and pressing Save keeps it Draft (never published) |
| MJ TC-WF-02 | An unbalanced journal cannot be saved as Draft (Save as Draft disabled) |
| MJ TC-WF-12 | Print in the journal view does nothing |
| MJ TC-INT-01 … 06 | No late fee is charged on a returned cheque, so no late-fee journal can be created |
