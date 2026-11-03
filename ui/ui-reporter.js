// Reporter for the Test Board UI (ui/server.js). Prints one "@@UI@@{json}" line per event so the
// server can tell test events apart from the other output of the run.
// "worker" is the parallel index: worker N always works in org N (ORG_NAMES), even after a restart.
const path = require('path');

const MARK = '@@UI@@';
const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
// Step categories worth showing; fixtures and attachments are noise
const STEP_CATEGORIES = new Set(['test.step', 'hook', 'pw:api', 'expect']);

class UiReporter {
  onBegin(config, suite) {
    this.rootDir = config.rootDir;
    this.repeats = new Map(); // test key -> polling calls held back (see onStepEnd)
    this.emit({ type: 'begin', total: suite.allTests().length, workers: config.workers });
  }

  // Same key the server builds from `--list`: "[project] › file › describe › title"
  key(test) {
    const [, project, , ...titles] = test.titlePath();
    const file = path.relative(this.rootDir, test.location.file).split(path.sep).join('/');
    return `[${project}] › ${[file, ...titles].join(' › ')}`;
  }

  onTestBegin(test, result) {
    this.emit({ type: 'testBegin', key: this.key(test), worker: result.parallelIndex, retry: result.retry });
  }

  onStepBegin(test, result, step) {
    if (step.category === 'test.step' || step.category === 'hook') {
      this.flushRepeats(this.key(test), result);
      this.emit({ type: 'stepBegin', key: this.key(test), worker: result.parallelIndex, cat: step.category, title: step.title, depth: depth(step) });
    }
  }

  onStepEnd(test, result, step) {
    if (!STEP_CATEGORIES.has(step.category)) return;
    // Calls made inside expect.poll / toPass are the assertion's own retries
    if (step.category === 'pw:api' && insideExpect(step) && !step.error) return;
    const key = this.key(test);
    const ev = {
      type: 'stepEnd',
      key,
      worker: result.parallelIndex,
      cat: step.category,
      title: step.title,
      depth: depth(step),
      duration: step.duration,
      error: step.error ? stripAnsi(step.error.message || step.error.value || '').split('\n')[0].slice(0, 500) : undefined,
    };
    // Polling loops (wait, count, wait, count…) repeat the same few calls hundreds of times:
    // send one summary line per loop instead of every call
    const r = this.repeats.get(key) || { recent: [], count: 0, ms: 0, titles: new Set() };
    this.repeats.set(key, r);
    if (step.category === 'pw:api' && !ev.error && r.recent.includes(step.title)) {
      r.count++;
      r.ms += step.duration;
      r.titles.add(step.title);
      return;
    }
    this.flushRepeats(key, result);
    this.emit(ev);
    if (step.category === 'pw:api') r.recent = [step.title, ...r.recent].slice(0, 3);
  }

  flushRepeats(key, result) {
    const r = this.repeats.get(key);
    if (!r || !r.count) return;
    this.emit({ type: 'stepEnd', key, worker: result.parallelIndex, cat: 'pw:api', depth: 1, duration: r.ms,
      title: `↻ repeated ${r.count}× (${[...r.titles].join(' / ')})` });
    r.count = 0; r.ms = 0; r.titles = new Set();
  }

  onStdOut(chunk, test, result) {
    // Keep the order: a polling summary first, then what the test printed after it
    if (test && result) this.flushRepeats(this.key(test), result);
    this.emit({ type: 'out', key: test ? this.key(test) : null, worker: result ? result.parallelIndex : undefined, text: stripAnsi(chunk) });
  }

  onStdErr(chunk, test, result) {
    this.emit({ type: 'out', key: test ? this.key(test) : null, worker: result ? result.parallelIndex : undefined, text: stripAnsi(chunk), err: true });
  }

  onTestEnd(test, result) {
    this.flushRepeats(this.key(test), result);
    this.repeats.delete(this.key(test));
    const outcome = test.outcome();
    const retrying = outcome === 'unexpected' && result.retry < test.retries;
    this.emit({
      type: 'testEnd',
      key: this.key(test),
      status: result.status,
      outcome,
      retrying,
      retry: result.retry,
      worker: result.parallelIndex,
      duration: result.duration,
      error: result.errors.map((e) => stripAnsi(e.message || e.value || '')).join('\n\n').slice(0, 6000),
      annotations: test.annotations.map((a) => ({ type: a.type, description: a.description })),
      attachments: result.attachments.filter((a) => a.path).map((a) => ({ name: a.name, contentType: a.contentType, path: a.path })),
    });
  }

  onError(error) {
    this.emit({ type: 'error', text: stripAnsi(error.message || error.value || '') });
  }

  onEnd(result) {
    this.emit({ type: 'end', status: result.status, duration: result.duration });
  }

  // The UI shows the output, so Playwright does not need to add its own console reporter
  printsToStdio() {
    return true;
  }

  emit(obj) {
    process.stdout.write(MARK + JSON.stringify(obj) + '\n');
  }
}

function insideExpect(step) {
  for (let p = step.parent; p; p = p.parent) if (p.category === 'expect') return true;
  return false;
}

function depth(step) {
  let d = 0;
  for (let p = step.parent; p; p = p.parent) d++;
  return d;
}

module.exports = UiReporter;
