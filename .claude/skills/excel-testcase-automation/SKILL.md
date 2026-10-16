---
name: excel-testcase-automation
description: Convert manual test cases from Excel (.xlsx) sheets into Playwright tests in this repo (YOLO invoice app), adding them to the existing specs without duplicating scenarios that are already automated, with progress tracked across sessions. Use when the user gives an Excel / xlsx / folder of test cases and asks to "automate", "convert", "add to the existing test", "write scripts for these cases", or says "continue", "resume", "next sheet", "carry on with the test cases", or asks for automation status / defects found.
---

# Excel test cases → Playwright automation (YOLO invoice)

Goal: add every case from the sheet as a test in the right existing spec, skip cases that are
already automated, run them, and report pass / app-defect / test-fix — **with as few tokens as
possible**. App knowledge from earlier conversions is in `reference/app-notes.md`; read it
instead of exploring the app again.

## Session management (multi-session programme)

The whole folder (20 sheets, ~2,800 cases) is a multi-session job. State lives in `state/`:
- `state/progress.json` — sheet order, status (pending / running / done), counts, deferred hand-offs.
- `state/defects.md` — every app defect found (test ID → what the app does). Append, never rewrite.
- `reference/app-notes.md` — app knowledge (append what you learn).

A SessionStart hook (`.claude/settings.json`) prints the resume point. On "continue" / "resume" / a new session:
1. `node .claude/skills/excel-testcase-automation/scripts/progress.js status` then `… next`.
2. If the next sheet is `running`, check its last run log / results first (re-run its tag) — don't redo written tests.
3. Work the sheet with the workflow below; include its **ALSO PICK UP** deferred cases.
4. Checkpoint after each sheet (and before stopping for any reason):
   `progress.js set <file> status=done tests=N pass=N appDefects=N fixme=N covered=N` ·
   new defects → `state/defects.md` · new app facts → `reference/app-notes.md` ·
   hand-offs → `progress.js defer <laterFile> "<Sheet TC-IDs reason>"` · `progress.js resolve <file>` once picked up.
5. Mark the next sheet `status=running` before starting it, so an interrupted session resumes there.
6. Keep going sheet after sheet until the user stops you; give a one-line status after each sheet
   (`progress.js status` totals line).

Where each area's tests go: sales sheets → `tests/sales/02_SalesInvoiceStock.spec.js`; purchase sheets →
`tests/purchase/` (new `02_…spec.js` next to `01_PurchaseFlow.spec.js`); inventory → `tests/inventory/`;
cheque / journal / van sales → `tests/finance/` or `tests/van-sales/`. One `test.describe` per sheet.

## Token rules (follow strictly)

- Never print the raw Excel or whole spec / POM files. Use the scripts below — they print
  compact lines.
- Never `Read` a whole POM. `grep -n "async <name>"` and read ~30 lines around it.
- Explore the live app (Playwright MCP) only for controls NOT in `reference/app-notes.md`, and
  batch all probes for one screen into a single `browser_run_code_unsafe` call returning JSON.
- Run tests in the background with output to a log file; monitor **failures only**
  (`grep -E "^\s+x\s+[0-9]+ |passed|failed|EXIT"`). Never cat the whole log.
- For a failure, read only lines 12–30 of its `test-results/artifacts/*/error-context.md`
  (find it with `grep -l "^- Name:.*<TC-ID>"`).
- Smoke-run 5–6 representative new tests before the full run; fix POM bugs first.

## Workflow

1. **Parse the sheet** (compact, UTF-8 safe):
   ```bash
   python .claude/skills/excel-testcase-automation/scripts/excel_to_cases.py "<path.xlsx>" > "$SCRATCH/cases.txt"
   ```
   Output: one line per case `ID | Module | Type | Title | Steps | Expected` + module counts.
   Read that file once.

2. **Build the coverage index** (what is already automated):
   ```bash
   node .claude/skills/excel-testcase-automation/scripts/coverage_index.js > "$SCRATCH/covered.txt"
   ```
   Lists every existing test title per spec, plus POM public methods. Compare each case's
   intent with it. A case is **covered** only if an existing test performs the same steps and
   checks the same result — note which test covers it.

3. **Classify each case** into: `new` · `covered (skip — name the test)` ·
   `not automatable (test.fixme with the reason)` · `adapted (app differs — say how)`.
   Show the user the counts in one short table before writing code only if the sheet has
   ambiguous / impossible cases; otherwise go straight on.

4. **Explore only gaps.** Check `reference/app-notes.md` first. If a control is missing there,
   create the seed `tests/_explore/seed.spec.js` (template in app-notes), call
   `planner_setup_page`, probe in one batched call, then **close the browser, delete
   `tests/_explore`, and kill the paused worker** (see app-notes "Housekeeping").
   Append anything new you learn to `reference/app-notes.md`.

5. **Write the tests** in the existing spec for that area (sales → `tests/sales/02_SalesInvoiceStock.spec.js`):
   - Own `test.describe` block per sheet, titles `"<Sheet ID> - <short behaviour>"` (e.g. `TC-E05 - …`),
     tags `['@sales', '@<area-tag>']`.
   - Header comment listing the skipped (covered) cases and where they are covered.
   - Reuse POMs: `SalesInvoiceStockPage` (items, stock, lines, save, list, preview, journal) and
     `SalesInvoiceEditPage` (rate/discount/GST/CESS, tax mode, dates, summary, TDS, adjustment,
     dashboard, payment). Add new methods to the POM, not inline locators in the spec.
   - Test data in `test-data/SalesInvoiceStock_Data.js` (new exported block).
   - Expected values come from a model (`computeTotals`), never hard-coded totals.
   - Negative cases: accept "input refused" OR "save refused with message"
     (`expectInvalidValueBlocked`); otherwise assert what the sheet says.
   - Cases the app cannot do → `test.fixme(title, async () => { /* reason */ })`.
   - The spec files use **CRLF** line endings: append big blocks by writing to a scratch file
     and `sed 's/$/\r/' block.js >> spec.js`; edit with python using `newline=''`.
   - Verify with `npx playwright test <spec> --list --grep "<prefix>" | tail -1`.

6. **Run** (see app-notes "Running"): smoke subset → full run in background → triage.
   Triage each failure as **app defect** (keep the test, it is the evidence) or **test bug**
   (fix the POM / test). Re-run the fixed ones only.

7. **Report** to the user, short:
   - totals: automated / pass / fail-app-defect / fixme / skipped-covered
   - table of app defects (case → what the app does)
   - adapted cases (one line each) and side observations
   - run command (`npx playwright test --grep @<tag>`); do not commit unless asked.
