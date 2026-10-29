'use strict';

/**
 * app-base-page.js — project base for the YOLO invoice / fieldforce / inventory apps.
 * Extends BasePage with Ant Design helpers the apps need everywhere.
 * Every feature POM extends this class.
 */
const { expect } = require('@playwright/test');
const { BasePage } = require('./base-page');
const { LoginPage } = require('../common/LoginPage');

class AppBasePage extends BasePage {

  constructor(page) {
    super(page);
    this.loginPage = new LoginPage(page);
    trackNetwork(page);   // from the start, so settle() sees requests fired before it is called
  }

  /** Locator for a raw selector string. XPath (starting with "/" or "(") gets "xpath=", else CSS. */
  loc(selector, scope = this.page) {
    const s = selector.trim();
    return scope.locator(s.startsWith('/') || s.startsWith('(') ? `xpath=${s}` : s);
  }

  /** First element matching selector that contains text (cy.contains semantics). */
  containing(selector, text, scope = this.page) {
    return this.loc(selector, scope).filter({ hasText: String(text) }).first();
  }

  /** Open an app (invoice | fieldforce | inventory), signing in only if the sign-in screen shows. */
  async openApp(app) {
    await this.loginPage.openApp(app);
  }

  /** true when the org was switched; false when the page was already inside it. */
  async selectOrg() {
    return this.loginPage.selectOrg();
  }

  /**
   * Click then type with real keystrokes. Needed for Ant Design select / auto-complete
   * wrappers (divs) where fill() is impossible, and for inputs that react per keystroke.
   */
  async typeInto(locator, text) {
    await this.clickSelect(locator);
    await this.page.keyboard.type(String(text));
  }

  /**
   * Click that works on Ant Design select inputs. When a select already shows a
   * value (e.g. Base unit = "pcs"), the value label <span.ant-select-selection-item>
   * sits on top of the search <input>, so a normal click fails with
   * "intercepts pointer events" and retries until timeout. For those inputs click
   * with force (the click lands on the select and focuses its search input);
   * everything else gets a normal, fully-checked click.
   */
  async clickSelect(locator) {
    const target = locator.first();
    const isSelectInput = await target.evaluate(
      (el) => el.classList.contains('ant-select-selection-search-input') || !!el.closest('.ant-select-selector')
    );
    if (!isSelectInput) {
      await target.click();
      return;
    }
    // Click the visible select box (what a user clicks): it opens the dropdown and
    // focuses the search input. Force-clicking the hidden <input> itself does not
    // always focus it (e.g. Stock Adjustment item search), so typing then goes nowhere.
    const box = target.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select-selector ")][1]');
    if (await box.count()) {
      await box.click();
    } else {
      await target.scrollIntoViewIfNeeded();
      await target.click({ force: true });
    }
  }

  /** Clear and set an input's value. */
  async fillInto(locator, text) {
    await locator.fill(String(text));
    // Leave the field like a user would: antd number inputs commit/recalculate
    // (e.g. the invoice total) on blur, so reading a total right after fill() is stale.
    await locator.blur();
  }

  /** Visible text of all matches joined (jQuery .text() semantics), after waiting for visibility. */
  async readText(locator, timeout) {
    await expect(locator.first()).toBeVisible(timeout ? { timeout } : undefined);
    return (await locator.allTextContents()).join('').trim();
  }

  /** textContent of all matches joined, without a visibility wait. */
  async readRawText(locator) {
    await locator.first().waitFor({ state: 'attached' });
    return (await locator.allTextContents()).join('');
  }

  async readValue(locator) {
    return locator.first().inputValue();
  }

  async readNumber(locator) {
    return parseFloat(await this.readValue(locator));
  }

  /**
   * Wait until the page is quiet, at most `ms`: no API request in flight, no Ant
   * spinner / skeleton showing, and no new request for QUIET_MS (a typed search
   * sends its request after a short debounce). Returns as soon as that holds, so
   * a 3 s settle on a page that is ready in 0.6 s costs 0.6 s. Always pass the reason.
   *
   * Waits shorter than QUIET_MS, and "nothing must happen" waits (see FIXED_WAIT),
   * stay fixed. SETTLE_MODE=fixed restores the old fixed pause everywhere.
   */
  async settle(ms, reason = '') {
    const t0 = Date.now();
    if (process.env.SETTLE_MODE === 'fixed' || ms <= QUIET_MS || FIXED_WAIT.test(reason)) {
      await this.page.waitForTimeout(ms);
    } else {
      await this._waitQuiet(ms);
    }
    if (reason) console.log(`  ⏳ ${Date.now() - t0}/${ms}ms — ${reason}`);
  }

  async _waitQuiet(maxMs) {
    const net = trackNetwork(this.page);
    const end = Date.now() + maxMs;
    await this.page.waitForTimeout(QUIET_MS);
    while (Date.now() < end) {
      const spinning = await this.page.locator(SPINNERS).filter({ visible: true }).count().catch(() => 0);
      if (!spinning && !net.busy() && Date.now() - net.last >= QUIET_MS) return;
      await this.page.waitForTimeout(100);
    }
  }
}

const QUIET_MS = Number(process.env.SETTLE_QUIET_MS) || 500;
// Waits that check that nothing happens (e.g. a refused save must not navigate) keep their full time
const FIXED_WAIT = /give a wrong save time/i;
const SPINNERS = '.ant-spin-spinning, .ant-skeleton-active, .ant-btn-loading';
// Requests that never matter for page data (analytics) or never finish (long polls)
const IGNORED_URL = /mixpanel|google-analytics|googletagmanager|sentry|hotjar|socket/i;
const NET = Symbol('network');

/** Fetch/XHR requests in flight on a page — tracked once per page, shared by every POM on it. */
function trackNetwork(page) {
  if (page[NET]) return page[NET];
  const pending = new Map();   // request → start time
  const state = {
    last: Date.now(),
    // A request older than 10 s is treated as a long poll, not as loading
    busy: () => [...pending.values()].some((t) => Date.now() - t < 10_000),
  };
  const isApi = (r) => ['fetch', 'xhr'].includes(r.resourceType()) && !IGNORED_URL.test(r.url());
  page.on('request', (r) => { if (isApi(r)) { pending.set(r, Date.now()); state.last = Date.now(); } });
  const done = (r) => { if (pending.delete(r)) state.last = Date.now(); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  page[NET] = state;
  return state;
}

module.exports = { AppBasePage };
