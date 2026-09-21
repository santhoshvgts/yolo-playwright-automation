/**
 * claudeHealer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Claude (cloud LLM) integration for self-healing Playwright selectors.
 * Used as the cloud fallback/comparison alongside the local providers
 * (LM Studio / Ollama).
 *
 * .env config:
 *   ANTHROPIC_API_KEY = sk-ant-...        (required)
 *   CLAUDE_MODEL       = claude-sonnet-5  (default; optional override)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true, quiet: true });

const Anthropic = require('@anthropic-ai/sdk');
const { BaseHealer, SYSTEM_PROMPT, isHealEnabled } = require('./healerBase');

const DEFAULT_MODEL   = 'claude-sonnet-5';
const HEAL_TIMEOUT_MS = 60000; // cloud call — no need for the local providers' long timeout
const MAX_RETRIES     = 3;
const RETRY_DELAY     = [2000, 5000, 10000];

// ─────────────────────────────────────────────────────────────────────────────

class ClaudeHealer extends BaseHealer {
  constructor() {
    super();
    this.model  = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this._client = this.apiKey ? new Anthropic({ apiKey: this.apiKey, timeout: HEAL_TIMEOUT_MS }) : null;
  }

  get isEnabled() {
    return isHealEnabled() && !!this.apiKey;
  }

  // ── Connectivity check — just confirm a key is configured, don't spend a call
  async checkOnline() {
    if (!isHealEnabled()) return false;
    return !!this.apiKey;
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
    if (!isHealEnabled())  return { selectors: [], reasoning: 'Self-healing disabled' };
    if (!this._client)     return { selectors: [], reasoning: 'ANTHROPIC_API_KEY not configured' };

    const inputJson = this._buildInputJson(failedSelector, action, pageUrl, nearbyContext, previousContext);
    const inputStr  = JSON.stringify(inputJson, null, 2);

    console.log(`[ClaudeHealer] 🤖 Calling Claude (${this.model})...`);
    console.log(`[ClaudeHealer]    Failed: "${failedSelector}" | Action: ${action}`);
    console.log(`[ClaudeHealer]    Payload: ${inputStr.length} chars (JSON only, no HTML)`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this._client.messages.create({
          model:       this.model,
          max_tokens:  1024,
          temperature: 0.1,
          system:      SYSTEM_PROMPT,
          messages:    [{ role: 'user', content: inputStr }],
        });

        const raw = response.content?.find(b => b.type === 'text')?.text || '';
        console.log('[ClaudeHealer] ⚙️  Extracted raw text:', raw.slice(0, 200));
        const parsed = this._parseJSON(raw);

        const conf = parsed.confidence != null ? ` (confidence: ${parsed.confidence})` : '';
        console.log(`[ClaudeHealer] ✅ Got ${parsed.selectors.length} suggestion(s)${conf}:`, parsed.selectors);
        return parsed;

      } catch (err) {
        const status      = err.status || err.response?.status;
        const isRetryable = status === 429 || status === 500 || status === 503 || err.message?.includes('fetch failed');

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY[attempt - 1];
          console.warn(`[ClaudeHealer] ⚠️  Retryable error (${err.message?.slice(0, 60)}) — retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error('[ClaudeHealer] ❌ API call failed:', err.message);
        return { selectors: [], reasoning: `Claude error: ${err.message}` };
      }
    }

    return { selectors: [], reasoning: 'Claude max retries exceeded' };
  }
}

module.exports = { ClaudeHealer };
