#!/usr/bin/env node
/**
 * Compact index of what is already automated: every test title per spec with its sheet case IDs
 * (from source, no Playwright run) and the public methods of each page object.
 *
 * Usage (repo root): node .claude/skills/excel-testcase-automation/scripts/coverage_index.js [filter]
 *   filter — optional case-insensitive text; only specs / POMs whose path contains it.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const filter = (process.argv[2] || '').toLowerCase();

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('_')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(root, p).replace(/\\/g, '/');
const keep = (p) => !filter || rel(p).toLowerCase().includes(filter);

console.log('# Specs (describe › test titles; fixme marked)');
for (const file of walk(path.join(root, 'tests')).filter((f) => /\.spec\.(js|ts)$/.test(f) && keep(f))) {
  const src = fs.readFileSync(file, 'utf8');
  console.log(`\n## ${rel(file)}`);
  const re = /\b(test\.describe(?:\.serial)?|test\.fixme|test)\(\s*(['`"])((?:\\.|(?!\2).)*)\2/g;
  let m;
  while ((m = re.exec(src))) {
    const [, kind, , title] = m;
    if (kind.startsWith('test.describe')) { console.log(`[${title}]`); continue; }
    // Sheet case IDs live in the test's annotation: { type: 'cases', description: '<IDs>' }
    const head = src.slice(re.lastIndex, src.indexOf('=>', re.lastIndex));
    const cases = (head.match(/type: 'cases', description: (?:'((?:\.|[^'])*)'|(\w+))/) || []).slice(1).find(Boolean);
    console.log(`${kind === 'test.fixme' ? '  (fixme) ' : '  '}${title.replace(/\s+/g, ' ')}${cases ? `  [${cases}]` : ''}`);
  }
}

console.log('\n# Page objects (public async methods)');
for (const file of walk(path.join(root, 'pages')).filter(keep)) {
  const names = [...fs.readFileSync(file, 'utf8').matchAll(/^\s{2}async ([a-zA-Z]\w*)\(/gm)].map((m) => m[1]);
  if (names.length) console.log(`${rel(file)}: ${[...new Set(names)].join(', ')}`);
}
