// End-to-end smoke test in the locally installed Firefox (headless, via WebDriver BiDi).
//
//   npm run dev            # in another terminal
//   npm run smoke:firefox  # SMOKE_HEADFUL=1 to watch it
//
// Checks: per-tab sessions (two driver tabs signed in as different drivers in one
// browser), reload keeps a tab signed in, a duplicated tab starts signed out as a new
// device, websockets open for every tab, and the simulator sees every tab on the bus.
// Phase 1: simulator map click moves a tab. Phase 2: a driver goes online (D06 → D07),
// location pings reach driver_locations. Phase 3: the rider books through R01 → R04,
// both online drivers get the offer, driver 1 accepts and driver 2's card goes to
// "taken", the rider sees R05 (driver, plate, start PIN), moving driver 1 in the
// simulator moves it on the rider's map. Phase 4: driver 1 cancels before pickup (D10)
// and the request is redispatched to driver 2; driver 2 starts with the PIN (a wrong one
// is rejected), ends, collects cash; the rider sees R06, pays and rates; then a second
// booking the rider cancels mid-trip. Phase 5: the simulator drives driver 2 along real
// roads — D09's Navigate without a simulator says so; auto-drive takes the car to the
// pickup (every stored ping on the route, D09 and R05 on the same route, the rider's ETA
// counting down to "Arriving now"); pause holds the car; a manual move stops the drive
// and un-shares the route; Navigate restarts it; after the PIN it drives the booked route
// to the drop-off. Phase 5b: quick setup opens three more drivers that sign themselves in
// (test accounts from go-ride-backend, DEV_TOOLS_ENABLED=true), scatter + online, a booking
// reaches all three, and a saved layout puts them back after they're moved.
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

// Text that only appears once a tab is signed in: the driver home's stat card, R01.
const DRIVER_HOME = 'Online time';
const RIDER_HOME = 'Choose on map';

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

/** Leaves both drivers offline with no trip and rider 1 with no active request, whatever a previous run did. */
async function resetState() {
  for (const email of [ACCOUNTS.driver1, ACCOUNTS.driver2]) {
    const driverToken = await apiLogin('driver', email);
    // A trip left mid-way keeps that driver out of dispatch. awaiting_payment can't be
    // cancelled by anyone, so it's collected instead.
    const { json: trip } = await api('/api/v1/driver-trips/current-trip', { token: driverToken });
    const ongoing = trip?.ongoing_trip;
    if (ongoing?.status === 'awaiting_payment') {
      await api(`/api/v1/driver-trips/ongoing-trips/${ongoing.trip_record_id}/collect-payment`, { method: 'POST', token: driverToken });
    } else if (ongoing) {
      await api(`/api/v1/driver-trips/ongoing-trips/${ongoing.trip_record_id}/cancel`, { method: 'POST', token: driverToken, body: { reason: 'other', note: 'smoke test cleanup' } });
    }
    await api('/api/v1/driver/online', { method: 'PATCH', body: { is_online: false }, token: driverToken });
  }
  const riderToken = await apiLogin('rider', ACCOUNTS.rider1);
  const { json: current } = await api('/api/v1/cab/current-trip', { token: riderToken });
  // An ongoing trip reports its request under ongoing_trip; a search under trip_request.
  const requestId = current?.ongoing_trip?.request_id ?? current?.trip_request?.request_id;
  if (current?.has_active_request || current?.has_ongoing_trip) {
    if (requestId) await api(`/api/v1/cab/request-cab/${requestId}/cancel`, { method: 'POST', body: { reason: 'other', note: 'smoke test cleanup' }, token: riderToken });
  }
}

const buttonXPath = (label, scope = '') => `xpath/.${scope}//button[normalize-space()="${label}" and not(@disabled)]`;

/** D06 → D07 → online. */
async function goOnline(page) {
  await page.bringToFront();
  await (await page.waitForSelector(buttonXPath('Go online'), { timeout: 10_000 })).click();
  await page.waitForSelector('[role=dialog]');
  await (await page.waitForSelector(buttonXPath('Go online', '//*[@role="dialog"]'))).click();
  await waitForText(page, "You're online");
}

/** Moves a tab exactly as the simulator does: a set-location message on the bus. */
const placeTab = (sim, id, lat, lng) =>
  sim.evaluate((msg) => new BroadcastChannel('goride-sim').postMessage(msg), { type: 'set-location', tabId: id, lat, lng });

const riderTrip = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('goride:rider-trip') ?? 'null'));

/** Types into D09's hidden PIN field, replacing whatever is there. */
async function enterPin(page, pin) {
  await page.evaluate(() => document.querySelector('[data-testid="start-pin-input"]').focus());
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await page.type('[data-testid="start-pin-input"]', pin);
}

