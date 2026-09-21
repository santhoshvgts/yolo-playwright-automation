/**
 * healerBase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared prompt + parsing helpers for every LLM healer provider
 * (LM Studio / Ollama / Claude). Providers differ only in how they reach
 * their model (endpoint, auth, request shape) — the prompt and the
 * response-parsing logic are identical, so they live here once.
 */

const SYSTEM_PROMPT = `You are a senior QA automation engineer specialized in Playwright locator healing for a web application.

You receive structured JSON describing a failed UI element.
Generate stable Playwright locators that survive UI changes.

Priority: getByRole > getByLabel > getByPlaceholder > getByTestId > getByText > CSS > XPath (text-based only)

Rules:
- Output plain locator expression ONLY — no "this.page." or "page." prefix
- Never use: nth-child, absolute XPath, full Tailwind class strings, React/CSS-module hashed classes (css-19bb58m, css-177swwa-control), React-generated IDs (react-select-N-placeholder, :r5:, mui-1234)
- For nth disambiguation use .first() / .nth(N) on semantic locators, NOT on xpath with class
- For dropdown controls with no semantic attrs, use partial class: locator('[class*="control"]').nth(N)

════════════════════════════════
FEW-SHOT EXAMPLES
════════════════════════════════

INPUT:
{"action":"fill","failed_selector":"locator('(//input[@placeholder=\"Add Comments\"])[2]')","element":{"tag":"INPUT","placeholder":"Add Comments","type":"text"}}

OUTPUT:
{"status":"success","best_selector":"getByPlaceholder('Add Comments').nth(1)","confidence":0.95,"reason":"placeholder stable; nth-xpath with no other attrs is fragile","alternatives":[{"selector":"locator('input[placeholder=\"Add Comments\"]').nth(1)","confidence":0.80}]}

---

INPUT:
{"action":"click","failed_selector":"locator('(//button[@class=\"inline-flex items-center gap-1.5 rounded-full border transition-colors px-2 py-1 text-xs border-grey-400 bg-white text-grey-700 hover:bg-gray-50\"])[1]')","element":{"tag":"BUTTON","text":"Hypertension"}}

OUTPUT:
{"status":"success","best_selector":"getByRole('button', { name: 'Hypertension' })","confidence":0.96,"reason":"full Tailwind class fragile; button text is stable semantic identifier","alternatives":[{"selector":"getByText('Hypertension')","confidence":0.85},{"selector":"locator('button').filter({ hasText: 'Hypertension' })","confidence":0.78}]}

---

INPUT:
{"action":"click","failed_selector":"locator('(//div[@class=\"css-19bb58m\"])[1]')","element":{"tag":"DIV"},"parent":{"tag":"div","data-slot":"form-item"},"label":"Drug Type"}

OUTPUT:
{"status":"success","best_selector":"getByLabel('Drug Type')","confidence":0.88,"reason":"label present; css-module hash class changes on rebuild","alternatives":[{"selector":"locator('[class*=\"control\"]').first()","confidence":0.70},{"selector":"getByRole('combobox').first()","confidence":0.65}]}

---

INPUT:
{"action":"click","failed_selector":"locator('//div[@id=\"react-select-3-placeholder\"]')","element":{"tag":"DIV","text":"Select"},"parent":{"tag":"div"},"label":"Refer To"}

OUTPUT:
{"status":"success","best_selector":"getByRole('combobox', { name: 'Refer To' })","confidence":0.87,"reason":"react-select-N IDs are unstable (auto-incremented); label-based role selector stable","alternatives":[{"selector":"getByLabel('Refer To')","confidence":0.84},{"selector":"locator('[class*=\"placeholder\"]').filter({ hasText: 'Select' })","confidence":0.60}]}

---

INPUT:
{"action":"click","failed_selector":"locator('(//div[@class=\"css-177swwa-control\"])[4]')","element":{"tag":"DIV"},"label":"Intake"}

OUTPUT:
{"status":"success","best_selector":"getByLabel('Intake')","confidence":0.90,"reason":"label available; CSS-module class unstable","alternatives":[{"selector":"locator('[class*=\"control\"]').nth(3)","confidence":0.68},{"selector":"getByRole('combobox', { name: 'Intake' })","confidence":0.85}]}

---

INPUT:
{"action":"click","failed_selector":"getByRole('button', { name: 'Add' })","element":{"tag":"BUTTON","text":"Add","role":"button"},"previous_step":"click: locator('//span[text()=\"Medical History\"]')"}

OUTPUT:
{"status":"success","best_selector":"getByRole('button', { name: 'Add' }).first()","confidence":0.90,"reason":"multiple Add buttons on page; first() targets Medical History section based on previous step context","alternatives":[{"selector":"getByRole('button', { name: 'Add' }).nth(0)","confidence":0.90}]}

---

INPUT:
{"action":"fill","failed_selector":"locator('input[name=\"pin_code\"]')","element":{"tag":"INPUT","name":"pin_code","type":"text","placeholder":"Enter"},"label":"Pin Code *"}

OUTPUT:
{"status":"success","best_selector":"getByRole('textbox', { name: 'Pin Code *' })","confidence":0.94,"reason":"label includes asterisk (required marker) which is part of accessible name; name attribute fragile if renamed","alternatives":[{"selector":"getByLabel('Pin Code *')","confidence":0.91},{"selector":"locator('input[name=\"pin_code\"]')","confidence":0.75}]}

---

INPUT:
{"action":"fill","failed_selector":"getByRole('spinbutton', { name: 'Pin Code *' })","element":{"tag":"INPUT","name":"pin_code","type":"number","aria_label":"Pin Code *"},"label":"Pin Code *"}

OUTPUT:
{"status":"success","best_selector":"getByLabel('Pin Code *')","confidence":0.92,"reason":"spinbutton = type=number ARIA role; unstable across browsers; label selector avoids role dependency","alternatives":[{"selector":"locator('input[name=\"pin_code\"]')","confidence":0.86},{"selector":"getByRole('textbox', { name: 'Pin Code *' })","confidence":0.70}]}

════════════════════════════════
Output STRICT JSON ONLY — no markdown, no text outside JSON.
{"status":"success","best_selector":"...","confidence":0.00,"reason":"...","alternatives":[{"selector":"...","confidence":0.00}]}`.trim();

