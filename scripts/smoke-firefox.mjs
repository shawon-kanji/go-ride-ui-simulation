// End-to-end smoke test in the locally installed Firefox (headless, via WebDriver BiDi).
//
//   npm run dev            # in another terminal
//   npm run smoke:firefox  # SMOKE_HEADFUL=1 to watch it
//
// Checks: per-tab sessions (two driver tabs signed in as different drivers in one
// browser), reload keeps a tab signed in, a duplicated tab starts signed out as a new
// device, websockets open for every tab, and the simulator sees every tab on the bus.
// Phase 1: simulator map click moves a tab. Phase 2: a driver goes online (D06 → D07),
// location pings reach driver_locations, a rider request nearby (made over HTTP until
// the rider screens exist) becomes an offer card, the seen-ack lands, Accept wins.
// Needs the Go stack and the go-ride-postgres container. Screenshots go to SMOKE_OUT
// (default ./test-results/smoke).

import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:5173';
const FIREFOX = process.env.FIREFOX_PATH ?? '/Applications/Firefox.app/Contents/MacOS/firefox';
const OUT = process.env.SMOKE_OUT ?? 'test-results/smoke';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123';
const ACCOUNTS = {
  driver1: process.env.SMOKE_DRIVER1 ?? 'sim.driver1@goride.test',
  driver2: process.env.SMOKE_DRIVER2 ?? 'sim.driver2@goride.test',
  rider1: process.env.SMOKE_RIDER1 ?? 'sim.rider1@goride.test',
};

// Text that only appears once a tab is signed in: the driver home's stat card, the
// rider's temporary signed-in screen.
const DRIVER_HOME = 'Online time';
const RIDER_HOME = 'Signed in';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const waitForText = (page, text, timeout = 10_000) =>
  page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text);

const bodyText = (page) => page.evaluate(() => document.body.textContent);
const tabId = (page) => page.evaluate(() => sessionStorage.getItem('goride:tab-id'));

async function signIn(page, path, email) {
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector('input[type=email]');
  await page.type('input[type=email]', email);
  await page.type('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await waitForText(page, path.startsWith('/driver') ? DRIVER_HOME : RIDER_HOME);
}

function sql(query) {
  return execFileSync('docker', ['exec', 'go-ride-postgres', 'psql', '-U', 'postgres', '-d', 'go_ride', '-At', '-c', query], {
    encoding: 'utf8',
  }).trim();
}

async function pollSql(query, predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let value = '';
  while (Date.now() < deadline) {
    value = sql(query);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return value;
}

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => undefined);
  return { status: response.status, json };
}

async function apiLogin(role, email) {
  const path = role === 'driver' ? '/api/v1/driver/auth/login' : '/api/v1/auth/login';
  const { json } = await api(path, { method: 'POST', body: { email, password: PASSWORD } });
  return json.access_token;
}

/** Leaves driver 1 offline and rider 1 with no active request, whatever a previous run did. */
async function resetState() {
  const driverToken = await apiLogin('driver', ACCOUNTS.driver1);
  await api('/api/v1/driver/online', { method: 'PATCH', body: { is_online: false }, token: driverToken });
  const riderToken = await apiLogin('rider', ACCOUNTS.rider1);
  const { json: current } = await api('/api/v1/cab/current-trip', { token: riderToken });
  // An ongoing trip reports its request under ongoing_trip; a search under trip_request.
  const requestId = current?.ongoing_trip?.request_id ?? current?.trip_request?.request_id;
  if (current?.has_active_request || current?.has_ongoing_trip) {
    if (requestId) await api(`/api/v1/cab/request-cab/${requestId}/cancel`, { method: 'POST', body: { reason: 'other', note: 'smoke test cleanup' }, token: riderToken });
  }
}

const buttonXPath = (label, scope = '') => `xpath/.${scope}//button[normalize-space()="${label}" and not(@disabled)]`;

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  return page;
}

await mkdir(OUT, { recursive: true });
await resetState();
const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: FIREFOX,
  headless: !process.env.SMOKE_HEADFUL,
});

