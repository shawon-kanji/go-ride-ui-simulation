// Phase 0 smoke test in the locally installed Firefox (headless, via WebDriver BiDi).
//
//   npm run dev            # in another terminal
//   npm run smoke:firefox  # SMOKE_HEADFUL=1 to watch it
//
// Checks: per-tab sessions (two driver tabs signed in as different drivers in one
// browser), reload keeps a tab signed in, a duplicated tab starts signed out as a new
// device, websockets open for every tab, and the simulator sees every tab on the bus.
// Screenshots go to SMOKE_OUT (default ./test-results/smoke).

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
  await waitForText(page, 'Signed in');
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  return page;
}

await mkdir(OUT, { recursive: true });
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
  await waitForText(d1, 'Signed in');
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
  await waitForText(d1, 'Signed in');
  check('original tab is still signed in', (await bodyText(d1)).includes(ACCOUNTS.driver1));

  // 8. Logout signs out that tab only.
  await d2.bringToFront();
  const logout = await d2.waitForSelector('xpath/.//button[normalize-space()="Log out"]');
  await logout.click();
  await waitForText(d2, 'Welcome back');
  await d1.reload();
  await waitForText(d1, 'Signed in');
  check('logging out tab 2 leaves tab 1 signed in', (await bodyText(d1)).includes(ACCOUNTS.driver1));
} catch (error) {
  check('smoke run finished without errors', false, String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${OUT}/`);
process.exit(failed ? 1 : 0);
