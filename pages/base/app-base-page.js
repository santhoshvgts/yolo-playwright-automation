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

  async selectOrg() {
    await this.loginPage.selectOrg();
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
   * Fixed pause. The apps recalculate totals/stock asynchronously with no visible
   * loading state, so some reads need a settle delay. Always pass the reason.
   */
  async settle(ms, reason) {
    if (reason) console.log(`  ⏳ ${ms}ms — ${reason}`);
    await this.page.waitForTimeout(ms);
  }
}

module.exports = { AppBasePage };
