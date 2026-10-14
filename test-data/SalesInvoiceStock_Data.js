const { faker } = require('@faker-js/faker');

/**
 * Sales Invoice stock / UOM scenarios (tests/sales/02_SalesInvoiceStock.spec.js).
 * Numbers come straight from the manual test cases; where a case's numbers cannot work
 * as written, the note on that block says what was changed.
 *
 * Stock is in the item's base unit. `alternates` are { unit, qty } = base units per unit.
 */

/** Unique item name per run, e.g. "TC01 Kx7Pq2". */
const itemName = (tag) => `TC${tag} ${faker.string.alphanumeric(6)}`;

/** pcs base + box / bundle alternates. */
const pcsItem = (tag, { box, bundle, stock, price = '10' } = {}) => ({
  name: itemName(tag),
  baseUnit: 'pcs',
  price,
  stock,
  alternates: [
    ...(box ? [{ unit: 'box', qty: box }] : []),
    ...(bundle ? [{ unit: 'bundle', qty: bundle }] : []),
  ],
});

// The manual case for TC27 uses a 4th UOM "box2". The test org has no such UOM, so a
// UOM that exists there stands in for it — set SI_BOX2_UOM once "box2" is created.
const BOX2_UOM = process.env.SI_BOX2_UOM || 'bag';

