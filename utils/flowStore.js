/**
 * flowStore.js — the runtime-store API the flow POMs use, on top of whichever
 * utils/runtimeDataStore.js the project ships.
 *
 * Some projects' runtimeDataStore has only saveSection / getSection (no
 * requireSection / clearSection). This adapter adds those two when missing, so
 * the POMs work unchanged in either project and the host store is never edited.
 * Both stores keep their data in Rundata/testData.json next to utils/.
 */
const fs = require('fs');
const path = require('path');
const store = require('./runtimeDataStore');

const DATA_FILE = path.join(__dirname, '..', 'Rundata', 'testData.json');

const saveSection = store.saveSection;
const getSection  = store.getSection;

/** Like getSection, but throws a clear error if a prerequisite test never ran. */
const requireSection = store.requireSection || function requireSection(section, keys = []) {
  const data = getSection(section) || {};
  const missing = keys.filter((k) => data[k] === undefined || data[k] === null || data[k] === '');
  if (!Object.keys(data).length || missing.length) {
    throw new Error(
      `[flowStore] Section "${section}" is ${Object.keys(data).length ? `missing keys: ${missing.join(', ')}` : 'empty'}. ` +
      'Run the test that produces it first.'
    );
  }
  return data;
};

/** Remove one section (a new flow starts clean). */
const clearSection = store.clearSection || function clearSection(section) {
  const all = store.readTestData ? store.readTestData() : JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}');
  delete all[section];
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));
};

module.exports = { saveSection, getSection, requireSection, clearSection };
