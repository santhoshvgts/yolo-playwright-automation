/**
 * llmHealerFactory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Picks which LLM healer backs self-healing, based on .env.
 *
 *   LLM_PROVIDER=lmstudio  → LmStudioHealer (local, default for this project)
 *   LLM_PROVIDER=ollama    → OllamaHealer   (local)
 *   LLM_PROVIDER=claude    → ClaudeHealer   (cloud)
 *
 * All three expose the same shape: checkOnline() + healLocator(...),
 * so swapping providers needs no change anywhere else in the codebase.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true, quiet: true });

const { LmStudioHealer } = require('./lmStudioHealer');
const { OllamaHealer }   = require('./ollamaHealer');
const { ClaudeHealer }   = require('./claudeHealer');

function getHealer() {
  const provider = (process.env.LLM_PROVIDER || 'lmstudio').toLowerCase();

  switch (provider) {
    case 'claude':   return new ClaudeHealer();
    case 'ollama':   return new OllamaHealer();
    case 'lmstudio':
    default:         return new LmStudioHealer();
  }
}

module.exports = { getHealer };