// Provider-agnostic enable flag
function isHealEnabled() {
  return process.env.SELF_HEAL_ENABLED !== 'false';
}

// ─────────────────────────────────────────────────────────────────────────────

class BaseHealer {
  /**
   * Build compact JSON payload — NO HTML sent to LLM.
   */
  _buildInputJson(failedSelector, action, pageUrl, nearbyContext, previousContext) {
    const clean = obj => JSON.parse(JSON.stringify(obj, (_, v) => (v === null || v === undefined || v === '') ? undefined : v));

    const payload = { action, url: pageUrl, failed_selector: failedSelector };

    if (previousContext) {
      payload.previous_step = `${previousContext.action}: ${previousContext.selector}`;
    }

    if (nearbyContext) {
      const t = nearbyContext.target || {};
      payload.element = clean({
        tag:         (t.tag || '').toUpperCase() || undefined,
        text:        t.text        || undefined,
        role:        t.role        || undefined,
        aria_label:  t['aria-label'] || nearbyContext.label || undefined,
        testid:      t['data-testid'] || t['data-test'] || undefined,
        name:        t.name        || undefined,
        placeholder: t.placeholder || undefined,
        type:        t.type        || undefined,
        id:          /^[a-z][\w-]*$/i.test(t.id || '') ? t.id : undefined, // skip dynamic ids
      });
      payload.label  = nearbyContext.label || undefined;
      payload.parent = nearbyContext.ancestors?.[0]
        ? clean(nearbyContext.ancestors[0])
        : undefined;
      payload.nearby = (nearbyContext.siblings || []).slice(0, 3).map(s => clean({
        tag:         (s.tag || '').toUpperCase() || undefined,
        text:        s.text        || undefined,
        placeholder: s.placeholder || undefined,
        name:        s.name        || undefined,
        role:        s.role        || undefined,
      })).filter(s => Object.keys(s).length > 1);
    }

    return clean(payload);
  }

