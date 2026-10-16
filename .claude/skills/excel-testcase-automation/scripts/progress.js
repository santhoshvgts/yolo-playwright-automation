#!/usr/bin/env node
/**
 * Session state for the Excel → automation programme (run from the repo root).
 *
 *   node .claude/skills/excel-testcase-automation/scripts/progress.js status
 *       table of every sheet + totals + deferred hand-offs
 *   node .claude/skills/excel-testcase-automation/scripts/progress.js next
 *       the next sheet to work on (first "running", else first "pending"), with its deferred cases
 *   node .claude/skills/excel-testcase-automation/scripts/progress.js set <file> key=value [key=value …]
 *       record results, e.g.  set Sales_Order_TestCases.xlsx status=done tests=40 pass=35 appDefects=5
 *       (numbers are stored as numbers; deferred=A,B,C stores a list)
 *   node .claude/skills/excel-testcase-automation/scripts/progress.js defer <targetFile> "<note>"
 *       hand a case over to a later sheet
 *   node .claude/skills/excel-testcase-automation/scripts/progress.js resolve <targetFile>
 *       clear the deferred list of a sheet once its cases are automated
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'state', 'progress.json');
const load = () => JSON.parse(fs.readFileSync(FILE, 'utf8'));
const save = (s) => { s.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n'); };
const sheetOf = (s, file) => {
  const key = s.order.find((f) => f === file || f.toLowerCase().startsWith(String(file).toLowerCase()));
  if (!key) throw new Error(`Unknown sheet "${file}". Known: ${s.order.join(', ')}`);
  s.sheets[key] = s.sheets[key] || { status: 'pending' };
  return [key, s.sheets[key]];
};

const [cmd = 'status', ...args] = process.argv.slice(2);
const s = load();

if (cmd === 'status') {
  const pad = (v, n) => String(v ?? '-').padEnd(n);
  console.log(`${pad('#', 3)}${pad('sheet', 42)}${pad('status', 9)}${pad('cases', 6)}${pad('tests', 6)}${pad('pass', 5)}${pad('defect', 7)}${pad('fixme', 6)}${pad('covered', 8)}deferred`);
  const tot = { cases: 0, tests: 0, pass: 0, appDefects: 0, fixme: 0 };
  s.order.forEach((f, i) => {
    const r = s.sheets[f] || { status: 'pending' };
    for (const k of Object.keys(tot)) tot[k] += Number(r[k] || 0);
    console.log(`${pad(i + 1, 3)}${pad(f.replace(/\.xlsx$/, ''), 42)}${pad(r.status, 9)}${pad(r.cases, 6)}${pad(r.tests, 6)}${pad(r.pass, 5)}${pad(r.appDefects, 7)}${pad(r.fixme, 6)}${pad(r.covered, 8)}${(r.deferred || []).length}`);
  });
  const done = s.order.filter((f) => s.sheets[f]?.status === 'done').length;
  console.log(`\n${done}/${s.order.length} sheets done · tests ${tot.tests} · pass ${tot.pass} · app defects ${tot.appDefects} · fixme ${tot.fixme}`);
  console.log('\nDeferred hand-offs (pick these up with that sheet):');
  for (const [f, notes] of Object.entries(s.deferredTo || {})) if (notes.length) console.log(`  ${f}: ${notes.join('; ')}`);
} else if (cmd === 'next') {
  const f = s.order.find((x) => s.sheets[x]?.status === 'running') || s.order.find((x) => (s.sheets[x]?.status || 'pending') === 'pending');
  if (!f) { console.log('ALL SHEETS DONE'); process.exit(0); }
  console.log(`NEXT: ${f} (status ${s.sheets[f]?.status || 'pending'})`);
  console.log(`PATH: ${path.join(s.source, f)}`);
  const d = (s.deferredTo || {})[f];
  if (d && d.length) console.log(`ALSO PICK UP (deferred here): ${d.join('; ')}`);
  if (s.sheets[f]?.notes) console.log(`NOTES: ${s.sheets[f].notes}`);
} else if (cmd === 'set') {
  const [file, ...pairs] = args;
  const [key, row] = sheetOf(s, file);
  for (const p of pairs) {
    const [k, ...rest] = p.split('=');
    const v = rest.join('=');
    row[k] = k === 'deferred' ? (v ? v.split(',').map((x) => x.trim()) : []) : (v !== '' && !isNaN(Number(v)) ? Number(v) : v);
  }
  save(s);
  console.log(`${key}: ${JSON.stringify(row)}`);
} else if (cmd === 'defer') {
  const [file, note] = args;
  const [key] = sheetOf(s, file);
  (s.deferredTo[key] = s.deferredTo[key] || []).push(note);
  save(s);
  console.log(`deferred to ${key}: ${note}`);
} else if (cmd === 'resolve') {
  const [key] = sheetOf(s, args[0]);
  s.deferredTo[key] = [];
  save(s);
  console.log(`cleared deferred list of ${key}`);
} else {
  console.log('Usage: progress.js status | next | set <file> k=v … | defer <file> "<note>" | resolve <file>');
  process.exit(1);
}
