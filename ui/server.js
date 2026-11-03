// Test Board: a local web UI to pick and run the Playwright tests, with live logs.
// Start: `bun run ui` (or `node ui/server.js`, or run-ui.cmd), then open http://localhost:4400
// Only listens on 127.0.0.1: it starts processes on this machine, so it must not be reachable from outside.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.UI_PORT) || 4400;
const CLI = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
// The server runs under Bun or Node, but Playwright always runs under Node: under Bun its workers hang
// and every test times out
const NODE = process.versions.bun ? (process.env.NODE_BIN || 'node') : process.execPath;
const REPORTER = path.join(__dirname, 'ui-reporter.js');
const RESULTS = path.join(ROOT, 'test-results', 'results.json');
const HTML_REPORT = path.join(ROOT, 'test-results', 'html');
const STATE_FILE = path.join(ROOT, 'test-results', 'ui-state.json');
const LIST_FILE = path.join(ROOT, 'test-results', 'ui-test-list.txt');
const CLEANUP_SPEC = '[chromium] › tools/pricing-cleanup.spec.js';
const LOG_DIR = path.join(ROOT, 'test-results', 'ui-logs');
// Held while a run is going, so a second Test Board (another port or window) cannot start tests in the same orgs
const LOCK_FILE = path.join(ROOT, 'test-results', 'ui-run.lock');
const RESULTS_DIR = path.join(ROOT, 'test-results');
const MARK = '@@UI@@';
const MAX_EVENTS = 40000;
const { cleanOutputs, formatBytes } = require('../utils/cleanOutputs');
const ORGS = (() => { try { return require('../test-data/UserData').ORGS; } catch { return []; } })();

// ── Test list ──────────────────────────────────────────────────────
let tests = null; // [{ key, project, file, line, describe, title, tags }]
let listing = null; // the --list call in progress, shared by everyone waiting for it

// Walks a JSON-reporter suite tree; calls fn(spec, test, describePath) for each test
function walk(suite, describes, fn) {
  for (const spec of suite.specs || []) for (const t of spec.tests || []) fn(spec, t, describes);
  for (const child of suite.suites || []) walk(child, [...describes, child.title], fn);
}
const keyOf = (project, file, describes, title) => `[${project}] › ${[file, ...describes, title].join(' › ')}`;

function loadTests() {
  if (listing) return listing;
  listing = new Promise((resolve, reject) => {
    execFile(NODE, [CLI, 'test', '--list', '--reporter=json'],
      { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } },
      (err, stdout, stderr) => {
        let json;
        try { json = JSON.parse(stdout); } catch { return reject(new Error(stderr || (err && err.message) || 'Could not list the tests')); }
        const list = [];
        // Top-level suites are the files: their title is the file path, not a describe
        for (const fileSuite of json.suites || []) {
          walk({ specs: fileSuite.specs, suites: fileSuite.suites }, [], (spec, t, describes) => {
            list.push({
              key: keyOf(t.projectName, spec.file, describes, spec.title),
              project: t.projectName,
              file: spec.file,
              line: spec.line,
              describe: describes.join(' › '),
              title: spec.title,
              tags: spec.tags || [],
            });
          });
        }
        tests = list;
        resolve(list);
      });
  }).finally(() => { listing = null; });
  return listing;
}

// ── Status of each test (kept across restarts) ─────────────────────
// key -> { status, duration, error, worker, at }
let statuses = {};

function mapOutcome(outcome, status) {
  if (outcome === 'flaky') return 'flaky';
  if (outcome === 'skipped') return 'skipped';
  if (outcome === 'expected') return 'passed';
  return status === 'interrupted' ? 'interrupted' : 'failed';
}

function loadStatuses() {
  try {
    statuses = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // Left over from a Test Board that stopped in the middle of a run
    if (!otherRun()) {
      for (const s of Object.values(statuses)) {
        if (s.status === 'queued') s.status = 'notrun';
        else if (s.status === 'running' || s.status === 'retrying') s.status = 'interrupted';
      }
    }
    return;
  } catch {}
  // First start: take the last run's results
  try {
    const json = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
    for (const fileSuite of json.suites || []) {
      walk({ specs: fileSuite.specs, suites: fileSuite.suites }, [], (spec, t, describes) => {
        const last = (t.results || [])[t.results.length - 1];
        if (!last) return;
        const outcome = { expected: 'expected', unexpected: 'unexpected', flaky: 'flaky', skipped: 'skipped' }[t.status];
        statuses[keyOf(t.projectName, spec.file, describes, spec.title)] = {
          status: mapOutcome(outcome, last.status),
          duration: last.duration,
          error: (last.errors || []).map((e) => e.message || '').join('\n\n').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 6000),
          at: last.startTime,
        };
      });
    }
  } catch {}
}