/** R01 → R02 → R03 → Book, using the Suggested row at `index`. */
async function bookFromR01(page, index = 1) {
  await page.bringToFront();
  await page.waitForSelector('[data-testid="suggested-place"]');
  await (await page.$$('[data-testid="suggested-place"]'))[index].click();
  await page.waitForFunction(
    () => {
      const t = document.querySelector('[data-testid="pin-place"]')?.textContent ?? '';
      return t !== '' && !/Finding|Moving/.test(t);
    },
    { timeout: 15_000 },
  );
  await (await page.waitForSelector(buttonXPath('Choose this pickup'))).click();
  await page.waitForSelector('[data-testid="tier-RIDE"]', { timeout: 15_000 });
  await (await page.waitForSelector('xpath/.//button[starts-with(normalize-space(), "Book Standard") and not(@disabled)]')).click();
  await page.waitForSelector('[data-testid="finding-headline"]', { timeout: 10_000 });
}

/** Waits for a live offer in a driver tab and accepts it. */
async function acceptOffer(page) {
  await page.bringToFront();
  await page.waitForSelector('[data-testid="offer-card"][data-state="live"]', { timeout: 30_000 });
  await (await page.waitForSelector(buttonXPath('Accept', '//article[@data-testid="offer-card"]'))).click();
  await page.waitForSelector('[data-testid="start-pin-input"]', { timeout: 10_000 });
}

/** Google encoded polyline → points (as src/shared/route/polyline.ts). */
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Metres from a point to the nearest part of a path (flat projection per segment). */
function metresOffPath(point, path) {
  const metresPerDeg = (Math.PI / 180) * 6_371_008.8;
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const kx = metresPerDeg * Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * metresPerDeg;
    const px = (point.lng - a.lng) * kx;
    const py = (point.lat - a.lat) * metresPerDeg;
    const lengthSq = bx * bx + by * by;
    const f = lengthSq ? Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(px - bx * f, py - by * f));
  }
  return best;
}

/** Straight-line metres between two points. */
function metresBetween(a, b) {
  const k = Math.PI / 180;
  const dLat = (b.lat - a.lat) * k;
  const dLng = (b.lng - a.lng) * k;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

const simulatedFix = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('goride:location') ?? '{}').simulated ?? null);

/** Pages that appeared since `before` (tabs the simulator opened with window.open). */
async function newPages(browser, before, count, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let found = [];
  while (Date.now() < deadline) {
    found = (await browser.pages()).filter((p) => !before.has(p));
    if (found.length >= count) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return found;
}

/** The routes a tab holds from the simulator (nav-route), per leg. */
const navRoutes = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('goride:nav-routes') ?? 'null')?.routes ?? {});

/**
 * driver_locations holds one row per driver, so every ping is collected by polling it
 * (pings are ≥10s apart) until `done()` says to stop.
 */