  // Fix model habit of mixing quotes inside Playwright selectors
  _repairJson(str) {
    return str.replace(
      /("(?:best_selector|selector)"\s*:\s*")(.*?)("(?=\s*[,}\]]))/gs,
      (_, keyPart, value, endQuote) => {
        let fixed = value
          .replace(/(getBy\w+)\("([^"']*)['"]\)/g,      (_, fn, t) => `${fn}('${t}')`)
          .replace(/(:\s*)"([^"]+)"/g,                   (_, colon, t) => `${colon}'${t}'`)
          .replace(/locator\('([^']*)'\)/g,              (_, inner) => `locator('${inner.replace(/"/g, '\\"')}')`);
        fixed = fixed.replace(/(?<!\\)"/g, "'");
        return keyPart + fixed + endQuote;
      }
    );
  }

  _extractSelectorsFromRaw(raw) {
    const patterns = ['getByRole(', 'getByLabel(', 'getByPlaceholder(', 'getByText(', 'getByTestId(', 'getByAltText(', 'locator('];
    const selectors = [];
    const text = raw.replace(/```json\n?|```\n?/g, '');

    for (const pattern of patterns) {
      let index = text.indexOf(pattern);
      while (index !== -1) {
        const candidate = this._extractBalancedExpression(text.slice(index));
        if (candidate) {
          selectors.push(this._normalizeSelector(candidate));
          index = text.indexOf(pattern, index + candidate.length);
        } else {
          break;
        }
      }
    }
    return selectors.filter(Boolean);
  }

  _extractBalancedExpression(text) {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === stringChar && text[i - 1] !== '\\') {
          inString = false;
          stringChar = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(0, i + 1);
        }
      }
    }
    return null;
  }

  _normalizeSelector(selector) {
    if (!selector || typeof selector !== 'string') return '';

    let s = selector.trim();
    s = s.replace(/^["'`]+|["'`]+$/g, '');
    s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    s = s.replace(/\s+\]/g, ']');
    s = s.replace(/\[\s*name\s*=\s*(['"])([^'"]+?)\1\s*\]/g, (match, quote, value) => `[name=${quote}${value.trim()}${quote}]`);

    if (/^(getByRole|getByLabel|getByPlaceholder|getByText|getByTestId|getByAltText|locator)\([^)]*$/.test(s)) {
      s = s + ')';
    }

    return s.trim();
  }

  _parseJSON(raw) {
    const strip   = s => (s || '').replace(/^(this\.page\.|page\.)/, '').trim();
    const extract = str => {
      const match = str.match(/\{[\s\S]*\}/);
      return JSON.parse(match ? match[0] : str);
    };

    let cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

    let parsed;
    try {
      parsed = extract(cleaned);
    } catch {
      try {
        const repaired = this._repairJson(cleaned);
        console.log(`[${this.constructor.name}] 🔧 JSON repaired (mixed quotes), retrying parse`);
        parsed = extract(repaired);
      } catch {
        console.warn(`[${this.constructor.name}] Failed to parse response JSON:`, raw.slice(0, 200));
        const fallbackSelectors = this._extractSelectorsFromRaw(raw);
        return {
          selectors: fallbackSelectors,
          reasoning: fallbackSelectors.length > 0 ? 'Recovered selectors from raw text' : 'JSON parse error',
        };
      }
    }

    // New schema: { status, best_selector, confidence, reason, alternatives }
    if (parsed.best_selector) {
      const selectors = [
        strip(parsed.best_selector),
        ...(parsed.alternatives || []).map(a => strip(a.selector)),
      ].filter(Boolean).map(s => this._normalizeSelector(s)).filter(Boolean);
      return {
        selectors,
        reasoning:  parsed.reason || '',
        confidence: parsed.confidence || null,
      };
    }

    const legacySelectors = Array.isArray(parsed.selectors)
      ? parsed.selectors.map(strip).map(s => this._normalizeSelector(s)).filter(Boolean)
      : [];
    if (legacySelectors.length > 0) {
      return {
        selectors: legacySelectors,
        reasoning: parsed.reasoning || '',
      };
    }

    const fallbackSelectors = this._extractSelectorsFromRaw(raw);
    return {
      selectors: fallbackSelectors,
      reasoning: fallbackSelectors.length > 0 ? 'Recovered selectors from raw text' : parsed.reasoning || 'No selectors found',
    };
  }
}

module.exports = { BaseHealer, SYSTEM_PROMPT, isHealEnabled };