let saveTimer = null;
function saveStatuses() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(statuses)); } catch {}
  }, 500);
}

// ── Live events (Server-Sent Events) ───────────────────────────────
let events = []; // replayed to a browser that connects mid-run
let seq = 0;
const clients = new Set();

function broadcast(ev) {
  ev.id = ++seq;
  ev.t = Date.now();
  events.push(ev);
  // Trim in blocks, not on every event (slicing a full buffer each time is slow)
  if (events.length > MAX_EVENTS + 5000) events.splice(0, events.length - MAX_EVENTS);
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(data);
  writeLog(ev);
}

// ── Full log of each run: test-results/ui-logs/run-<date>.log ──────
let logStream = null;
const testName = (key) => (key || '').split(' › ').slice(1).join(' > ');
const indent = (text, pad) => String(text).split('\n').map((l) => pad + l).join('\n');

function formatEvent(ev) {
  const w = ev.worker != null ? `W${ev.worker}` : '--';
  switch (ev.type) {
    case 'runStart': return `=== RUN START: ${ev.keys.length} test(s) | ${ev.options.headed ? 'headed' : 'headless'} | workers ${ev.options.workers || 'auto'} | retries ${ev.options.retries === '' || ev.options.retries == null ? 'config' : ev.options.retries} | ${ev.steps.join(' -> ')}`;
    case 'phaseStart': return `--- ${ev.label}\n$ ${ev.command}`;
    case 'phaseEnd': return `--- ${ev.label} finished (exit code ${ev.code})`;
    case 'log': return `[runner] ${ev.level === 'err' ? 'ERR ' : ''}${ev.text}`;
    case 'begin': return `Playwright: ${ev.total} test(s), ${ev.workers} worker(s)`;
    case 'testBegin': return `[${w}] START${ev.retry ? ` (retry #${ev.retry})` : ''} ${testName(ev.key)}`;
    case 'stepBegin': return `[${w}] ${'  '.repeat(ev.depth + 1)}> ${ev.cat === 'hook' ? 'hook' : 'step'}: ${ev.title}`;
    case 'stepEnd': return `[${w}] ${'  '.repeat(ev.depth + 1)}${ev.cat.padEnd(9)} ${ev.title} (${Math.round(ev.duration)}ms)${ev.error ? `  ERROR: ${ev.error}` : ''}`;
    case 'out': return indent(ev.text.replace(/\n$/, ''), `[${w}]   | `);
    case 'testEnd': {
      const status = ev.retrying ? 'FAILED (will retry)' : mapOutcome(ev.outcome, ev.status).toUpperCase();
      let text = `[${w}] ${status} ${testName(ev.key)} (${(ev.duration / 1000).toFixed(1)}s)`;
      for (const a of ev.annotations || []) text += `\n[${w}]   @${a.type}${a.description ? `: ${a.description}` : ''}`;
      if (ev.error) text += '\n' + indent(ev.error, `[${w}]   ! `);
      for (const a of ev.attachments || []) text += `\n[${w}]   attachment ${a.name}: ${a.path}`;
      return text;
    }
    case 'error': return `ERROR ${ev.text}`;
    case 'end': return `Playwright finished: ${ev.status} (${(ev.duration / 1000).toFixed(1)}s)`;
    case 'runEnd': return `=== RUN ${ev.result.toUpperCase()} after ${(ev.duration / 1000).toFixed(1)}s`;
    default: return null;
  }
}

function writeLog(ev) {
  if (!logStream) return;
  const text = formatEvent(ev);
  if (text == null) return;
  const ts = new Date(ev.t).toISOString().replace('T', ' ').slice(0, 23);
  logStream.write(text.split('\n').map((l) => `${ts} ${l}`).join('\n') + '\n');
}

let currentLog = null; // file name of the log being written
function openLog() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  currentLog = `run-${stamp}.log`;
  logStream = fs.createWriteStream(path.join(LOG_DIR, currentLog), { flags: 'a' });
}