const SalesInvoiceStockData = {
  cancelComments: 'Cancelled by automation',

  // TC01 — 61 pcs = 1 box, 625 pcs = 1 bundle, stock 4000
  uomConversion: {
    item: () => pcsItem('01', { box: 61, bundle: 625, stock: 4000 }),
    exceeding: { pcs: 2000, box: 4, bundle: 20 },   // 14744 pcs > 4000 → refused
    allowed:   { pcs: 1000, box: 5, bundle: 2 },    // 2555 pcs → 1445 left
  },

  // TC02 / TC03 — stock 2000, 61 pcs = 1 box
  decimalBoxToZero: { item: () => pcsItem('02', { box: 61, bundle: 625, stock: 2000 }), box: 32.79 },
  decimalBoxRemainder: { item: () => pcsItem('03', { box: 61, bundle: 625, stock: 2000 }), box: 30, expectedBoxesLeft: 2.79 },

  // TC04 — stock 500.99 pcs, 600 pcs = 1 bundle, 1 bundle refused
  bundleOverDecimalStock: { item: () => pcsItem('04', { box: 61, bundle: 600, stock: 500.99 }), bundle: 1 },

  // TC05 — stock 3500, 3501 pcs refused
  maxQty: { item: () => pcsItem('05', { box: 61, bundle: 625, stock: 3500 }), over: 3501, max: 3500 },

  // TC06 — many items, one invoice, decimal qty cycling pcs / box / bundle
  multiItemDecimal: {
    count: Number(process.env.SI_MULTI_ITEM_COUNT || 20),
    item: (i) => pcsItem(`06-${i + 1}`, { box: 10, bundle: 50, stock: 1000 }),
    quantities: [{ qty: 20.78, uom: 'pcs' }, { qty: 1.9, uom: 'box' }, { qty: 0.9, uom: 'bundle' }],
  },

  // TC07 — stock 15000, several invoices totalling 14500 → 500 left
  multiInvoiceSingleItem: { item: () => pcsItem('07', { box: 61, bundle: 625, stock: 15000 }), invoices: [5000, 4000, 3000, 2000, 500] },

  // TC08 — stock 20000, one invoice with many lines. The case gives no conversions; with
  // 10 pcs/box and 50 pcs/bundle the lines total 12540.8 pcs (fits the stock) → 7459.2 left.
  multiLineSingleItem: {
    item: () => pcsItem('08', { box: 10, bundle: 50, stock: 20000 }),
    lines: [
      { qty: 67, uom: 'box' }, { qty: 78.9, uom: 'box' }, { qty: 90, uom: 'box' }, { qty: 89, uom: 'box' },
      { qty: 90, uom: 'pcs' }, { qty: 67.9, uom: 'pcs' }, { qty: 89.9, uom: 'pcs' },
      { qty: 89.99, uom: 'bundle' }, { qty: 90.89, uom: 'bundle' },
    ],
  },

  // TC09 — 10 items, 50000 pcs in total, three invoices (pcs / box / bundle), 62 pcs = 1 box,
  // 702 pcs = 1 bundle. The case's totals (3500 box = 217000 pcs, 5000 bundle = 3510000 pcs)
  // exceed the 50000 stock, so per item: 1000 pcs + 35 box + 2 bundle = 4574 of 5000 → 426 left,
  // i.e. 10000 pcs, 350 box, 20 bundle sold in total and 4260 pcs left across the 10 items.
  multiItemMultiInvoice: {
    count: 10,
    item: (i) => pcsItem(`09-${i + 1}`, { box: 62, bundle: 702, stock: 5000 }),
    perItem: [{ qty: 1000, uom: 'pcs' }, { qty: 35, uom: 'box' }, { qty: 2, uom: 'bundle' }],
  },

  // TC10 — single-unit items: only their own unit can be picked
  singleUnit: [
    { spec: () => ({ name: itemName('10-pcs'), baseUnit: 'pcs', price: '10', alternates: [] }), forbidden: 'box' },
    { spec: () => ({ name: itemName('10-box'), baseUnit: 'box', price: '10', alternates: [] }), forbidden: 'bundle' },
    { spec: () => ({ name: itemName('10-bundle'), baseUnit: 'bundle', price: '10', alternates: [] }), forbidden: 'pcs' },
  ],

  // TC11 / TC12 — journal
  journalMultiItem: {
    items: () => [
      pcsItem('11-a', { box: 12, bundle: 60, stock: 1000, price: '10' }),
      pcsItem('11-b', { box: 12, bundle: 60, stock: 1000, price: '25' }),
      pcsItem('11-c', { box: 12, bundle: 60, stock: 1000, price: '40' }),
    ],
    lines: [{ item: 0, qty: 15.5, uom: 'pcs' }, { item: 1, qty: 3, uom: 'box' }, { item: 2, qty: 1.25, uom: 'bundle' }],
  },
  journalSingleItem: { item: () => pcsItem('12', { box: 12, bundle: 60, stock: 1000, price: '15' }), lines: [{ qty: 7.5, uom: 'pcs' }, { qty: 2, uom: 'box' }] },

  // TC13 — stock 3000 → SI 3000 → 0 → edit to 1500 → 1500
  editRound: { item: () => pcsItem('13', { box: 61, bundle: 625, stock: 3000 }), create: 3000, edit: 1500 },
  // TC14 — round → decimal
  editRoundToDecimal: { item: () => pcsItem('14', { box: 61, bundle: 625, stock: 1000 }), create: 553, edit: 234.67 },
  // TC15 — decimal → round
  editDecimalToRound: { item: () => pcsItem('15', { box: 61, bundle: 625, stock: 100 }), create: 42.99, edit: 31 },
  // TC16 — stock 100, created at the first qty, then edited to each of the rest
  editManyTimes: { item: () => pcsItem('16', { box: 61, bundle: 625, stock: 100 }), quantities: [20.89, 10, 2, 5, 40, 0.87, 1.99, 3.78, 50, 99, 100] },
  // TC17 — stock 5000, created with pcs, edited to 1000 pcs + 2 box + 2 bundle
  editToMixedUom: {
    item: () => pcsItem('17', { box: 61, bundle: 625, stock: 5000 }),
    create: 1000,
    edit: [{ qty: 1000, uom: 'pcs' }, { qty: 2, uom: 'box' }, { qty: 2, uom: 'bundle' }],
  },
  // TC18 — stock 2100, edit to 1000 + 1000 + 200 pcs refused
  editExceeding: { item: () => pcsItem('18', { box: 61, bundle: 625, stock: 2100 }), create: 100, edit: [1000, 1000, 200] },
  // TC19 — single-unit pcs item with 200 pcs fully sold, edited to several items in mixed UOMs
  editAddItems: {
    single: () => ({ name: itemName('19-pcs'), baseUnit: 'pcs', price: '10', alternates: [], stock: 200 }),
    other: () => pcsItem('19-mix', { box: 10, bundle: 50, stock: 1000 }),
    create: 200,
    // single item: line 1 changed to 25, plus a 23 pcs line; other item: 32 box, 6.9 bundle, 89.9 pcs
    singleLines: [25, 23],
    otherLines: [{ qty: 32, uom: 'box' }, { qty: 6.9, uom: 'bundle' }, { qty: 89.9, uom: 'pcs' }],
  },
  // TC20 — journal before / after adding items in edit
  journalAfterEdit: {
    items: () => [
      pcsItem('20-a', { box: 12, bundle: 60, stock: 1000, price: '10' }),
      pcsItem('20-b', { box: 12, bundle: 60, stock: 1000, price: '30' }),
    ],
    create: [{ item: 0, qty: 10, uom: 'pcs' }],
    added: [{ item: 0, qty: 1, uom: 'box' }, { item: 1, qty: 4.5, uom: 'pcs' }, { item: 1, qty: 0.5, uom: 'bundle' }],
  },
  // TC21 — draft never touches stock or journal
  draft: {
    items: () => [pcsItem('21-a', { box: 12, bundle: 60, stock: 1000 }), pcsItem('21-b', { box: 12, bundle: 60, stock: 1000 })],
    create: 100, edit: 250, added: { qty: 3, uom: 'box' },
  },
  // TC22 — absurd qty in edit
  editHugeQty: { item: () => pcsItem('22', { box: 61, bundle: 625, stock: 500 }), create: 100, edit: '1000000000.46' },

  // TC23 — stock 2500, SI 2200 → 300; cancel / delete → 2500
  deleteCancelRestore: { item: () => pcsItem('23', { box: 61, bundle: 625, stock: 2500 }), qty: 2200 },
  // TC24 — stock 25000, mixed UOM invoice deleted → 25000
  deleteMixedUom: {
    item: () => pcsItem('24', { box: 61, bundle: 625, stock: 25000 }),
    lines: [
      { qty: 1990, uom: 'pcs' }, { qty: 20.89, uom: 'box' }, { qty: 10.88, uom: 'bundle' },
      { qty: 8.9, uom: 'pcs' }, { qty: 45.9, uom: 'box' }, { qty: 90.89, uom: 'pcs' },
    ],
  },
  // TC25 / TC26 — delete gives back pcs
  deleteBoxes: { item: () => pcsItem('25', { box: 51, bundle: 625, stock: 2000 }), qty: 20, uom: 'box', restored: 1020 },
  deleteBundles: { item: () => pcsItem('26', { box: 61, bundle: 602, stock: 15000 }), qty: 20, uom: 'bundle', restored: 12040 },
  // TC27 — pcs / box / bundle / box2. The case gives no conversions; box2 = 10, box = 61,
  // bundle = 625 keeps the lines (30320.4 pcs) inside the 35900 stock.
  deleteFourUoms: {
    box2Uom: BOX2_UOM,
    item: () => ({
      name: itemName('27'), baseUnit: 'pcs', price: '10', stock: 35900,
      alternates: [{ unit: 'box', qty: 61 }, { unit: 'bundle', qty: 625 }, { unit: BOX2_UOM, qty: 10 }],
    }),
    lines: [{ qty: 890.9, uom: BOX2_UOM }, { qty: 89.9, uom: 'box' }, { qty: 23.9, uom: 'bundle' }, { qty: 990, uom: 'pcs' }],
  },
  // TC28 — stock 5000 dated before all invoices; SIs on 20/12/2025 (1000), 21/12/2025 (1250),
  // today (1250) → 1500 left; deleting the 21/12/2025 one → 2750
  deleteByDate: {
    item: () => pcsItem('28', { box: 61, bundle: 625, stock: 5000 }),
    stockDate: 'December 1, 2025',
    invoices: [
      { billDate: 'December 20, 2025', qty: 1000 },
      { billDate: 'December 21, 2025', qty: 1250, deleteIt: true },
      { billDate: null, qty: 1250 },
    ],
    expectedAfterDelete: 2750,
  },
  // TC29 — several invoices, all deleted → opening stock everywhere
  deleteAll: {
    item: () => pcsItem('29', { box: 61, bundle: 625, stock: 3000 }),
    invoices: [[{ qty: 500, uom: 'pcs' }], [{ qty: 10, uom: 'box' }], [{ qty: 1.5, uom: 'bundle' }, { qty: 12.34, uom: 'pcs' }]],
  },
};

module.exports = { SalesInvoiceStockData, itemName, pcsItem };
