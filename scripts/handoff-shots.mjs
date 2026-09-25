// Renders design-handoff screens to PNGs for side-by-side comparison with the web app.
//
//   npm run handoff:shots -- "../design_handoff_go_ride/Driver App.dc.html" "06 Go online" "08 Job offers"
//
// Labels are the `data-screen-label` values in the .dc.html file (run with no labels to
// list them). Output: test-results/handoff/<label>.png
import puppeteer from 'puppeteer-core';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? ''); const labels = process.argv.slice(3);
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: '/Applications/Firefox.app/Contents/MacOS/firefox', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1200 });
await page.goto('file://' + file, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 2500));
const found = await page.$$eval('[data-screen-label]', (els) => els.map((e) => e.getAttribute('data-screen-label')));
console.log('screens:', found.join(' | '));
for (const label of labels) {
  const el = await page.$(`[data-screen-label="${label}"]`);
  if (!el) { console.log('missing', label); continue; }
  await el.scrollIntoView();
  const out = `test-results/handoff/${label.replace(/\W+/g, '-')}.png`;
  await el.screenshot({ path: out });
  console.log('saved', out);
}
await browser.close();