function closeLog() {
  if (logStream) logStream.end();
  logStream = null;
  currentLog = null;
}

// ── Saved run logs (Logs & Files screen) ───────────────────────────
const LOG_NAME = /^run-[0-9-]+\.log$/;

// Kind of a line written by formatEvent, for the same badges and filters as the live console
function classify(rest) {
  const m = rest.match(/^\[(?:W(\d+)|--)\] ?(.*)$/);
  const w = m && m[1] != null ? Number(m[1]) : null;
  const text = m ? m[2] : rest;
  const errWords = /\b(error|fail|failed|timeout|exception)\b/i;
  let kind = 'sys';
  if (!m) {
    if (text.startsWith('===')) kind = /RUN (FAILED|STOPPED)/.test(text) ? 'fail' : 'run';
    else if (text.startsWith('---')) kind = /exit code [1-9]/.test(text) ? 'err' : 'run';
    else if (text.startsWith('$ ')) kind = 'cmd';
    else if (text.startsWith('[runner] ERR ') || text.startsWith('ERROR ')) kind = 'err';
    else if (text.startsWith('Playwright')) kind = /: passed/.test(text) || /test\(s\),/.test(text) ? 'run' : 'err';
    else kind = errWords.test(text) ? 'err' : 'sys';
  } else if (/^START/.test(text)) kind = /retry/.test(text) ? 'retry' : 'start';
  else if (/^(PASSED|FLAKY)/.test(text)) kind = 'pass';
  else if (/^FAILED \(will retry\)/.test(text)) kind = 'retry';
  else if (/^(FAILED|INTERRUPTED)/.test(text)) kind = 'fail';
  else if (/^SKIPPED/.test(text)) kind = 'skip';
  else if (/^\s+! /.test(text) || / ERROR: /.test(text)) kind = 'err';
  else if (/^\s+\| /.test(text)) kind = errWords.test(text) ? 'err' : 'out';
  else if (/^\s+(@|attachment )/.test(text)) kind = 'note';
  else if (/^\s+(> hook:|hook\s)/.test(text)) kind = 'hook';
  else if (/^\s+(> step:|test\.step)/.test(text)) kind = 'step';
  else if (/^\s+pw:api/.test(text)) kind = 'action';
  else if (/^\s+expect/.test(text)) kind = 'expect';
  return { w, kind, text: text.replace(/^\s+(pw:api|expect|hook|test\.step)\s+/, '  ') };
}

const parsedLogs = new Map(); // name -> { sig, lines, summary }
function parseLog(name) {
  const file = path.join(LOG_DIR, name);
  const st = fs.statSync(file);
  const sig = `${st.size}:${st.mtimeMs}`;
  const hit = parsedLogs.get(name);
  if (hit && hit.sig === sig) return hit;
  const lines = [];
  const summary = { tests: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, interrupted: 0, result: null, duration: null, mode: '', start: null };
  let n = 0;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!raw) continue;
    n++;
    const ts = raw.slice(11, 23);
    const day = raw.slice(0, 10);
    const c = classify(raw.slice(24));
    lines.push({ n, ts, w: c.w, kind: c.kind, text: c.text });
    if (!summary.start && /^\d{4}-/.test(raw)) summary.start = `${day}T${ts}Z`;
    let mm;
    if ((mm = c.text.match(/^=== RUN START: (\d+) test\(s\) \| (\w+)/))) { summary.tests = Number(mm[1]); summary.mode = mm[2]; }
    else if ((mm = c.text.match(/^=== RUN (\w+) after ([\d.]+)s/))) { summary.result = mm[1].toLowerCase(); summary.duration = Number(mm[2]) * 1000; }
    else if (c.w != null && (mm = c.text.match(/^(PASSED|FLAKY|FAILED|SKIPPED|INTERRUPTED) /)) && !/^FAILED \(will retry\)/.test(c.text)) {
      summary[mm[1].toLowerCase()]++;
    }
  }
  const entry = { sig, lines, summary, size: st.size, mtime: st.mtimeMs };
  parsedLogs.set(name, entry);
  // Keep only a few parsed files in memory
  if (parsedLogs.size > 4) parsedLogs.delete(parsedLogs.keys().next().value);
  return entry;
}

function listLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR).filter((f) => LOG_NAME.test(f)).sort().reverse().map((name) => {
    try {
      const { summary, size, mtime } = parseLog(name);
      return { name, size, mtime, live: name === currentLog, ...summary };
    } catch (e) {
      return { name, error: e.message };
    }
  });
}

// ── Run lock ───────────────────────────────────────────────────────
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// The lock of a run in another Test Board that is still alive, or null
function otherRun() {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    return lock.pid !== process.pid && pidAlive(lock.pid) ? lock : null;
  } catch { return null; }
}

function takeLock() {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, port: PORT, startedAt: new Date().toISOString() }));
}

function releaseLock() {
  try { if (JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')).pid === process.pid) fs.unlinkSync(LOCK_FILE); } catch {}
}

// ── Running tests ──────────────────────────────────────────────────
let run = null; // { id, child, keys, options, startedAt, stopping }

function startRun({ keys, all, headed, workers, retries, cleanupFirst, cleanFiles }) {
  const steps = [];
  if (cleanupFirst) steps.push({ label: 'Pricing cleanup', keys: [CLEANUP_SPEC] });
  steps.push({ label: all ? 'All tests' : `${keys.length} selected test(s)`, keys: all ? null : keys });

  run = { id: Date.now(), keys: all ? tests.map((t) => t.key) : keys, options: { headed, workers, retries, cleanFiles }, startedAt: Date.now(), stopping: false };
  for (const k of run.keys) statuses[k] = { ...(statuses[k] || {}), status: 'queued' };
  events = [];
  takeLock();
  openLog();
  broadcast({ type: 'runStart', runId: run.id, keys: run.keys, options: run.options, steps: steps.map((s) => s.label) });

  const next = (i) => {
    if (!run) return;
    if (i >= steps.length || run.stopping) return finishRun(run.stopping ? 'stopped' : run.result || 'passed');
    runStep(steps[i], { headed, workers, retries, cleanFiles }, (code) => {
      if (steps[i].keys && steps[i].keys[0] === CLEANUP_SPEC && code !== 0) {
        broadcast({ type: 'log', level: 'err', text: 'Pricing cleanup failed — the selected tests still run' });
      }
      next(i + 1);
    });
  };
  next(0);
}

function runStep(step, { headed, workers, retries, cleanFiles }, done) {
  const args = [CLI, 'test', `--reporter=${REPORTER},html,json`];
  if (step.keys) {
    // A test-list file instead of arguments: hundreds of tests do not fit on a Windows command line
    fs.mkdirSync(path.dirname(LIST_FILE), { recursive: true });
    fs.writeFileSync(LIST_FILE, step.keys.join('\n') + '\n');
    args.push(`--test-list=${LIST_FILE}`);
  }
  if (headed) args.push('--headed');
  if (retries !== undefined && retries !== '') args.push(`--retries=${Number(retries)}`);

  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    PLAYWRIGHT_HTML_OPEN: 'never',
    PLAYWRIGHT_HTML_OUTPUT_DIR: HTML_REPORT,
    PLAYWRIGHT_JSON_OUTPUT_NAME: RESULTS,
    // config/global-setup.js removes old test output first unless this is false
    CLEAN_BEFORE_RUN: cleanFiles === false ? 'false' : 'true',
  };
  // playwright.config.js caps WORKERS at the number of test orgs
  if (workers) env.WORKERS = String(workers);

  const shown = ['npx playwright test', ...args.slice(3).map((a) => a.replace(ROOT + path.sep, ''))].join(' ');
  broadcast({ type: 'phaseStart', label: step.label, command: shown + (workers ? `   (WORKERS=${workers})` : '') });

  const child = spawn(NODE, args, { cwd: ROOT, env, windowsHide: true });
  run.child = child;

  const onData = (stream) => {
    let buf = '';
    return (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) handleLine(line, stream === 'err');
    };
  };
  child.stdout.on('data', onData('out'));
  child.stderr.on('data', onData('err'));
  child.on('close', (code) => {
    broadcast({ type: 'phaseEnd', label: step.label, code });
    if (code !== 0 && run) run.result = 'failed';
    done(code);
  });
}

