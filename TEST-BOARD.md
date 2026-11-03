# Test Board: run the tests from a browser

Test Board is a local web page, laid out like Jira, for picking and running the Playwright tests in this repo. It loads every spec file under `tests/` and lets you:

- select all tests, a whole file, or single tests
- run them in **headless** mode (no browser windows) or **headed** mode (you watch the browser)
- follow the **live logs** while they run, and see each test's own log and error

## Start it

You need [Bun](https://bun.sh), Node.js and a `.env` file in the project folder. Test Board runs on Bun. The tests still run on Node, because Playwright's workers hang under Bun and every test times out.

Pick one way to start it:

| How | Command |
|---|---|
| Double-click | `run-ui.cmd` in the project folder (it also opens the browser; it falls back to Node when Bun is not installed) |
| Terminal | `bun run ui` |
| Terminal, without Bun | `npm run ui:node` |

If `node` is not on your PATH, set `NODE_BIN` to the full path of `node.exe`.

Then open **http://localhost:4400**.

To use another port, set `UI_PORT` first, for example `set UI_PORT=5000` in cmd before `run-ui.cmd`. To stop Test Board, close its window or press `Ctrl+C`.

The server only listens on this computer (127.0.0.1). Other machines can't reach it.

## The screen

| Area | What it does |
|---|---|
| **Backlog** (top tab) | Every test, grouped by spec file. Each row shows a key, the title, the tags as labels, the status, how long it took and the worker. Click a file header to fold or unfold it. |
| **Board** (top tab) | The tests of the current or last run in columns: To do, In progress, Done, Failed, Flaky / skipped. |
| **Live Logs** (top tab) | Detailed progress and the full log of the run. See [Live Logs](#live-logs). The red number on the tab is the failure count. |
| **Logs & Files** (top tab) | Saved run logs: open, search, download or delete them, and clean up old test output. See [Logs & Files](#logs--files). |
| **🌙 / ☀️** (top right) | Switches the whole page between the light and dark theme. The choice is remembered; the first time, it follows your system setting. |
| **Sidebar** | Filter by module (`finance`, `inventory`, `purchase`, `sales`…) or by status. |
| **Search / labels / status** | Narrow the list. Search matches the key, title, file and tags. |
| **Details panel** | Click a test to see its file and line, last error and own log, and to run just that test. |
| **Live logs** (bottom) | All output of the running tests. You can filter it, show errors only or turn auto-scroll off. Drag the header to resize it. |
| **HTML report ↗** | Opens Playwright's HTML report of the last run (`test-results/html`). |

The test keys come from the spec file and the test number. For example, `CT-11` is "TC11" in `01_ChequeTracker.spec.js`.

## Running tests

1. Choose the tests:
   - **Select all** ticks every test the current filters show.
   - Use a file's checkbox for the whole file, or the row checkboxes for single tests.
   - **Select failed** picks every test that failed in a previous run.
   - **▶ Run** on a file header runs that file straight away.
2. Set the run options:
   - **Mode:** Headless or Headed.
   - **Workers:** "Auto" uses one worker per test org (`ORG_NAMES` in `.env`). The config never allows more workers than orgs.
   - **Retries:** "Config" uses `playwright.config.js` (1 retry locally). Choose 0 to see failures faster.
   - **Pricing cleanup** (on by default): runs `tests/tools/pricing-cleanup.spec.js` before your tests. It switches the lists off through the app's API (`utils/pricingApi.js`) and takes about 40 seconds. It switches off any price list or offer that an earlier run left active; a leftover one changes invoice rates and fails the sales tests. You can turn it off for a quick single-test run.
   - **Clean old files** (on by default): removes old test output before the tests start. See [Cleaning before a run](#cleaning-before-a-run).
3. Click **▶ Run selected**, or **Run all** for the whole suite. The whole suite takes hours.
4. Watch the progress bar, the statuses and the live logs. **■ Stop** ends the run and closes its browsers.

Only one run can go at a time, even across several Test Boards. While one board is running tests, another board (on another port, for example) refuses to start a run, because both would work in the same test orgs.

## Live Logs

The **Live Logs** tab shows everything about the current or last run. You can also open it from the blue "Running" badge at the top or from the **Open Live Logs ↗** button on the small log panel.

**Progress panel**
- Percent done, the run state, and these figures: tests done, elapsed time, estimated time left (ETA), tests per minute, average test time and pass rate.
- The run phases, for example `1. Pricing cleanup ✓` and `2. 40 selected test(s)`.
- A segmented bar of passed, flaky, failed, skipped, running (striped) and waiting tests, with a count and percentage for each.

**Workers.** One card per worker, and so per test org. Each card shows:
- the org name
- the test running now, with its timer
- the step and browser action it is doing
- done / passed / failed counts and the time the worker has been busy

Click the test to filter the log to it.

**Spec files.** Each file in the run has a progress bar and a done/total count. Files with a test running come first; finished files go to the bottom.

**Log console.** Every line has a time (to the millisecond), a type badge, the worker and the test key. It holds:
- **Run**: commands, phases and runner output, including the login in global setup.
- **Tests**: start, pass, fail and retry of each test, plus notes such as `@bug`.
- **Steps**: `test.step` blocks and hooks (`beforeEach`, `afterAll`…) with their times.
- **Actions**: every Playwright call (click, fill, goto, waits…) with its time.
- **Expect**: every assertion with its time.
- **Output**: everything the tests print (`console.log` from the page objects).
- **Errors**: failed actions and assertions, and the full error of each failed test.

The type buttons switch these groups on and off. **Problems only** shows just errors, failures, retries and warnings. You can also filter by worker or by test, or search; matches are highlighted.

- **Group by test** folds the log into one section per test. Failed and running tests open by default.
- **Pause** freezes the view and counts new lines. **Resume** shows them.
- If you scroll up, the view stops following new lines. **↓ Jump to latest** goes back to the newest line.
- **⬇ Download full log** saves the complete log of the current or last run. Every run is also written to `test-results/ui-logs/run-<date>-<time>.log`.

**Failures.** Every failed or retrying test, with the first lines of its error, its screenshots and links to its video or trace. Click a failure to filter the log to that test and open its details.

## Logs & Files

**Clean up old files.** This panel shows how much old test output can be removed, and **Show items** lists each item with its size and the reason. **🧹 Clean now** removes it; it is disabled while tests run. **Keep newest** sets how many run logs survive (5, 10, 20 or 50).

**Run logs.** One row per run, from `test-results/ui-logs/`. Each row shows:
- the start time and result
- the tests, passed, failed, flaky, skipped and stopped counts
- the duration, mode and file size

A log that is still being written is marked **LIVE**. **View** opens it, **⬇** downloads it and **🗑** deletes it. You can also tick several logs and use **Delete selected**. A live log can't be deleted.

**Log viewer.** It uses the same badges and colours as the Live Logs console, and opens on the last 500 lines.
- Filter by line type (Run, Tests, Steps, Actions, Expect, Output, Errors), by worker, or with **Problems only**. Search highlights matches.
- **⏮ ◀ Earlier · Later ▶ ⏭** pages through the lines. Each line shows its line number in the file.
- The server does the filtering and paging, so even a full-suite log opens fast.
- A live log on its last page follows the run.

## Cleaning before a run

`config/global-setup.js` runs before every Playwright run, from Test Board or from the terminal. Before it logs in, it removes old test output using `utils/cleanOutputs.js`:

- **Removed:**
  - everything in `test-results/` except the items listed under "Kept"; this is mostly debug runs made with `--output` and stray report files
  - `playwright-report/` and `blob-report/` in the project root
  - run logs in `test-results/ui-logs/` beyond the newest 20
- **Kept:**
  - `test-results/artifacts`, which Playwright empties itself at the start of a run
  - `test-results/html` and `results.json` (the last report)
  - `test-results/.last-run.json`, used by `--last-failed`
  - Test Board's `ui-*` files
- **Never touched:** `Rundata/`. Specs pass data to each other through it, and it is tracked in git.
- **Recent files:** anything changed in the last 10 minutes stays, so a run going on at the same time keeps its files.

You can change this with environment variables:

| Variable | Effect |
|---|---|
| `CLEAN_BEFORE_RUN=false` | Skip the cleanup (Test Board sets this when **Clean old files** is off). |
| `CLEAN_KEEP_LOGS=50` | Keep the newest 50 run logs instead of 20. |

The run log shows the result, for example `[clean] removed 102 old output item(s), 461.4 MB`.

## Where results go

- `test-results/html`: the Playwright HTML report (the **HTML report ↗** link).
- `test-results/results.json`: the JSON report of the last run.
- `test-results/ui-state.json`: the last status of every test, so the board still shows them after a restart.
- `test-results/ui-logs/`: the full log of every run.

All of these are in the git-ignored `test-results` folder.

## Same run from the terminal

Test Board runs the normal Playwright command, so these give the same result:

```bash
npx playwright test                                    # everything (headless)
npx playwright test --headed                           # everything, browser visible
npx playwright test tests/finance                      # one module
npx playwright test "tests/finance/01_ChequeTracker.spec.js:189"   # one test (file:line)
npx playwright test --grep @sales                      # by tag
npx playwright test tests/tools/pricing-cleanup.spec.js           # price-list cleanup
```

The live log shows the exact command each run used.

## Files

| File | Purpose |
|---|---|
| `ui/server.js` | Small Node server with no extra packages. It lists the tests (`playwright test --list`), starts and stops runs, and streams events to the page. |
| `ui/ui-reporter.js` | Playwright reporter that sends each test's start, steps, actions, assertions, output and result to the server. |
| `ui/index.html` | The page itself. |
| `run-ui.cmd` | Windows launcher. |

## If something goes wrong

- **"Could not load the tests"**: the error under it comes from `npx playwright test --list`. Fix the spec or config error it names, then click **⟳ Reload tests**.
- **Port already in use**: Test Board is already running, or another program uses port 4400. Set another `UI_PORT`.
- **New or renamed tests don't show up**: click **⟳ Reload tests**.
- **Many sales tests fail on the tax amount**: an active price list or offer was left behind. Run again with **Pricing cleanup** turned on.
