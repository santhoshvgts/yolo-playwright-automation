const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../Rundata/testData.json');
const filePath1 = path.join(__dirname, '../Rundata/LLmData.json');
/**
 * Initialize store if missing
 */
function initStore() {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }
}

/**
 * Read full JSON safely
 */
function readTestData() {
  initStore();

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

/**
 * Clean object → replace undefined / null with empty string
 */
function cleanObject(data) {
  const cleaned = {};

  for (const key in data) {
    if (data[key] === undefined || data[key] === null) {
      cleaned[key] = "";
    } else {
      cleaned[key] = data[key];
    }
  }

  return cleaned;
}

/**
 * Optional namespacing so callers CAN isolate data per worker/test instead of
 * sharing one global key — opt-in only. Omitting `namespace` (as every
 * current caller does) keeps the exact original behavior: one shared
 * `section` key across the whole run.
 *
 * Example for a future caller that wants isolation:
 *   saveSection('opBillingData', data, workerNamespace());
 */
function sectionKey(section, namespace) {
  return namespace ? `${namespace}::${section}` : section;
}

/**
 * A ready-made namespace value based on Playwright's per-worker env var —
 * stable for every test running in the same worker process, distinct across
 * workers. Not used by any call site yet; available for incremental adoption.
 */
function workerNamespace() {
  return `worker-${process.env.TEST_WORKER_INDEX ?? 0}`;
}

/**
 * Save section safely
 */
function saveSection(section, data, namespace) {
  const key = sectionKey(section, namespace);
  const fileData = readTestData();

  fileData[key] = {
    ...(fileData[key] || {}),
    ...cleanObject(data),
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
}
function saveSectionllm(section, data) {
  const fileData = readLLmData();

  fileData[section] = {
    ...(fileData[section] || {}),
    ...cleanObject(data),
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(filePath1, JSON.stringify(fileData, null, 2));
}

/**
 * Get section safely
 */
function getSection(section, namespace) {
  const key = sectionKey(section, namespace);
  const fileData = readTestData();

  if (!fileData[key]) {
    return {}; // return empty object if not exist
  }

  return fileData[key];
}
function initLLmStore() {
  if (!fs.existsSync(filePath1)) {
    fs.mkdirSync(path.dirname(filePath1), { recursive: true });
    fs.writeFileSync(filePath1, JSON.stringify({}, null, 2));
  }
}

function readLLmData() {
  initLLmStore();
  try {
    const raw = fs.readFileSync(filePath1, 'utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getSectionllm(section) {
  const fileData = readLLmData();
  return fileData[section] || {};
}


/**
 * Get field safely
 */
function getValue(section, key) {
  const sectionData = getSection(section);

  if (!sectionData[key]) {
    return "";
  }

  return sectionData[key];
}

module.exports = {
  saveSection,
  getSection,
  getValue,
  saveSectionllm,
  getSectionllm,
  readTestData,
  workerNamespace
};
