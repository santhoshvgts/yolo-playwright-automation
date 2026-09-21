/**
 * ollamaHealer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ollama (local LLM) integration for self-healing Playwright selectors.
 *
 * Uses Ollama's native API: POST http://localhost:11434/api/chat
 * Start Ollama → `ollama pull qwen3-coder:30b` → `ollama serve` (usually already running as a service).
 *
 * .env config (optional overrides):
 *   OLLAMA_URL   = http://localhost:11434   (default)
 *   OLLAMA_MODEL = qwen3-coder:30b          (default)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true, quiet: true });

const { BaseHealer, SYSTEM_PROMPT, isHealEnabled } = require('./healerBase');

const DEFAULT_URL     = 'http://localhost:11434';
const DEFAULT_MODEL   = 'qwen3-coder:30b';
const HEAL_TIMEOUT_MS = 4500000;
const MAX_RETRIES     = 3;
const RETRY_DELAY     = [15000, 30000, 50000];

// ─────────────────────────────────────────────────────────────────────────────

class OllamaHealer extends BaseHealer {
  constructor() {
    super();
    this.baseUrl = (process.env.OLLAMA_URL || DEFAULT_URL).replace(/\/$/, '');
    this.model   = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
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
      const res = await fetch(`${this.baseUrl}/api/tags`, {
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

    console.log(`[OllamaHealer] 🤖 Calling Ollama (${this.model})...`);
    console.log(`[OllamaHealer]    Failed: "${failedSelector}" | Action: ${action}`);
    console.log(`[OllamaHealer]    Payload: ${inputStr.length} chars (JSON only, no HTML)`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal:  AbortSignal.timeout(HEAL_TIMEOUT_MS),
          body: JSON.stringify({
            model:   this.model,
            stream:  false,
            options: { temperature: 0.1 },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user',   content: inputStr },
            ],
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }

        const data = await res.json();
        console.log('[OllamaHealer] ⚙️  Raw response:', JSON.stringify(data).slice(0, 300));
        const raw = data.message?.content || '';
        console.log('[OllamaHealer] ⚙️  Extracted raw text:', raw.slice(0, 200));
        const parsed = this._parseJSON(raw);

        const conf = parsed.confidence != null ? ` (confidence: ${parsed.confidence})` : '';
        console.log(`[OllamaHealer] ✅ Got ${parsed.selectors.length} suggestion(s)${conf}:`, parsed.selectors);
        return parsed;

      } catch (err) {
        const isRetryable = err.message.includes('ECONNREFUSED')
                         || err.message.includes('fetch failed');

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY[attempt - 1];
          console.warn(`[OllamaHealer] ⚠️  Retryable error (${err.message.slice(0, 60)}) — retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error('[OllamaHealer] ❌ API call failed:', err.message);
        if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
          console.error('[OllamaHealer]    Is Ollama running? Start server at:', this.baseUrl);
        }
        return { selectors: [], reasoning: `Ollama error: ${err.message}` };
      }
    }

    return { selectors: [], reasoning: 'Ollama max retries exceeded' };
  }
}

module.exports = { OllamaHealer };