try {
  // 1. Driver login screen renders (redirect from /driver when signed out).
  const d1 = await newPage(browser);
  await d1.goto(`${BASE}/driver`);
  await waitForText(d1, 'Welcome back');
  check('signed-out /driver redirects to login', d1.url().endsWith('/driver/login'), d1.url());
  await d1.screenshot({ path: `${OUT}/01-driver-login.png` });

  // 2. Two driver tabs, two different drivers, same browser.
  await signIn(d1, '/driver/login', ACCOUNTS.driver1);
  const d2 = await newPage(browser);
  await d2.goto(`${BASE}/driver`);
  await waitForText(d2, 'Welcome back');
  check('a new tab starts signed out', d2.url().endsWith('/driver/login'));
  await signIn(d2, '/driver/login', ACCOUNTS.driver2);
  check('tab 1 shows driver 1', (await bodyText(d1)).includes(ACCOUNTS.driver1));
  check('tab 2 shows driver 2', (await bodyText(d2)).includes(ACCOUNTS.driver2));
  check('tabs have different device ids', (await tabId(d1)) !== (await tabId(d2)));

  // 3. Websocket opens for a signed-in tab (dev panel shows the state).
  await d1.waitForFunction(() => /Websocket\s*open/.test(document.body.textContent), { timeout: 10_000 }).then(
    () => check('driver websocket opens through the proxy', true),
    () => check('driver websocket opens through the proxy', false),
  );
  await d1.screenshot({ path: `${OUT}/02-driver-signed-in.png` });

  // 4. Reload keeps the tab signed in as the same driver and device.
  const idBefore = await tabId(d1);
  await d1.reload();
  await waitForText(d1, DRIVER_HOME);
  check('reload keeps driver 1 signed in', (await bodyText(d1)).includes(ACCOUNTS.driver1));
  check('reload keeps the same device id', (await tabId(d1)) === idBefore);

  // 5. Rider tab in the rider theme.
  const r1 = await newPage(browser);
  await r1.goto(`${BASE}/user`);
  await waitForText(r1, 'Welcome back');
  await r1.screenshot({ path: `${OUT}/03-rider-login.png` });
  await signIn(r1, '/user/login', ACCOUNTS.rider1);
  await r1.waitForFunction(() => /Websocket\s*open/.test(document.body.textContent), { timeout: 10_000 }).then(
    () => check('rider websocket opens through the proxy', true),
    () => check('rider websocket opens through the proxy', false),
  );
  await r1.screenshot({ path: `${OUT}/04-rider-signed-in.png` });

  // 6. Simulator sees all three tabs.
  const sim = await newPage(browser);
  await sim.goto(`${BASE}/simulator`);
  await sim
    .waitForFunction(
      (emails) => emails.every((e) => document.body.textContent.includes(e)),
      { timeout: 10_000 },
      Object.values(ACCOUNTS),
    )
    .then(
      () => check('simulator lists every signed-in tab', true),
      () => check('simulator lists every signed-in tab', false),
    );
  // 6b. Phase 1: select driver 1 in the simulator, click the map, and the driver's tab
  //     must report the new simulated position within a second.
  const mapsErrors = [];
  sim.on('console', (msg) => {
    if (/Google Maps JavaScript API (error|warning)|InvalidKey|RefererNotAllowed|ApiNotActivated/i.test(msg.text())) {
      mapsErrors.push(msg.text());
    }
  });
  const d1TabId = await tabId(d1);
  await sim.waitForSelector('.gm-style', { timeout: 15_000 }).then(
    () => check('simulator map loads', true),
    () => check('simulator map loads', false),
  );
  await sim.click(`[data-testid="tab-row-${d1TabId}"]`);
  const mapBox = await (await sim.$('.gm-style')).boundingBox();
  await sim.mouse.click(mapBox.x + mapBox.width * 0.4, mapBox.y + mapBox.height * 0.55);
  const clickedAt = Date.now();
  await d1
    .waitForFunction(
      () => /^-?\d+\.\d{5}, -?\d+\.\d{5}$/.test(document.querySelector('[data-testid="current-location"]')?.textContent ?? ''),
      { timeout: 1_000, polling: 50 },
    )
    .then(
      () => check('map click moves the driver tab within 1s', true, `${Date.now() - clickedAt}ms`),
      () => check('map click moves the driver tab within 1s', false),
    );
  const placed = await d1.$eval('[data-testid="current-location"]', (el) => el.textContent);
  await sim
    .waitForFunction((coords) => document.body.textContent.includes(coords), { timeout: 5_000 }, placed)
    .then(
      () => check('simulator shows the confirmed position', true, placed),
      () => check('simulator shows the confirmed position', false, placed),
    );
  const d1Reloaded = await d1.reload().then(() => d1.waitForSelector('[data-testid="current-location"]'));
  check('simulated position survives a reload', (await d1Reloaded.evaluate((el) => el.textContent)) === placed);
  check('no Google Maps key errors', mapsErrors.length === 0, mapsErrors[0] ?? '');
  await d1.screenshot({ path: `${OUT}/05a-driver-placed.png` });
  await sim.screenshot({ path: `${OUT}/05-simulator.png` });

  // 6c. Phase 2: driver 1 goes online through D06 → D07, location pings reach the
  //     database, a rider request nearby becomes an offer card, Accept wins the trip.
  let requestId = null;
  let riderToken = null;
  try {
    const driverId = await d1.evaluate(() => JSON.parse(sessionStorage.getItem('goride:session:driver')).user.id);
    await d1.bringToFront();
    await (await d1.waitForSelector(buttonXPath('Go online'), { timeout: 10_000 })).click();
    await d1.waitForSelector('[role=dialog]');
    await d1.screenshot({ path: `${OUT}/06-driver-confirm-online.png` });
    await (await d1.waitForSelector(buttonXPath('Go online', '//*[@role="dialog"]'))).click();
    await waitForText(d1, "You're online").then(
      () => check('driver goes online through the D07 confirmation', true),
      () => check('driver goes online through the D07 confirmation', false),
    );

    const fresh = await pollSql(
      `select count(*) from driver_locations where driver_id = '${driverId}' and recorded_at > now() - interval '1 minute'`,
      (value) => Number(value) > 0,
    );
    check('location ping reaches driver_locations', Number(fresh) > 0, `${fresh} fresh row(s)`);
    await d1.screenshot({ path: `${OUT}/06-driver-online.png` });

    // Rider 1 books a ride starting ~200m from the driver (HTTP until Phase 3's screens).
    const where = await d1.evaluate(() => JSON.parse(sessionStorage.getItem('goride:location')).simulated);
    riderToken = await apiLogin('rider', ACCOUNTS.rider1);
    const estimate = await api('/api/v1/cab/fare-estimate', {
      method: 'POST',
      token: riderToken,
      body: { pickup_lat: where.lat + 0.0015, pickup_lng: where.lng + 0.001, dropoff_lat: where.lat + 0.025, dropoff_lng: where.lng + 0.02 },
    });
    const quote = estimate.json?.quotes?.find((q) => q.service_type === 'RIDE');
    const booked = await api('/api/v1/cab/request-cab', {
      method: 'POST',
      token: riderToken,
      headers: { 'Idempotency-Key': `smoke-${Date.now()}` },
      body: { fare_id: quote?.fare_id },
    });
    requestId = booked.json?.request_id ?? null;
    check('rider request is accepted by cab-request-handler', booked.status < 300 && !!requestId, `HTTP ${booked.status}`);

    const bookedAt = Date.now();
    await d1.waitForSelector('[data-testid="offer-card"][data-state="live"]', { timeout: 30_000 }).then(
      () => check('offer card appears in the driver tab', true, `${Date.now() - bookedAt}ms after booking`),
      () => check('offer card appears in the driver tab', false),
    );
    check('driver tab opens D08 on arrival', d1.url().endsWith('/driver/offers'), d1.url());
    const delivery = await pollSql(
      `select delivery_status from driver_job_offers where driver_id = '${driverId}' order by created_at desc limit 1`,
      (value) => value === 'seen',
      8_000,
    );
    check('seen-ack is recorded by the gateway', delivery === 'seen', delivery);
    await new Promise((resolve) => setTimeout(resolve, 1_500)); // let place names load
    await d1.screenshot({ path: `${OUT}/07-driver-offers.png` });

    await (await d1.waitForSelector(buttonXPath('Accept', '//article[@data-testid="offer-card"]'))).click();
    await waitForText(d1, 'Trip assigned').then(
      () => check('accepting wins the trip', true),
      () => check('accepting wins the trip', false),
    );
    await d1.screenshot({ path: `${OUT}/08-driver-trip-assigned.png` });
  } finally {
    // Cancel as the rider so driver 1 isn't left on a trip, then take them offline.
    if (requestId && riderToken) {
      await api(`/api/v1/cab/request-cab/${requestId}/cancel`, { method: 'POST', token: riderToken, body: { reason: 'other', note: 'smoke test cleanup' } });
    }
    const driverToken = await apiLogin('driver', ACCOUNTS.driver1);
    await api('/api/v1/driver/online', { method: 'PATCH', body: { is_online: false }, token: driverToken });
    await d1.goto(`${BASE}/driver`);
  }

  // 7. "Duplicate tab": a new tab that boots with a copy of tab 1's sessionStorage.
  const copied = await d1.evaluate(() => JSON.stringify(Object.entries(sessionStorage)));
  const dup = await newPage(browser);
  await dup.evaluateOnNewDocument((entries) => {
    if (sessionStorage.getItem('goride:tab-id')) return;
    for (const [key, value] of JSON.parse(entries)) sessionStorage.setItem(key, value);
  }, copied);
  await dup.goto(`${BASE}/driver`);
  await waitForText(dup, 'Welcome back');
  check('duplicated tab starts signed out', dup.url().endsWith('/driver/login'), dup.url());
  check('duplicated tab gets a new device id', (await tabId(dup)) !== idBefore);
  await d1.reload();
  await waitForText(d1, DRIVER_HOME);
  check('original tab is still signed in', (await bodyText(d1)).includes(ACCOUNTS.driver1));

  // 8. Logout signs out that tab only.
  await d2.bringToFront();
  await d2.goto(`${BASE}/driver/menu`);
  const logout = await d2.waitForSelector('xpath/.//button[normalize-space()="Log out"]');
  await logout.click();
  await waitForText(d2, 'Welcome back');
  await d1.reload();
  await waitForText(d1, DRIVER_HOME);
  check('logging out tab 2 leaves tab 1 signed in', (await bodyText(d1)).includes(ACCOUNTS.driver1));
} catch (error) {
  const where = String(error?.stack ?? '')
    .split('\n')
    .filter((line) => line.includes('smoke-firefox.mjs'))
    .map((line) => line.replace(/.*smoke-firefox\.mjs:/, 'line '))
    .join(' ← ');
  check('smoke run finished without errors', false, `${error} ${where.trim()}`);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${OUT}/`);
process.exit(failed ? 1 : 0);
