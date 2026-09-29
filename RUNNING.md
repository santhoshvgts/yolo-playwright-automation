# Running the tests

This project uses **Bun** as its package manager and command runner. Playwright itself still runs on Node.js, and `npx playwright ...` keeps working as a fallback.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Bun](https://bun.sh/) 1.3+
  - Windows (PowerShell): `powershell -c "irm bun.sh/install.ps1 | iex"`
  - macOS / Linux: `curl -fsSL https://bun.sh/install | bash`

## First-time setup

Run these from the project root:

```bash
bun install
bunx playwright install --with-deps
```

`bun install` reads `bun.lock`. The second command downloads the Playwright browsers. Run it yourself, because Bun doesn't download them automatically.

## Running tests

| What | Command |
|------|---------|
| All tests (headless) | `bunx playwright test` |
| UI mode | `bunx playwright test --ui` |
| Visible browser | `bunx playwright test --headed` |
| One spec file | `bunx playwright test tests/Product_item_Create.spec.js` |
| Tests matching a name | `bunx playwright test -g "Create a new product"` |
| Debug with the inspector | `bunx playwright test --debug` |
| List tests without running them | `bunx playwright test --list` |
| Open the last HTML report | `bunx playwright show-report test-results/html` |

Results go to `test-results/`. That folder holds the HTML report, the JSON results and the artifacts (traces, screenshots and videos) from failed runs.

## Choosing an environment and timeouts

Environment variables override the defaults without any code change. You can also put them in a `.env` file in the project root.

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL` | `https://invoice.test.vgts.xyz` | Target environment |
| `ORG_ID` | *(set in `config/urls.js`)* | Organisation the tests run against |
| `TEST_TIMEOUT` | `300000` | Time allowed for each test (ms) |
| `EXPECT_TIMEOUT` | `30000` | Time allowed for each assertion (ms) |
| `ACTION_TIMEOUT` / `NAVIGATION_TIMEOUT` | see `config/timeouts.js` | Time allowed for each action or navigation (ms) |

PowerShell:

```powershell
$env:BASE_URL="https://invoice.stage.vgts.xyz"; bunx playwright test
```

Bash:

```bash
BASE_URL=https://invoice.stage.vgts.xyz bunx playwright test
```

## Running on GitHub Actions

The workflow in `.github/workflows/playwright.yml` only runs when someone starts it by hand:

1. On GitHub, open the repo's **Actions** tab.
2. Pick **Playwright Tests** from the list on the left.
3. Click **Run workflow**. Optionally fill in:
   - **spec**: one spec file to run. Leave it blank to run everything.
   - **grep**: run only tests whose title matches this text.
   - **base_url**: the environment to test against.
4. When the run finishes, download the **playwright-results** artifact. It holds the HTML report, traces, screenshots and videos.

Optional: add a repository secret named `PASSWORD` under **Settings → Secrets and variables → Actions**. If it's missing, the tests use the password in `test-data/`.

## Adding packages

```bash
bun add <package>        # runtime dependency
bun add -d <package>     # dev dependency
```

Commit `bun.lock` whenever it changes.

## Known limitations

- **VS Code Playwright extension:** it runs tests through Node, not Bun, so it works the same as before.
- **Browser hangs on Windows:** if a browser launch hangs under `bunx`, run that command with `npx` instead, e.g. `npx playwright test --ui`.
- Microsoft doesn't officially support running Playwright with Bun yet.

## Going back to npm

```bash
rm -rf node_modules bun.lock
git checkout package-lock.json
npm install
```

After that, use `npx playwright ...` in place of `bunx playwright ...`.
