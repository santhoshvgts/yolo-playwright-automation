/**
 * selfHealingLocator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CommonJS self-healing Playwright locator.
 *
 * How it works:
 *   1. Try each provided strategy in order (css → role → text → xpath)
 *   2. If ALL strategies fail → try the cached healed selector (Rundata/LLmData.json)
 *   3. If no cache hit → send structured element context to the LLM provider
 *      (LM Studio / Ollama / Claude — see utils/llmHealerFactory.js)
 *   4. Try the LLM's suggested selectors
 *   5. If still fails → throw with full log of everything tried
 *
 * Usage:
 *   const { SelfHealingLocator } = require('../utils/selfHealingLocator');
 *   const healer = new SelfHealingLocator(page);
 *
 *   const btn = await healer.find([
 *     { type: 'role',  value: 'button', options: { name: 'Submit' } },
 *     { type: 'css',   value: 'button[type="submit"]' },
 *     { type: 'text',  value: 'Submit' },
 *     { type: 'xpath', value: '//button[@type="submit"]' },
 *   ]);
 *   await btn.click();
 */

const { getHealer }                               = require('./llmHealerFactory');
const { saveSection, getSection,
        saveSectionllm, getSectionllm }            = require('./runtimeDataStore');

// How long to wait for each strategy attempt (ms)
const STRATEGY_TIMEOUT = 3000;

// ─────────────────────────────────────────────────────────────────────────────

