# YOLO Playwright Automation

End-to-end UI tests for **YOLO Books** (invoice app), built with [Playwright](https://playwright.dev/) in JavaScript. Tests follow the Page Object Model, generate test data with Faker, and can repair broken locators at runtime with an LLM (self-healing).

Covered modules:

| Spec | What it tests |
|------|---------------|
| `tests/Product_item_Create.spec.js` | Create and edit a product item (with alternate units) |
| `tests/Pricing_general_Create.spec.js` | Price lists (General, Category-wise, Profile-wise × markup, markdown, item specific): create, edit, deactivate, delete |
| `tests/Vendor_Create.spec.js` | Business vendor with and without GST, individual vendor |

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- Optional: [Bun](https://bun.sh/) 1.3+, a faster installer and runner that the CI workflow uses

## Setup

```bash
npm install
npx playwright install --with-deps chromium
```

With Bun instead:

```bash
bun install
bunx playwright install --with-deps chromium
```

Both commands read `package-lock.json`, so npm and Bun install the same versions. If you use Bun, don't commit the `bun.lock` file it creates.

## Running tests

Run these from the project root. With Bun, use `bunx` in place of `npx`.

| What | Command |
|------|---------|
| All tests (headless) | `npx playwright test` |
| UI mode | `npx playwright test --ui` |
| Visible browser | `npx playwright test --headed` |
| Visible browser, slowed down | `SLOWMO=1 npx playwright test --headed` |
| One spec | `npx playwright test tests/Vendor_Create.spec.js` |
| Tests matching a title | `npx playwright test -g "Business Vendor"` |
| Step through with the inspector | `npx playwright test --debug` |
| List tests without running them | `npx playwright test --list` |
| Open the last HTML report | `npx playwright show-report test-results/html` |

> **Order matters.** Specs pass data to each other through `Rundata/testData.json`. For example, the pricing tests use the product created by `Product_item_Create`. Run the whole suite, or make sure the data a spec needs was saved by an earlier run. `workers` is fixed at `1` for this reason.

### Environment variables

Set these in your shell or in a `.env` file in the project root.

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL` | `https://invoice.test.vgts.xyz` | Target environment |
| `ORG_ID` | set in `config/urls.js` | Organisation the tests run against |
| `PASSWORD` | value in `test-data/*` | Login password |
| `TEST_TIMEOUT` | `300000` | Time allowed for each test (ms) |
| `EXPECT_TIMEOUT` | `30000` | Time allowed for each assertion (ms) |
| `ACTION_TIMEOUT` / `NAVIGATION_TIMEOUT` | see `config/timeouts.js` | Time allowed for each action or navigation (ms) |
| `SLOWMO` | off | Any value adds a 500 ms delay to each browser action |
| `SELF_HEAL_ENABLED` | `true` | Set to `false` to turn off LLM locator healing |
| `LLM_PROVIDER` | `lmstudio` | `lmstudio`, `ollama` or `claude` |
| `LM_STUDIO_URL` / `LM_STUDIO_MODEL` | `http://localhost:1234` / `qwen/qwen3-coder-next` | LM Studio settings |
| `OLLAMA_URL` / `OLLAMA_MODEL` | `http://localhost:11434` / `qwen3-coder:30b` | Ollama settings |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | — / `claude-sonnet-5` | Claude settings (when `LLM_PROVIDER=claude`) |

In PowerShell, set variables like this:

```powershell
$env:BASE_URL="https://invoice.stage.vgts.xyz"; npx playwright test
```

## Running on GitHub Actions

The workflow in `.github/workflows/playwright.yml` only runs when someone starts it by hand:

1. Open the **Actions** tab, then **Playwright Tests**.
2. Click **Run workflow**. You can optionally set:
   - **spec**: one or more spec files, separated by spaces. Leave it blank to run everything.
   - **grep**: run only tests whose title matches this text.
   - **base_url**: the environment to test against.
   - **retries**: how many times to retry a failed test. Defaults to 1.
3. When the run finishes, it shows a results table. Download:
   - **playwright-report**: the HTML report.
   - **playwright-artifacts**: traces, screenshots and videos. Uploaded only when tests fail.

Only one run executes at a time; a second trigger waits in the queue. To keep the password out of the code, add a repository secret named `PASSWORD` under **Settings → Secrets and variables → Actions**.

## Project structure

```
config/          URLs, timeouts, optional session-reuse setup (auth.js, global-setup.js; not wired in)
fixtures/        base-test.js: shared test fixture (default timeouts etc.)
pages/           Page objects, one per screen/flow
  base-page.js               basic helpers
  self-healing-base-page.js  locator actions with LLM fallback
  LoginFlow.js               login + organisation selection
tests/           Spec files (*.spec.js)
test-data/       Faker-based data generators per module, plus upload fixtures
utils/
  runtimeDataStore.js        saveSection / getSection: JSON store shared between specs
  llmHealerFactory.js        picks the healer from LLM_PROVIDER
  *Healer.js                 LM Studio / Ollama / Claude healers
Rundata/         Runtime data written by tests (testData.json, per-run snapshots in runs/)
specs/           Test plans
test-results/    Reports and failure artifacts (git-ignored)
```

## Writing a new test

1. **Page object:** add `pages/<Module>.js`. Extend `SelfHealingBasePage` and define locators in the constructor. Prefer `getByRole` or `getByText` over CSS classes, because the UI library generates class names (such as `css-mncuj7`) that change between builds.
2. **Test data:** add `test-data/<Module>-data.js` that exports a generator built on `@faker-js/faker`.
3. **Spec:** add `tests/<Module>.spec.js`. Import `test` and `expect` from `../fixtures/base-test`, and log in in `beforeEach` with `LoginFlow`.
4. **Sharing data:** store what later specs need with `saveSection('<key>', {...})`, and read it back with `getSection('<key>')`.
5. **Waits:** avoid fixed `waitForTimeout` pauses. Wait for the element or state you need, for example `await expect(locator).toBeVisible()`.
