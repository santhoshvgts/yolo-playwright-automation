/**
 * Retry API GETs that the gateway answers with 502 / 503 / 504.
 *
 * UAT's API gateway (nginx) now and then answers 502 Bad Gateway, without CORS headers, so the browser
 * reports net::ERR_FAILED. When that hits the app's user-info call (core/user-info/), the app treats
 * it as an invalid session: it deletes the Passcode cookie and goes back to the landing page. The test
 * is logged out halfway through. More parallel workers means more 502s.
 * App defect: one failed user-info call (retry: false) logs the user out.
 *
 * It happens when several browsers load pages at once (each page fires ~30 API calls together); one call
 * at a time never gets a 502. GETs are safe to repeat, so a gateway error is retried a few times before
 * the page sees it. Other methods
 * (saves, deletes) are passed through untouched. API_RETRY=false turns this off.
 */
const API_HOST = /^https:\/\/[^/]+\.api\.[^/]+\//;
const ATTEMPTS = 4;
const GATEWAY_ERROR = [502, 503, 504];
const INSTALLED = Symbol('apiRetry');

async function retryGatewayErrors(context) {
  if (process.env.API_RETRY === 'false' || context[INSTALLED]) return;
  context[INSTALLED] = true;
  await context.route(API_HOST, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    let resp = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      resp = await route.fetch().catch(() => null);
      // Only gateway errors pass: a 500 is the API's own answer (e.g. erp-announcements always 500s)
      if (resp && !GATEWAY_ERROR.includes(resp.status())) break;
      if (attempt < ATTEMPTS) {
        console.log(`[api] ${new URL(route.request().url()).pathname} → ${resp ? resp.status() : 'no response'}, retry ${attempt}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    // The page or context may be gone by now (test finished) — nothing left to answer
    if (resp) await route.fulfill({ response: resp }).catch(() => {});
    else await route.abort().catch(() => {});
  });
}

module.exports = { retryGatewayErrors };
