const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'test-results');
const LOG_DIR = path.join(RESULTS, 'ui-logs');

// Kept in test-results/: Playwright empties `artifacts` itself at the start of a run, `html` and
// results.json are the last report, .last-run.json drives --last-failed, and the ui-* files belong to
// the Test Board (status per test, the run lock, the test list of the run that is starting)
const KEEP = new Set(['artifacts', 'html', 'results.json', '.last-run.json', 'ui-logs', 'ui-state.json', 'ui-run.lock', 'ui-test-list.txt']);
// Default report folders Playwright writes when run without this project's config
const ROOT_LEFTOVERS = ['playwright-report', 'blob-report'];

function sizeOf(p) {
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((sum, name) => sum + sizeOf(path.join(p, name)), 0);
  } catch {
    return 0;
  }
}

/**
 * Lists (and, unless dryRun, deletes) old test output:
 *   - everything in test-results/ except KEEP (debug runs with --output, stray report files)
 *   - playwright-report/ and blob-report/ in the project root
 *   - run logs in test-results/ui-logs beyond the newest `keepLogs`
 * Entries changed in the last `minAgeMs` are left alone, so a run going on at the same time
 * does not lose its files. Rundata/ is never touched: specs pass data through it.
 * Returns { items: [{ path, bytes, reason }], bytes }.
 */
function cleanOutputs({ dryRun = false, keepLogs = 20, minAgeMs = 0 } = {}) {
  const items = [];
  const now = Date.now();
  const oldEnough = (p) => {
    try { return now - fs.statSync(p).mtimeMs >= minAgeMs; } catch { return false; }
  };
  const add = (p, reason) => { if (oldEnough(p)) items.push({ path: path.relative(ROOT, p).split(path.sep).join('/'), abs: p, bytes: sizeOf(p), reason }); };

  if (fs.existsSync(RESULTS)) {
    for (const name of fs.readdirSync(RESULTS)) {
      if (!KEEP.has(name)) add(path.join(RESULTS, name), 'old test output');
    }
  }
  for (const name of ROOT_LEFTOVERS) {
    const p = path.join(ROOT, name);
    if (fs.existsSync(p)) add(p, 'default Playwright report folder');
  }
  if (fs.existsSync(LOG_DIR)) {
    const logs = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log')).sort().reverse(); // newest first
    for (const name of logs.slice(keepLogs)) add(path.join(LOG_DIR, name), `older than the newest ${keepLogs} run logs`);
  }

  if (!dryRun) {
    for (const it of items) {
      try { fs.rmSync(it.abs, { recursive: true, force: true }); } catch (e) { it.error = e.message; }
    }
  }
  for (const it of items) delete it.abs;
  return { items, bytes: items.reduce((s, it) => s + it.bytes, 0) };
}

const formatBytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

module.exports = { cleanOutputs, formatBytes };
