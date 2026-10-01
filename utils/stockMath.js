/**
 * stockMath.js — pure helpers shared by the stock / amount POMs.
 * No page access here, so they are safe to unit-test.
 */
const { expect } = require('@playwright/test');

/** Parse an inventory stock cell like "12 box 3 bundle 4.5 pcs" into piece counts. */
function parseStock(stockText, boxconversion, bundleconversion) {
  const text = String(stockText || '');
  if (text.trim().toLowerCase() === 'out of stocks') {
    return { box: 0, bundle: 0, pcs: 0, total: 0, outOfStock: true };
  }
  const grab = (unit) => {
    const m = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`, 'i'));
    return m ? parseFloat(m[1]) : 0;
  };
  const box = grab('box');
  const bundle = grab('bundle');
  const pcs = grab('pcs');
  return { box, bundle, pcs, total: box * boxconversion + bundle * bundleconversion + pcs, outOfStock: false };
}

/** Parse a money/number string like "₹ -1,234.50" -> -1234.5 */
function toNumber(str) {
  const m = String(str).match(/-?\d[\d,]*(?:\.\d+)?/);
  return m ? parseFloat(m[0].replace(/,/g, '')) || 0 : 0;
}

/** parseFloat(text.replace(/[^\d.-]/g, '')) — the inline money parse the original suite used. */
function money(str) {
  return parseFloat(String(str).replace(/[^\d.-]/g, ''));
}

/** "exact match else closeTo(expected, delta)" */
function expectClose(actual, expected, delta = 0.01, label = '') {
  expect(Math.abs(actual - expected), `${label} actual=${actual} expected=${expected}`).toBeLessThanOrEqual(delta);
}

module.exports = { parseStock, toNumber, money, expectClose };