class SelfHealingLocator {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page                   = page;
    this.healer                 = getHealer();
    this.previousElementContext = null; // { selector, outerHTML, action }
  }

  // ── Cache-first lookup — try a previously healed selector before calling the LLM
  async _tryCached(originalSelector) {
    const key   = this._sanitizeKey(originalSelector);
    const entry = getSectionllm('healedSelectors')[key];
    if (!entry?.healedSelector) return null;

    try {
      const healed = this._evalHealedSelector(entry.healedSelector);
      const state  = await this._waitForHealed(healed);
      console.log(`[SelfHeal] ⚡ Cache hit (${state}): "${entry.healedSelector}"`);
      return healed;
    } catch {
      console.log(`[SelfHeal] ⚠️  Cached selector no longer works: "${entry.healedSelector}" — falling back to LLM`);
      return null;
    }
  }

  // Run in-browser JS to extract structured element context (no string hacking)
  async _extractNearbyContext(failedSelector) {
    return this.page.evaluate((sel) => {
      const KEEP_ATTRS = ['id','name','type','placeholder','role','for','value',
                          'data-slot','data-testid','data-test','aria-label',
                          'aria-invalid','href','checked','aria-selected'];

      function compress(el) {
        const attrs = {};
        for (const a of el.attributes) {
          if (KEEP_ATTRS.includes(a.name)) attrs[a.name] = a.value;
        }
        const text = el.textContent.trim().slice(0, 60);
        return { tag: el.tagName.toLowerCase(), ...(text ? { text } : {}), ...attrs };
      }

      function ancestors(el, depth = 4) {
        const chain = [];
        let cur = el.parentElement;
        for (let i = 0; cur && i < depth; i++, cur = cur.parentElement) chain.push(compress(cur));
        return chain;
      }

      function siblings(el) {
        const list = [];
        let s = el.parentElement?.firstElementChild;
        while (s) { if (s !== el) list.push(compress(s)); s = s.nextElementSibling; }
        return list.slice(0, 4);
      }

      // Try multiple strategies to locate the element from selector string
      const finders = [
        () => { const m = sel.match(/\[name=["']?([^"'\]]+)/);   return m && document.querySelector(`[name="${m[1]}"]`); },
        () => { const m = sel.match(/placeholder["':]+\s*["']([^"']+)/i); return m && document.querySelector(`[placeholder="${m[1]}"]`); },
        () => { const m = sel.match(/getByPlaceholder\(['"]([^'"]+)/i);   return m && document.querySelector(`[placeholder="${m[1]}"]`); },
        () => { const m = sel.match(/getByTestId\(['"]([^'"]+)/i);        return m && document.querySelector(`[data-testid="${m[1]}"]`); },
        // getByLabel / label text match → find associated input (covers spinbutton / type=number)
        () => { const m = sel.match(/getByLabel\(['"]([^'"]+)/i);
                if (!m) return null;
                const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent.trim().includes(m[1]));
                return lbl?.htmlFor ? document.getElementById(lbl.htmlFor) : lbl?.querySelector('input,select,textarea'); },
        // getByRole('spinbutton' / 'textbox', { name: 'Label' }) → find by aria-label or label text
        () => { const m = sel.match(/getByRole\(['"](?:spinbutton|textbox|combobox)['"]\s*,\s*\{\s*name:\s*['"]([^'"]+)/i);
                if (!m) return null;
                const label = m[1];
                return document.querySelector(`[aria-label="${label}"]`)
                    || (() => { const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent.trim().includes(label.replace(' *','')));
                                return lbl?.htmlFor ? document.getElementById(lbl.htmlFor) : lbl?.querySelector('input'); })(); },
        // aria-label attribute match
        () => { const m = sel.match(/name:\s*['"]([^'"]+)/);
                return m && (document.querySelector(`[aria-label="${m[1]}"]`) || document.querySelector(`input[aria-label="${m[1]}"]`)); },
        () => { const m = sel.match(/#([\w-]+)/);                         return m && document.getElementById(m[1]); },
      ];

      let target = null;
      for (const fn of finders) { try { target = fn(); if (target) break; } catch {} }
      if (!target) return null;

      const labelEl = target.id ? document.querySelector(`label[for="${target.id}"]`) : null;

      return {
        target:    compress(target),
        label:     labelEl?.textContent?.trim() || null,
        ancestors: ancestors(target),
        siblings:  siblings(target),
        form:      target.form ? compress(target.form) : null,
      };
    }, failedSelector).catch(() => null);
  }

  // ── Main API ───────────────────────────────────────────────────────────────

  /**
   * Find an element using multiple fallback strategies.
   * Falls back to the configured LLM provider if all strategies fail.
   *
   * @param {Array<{type: string, value: string, options?: object}>} strategies
   * @returns {Promise<import('@playwright/test').Locator>}
   */
  async find(strategies, actionHint = 'find') {
    // Accept a Playwright Locator directly: await this.find(this.myLocator)
    if (!Array.isArray(strategies)) {
      const locator     = strategies;
      const selectorStr = String(locator);
      try {
        await locator.waitFor({ state: 'visible', timeout: STRATEGY_TIMEOUT });
        const nearbyCtx = await this._extractNearbyContext(selectorStr);
        this.previousElementContext = { selector: selectorStr, nearbyCtx, action: actionHint };
        return locator;
      } catch {
        console.warn(`[SelfHeal] ⚠️  Locator failed: ${selectorStr}`);

        const cached = await this._tryCached(selectorStr);
        if (cached) {
          const ctx = await this._extractNearbyContext(String(cached));
          this.previousElementContext = { selector: selectorStr, nearbyCtx: ctx, action: actionHint };
          return cached;
        }

        console.warn(`[SelfHeal] ⚠️  No usable cache — checking LLM provider`);
        const online = await this.healer.checkOnline();
        if (!online) {
          console.warn(`[SelfHeal] ⚠️  LLM provider offline — returning original locator`);
          return locator;
        }
        const pageUrl      = this.page.url();
        const nearbyCtx    = await this._extractNearbyContext(selectorStr);
        const domSnapshot  = await this.page.evaluate(() =>
          document.body ? document.body.outerHTML : document.documentElement.outerHTML
        );
        const healing = await this.healer.healLocator(
          selectorStr, actionHint, domSnapshot, pageUrl,
          this.previousElementContext, nearbyCtx
        );
        for (const selector of healing.selectors) {
          try {
            const healed = this._evalHealedSelector(selector);
            const state  = await this._waitForHealed(healed);
            console.log(`[SelfHeal] 🤖 ${this.healer.constructor.name} healed (${state}): "${selector}"`);
            this._saveHealed(selectorStr, selector, this.healer.constructor.name, pageUrl);
            const ctx = await this._extractNearbyContext(selector);
            this.previousElementContext = { selector, nearbyCtx: ctx, action: actionHint };
            return healed;
          } catch { console.log(`[SelfHeal] ❌ Healed selector failed: "${selector}"`); }
        }
        console.warn(`[SelfHeal] ⚠️  Healing exhausted — all ${healing.selectors.length} suggestions failed`);
        return null;
      }
    }

    const tried = [];

    // ── Phase 1: Try provided strategies ──────────────────────────────────
    for (const strategy of strategies) {
      try {
        const locator = this._buildLocator(strategy);
        await locator.waitFor({ state: 'visible', timeout: STRATEGY_TIMEOUT });
        const desc = this._describeStrategy(strategy);
        console.log(`[SelfHeal] ✅ Found via ${desc}`);
        if (tried.length > 0) {
          this._saveHealed(tried[0], desc, 'fallback_strategy');
        }
        const nearbyCtx = await this._extractNearbyContext(desc);
        this.previousElementContext = {
          selector: desc,
          nearbyCtx,
          action: actionHint,
        };
        return locator;
      } catch {
        const desc = this._describeStrategy(strategy);
        tried.push(desc);
        console.log(`[SelfHeal] ❌ Failed: ${desc}`);
      }
    }

    console.warn(`[SelfHeal] ⚠️  All ${strategies.length} strategies failed`);

    const primaryFailed = tried[0] || 'unknown';

    // ── Phase 1.5: Cache-first — try a previously healed selector, skip the LLM entirely
    const cached = await this._tryCached(primaryFailed);
    if (cached) {
      const ctx = await this._extractNearbyContext(String(cached));
      this.previousElementContext = { selector: primaryFailed, nearbyCtx: ctx, action: actionHint };
      return cached;
    }

    console.warn(`[SelfHeal] ⚠️  No usable cache — checking LLM provider`);

    // ── Phase 2: LLM provider connectivity check ───────────────────────────
    const online = await this.healer.checkOnline();
    if (!online) {
      console.warn(`[SelfHeal] ⚠️  LLM provider offline — skipping healing, continuing test`);
      return this._buildLocator(strategies[strategies.length - 1]);
    }

    const pageUrl = this.page.url();

    const domSnapshot = await this.page.evaluate(() =>
      document.body ? document.body.outerHTML : document.documentElement.outerHTML
    );

    // Extract structured element context from the live page
    const nearbyCtx = await this._extractNearbyContext(primaryFailed);
    console.log(`[SelfHeal] 🔍 Nearby context:`, nearbyCtx ? JSON.stringify(nearbyCtx).slice(0, 200) : 'not found');

    // ── Phase 3: Ask the LLM provider for alternatives ─────────────────────
    const healing = await this.healer.healLocator(
      primaryFailed, actionHint, domSnapshot, pageUrl,
      this.previousElementContext, nearbyCtx
    );

    if (healing.selectors.length === 0) {
      console.warn(`[SelfHeal] ⚠️  LLM provider returned no selectors — continuing test`);
      return this._buildLocator(strategies[strategies.length - 1]);
    }

    // ── Phase 4: Try LLM suggestions ───────────────────────────────────────
    for (const selector of healing.selectors) {
      try {
        const locator = this._evalHealedSelector(selector);
        const state   = await this._waitForHealed(locator);
        console.log(`[SelfHeal] 🤖 ${this.healer.constructor.name} healing succeeded (${state})! Selector: "${selector}"`);
        this._saveHealed(primaryFailed, selector, this.healer.constructor.name, pageUrl);
        const ctx = await this._extractNearbyContext(selector);
        this.previousElementContext = { selector, nearbyCtx: ctx, action: actionHint };
        return locator;
      } catch {
        console.log(`[SelfHeal] ❌ Healed selector failed: "${selector}"`);
      }
    }

    throw new Error(
      `[SelfHeal] Complete healing failure.\n` +
      `  Original strategies : ${tried.join(', ')}\n` +
      `  LLM suggestions      : ${healing.selectors.join(', ')}\n` +
      `  Reasoning            : ${healing.reasoning}`
    );
  }

  // Real bug found in practice: every generated POM's fallback strategies use
  // the { locator: () => ... } function form (per this project's own style
  // rules), but this code used to unconditionally build `${strategy.type}:
  // ${strategy.value}` for logging/cache-keying — both undefined for
  // function-form strategies, so every failure produced the literal string
  // "undefined:undefined". That collided ALL distinct failures onto one
  // cache key, so a single bad LLM guess got replayed for every other field
  // on the page for the rest of the run. Describe function-form strategies
  // by their actual source (truncated) instead, so keys are unique again.
  _describeStrategy(strategy) {
    if (strategy.type) return `${strategy.type}:${strategy.value}`;
    if (typeof strategy.locator === 'function') {
      return strategy.locator.toString().replace(/^\(\)\s*=>\s*/, '').replace(/\bthis\./g, '').slice(0, 120);
    }
    return 'unknown-strategy';
  }

  // ── Private: save healed selector to Rundata ──────────────────────────────

  _saveHealed(originalSelector, healedSelector, via, pageUrl = '') {
    try {
      const key     = this._sanitizeKey(originalSelector);
      const url     = pageUrl || (this.page ? this.page.url() : '');
      const isLLM   = via !== 'fallback_strategy';

      // LLM healed (any provider) → LLmData.json   |   fallback strategy → testData.json
      const readFn  = isLLM ? getSectionllm  : getSection;
      const saveFn  = isLLM ? saveSectionllm : saveSection;
      const file    = isLLM ? 'LLmData.json' : 'testData.json';

      const existing = readFn('healedSelectors');
      const entry    = existing[key] || {};

      saveFn('healedSelectors', {
        [key]: {
          originalSelector,
          healedSelector,
          via,
          pageUrl:    url,
          healCount:  (entry.healCount || 0) + 1,
          healedAt:   new Date().toISOString(),
        },
      });
      console.log(`[SelfHeal] 💾 Saved healed selector → Rundata/${file} [${key}]`);
    } catch (err) {
      console.warn(`[SelfHeal] Could not save healed selector: ${err.message}`);
    }
  }

  _sanitizeKey(selector) {
    return selector.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 80);
  }

  // Try visible first; fall back to attached (fill/click scroll to element anyway)
  async _waitForHealed(loc) {
    try {
      await loc.waitFor({ state: 'visible', timeout: STRATEGY_TIMEOUT });
      return 'visible';
    } catch {
      await loc.waitFor({ state: 'attached', timeout: 3000 });
      return 'attached';
    }
  }

  // Parse LLM-returned selector string → actual Playwright Locator object
  _evalHealedSelector(selector) {
    const s = selector.trim().replace(/^(this\.page\.|page\.)/, '');

    const parseOpts = raw => {
      if (!raw) return {};
      try { return JSON.parse(raw.replace(/'/g, '"')); } catch { return {}; }
    };

    let m;

    m = s.match(/^getByRole\((['"])(.*?)\1(?:,\s*(\{[^}]+\}))?\)(.*)/s);
    if (m) return this._applyChain(this.page.getByRole(m[2], parseOpts(m[3])), m[4]);

    m = s.match(/^getByLabel\((['"])(.*?)\1(?:,\s*(\{[^}]+\}))?\)(.*)/s);
    if (m) return this._applyChain(this.page.getByLabel(m[2], parseOpts(m[3])), m[4]);

    m = s.match(/^getByPlaceholder\((['"])(.*?)\1(?:,\s*(\{[^}]+\}))?\)(.*)/s);
    if (m) return this._applyChain(this.page.getByPlaceholder(m[2], parseOpts(m[3])), m[4]);

    m = s.match(/^getByText\((['"])(.*?)\1(?:,\s*(\{[^}]+\}))?\)(.*)/s);
    if (m) return this._applyChain(this.page.getByText(m[2], parseOpts(m[3])), m[4]);

    m = s.match(/^getByTestId\((['"])(.*?)\1\)(.*)/s);
    if (m) return this._applyChain(this.page.getByTestId(m[2]), m[3]);

    m = s.match(/^getByAltText\((['"])(.*?)\1\)(.*)/s);
    if (m) return this._applyChain(this.page.getByAltText(m[2]), m[3]);

    m = s.match(/^locator\((['"])([\s\S]*?)\1\)(.*)/s);
    if (m) return this._applyChain(this.page.locator(m[2]), m[3]);

    // Fallback: treat whole string as CSS/XPath
    return this.page.locator(s);
  }

  _applyChain(loc, chain) {
    if (!chain) return loc;
    const c = chain.trim();
    if (!c || !c.startsWith('.')) return loc;

    let m;
    if (c.startsWith('.first()'))  return this._applyChain(loc.first(),          c.slice(8));
    if (c.startsWith('.last()'))   return this._applyChain(loc.last(),            c.slice(7));
    m = c.match(/^\.nth\((\d+)\)(.*)/s);
    if (m) return this._applyChain(loc.nth(parseInt(m[1])),                       m[2]);
    m = c.match(/^\.filter\(\s*\{\s*hasText:\s*(['"])(.*?)\1\s*\}\)(.*)/s);
    if (m) return this._applyChain(loc.filter({ hasText: m[2] }),                 m[3]);

    return loc;
  }

  // ── Private: build Playwright locator from strategy object ────────────────

  _buildLocator(strategy) {
    // Support { locator: () => page.locator(...) } function format
    if (typeof strategy.locator === 'function') {
      return strategy.locator();
    }

    const { type, value, options = {} } = strategy;

    switch (type) {
      case 'testId':
        return this.page.getByTestId(value);

      case 'role':
        // value = role name (e.g. 'button', 'textbox', 'link')
        return this.page.getByRole(value, options);

      case 'text':
        return this.page.getByText(value, options);

      case 'label':
        return this.page.getByLabel(value, options);

      case 'placeholder':
        return this.page.getByPlaceholder(value, options);

      case 'css':
        return this.page.locator(value);

      case 'xpath':
        return this.page.locator(`xpath=${value}`);

      default:
        throw new Error(`[SelfHeal] Unknown strategy type: "${type}"`);
    }
  }
}

module.exports = { SelfHealingLocator };
