/**
 * Price list / offer clean-up through the app's API instead of the UI (seconds instead of minutes).
 *
 * The app calls https://invoice.<env>.api.vgts.xyz/ with `authorization`, `organization` and `branch`
 * headers. Rather than rebuild them, apiSession() opens the org in the browser and copies them from the
 * app's own first API request, so they always match what the UI uses.
 *
 *   GET   item/price-list/?page=&page_size=&search=   → { num_pages, data: [{ id, name, status, … }] }
 *   PATCH item/price-list/<id>/                        → flips status (no body; same call as the list switch)
 *   GET   item/scheme/?page=&page_size=&search=        → offers, same shape
 *   PATCH item/scheme-update/<id>/                     → flips an offer's status
 *
 * The PATCH flips, so only lists that are active are sent, and each is read back afterwards.
 */
const { appUrls } = require('../test-data/UserData');

const KINDS = {
  priceList: { list: 'item/price-list/', toggle: (id) => `item/price-list/${id}/`, label: 'price list' },
  offer: { list: 'item/scheme/', toggle: (id) => `item/scheme-update/${id}/`, label: 'offer' },
};

/**
 * Opens the org and returns { request, base, headers } for API calls in that org.
 * The headers come from the price-list request of the Pricing tab: the first requests after an org
 * switch can still carry the previous org's `branch`, and then every list comes back empty.
 */
async function apiSession(page, orgId) {
  const shell = `${appUrls.invoice}/${orgId}`;
  await page.goto(shell);
  await page.locator('//a[text()="Sales"]').waitFor({ timeout: 60_000 });
  const listCall = page.waitForRequest(
    (r) => /\/\/invoice\.[\w.-]*api\.vgts\.xyz\/item\/price-list\/\?/.test(r.url()) && !!r.headers().authorization,
    { timeout: 60_000 },
  );
  await page.goto(`${shell}/inventory?tab=4`);
  const req = await listCall;
  const h = req.headers();
  const headers = { authorization: h.authorization, organization: h.organization };
  if (h.branch) headers.branch = h.branch;
  return { request: page.request, base: `${new URL(req.url()).origin}/`, headers };
}

async function call(api, method, path, params) {
  const url = new URL(path, api.base);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const res = await api.request.fetch(url.href, { method, headers: api.headers, timeout: 30_000 });
  if (!res.ok()) throw new Error(`${method} ${url.pathname} → ${res.status()}`);
  return res.status() === 204 ? null : res.json().catch(() => null);
}

/** Every list / offer whose name matches the search (all pages). */
async function findAll(api, kind, search) {
  const k = KINDS[kind];
  const rows = [];
  for (let page = 1, pages = 1; page <= pages && page <= 200; page++) {
    const j = await call(api, 'GET', k.list, { page, page_size: 100, search });
    rows.push(...(j.data || j.results || []));
    pages = j.num_pages || 1;
  }
  return rows;
}

const matches = (name, prefix, exact) => {
  const n = String(name).trim().toLowerCase();
  const p = String(prefix).trim().toLowerCase();
  return exact ? n === p : n.startsWith(p);
};

/**
 * Switches off every active list / offer named `prefix…` (or exactly `prefix` with exact: true, or one of
 * `names`). Returns { found, switched, stuck: [names still active] }.
 */
async function deactivate(api, kind, { prefix, exact = false, names } = {}) {
  const k = KINDS[kind];
  const wanted = names ? new Set(names.map((n) => String(n).trim().toLowerCase())) : null;
  const pick = (r) => (wanted ? wanted.has(String(r.name).trim().toLowerCase()) : matches(r.name, prefix, exact));
  // One search per name (a handful), or one for the prefix
  const searches = names ? [...wanted] : [String(prefix).trim()];
  const active = async () => {
    const byId = new Map();
    for (const s of searches) for (const r of await findAll(api, kind, s)) if (r.status === true && pick(r)) byId.set(r.id, r);
    return [...byId.values()];
  };

  let todo = await active();
  const found = todo.length;
  let switched = 0;
  // Up to 3 rounds: a list switched back on by someone else in between is caught on the next round
  for (let round = 0; round < 3 && todo.length; round++) {
    for (let i = 0; i < todo.length; i += 5) {
      const batch = todo.slice(i, i + 5);
      const done = await Promise.all(batch.map((r) => call(api, 'PATCH', k.toggle(r.id)).then(() => true, (e) => { console.log(`  ${k.label} "${r.name}": ${e.message}`); return false; })));
      switched += done.filter(Boolean).length;
    }
    todo = await active();
  }
  const what = names ? `${names.length} named ${k.label}(s)` : `"${prefix}"${exact ? ' (exact)' : ''} ${k.label}s`;
  console.log(`API: ${what} — ${found} active, switched off ${switched}${todo.length ? `, ${todo.length} still active: ${todo.map((r) => r.name).join(', ')}` : ''}`);
  return { found, switched, stuck: todo.map((r) => r.name) };
}

module.exports = { apiSession, findAll, deactivate };