async function collectPings(driverId, sinceMs, done, timeoutMs = 240_000) {
  const since = new Date(sinceMs).toISOString();
  const pings = new Map();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = sql(`select latitude, longitude, recorded_at from driver_locations where driver_id = '${driverId}' and recorded_at >= '${since}'`);
    if (row) {
      const [lat, lng, at] = row.split('|');
      pings.set(at, { lat: Number(lat), lng: Number(lng) });
    }
    if (await done(pings)) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return [...pings.values()];
}

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
  // Place search (Places API (New) from the browser key) lists results; cleared again so the map stays put.
  await sim.type('input[aria-label="Search places"]', 'KL Sentral');
  await sim.waitForSelector('[data-testid="place-search-result"]', { timeout: 10_000 }).then(
    () => check('simulator place search returns results', true),
    () => check('simulator place search returns results', false),
  );
  await sim.click('button[aria-label="Clear search"]');
  await d1.screenshot({ path: `${OUT}/05a-driver-placed.png` });
  await sim.screenshot({ path: `${OUT}/05-simulator.png` });

  // 6c. Phase 2: driver 1 goes online through D06 → D07 and location pings reach the
  //     database. Phase 3: driver 2 goes online nearby too, rider 1 books through the
  //     rider screens, both drivers get the offer, driver 1 wins.
  let requestId = null;
  let quickSetupEmails = [];
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

    // Driver 2 ~300m from driver 1, rider ~200m from driver 1 — both drivers qualify for RIDE.
    const where = await d1.evaluate(() => JSON.parse(sessionStorage.getItem('goride:location')).simulated);
    await placeTab(sim, await tabId(d2), where.lat - 0.002, where.lng + 0.002);
    await d2.waitForFunction(() => !!JSON.parse(sessionStorage.getItem('goride:location') ?? '{}').simulated, { timeout: 5_000 });
    await goOnline(d2);
    await placeTab(sim, await tabId(r1), where.lat + 0.0015, where.lng + 0.001);

    // R01 → R02 → R03 → Book.
    await r1.bringToFront();
    await r1.goto(`${BASE}/user`);
    await r1.waitForSelector('[data-testid="suggested-place"]');
    await r1.screenshot({ path: `${OUT}/09-rider-where-to.png` });
    await (await r1.$$('[data-testid="suggested-place"]'))[1].click();
    await r1.waitForFunction(
      () => {
        const t = document.querySelector('[data-testid="pin-place"]')?.textContent ?? '';
        return t !== '' && !/Finding|Moving/.test(t);
      },
      { timeout: 15_000 },
    );
    check('R02 names the pickup under the pin', true, await r1.$eval('[data-testid="pin-place"]', (el) => el.textContent));
    await r1.screenshot({ path: `${OUT}/10-rider-confirm-pickup.png` });
    await (await r1.waitForSelector(buttonXPath('Choose this pickup'))).click();

    await r1.waitForSelector('[data-testid="tier-RIDE"]', { timeout: 15_000 });
    const prices = (await bodyText(r1)).match(/RM \d+\.\d{2}/g) ?? [];
    check('R03 shows three MYR tiers', (await r1.$$('[role=radiogroup] [data-testid^="tier-"]')).length === 3 && prices.length >= 3, prices.slice(0, 3).join(' / '));
    await r1.screenshot({ path: `${OUT}/11-rider-pick-ride.png` });
    await (await r1.waitForSelector('xpath/.//button[starts-with(normalize-space(), "Book Standard") and not(@disabled)]')).click();

    await r1.waitForSelector('[data-testid="finding-headline"]', { timeout: 10_000 }).then(
      () => check('booking opens R04 Finding a driver', true),
      () => check('booking opens R04 Finding a driver', false),
    );
    requestId = (await riderTrip(r1))?.requestId ?? null;
    check('request-cab created a request', !!requestId, requestId ?? '');
    await r1.screenshot({ path: `${OUT}/12-rider-finding.png` });

    const bookedAt = Date.now();
    const [offer1, offer2] = await Promise.all(
      [d1, d2].map((page) =>
        page.waitForSelector('[data-testid="offer-card"][data-state="live"]', { timeout: 30_000 }).then(
          () => Date.now() - bookedAt,
          () => null,
        ),
      ),
    );
    check('offer card appears in driver 1', offer1 !== null, `${offer1}ms after booking`);
    check('offer card appears in driver 2', offer2 !== null, `${offer2}ms after booking`);
    check('driver tab opens D08 on arrival', d1.url().endsWith('/driver/offers'), d1.url());
    const delivery = await pollSql(
      `select delivery_status from driver_job_offers where driver_id = '${driverId}' order by created_at desc limit 1`,
      (value) => value === 'seen',
      8_000,
    );
    check('seen-ack is recorded by the gateway', delivery === 'seen', delivery);
    await new Promise((resolve) => setTimeout(resolve, 1_500)); // let place names load
    await d1.screenshot({ path: `${OUT}/07-driver-offers.png` });

    await d1.bringToFront();
    await (await d1.waitForSelector(buttonXPath('Accept', '//article[@data-testid="offer-card"]'))).click();
    await d1.waitForSelector('[data-testid="start-pin-input"]', { timeout: 10_000 }).then(
      () => check('accepting wins the trip', true),
      () => check('accepting wins the trip', false),
    );
    await d1.screenshot({ path: `${OUT}/08-driver-trip-assigned.png` });
    await d2.waitForSelector('[data-testid="offer-card"][data-state="taken"]', { timeout: 10_000 }).then(
      () => check("driver 2's card goes to taken", true),
      () => check("driver 2's card goes to taken", false),
    );
    await d2.screenshot({ path: `${OUT}/08b-driver2-taken.png` });

    // R05: driver, vehicle, plate and the same start PIN the server holds.
    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="vehicle-plate"]', { timeout: 10_000 });
    const plate = await r1.$eval('[data-testid="vehicle-plate"]', (el) => el.textContent);
    check('R05 shows the driver and plate', plate === 'SIM1001' && (await bodyText(r1)).includes('Perodua Myvi'), plate);
    const shownPin = (await r1.$eval('[data-testid="start-pin"]', (el) => el.textContent)).trim();
    const riderToken = await apiLogin('rider', ACCOUNTS.rider1);
    const serverPin = (await api('/api/v1/cab/current-trip', { token: riderToken })).json?.ongoing_trip?.start_pin;
    check('R05 start PIN matches the server', /^\d{4}$/.test(shownPin) && shownPin === serverPin, shownPin);
    await r1.screenshot({ path: `${OUT}/13-rider-driver-on-the-way.png` });

    // The simulator draws the trip, then moves driver 1 towards the pickup.
    await sim.bringToFront();
    await sim.waitForSelector('[title*="’s pickup"]', { timeout: 6_000 }).then(
      () => check('simulator draws the rider’s pickup and drop-off', true),
      () => check('simulator draws the rider’s pickup and drop-off', false),
    );
    await sim.screenshot({ path: `${OUT}/14-simulator-trip.png` });
    const target = { lat: where.lat + 0.001, lng: where.lng + 0.0007 };
    await placeTab(sim, d1TabId, target.lat, target.lng);
    const movedAt = Date.now();
    await r1
      .waitForFunction(
        (t) => {
          const fix = JSON.parse(sessionStorage.getItem('goride:rider-trip') ?? 'null')?.driverFix;
          return fix && Math.abs(fix.lat - t.lat) < 1e-6 && Math.abs(fix.lng - t.lng) < 1e-6;
        },
        { timeout: 20_000, polling: 200 },
        target,
      )
      .then(
        () => check('moving the driver in the simulator moves it on the rider’s map', true, `${Date.now() - movedAt}ms`),
        () => check('moving the driver in the simulator moves it on the rider’s map', false),
      );
    check('rider map shows the driver marker', !!(await r1.$('[data-testid="driver-marker"]')));

    // Reload keeps the driver details (ride_assigned is never replayed).
    await r1.reload();
    await r1.waitForSelector('[data-testid="vehicle-plate"]', { timeout: 10_000 });
    check('R05 survives a reload', (await r1.$eval('[data-testid="vehicle-plate"]', (el) => el.textContent)) === 'SIM1001');
    await r1.screenshot({ path: `${OUT}/15-rider-driver-moved.png` });

    // Phase 4 — driver 1 cancels before pickup (D10); the request goes back to dispatch.
    const riderToken1 = riderToken;
    await d1.bringToFront();
    await (await d1.waitForSelector(buttonXPath('Cancel trip'))).click();
    await d1.waitForSelector('[role=dialog]');
    check('D10 needs a reason first', !(await d1.$(buttonXPath('Cancel trip', '//*[@role="dialog"]'))));
    await (await d1.waitForSelector('[role=dialog] [role=radio]')).click();
    await d1.type('[role=dialog] textarea', 'smoke: rider not at pickup');
    await d1.screenshot({ path: `${OUT}/16-driver-cancel-reason.png` });
    await (await d1.waitForSelector(buttonXPath('Cancel trip', '//*[@role="dialog"]'))).click();
    await d1.waitForSelector('[data-testid="trip-ended"]', { timeout: 10_000 });
    check('driver 1 sees the trip went back to dispatch', (await bodyText(d1)).includes('back into dispatch'));

    // Offers live 15s, so driver 2 accepts first; the rider's trip went back to
    // searching in between (its dev log records every trip transition).
    await acceptOffer(d2);
    check('driver 2 wins the redispatched trip', true);
    const d1Offers = sql(`select count(*) from driver_job_offers where driver_id = '${driverId}' and request_id = '${requestId}'`);
    check('driver 1 is not offered the trip again', d1Offers === '1', `${d1Offers} offer(s) to driver 1`);
    await r1.bringToFront();
    check('rider went back to searching (“finding you another driver”)', (await bodyText(r1)).includes('trip assigned → searching'));
    await r1.waitForFunction(() => document.querySelector('[data-testid="vehicle-plate"]')?.textContent === 'SIM2002', { timeout: 10_000 }).then(
      () => check('rider R05 shows driver 2 and their plate', true),
      () => check('rider R05 shows driver 2 and their plate', false),
    );
    const pin2 = (await r1.$eval('[data-testid="start-pin"]', (el) => el.textContent)).trim();
    const serverPin2 = (await api('/api/v1/cab/current-trip', { token: riderToken1 })).json?.ongoing_trip?.start_pin;
    check('R05 shows the new start PIN', /^\d{4}$/.test(pin2) && pin2 === serverPin2, `${pin2} (was ${shownPin})`);
    await r1.screenshot({ path: `${OUT}/17-rider-new-driver.png` });

    // Happy path with driver 2: PIN → R06 → end → pay → collect → rate.
    const d2Token = await apiLogin('driver', ACCOUNTS.driver2);
    const earningsBefore = (await api('/api/v1/driver-trips/earnings?period=today', { token: d2Token })).json?.total_earnings ?? 0;
    const ratingsBefore = (await api('/api/v1/driver-trips/stats', { token: d2Token })).json?.rating_count ?? 0;
    await d2.bringToFront();
    check('D09 shows the rider’s name', ((await d2.$eval('[data-testid="trip-rider"]', (el) => el.textContent)) ?? '').length > 0 && !(await bodyText(d2)).includes('Your rider'));
    await enterPin(d2, pin2 === '0000' ? '1111' : '0000');
    await (await d2.waitForSelector(buttonXPath('Start trip'))).click();
    await waitForText(d2, 'doesn’t match').then(
      () => check('a wrong start PIN is rejected', true),
      () => check('a wrong start PIN is rejected', false),
    );
    await enterPin(d2, pin2);
    await (await d2.waitForSelector(buttonXPath('Start trip'))).click();
    await d2.waitForSelector('[data-testid="collect-fare"]', { timeout: 10_000 }).then(
      () => check('the right PIN starts the trip', true),
      () => check('the right PIN starts the trip', false),
    );
    await d2.screenshot({ path: `${OUT}/19-driver-on-trip.png` });
    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="arrival-clock"]', { timeout: 10_000 }).then(
      () => check('rider sees R06 on trip', true),
      () => check('rider sees R06 on trip', false),
    );
    await r1.screenshot({ path: `${OUT}/20-rider-on-trip.png` });

    await d2.bringToFront();
    check('Cash collected is locked until the trip ends', !(await d2.$(buttonXPath('Cash collected'))));
    await (await d2.waitForSelector(buttonXPath('End trip'))).click();
    await d2.waitForSelector(buttonXPath('Cash collected'), { timeout: 10_000 });
    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="pay-driver"]', { timeout: 10_000 }).then(
      () => check('rider is asked to pay in cash', true),
      () => check('rider is asked to pay in cash', false),
    );
    await r1.screenshot({ path: `${OUT}/21-rider-pay.png` });

    await d2.bringToFront();
    await (await d2.waitForSelector(buttonXPath('Cash collected'))).click();
    await d2.waitForFunction(() => document.querySelector('[data-testid="trip-ended"]')?.textContent === 'Trip complete', { timeout: 10_000 }).then(
      () => check('driver completes the trip', true),
      () => check('driver completes the trip', false),
    );
    await d2.screenshot({ path: `${OUT}/22-driver-complete.png` });

    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="trip-complete"]', { timeout: 10_000 });
    await r1.click('[role=radiogroup][aria-label="Rating"] [aria-label="5 stars"]');
    await r1.type('textarea[aria-label="Comment"]', 'smoke test ride');
    await r1.screenshot({ path: `${OUT}/23-rider-rate.png` });
    await (await r1.waitForSelector(buttonXPath('Submit rating'))).click();
    await r1.waitForSelector('[data-testid="suggested-place"]', { timeout: 10_000 }).then(
      () => check('rating returns the rider to R01', true),
      () => check('rating returns the rider to R01', false),
    );
    const history = await api('/api/v1/cab/trips?limit=5', { token: riderToken1 });
    const finished = history.json?.trips?.find((t) => t.request_id === requestId);
    check('rider history shows the trip completed', finished?.status === 'completed', finished?.status ?? 'missing');
    const earningsAfter = (await api('/api/v1/driver-trips/earnings?period=today', { token: d2Token })).json?.total_earnings ?? 0;
    check('driver 2’s earnings include the fare', earningsAfter > earningsBefore, `${earningsBefore} → ${earningsAfter}`);
    const ratingsAfter = (await api('/api/v1/driver-trips/stats', { token: d2Token })).json?.rating_count ?? 0;
    check('the rating reaches driver 2', ratingsAfter === ratingsBefore + 1, `${ratingsBefore} → ${ratingsAfter}`);
    await (await d2.waitForSelector(buttonXPath('Back to map'))).click();
    requestId = null;

    // Second booking: the rider cancels mid-trip from R06.
    await api('/api/v1/driver/online', { method: 'PATCH', body: { is_online: false }, token: await apiLogin('driver', ACCOUNTS.driver1) });
    await bookFromR01(r1, 2);
    requestId = (await riderTrip(r1))?.requestId ?? null;
    await acceptOffer(d2);
    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="start-pin"]', { timeout: 10_000 });
    const pin3 = (await r1.$eval('[data-testid="start-pin"]', (el) => el.textContent)).trim();
    await d2.bringToFront();
    await enterPin(d2, pin3);
    await (await d2.waitForSelector(buttonXPath('Start trip'))).click();
    await d2.waitForSelector('[data-testid="collect-fare"]', { timeout: 10_000 });
    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="arrival-clock"]', { timeout: 10_000 });
    await (await r1.waitForSelector('xpath/.//button[normalize-space()="Cancel trip"]')).click();
    await r1.waitForSelector('[role=dialog]');
    await (await r1.waitForSelector('[role=dialog] [role=radio]')).click();
    await (await r1.waitForSelector(buttonXPath('Cancel trip', '//*[@role="dialog"]'))).click();
    await r1.waitForSelector('[data-testid="suggested-place"]', { timeout: 10_000 }).then(
      () => check('rider cancels mid-trip from R06', true),
      () => check('rider cancels mid-trip from R06', false),
    );
    await d2.bringToFront();
    await d2.waitForFunction(() => document.querySelector('[data-testid="trip-ended"]')?.textContent === 'The rider cancelled', { timeout: 10_000 }).then(
      () => check('driver 2 sees the rider cancelled', true),
      () => check('driver 2 sees the rider cancelled', false),
    );
    await d2.screenshot({ path: `${OUT}/24-driver-rider-cancelled.png` });
    requestId = null;

    // 6d. Phase 5: driving along real roads. Driver 2 ~850 m (2.7 km by road) from the rider.
    await (await d2.waitForSelector(buttonXPath('Back to map'))).click();
    const d2TabId = await tabId(d2);
    const d2Id = await d2.evaluate(() => JSON.parse(sessionStorage.getItem('goride:session:driver')).user.id);
    await placeTab(sim, d2TabId, 3.149, 101.7133);
    await placeTab(sim, await tabId(r1), 3.1552, 101.7178);
    await sim.close();
    await bookFromR01(r1, 1);
    requestId = (await riderTrip(r1))?.requestId ?? null;
    await acceptOffer(d2);

    await (await d2.waitForSelector(buttonXPath('Navigate'))).click();
    await d2
      .waitForFunction(() => document.querySelector('[data-testid="navigate-error"]')?.textContent === 'Open the simulator to drive.', { timeout: 5_000, polling: 200 })
      .then(
        () => check('D09 Navigate without a simulator says to open one', true),
        () => check('D09 Navigate without a simulator says to open one', false),
      );

    // A new simulator with auto-drive on picks up the trip and drives to the pickup.
    const sim5 = await newPage(browser);
    await sim5.goto(`${BASE}/simulator`);
    await sim5.evaluate(() => localStorage.setItem('goride:sim-auto-drive', '1'));
    await sim5.reload();
    const card = `[data-testid="playback-${d2TabId}"]`;
    const cardText = () => sim5.$eval(card, (el) => el.textContent).catch(() => '');
    const speedButton = (factor) => sim5.waitForSelector(`xpath/.//*[@data-testid="playback-${d2TabId}"]//button[normalize-space()="×${factor}"]`);
    const waitForCard = (...parts) =>
      sim5.waitForFunction((c, p) => p.every((part) => document.querySelector(c)?.textContent.includes(part)), { timeout: 20_000, polling: 250 }, card, parts);
    await waitForCard('To pickup', 'Driving').then(
      () => check('auto-drive starts the drive to the pickup', true),
      () => check('auto-drive starts the drive to the pickup', false),
    );
    await (await speedButton(10)).click();

    // Pause holds the car.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await (await sim5.waitForSelector(`${card} button[aria-label="Pause"]`)).click();
    const heldAt = await d2.evaluate(() => JSON.parse(sessionStorage.getItem('goride:location')).simulated);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const stillAt = await d2.evaluate(() => JSON.parse(sessionStorage.getItem('goride:location')).simulated);
    check('pause holds the car', heldAt.lat === stillAt.lat && heldAt.lng === stillAt.lng && heldAt.lat !== 3.149, `${heldAt.lat}, ${heldAt.lng}`);

    // A manual move (select the driver, centre the map on it, click the map beside its
    // marker) stops the drive and un-shares the route in both apps.
    await sim5.click(`[data-testid="tab-row-${d2TabId}"] button[aria-label="Show on map"]`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const mapBox = await (await sim5.$('main')).boundingBox();
    await sim5.mouse.click(mapBox.x + mapBox.width / 2 - 80, mapBox.y + mapBox.height / 2 - 80);
    await sim5.keyboard.press('Escape');
    await waitForCard('Drive to pickup').then(
      () => check('a manual move stops the drive', true),
      () => check('a manual move stops the drive', false),
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    check('a manual move un-shares the route in both apps', !(await navRoutes(d2)).pickup && !(await navRoutes(r1)).pickup);

    // Navigate restarts it; this drive runs to the pickup.
    await d2.bringToFront();
    await (await d2.waitForSelector(buttonXPath('Navigate'))).click();
    await sim5.bringToFront();
    await waitForCard('To pickup', 'Driving').then(
      () => check('D09 Navigate restarts the drive', true),
      () => check('D09 Navigate restarts the drive', false),
    );
    await (await speedButton(10)).click();
    const pickupStart = Date.now() - 1_000;
    const etas = [];
    let arrivedAt = null;
    const pickupPings = await collectPings(d2Id, pickupStart, async () => {
      const eta = await r1.$eval('[data-testid="trip-eta"]', (el) => el.textContent).catch(() => null);
      if (eta && eta !== etas.at(-1)) etas.push(eta);
      if (arrivedAt === null && (await cardText()).includes('Arrived')) arrivedAt = Date.now();
      // The last ping lands up to ~15s after arrival (10s floor, 5s tick); R05 then glides to it.
      return arrivedAt !== null && (eta === 'Arriving now' || Date.now() - arrivedAt > 30_000);
    });
    check('the car drives itself to the pickup', arrivedAt !== null);
    const pickupRoute = (await navRoutes(d2)).pickup?.path ?? '';
    const pickupPath = decodePolyline(pickupRoute);
    const worstPickup = Math.max(...pickupPings.map((p) => metresOffPath(p, pickupPath)));
    check('every stored ping lies on the route to the pickup', pickupPings.length >= 2 && worstPickup <= 25, `${pickupPings.length} pings, worst ${worstPickup.toFixed(1)} m`);
    const d09Route = await d2.$eval('[data-testid="trip-map"]', (el) => el.dataset.route);
    const r05Route = await r1.$eval('[data-testid="trip-map"]', (el) => el.dataset.route).catch(() => null);
    check('D09 and R05 draw the same route', pickupRoute !== '' && d09Route === pickupRoute && r05Route === pickupRoute, `${pickupPath.length} points`);
    const minutes = etas.map((t) => (t === 'Arriving now' ? 0 : Number.parseInt(t, 10))).filter((n) => !Number.isNaN(n));
    check('the rider’s ETA never goes up', minutes.every((m, i) => i === 0 || m <= minutes[i - 1]), etas.join(' → '));
    check('the rider’s ETA reaches "Arriving now"', etas.at(-1) === 'Arriving now', etas.at(-1) ?? 'none');
    await r1.bringToFront();
    await r1.screenshot({ path: `${OUT}/25-rider-driver-arriving.png` });
    await d2.bringToFront();
    await d2.screenshot({ path: `${OUT}/25-driver-at-pickup.png` });

    // Start with the PIN: auto-drive takes the booked route to the drop-off.
    const pin5 = (await r1.$eval('[data-testid="start-pin"]', (el) => el.textContent)).trim();
    await enterPin(d2, pin5);
    await (await d2.waitForSelector(buttonXPath('Start trip'))).click();
    await d2.waitForSelector('[data-testid="collect-fare"]', { timeout: 10_000 });
    await sim5.bringToFront();
    await waitForCard('To drop-off', 'Driving').then(
      () => check('auto-drive starts the drive to the drop-off', true),
      () => check('auto-drive starts the drive to the drop-off', false),
    );
    await (await speedButton(5)).click();
    const dropoffStart = Date.now() - 1_000;
    let r06Shot = false;
    const dropoffPings = await collectPings(d2Id, dropoffStart, async (pings) => {
      if (!r06Shot && pings.size >= 2) {
        r06Shot = true;
        await r1.bringToFront();
        await r1.screenshot({ path: `${OUT}/26-rider-on-trip-driven.png` });
        await sim5.bringToFront();
      }
      return (await cardText()).includes('Arrived');
    });
    const booked = (await riderTrip(r1))?.route?.polyline;
    const dropoffRoute = (await navRoutes(d2)).dropoff?.path;
    check('the drive to the drop-off follows the booked route', !!booked && dropoffRoute === booked);
    const worstDropoff = Math.max(...dropoffPings.map((p) => metresOffPath(p, decodePolyline(dropoffRoute ?? ''))));
    check('every stored ping lies on the route to the drop-off', dropoffPings.length >= 2 && worstDropoff <= 25, `${dropoffPings.length} pings, worst ${worstDropoff.toFixed(1)} m`);
    const r06Route = await r1.$eval('[data-testid="trip-map"]', (el) => el.dataset.route).catch(() => null);
    check('R06 draws the same route', r06Route === dropoffRoute);

    // End + collect as before; the finished trip's route is cleared everywhere.
    await d2.bringToFront();
    await (await d2.waitForSelector(buttonXPath('End trip'))).click();
    await (await d2.waitForSelector(buttonXPath('Cash collected'), { timeout: 10_000 })).click();
    await d2.waitForSelector('[data-testid="trip-ended"]', { timeout: 10_000 });
    requestId = null;
    await sim5.bringToFront();
    await sim5.waitForFunction((c) => !document.querySelector(c), { timeout: 15_000, polling: 250 }, card).then(
      () => check('the finished trip’s drive is removed from the simulator', true),
      () => check('the finished trip’s drive is removed from the simulator', false),
    );
    check('the finished trip’s route is cleared in the driver tab', Object.keys(await navRoutes(d2)).length === 0);
    await (await d2.waitForSelector(buttonXPath('Back to map'))).click();
    // Rate the trip so the rider is back on R01 for the next booking.
    await r1.bringToFront();
    await r1.waitForSelector('[data-testid="trip-complete"]', { timeout: 10_000 });
    await r1.click('[role=radiogroup][aria-label="Rating"] [aria-label="5 stars"]');
    await (await r1.waitForSelector(buttonXPath('Submit rating'))).click();
    await r1.waitForSelector('[data-testid="suggested-place"]', { timeout: 10_000 });

    // 6e. Phase 5b: quick setup, scatter + online, and a layout round trip.
    await sim5.bringToFront();
    const freeDrivers = () => sim5.$eval('[data-testid="free-drivers"]', (el) => Number.parseInt(el.textContent, 10));
    await sim5.waitForSelector('[data-testid="free-drivers"]', { timeout: 10_000 });
    const freeBefore = await freeDrivers();
    const pagesBefore = new Set(await browser.pages());
    await sim5.focus('input[aria-label="How many drivers to open"]');
    for (let i = 0; i < 3; i++) await sim5.keyboard.press('Backspace');
    await sim5.keyboard.type('3');
    await sim5.click('[data-testid="open-drivers"]');
    const fleet = await newPages(browser, pagesBefore, 3);
    quickSetupEmails = await Promise.all(
      fleet.map(async (page) => {
        await page.waitForFunction((home) => document.body.textContent.includes(home), { timeout: 20_000, polling: 300 }, DRIVER_HOME);
        return page.evaluate(() => JSON.parse(sessionStorage.getItem('goride:session:driver')).user.email);
      }),
    );
    check('quick setup opens 3 driver tabs that sign themselves in', new Set(quickSetupEmails).size === 3, quickSetupEmails.join(', '));
    check('the free driver count drops by 3', (await freeDrivers()) === freeBefore - 3, `${freeBefore} → ${await freeDrivers()}`);

    // Centre the map on the rider, scatter, go online.
    const riderAt = await simulatedFix(r1);
    await sim5.bringToFront();
    await sim5.click(`[data-testid="tab-row-${await tabId(r1)}"] button[aria-label="Show on map"]`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await sim5.click('[data-testid="scatter-drivers"]');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const scattered = await Promise.all(fleet.map(simulatedFix));
    const farthest = Math.max(...scattered.map((p) => (p ? metresBetween(p, riderAt) : Infinity)));
    check('scatter places them around the rider', farthest <= 1_600, `farthest ${Math.round(farthest)} m`);
    await sim5.click('[data-testid="drivers-online"]');
    const fleetSummary = () => sim5.$eval('[data-testid="driver-fleet-summary"]', (el) => el.textContent).catch(() => '');
    await sim5.waitForFunction(() => /went online/.test(document.querySelector('[data-testid="driver-fleet-summary"]')?.textContent ?? ''), { timeout: 15_000, polling: 300 });
    const inList = quickSetupEmails.map((e) => `'${e}'`).join(',');
    const onlineCount = sql(`select count(*) from drivers where is_online and email in (${inList})`);
    check('Online takes the quick-setup drivers online', onlineCount === '3', await fleetSummary());
    // Dispatch only matches drivers whose stored location is fresh; a driver's first ping after
    // going online can land a second after a booking made straight away.
    await pollSql(
      `select count(*) from driver_locations l join drivers d on d.id = l.driver_id where d.email in (${inList}) and l.recorded_at > now() - interval '20 seconds'`,
      (value) => value === '3',
      20_000,
    );

    // A booking reaches all three.
    await bookFromR01(r1, 1);
    requestId = (await riderTrip(r1))?.requestId ?? null;
    const offered = await Promise.all(
      fleet.map((page) =>
        page
          .waitForFunction(() => !!document.querySelector('[data-testid="offer-card"]'), { timeout: 30_000, polling: 300 })
          .then(() => true, () => false),
      ),
    );
    check('a booking offers the trip to all three', offered.every(Boolean), offered.join(', '));
    await api(`/api/v1/cab/request-cab/${requestId}/cancel`, {
      method: 'POST',
      token: await apiLogin('rider', ACCOUNTS.rider1),
      body: { reason: 'other', note: 'smoke test cleanup' },
    });
    requestId = null;

    // Save a layout, scatter them elsewhere, load it back.
    await sim5.bringToFront();
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const savedAt = await Promise.all(fleet.map(simulatedFix));
    await sim5.type('input[aria-label="Layout name"]', 'smoke scene');
    await sim5.click('[data-testid="layout-save"]');
    await sim5.select('select[aria-label="Scatter radius"]', '3000');
    await sim5.click('[data-testid="scatter-drivers"]');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const movedAway = await Promise.all(fleet.map(simulatedFix));
    await (await sim5.waitForSelector('xpath/.//li[@data-testid="layout-row"][contains(., "smoke scene")]//button[normalize-space()="Load"]')).click();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const restored = await Promise.all(fleet.map(simulatedFix));
    const back = restored.every((p, i) => p && Math.abs(p.lat - savedAt[i].lat) < 1e-9 && Math.abs(p.lng - savedAt[i].lng) < 1e-9);
    const hadMoved = movedAway.some((p, i) => p && (p.lat !== savedAt[i].lat || p.lng !== savedAt[i].lng));
    check('loading a layout puts the drivers back', hadMoved && back, await sim5.$eval('[data-testid="layout-message"]', (el) => el.textContent).catch(() => ''));
    await sim5.screenshot({ path: `${OUT}/27-simulator-quick-setup.png` });

    await sim5.click('[data-testid="drivers-offline"]');
    await sim5.waitForFunction(() => /went offline/.test(document.querySelector('[data-testid="driver-fleet-summary"]')?.textContent ?? ''), { timeout: 15_000, polling: 300 });
    for (const page of fleet) await page.close();
  } finally {
    // Cancel as the rider if the run stopped half way, then take both drivers offline.
    if (requestId) {
      const riderToken = await apiLogin('rider', ACCOUNTS.rider1);
      await api(`/api/v1/cab/request-cab/${requestId}/cancel`, { method: 'POST', token: riderToken, body: { reason: 'other', note: 'smoke test cleanup' } });
    }
    for (const email of [ACCOUNTS.driver1, ACCOUNTS.driver2, ...quickSetupEmails]) {
      const driverToken = await apiLogin('driver', email);
      await api('/api/v1/driver/online', { method: 'PATCH', body: { is_online: false }, token: driverToken });
    }
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