function handleLine(line, isErr) {
  if (!line.startsWith(MARK)) {
    if (line.trim()) broadcast({ type: 'log', level: isErr ? 'err' : 'out', text: line });
    return;
  }
  let ev;
  try { ev = JSON.parse(line.slice(MARK.length)); } catch { return; }
  if (ev.type === 'testBegin') {
    statuses[ev.key] = { ...(statuses[ev.key] || {}), status: 'running', worker: ev.worker, retry: ev.retry };
  } else if (ev.type === 'testEnd') {
    statuses[ev.key] = {
      status: ev.retrying ? 'retrying' : mapOutcome(ev.outcome, ev.status),
      duration: ev.duration,
      error: ev.error,
      worker: ev.worker,
      retry: ev.retry,
      annotations: ev.annotations,
      attachments: ev.attachments,
      at: new Date().toISOString(),
    };
    saveStatuses();
  }
  broadcast(ev);
}

function finishRun(result) {
  if (!run) return;
  // Tests still queued/running when the run ended did not run
  for (const k of run.keys) {
    const s = statuses[k];
    if (s && ['queued', 'running', 'retrying'].includes(s.status)) s.status = result === 'stopped' ? 'interrupted' : 'notrun';
  }
  saveStatuses();
  broadcast({ type: 'runEnd', result, duration: Date.now() - run.startedAt });
  closeLog();
  releaseLock();
  run = null;
}

function stopRun() {
  if (!run) return false;
  run.stopping = true;
  if (run.child && run.child.exitCode === null) {
    // Kill the whole tree: the runner, its workers and the browsers
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(run.child.pid), '/T', '/F'], { windowsHide: true });
    else run.child.kill('SIGTERM');
  }
  broadcast({ type: 'log', level: 'err', text: 'Stop requested — closing the test run…' });
  return true;
}

