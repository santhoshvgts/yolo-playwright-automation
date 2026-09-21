/**
 * self-healing-base-page.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for base-page.js that adds:
 *   ✅ Self-healing locator (find with multiple fallbacks + local LLM)
 *   ✅ healingClick()   — click with locator fallbacks on failure
 *   ✅ healingFill()    — fill with locator fallbacks on failure
 *   ✅ safeClick()      — click with exponential backoff retry
 *   ✅ waitForStableDOM() — wait for networkidle + domcontentloaded
 *   ✅ mockApiResponse() — stub flaky external APIs
 *
 * HOW TO USE IN A NEW PAGE OBJECT:
 *
 *   const { SelfHealingBasePage } = require('./self-healing-base-page');
 *   class LoginPage extends SelfHealingBasePage { ... }
 *
 * Everything in BasePage still works exactly as before.
 * You only add healing where YOU want it.
 */

const { BasePage }            = require('./base-page');
const { SelfHealingLocator }  = require('../utils/selfHealingLocator');

// ─────────────────────────────────────────────────────────────────────────────

class SelfHealingBasePage extends BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    super(page);
    // Self-healing locator — available as this.find() in all subclasses
    this._healer = new SelfHealingLocator(page);
  }

  // ── Self-healing locator ──────────────────────────────────────────────────

  /**
   * Find an element using multiple fallback strategies + the local LLM.
   *
   * @example
   * // In your POM method:
   * const dropdown = await this.find([
   *   { type: 'css',  value: '.css-177swwa-control' },           // primary (brittle)
   *   { type: 'role', value: 'combobox' },                       // semantic fallback
   *   { type: 'css',  value: '[class*="control"]' },             // partial class
   *   { type: 'xpath',value: '//div[contains(@class,"control")]' } // xpath fallback
   * ]);
   * await dropdown.click();
   *
   * @param {Array<{type: string, value: string, options?: object}>} strategies
   * @returns {Promise<import('@playwright/test').Locator>}
   */
  async find(strategies) {
    return this._healer.find(strategies);
  }

  // ── Healing click ─────────────────────────────────────────────────────────

  /**
   * Click using an existing Locator, but if it fails try the fallback strategies.
   * Use this to add healing to existing constructor locators with ZERO refactor.
   *
   * @example
   * // Instead of:  await this.categoryDropdown.click()
   * // Use:
   * await this.healingClick(this.categoryDropdown, [
   *   { type: 'css',  value: '.css-177swwa-control' },
   *   { type: 'role', value: 'combobox' },
   * ]);
   *
   * @param {import('@playwright/test').Locator} locator   - primary locator
   * @param {Array}                              fallbacks - fallback strategies
   */
  async healingClick(locator, fallbacks = []) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 10000 });
      await locator.click();
    } catch (err) {
      console.warn(`[SelfHeal] Primary locator click failed: ${err.message}`);
      if (fallbacks.length > 0) {
        const healed = await this.find(fallbacks);
        await healed.click();
        return;
      }
      // No fallbacks — escalate to the local LLM
      const healed = await this.find(locator);
      if (!healed) throw new Error(`[SelfHeal] All healing attempts exhausted for click — no viable selector found`);
      await healed.click({ force: true });
    }
  }

  /**
   * Fill using an existing Locator, but if it fails try the fallback strategies.
   *
   * @param {import('@playwright/test').Locator} locator   - primary locator
   * @param {string}                             value     - text to fill
   * @param {Array}                              fallbacks - fallback strategies
   */
  async healingFill(locator, value, fallbacks = []) {
    try {
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      await locator.fill(value);
      // Blur after fill so the Android soft keyboard fully closes before the
      // next interaction (dropdown click etc.). Harmless on desktop.
      await locator.evaluate(el => el.blur()).catch(() => {});
      await this.page.waitForTimeout(200);
    } catch (err) {
      console.warn(`[SelfHeal] Primary locator fill failed: ${err.message}`);
      if (fallbacks.length > 0) {
        const healed = await this.find(fallbacks);
        await healed.fill(value);
        await healed.evaluate(el => el.blur()).catch(() => {});
        await this.page.waitForTimeout(200);
        return;
      }
      // No fallbacks — escalate to the local LLM
      const healed = await this.find(locator);
      if (!healed) throw new Error(`[SelfHeal] All healing attempts exhausted for fill — no viable selector found`);
      await healed.fill(value, { force: true });   // force skips actionability for off-viewport elements
      await healed.evaluate(el => el.blur()).catch(() => {});
      await this.page.waitForTimeout(200);
    }
  }

  // ── Robust click with exponential backoff ─────────────────────────────────

  /**
   * Click a CSS selector with automatic retry + exponential backoff.
   * Handles transient overlays, loading spinners, and re-renders.
   *
   * @param {string} selector - CSS or XPath selector
   * @param {number} retries  - max retry attempts (default 3)
   */
  async safeClick(selector, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.page.locator(selector).click({ timeout: 5000 });
        return;
      } catch (err) {
        if (attempt === retries) throw err;
        const delay = 500 * attempt;  // 500ms, 1000ms, 1500ms
        console.warn(`[SafeClick] Attempt ${attempt} failed, retrying in ${delay}ms — ${selector}`);
        await this.page.waitForTimeout(delay);
      }
    }
  }

  // ── Page stability ────────────────────────────────────────────────────────

  /**
   * Wait for the page to fully settle after navigation or heavy interactions.
   * More reliable than a fixed waitForTimeout().
   */
  async waitForStableDOM() {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await this.page.waitForLoadState('networkidle',      { timeout: 30000 });
    } catch {
      // networkidle can timeout on pages with long-polling — continue anyway
      console.warn('[SelfHeal] waitForStableDOM: networkidle timed out, continuing');
    }
  }

  // ── API mocking ───────────────────────────────────────────────────────────

  /**
   * Intercept and stub any API route that causes test flakiness.
   * Call BEFORE page.goto() so the mock is in place when the page loads.
   *
   * @example
   * // Stub analytics so it never causes network failures
   * await this.mockApiResponse('**\/analytics\/**', { status: 'ok' });
   * await this.navigate(url);
   *
   * @param {string} urlPattern  - glob pattern (e.g. '**\/api\/login**')
   * @param {object} responseBody
   * @param {number} status      - HTTP status (default 200)
   */
  async mockApiResponse(urlPattern, responseBody, status = 200) {
    await this.page.route(urlPattern, async route => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body:        JSON.stringify(responseBody),
      });
    });
  }

  // ── DOM snapshot for the healer ───────────────────────────────────────────

  /**
   * Get a compact DOM snapshot suitable for sending to the LLM healer.
   * Used automatically by healingClick/find — but you can call it directly too.
   *
   * @param {number} maxLength - character limit (default 8000)
   * @returns {Promise<string>}
   */
  async getDOMSnapshot(maxLength = 8000) {
    const html = await this.page.evaluate(() =>
      document.body ? document.body.outerHTML : document.documentElement.outerHTML
    );
    return html.slice(0, maxLength);
  }
}

module.exports = { SelfHealingBasePage };
