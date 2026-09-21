/**
 * lmStudioHealer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LM Studio (local LLM) integration for self-healing Playwright selectors.
 *
 * Uses LM Studio native API: POST http://localhost:1234/api/v1/chat
 * Start LM Studio → Load model → Enable "Local Server" tab → Start server.
 *
 * .env config (optional overrides):
 *   LM_STUDIO_URL   = http://localhost:1234   (default)
 *   LM_STUDIO_MODEL = qwen/qwen3-coder-next   (default; match name shown in LM Studio)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true, quiet: true });

const { BaseHealer, SYSTEM_PROMPT, isHealEnabled } = require('./healerBase');

const DEFAULT_URL     = 'http://localhost:1234';
const DEFAULT_MODEL   = 'qwen/qwen3-coder-next';
const HEAL_TIMEOUT_MS = 4500000;

// ─────────────────────────────────────────────────────────────────────────────

class LmStudioHealer extends BaseHealer {
  constructor() {
    super();
    this.baseUrl = (process.env.LM_STUDIO_URL || DEFAULT_URL).replace(/\/$/, '');
    this.model   = process.env.LM_STUDIO_MODEL || DEFAULT_MODEL;
    this._alive  = null; // null = unchecked
  }

  get isEnabled() {
    return isHealEnabled() && this._alive !== false;
  }

  // ── Fast connectivity check (cached per instance) ─────────────────────────

  async checkOnline() {
    if (!isHealEnabled()) return (this._alive = false);
    if (this._alive !== null) return this._alive;
    try {
      // GET /api/v1/models — lightweight, no inference, returns immediately
      const res = await fetch(`${this.baseUrl}/api/v1/models`, {
        signal: AbortSignal.timeout(3000),
      });
      this._alive = res.ok;
    } catch {
      this._alive = false;
    }
    return this._alive;
  }

  // ── Heal a broken locator ─────────────────────────────────────────────────

  /**
   * @param {string} failedSelector
   * @param {string} action               - 'click' | 'fill' | 'find' | 'assert'
   * @param {string} _domSnapshot         - kept for API compat; not sent to LLM
   * @param {string} pageUrl
   * @param {{ selector: string, nearbyCtx: object, action: string }|null} previousContext
   * @param {object|null} nearbyContext   - structured element context from _extractNearbyContext
   * @returns {{ selectors: string[], reasoning: string, confidence?: number }}
   */
  async healLocator(failedSelector, action, _domSnapshot, pageUrl, previousContext = null, nearbyContext = null) {
    if (!isHealEnabled()) return { selectors: [], reasoning: 'Self-healing disabled' };

    const inputJson = this._buildInputJson(failedSelector, action, pageUrl, nearbyContext, previousContext);
    const inputStr  = JSON.stringify(inputJson, null, 2);

    console.log(`[LmStudioHealer] 🤖 Calling LM Studio (${this.model})...`);
    console.log(`[LmStudioHealer]    Failed: "${failedSelector}" | Action: ${action}`);
    console.log(`[LmStudioHealer]    Payload: ${inputStr.length} chars (JSON only, no HTML)`);

    const MAX_RETRIES = 3;
    const RETRY_DELAY = [15000, 30000, 50000];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal:  AbortSignal.timeout(HEAL_TIMEOUT_MS),
          body: JSON.stringify({
            model:        this.model,
            temperature:  0.1,
            system_prompt: SYSTEM_PROMPT,
            input:         inputStr,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          const isModelReload = res.status === 500 && body.includes('Model reloaded');

          if (isModelReload && attempt < MAX_RETRIES) {
            const delay = RETRY_DELAY[attempt - 1];
            console.warn(`[LmStudioHealer] ⚠️  Model reloading — retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }

        // Parse non-streaming JSON response
        const data    = await res.json();
        console.log('[LmStudioHealer] ⚙️  Raw response:', JSON.stringify(data).slice(0, 300));
        // LM Studio native: { output: [{ type: 'message', content: '...' }] }
        // OpenAI-compat:    { choices: [{ message: { content: '...' } }] }
        const outputArr = Array.isArray(data) ? data : (data.output || []);
        const raw = outputArr.find?.(d => d.type === 'message')?.content
                 || data.choices?.[0]?.message?.content
                 || '';
        console.log('[LmStudioHealer] ⚙️  Extracted raw text:', raw.slice(0, 200));
        const parsed = this._parseJSON(raw);

        const conf = parsed.confidence != null ? ` (confidence: ${parsed.confidence})` : '';
        console.log(`[LmStudioHealer] ✅ Got ${parsed.selectors.length} suggestion(s)${conf}:`, parsed.selectors);
        return parsed;

      } catch (err) {
        const isRetryable = err.message.includes('ECONNREFUSED')
                         || err.message.includes('fetch failed')
                         || err.message.includes('Model reloaded');

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY[attempt - 1];
          console.warn(`[LmStudioHealer] ⚠️  Retryable error (${err.message.slice(0, 60)}) — retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error('[LmStudioHealer] ❌ API call failed:', err.message);
        if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
          console.error('[LmStudioHealer]    Is LM Studio running? Start server at:', this.baseUrl);
        }
        return { selectors: [], reasoning: `LM Studio error: ${err.message}` };
      }
    }

    return { selectors: [], reasoning: 'LM Studio max retries exceeded' };
  }
}

module.exports = { LmStudioHealer };