// ── HTTP ───────────────────────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/') return serveFile(res, path.join(__dirname, 'index.html'));

    if (req.method === 'GET' && p === '/api/tests') {
      if (!tests || url.searchParams.get('refresh')) await loadTests();
      return sendJson(res, 200, { tests, statuses, running: !!run, orgs: ORGS });
    }

    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'hello', running: !!run, keys: run ? run.keys : [], options: run ? run.options : null, startedAt: run ? run.startedAt : null })}\n\n`);
      // One write for the whole replay, then a marker so the page draws once instead of per event
      res.write(events.map((ev) => `data: ${JSON.stringify({ ...ev, replay: true })}\n\n`).join('') + `data: ${JSON.stringify({ type: 'replayEnd' })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }

    if (req.method === 'POST' && p === '/api/run') {
      if (run) return sendJson(res, 409, { error: 'A run is already in progress' });
      const other = otherRun();
      if (other) return sendJson(res, 409, { error: `Another Test Board (port ${other.port}) is running tests since ${new Date(other.startedAt).toLocaleTimeString()} — wait for it or stop it there` });
      const body = await readBody(req);
      if (!tests) await loadTests();
      const known = new Set(tests.map((t) => t.key));
      const keys = (body.keys || []).filter((k) => known.has(k));
      if (!body.all && !keys.length) return sendJson(res, 400, { error: 'No tests selected' });
      startRun({ keys, all: !!body.all, headed: !!body.headed, workers: Number(body.workers) || 0, retries: body.retries, cleanupFirst: !!body.cleanupFirst, cleanFiles: body.cleanFiles !== false });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/stop') return sendJson(res, 200, { stopped: stopRun() });

    if (req.method === 'POST' && p === '/api/reset') {
      if (run) return sendJson(res, 409, { error: 'A run is in progress' });
      statuses = {};
      saveStatuses();
      return sendJson(res, 200, { ok: true });
    }

    // Saved run logs and what a cleanup would remove
    if (req.method === 'GET' && p === '/api/files') {
      const keepLogs = Number(url.searchParams.get('keepLogs')) || 20;
      const preview = cleanOutputs({ dryRun: true, keepLogs });
      return sendJson(res, 200, { logs: listLogs(), clean: { ...preview, size: formatBytes(preview.bytes) }, running: !!run || !!otherRun() });
    }

    // Lines of one saved log, filtered and paged: ?name=&kinds=a,b&w=&q=&offset=&limit=&tail=1
    if (req.method === 'GET' && p === '/api/logfile') {
      const name = url.searchParams.get('name') || '';
      if (!LOG_NAME.test(name) || !fs.existsSync(path.join(LOG_DIR, name))) return sendJson(res, 404, { error: 'No such log' });
      const kinds = new Set((url.searchParams.get('kinds') || '').split(',').filter(Boolean));
      const w = url.searchParams.get('w');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const { lines, summary } = parseLog(name);
      const hits = lines.filter((l) => (!kinds.size || kinds.has(l.kind)) && (w == null || w === '' || String(l.w) === w) && (!q || l.text.toLowerCase().includes(q)));
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 2000);
      let offset = Number(url.searchParams.get('offset')) || 0;
      if (url.searchParams.get('tail')) offset = Math.max(0, hits.length - limit);
      return sendJson(res, 200, { name, summary, total: lines.length, matched: hits.length, offset, lines: hits.slice(offset, offset + limit), live: name === currentLog });
    }

    // Download one saved log
    if (req.method === 'GET' && p === '/api/logfile/download') {
      const name = url.searchParams.get('name') || '';
      if (!LOG_NAME.test(name) || !fs.existsSync(path.join(LOG_DIR, name))) { res.writeHead(404); return res.end('No such log'); }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
      return fs.createReadStream(path.join(LOG_DIR, name)).pipe(res);
    }

    if (req.method === 'POST' && p === '/api/logs/delete') {
      const body = await readBody(req);
      const removed = [];
      for (const name of body.names || []) {
        if (!LOG_NAME.test(name) || name === currentLog) continue;
        try { fs.unlinkSync(path.join(LOG_DIR, name)); parsedLogs.delete(name); removed.push(name); } catch {}
      }
      return sendJson(res, 200, { removed });
    }

    // Remove old test output now (same rules as before a run)
    if (req.method === 'POST' && p === '/api/clean') {
      if (run || otherRun()) return sendJson(res, 409, { error: 'Tests are running — clean up after the run' });
      const body = await readBody(req);
      const result = cleanOutputs({ keepLogs: Number(body.keepLogs) || 20 });
      for (const it of result.items) parsedLogs.delete(path.basename(it.path));
      return sendJson(res, 200, { ...result, size: formatBytes(result.bytes) });
    }

    // Full log of the current or last run
    if (req.method === 'GET' && p === '/api/runlog') {
      const files = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log')).sort() : [];
      if (!files.length) { res.writeHead(404); return res.end('No run log yet'); }
      const name = files[files.length - 1];
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` });
      return fs.createReadStream(path.join(LOG_DIR, name)).pipe(res);
    }

    // Screenshots, videos and traces of a test (only files under test-results/)
    if (req.method === 'GET' && p === '/artifact') {
      const file = path.resolve(url.searchParams.get('p') || '');
      const inside = process.platform === 'win32'
        ? file.toLowerCase().startsWith(RESULTS_DIR.toLowerCase() + path.sep)
        : file.startsWith(RESULTS_DIR + path.sep);
      if (!inside) { res.writeHead(403); return res.end(); }
      return serveFile(res, file);
    }

    // Playwright HTML report of the last run
    if (req.method === 'GET' && (p === '/report' || p.startsWith('/report/'))) {
      if (p === '/report') { res.writeHead(302, { Location: '/report/' }); return res.end(); }
      const rel = decodeURIComponent(p.slice('/report/'.length)) || 'index.html';
      const file = path.resolve(HTML_REPORT, rel);
      if (!file.startsWith(HTML_REPORT)) { res.writeHead(403); return res.end(); }
      return serveFile(res, file);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
});

loadStatuses();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Test Board running at http://localhost:${PORT}  (Ctrl+C to stop)`);
  loadTests().then((t) => { console.log(`Loaded ${t.length} tests`); }).catch((e) => console.error(e.message));
});

process.on('SIGINT', () => { stopRun(); releaseLock(); setTimeout(() => process.exit(0), 500); });
