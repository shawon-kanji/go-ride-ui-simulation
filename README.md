# Go Ride — web simulator

Browser versions of the Go Ride rider and driver apps, plus a simulator page, for fast
local testing against the real backend. See [PLAN.md](PLAN.md) for the full design and
phases, and [PROGRESS.md](PROGRESS.md) for checkpoints and the next tasks.

| Route | What it is |
|---|---|
| `/user` | Rider app (phone frame, rider theme): where to (R01), confirm pickup (R02), pick a ride (R03), finding a driver (R04), driver on the way (R05), on trip (R06), pay your driver, trip complete + rating |
| `/driver` | Driver app (phone frame, driver theme): home/go online (D06–D07), menu (D03), job offers (D08), trip with start PIN, route, Navigate and cash collection (D09), cancel with a reason (D10) |
| `/simulator` | Every open tab on a Google map, plus the tools below: move tabs, drive drivers along real roads, open signed-in test accounts, scatter drivers, take them online, and save/load layouts |
| `/health` | Pings every Go service through the dev proxy |

Every tab is its own device: its own login (in `sessionStorage`), its own websocket
`device_id`. Open as many rider and driver tabs as you need in one browser. Reloading keeps
a tab signed in; closing it signs it out. A tab made with the browser's "Duplicate tab"
starts signed out as a new device.

## Simulator tools

- **Move a tab:** select it in the list, then click the map (or drag its marker). The search box (top left)
  jumps to a place; with a tab selected, “Move … here” puts it there.
- **Drive along real roads:** a driver on a trip gets a playback card with the leg, progress and time left,
  ×1/×2/×5/×10, pause and stop. *Auto-drive* drives to the pickup on accept and along the booked route to the
  drop-off once the trip starts. D09's *Navigate* asks the simulator to drive. The driver app (D09) and the
  rider app (R05/R06) draw the same route, and the rider's ETA comes from it.
- **Quick setup:** shows how many test riders and drivers are free, meaning ready and not signed in to an open
  tab. *Open N* opens that many tabs, each signing itself in as a free test account (up to 10 per click).
  Chrome opens one tab per click unless pop-ups are allowed for `localhost:5173`; the card says when tabs were
  blocked.
- **Drivers on the map:** *Scatter* places every driver tab at random within 0.5/1.5/3 km of the map centre
  (drivers on a trip aren't moved). *Online* / *Offline* asks each driver tab to switch, as its own button would,
  and reports who couldn't and why (e.g. no location yet).
- **Layouts:** save where every signed-in account stands and which drivers are online, under a name, and load it
  later. Accounts without an open tab can be opened from the card; they're placed as they sign in. Layouts are
  kept per browser and export/import as JSON.

## Location

Each tab's position comes from its location source, switchable in the dev panel:

- **Simulated** (default): set from the simulator. Select a tab in the simulator's list,
  then click the map, or drag its marker. The position survives a reload of that tab.
- **Browser GPS**: `navigator.geolocation`. The simulator shows these tabs but can't move them.

## Run

```bash
cp .env.example .env        # set VITE_GOOGLE_MAPS_API_KEY
npm install
npm run dev                 # http://localhost:5173
```

The Go services must be running (`scripts/run-all.sh` at the workspace root). The dev
server proxies `/api/v1/*` to them, so no CORS setup is needed:

| Prefix | Service | Default |
|---|---|---|
| `/api/v1/cab` | cab-request-handler | `:8082` |
| `/api/v1/driver-trips` | driver-request-handler | `:8084` |
| `/api/v1/location` | location-producers | `:8081` |
| `/api/v1/ws` | websocket-gateway | `:8083` |
| `/api/v1`, `/healthz` | go-ride-backend | `:8080` |

Override targets with `PROXY_*` in `.env`.

## Test accounts

The accounts live in go-ride-backend's [`config/test-accounts.yaml`](../go-ride-backend/config/test-accounts.yaml):
5 riders (`sim.rider1–5@goride.test`) and 8 drivers (`sim.driver1–8@goride.test`), all with password
`password123`. The drivers have a mix of normal, 7-seat and luxury vehicles, so there are drivers for every ride
type. To use them, in go-ride-backend:

```bash
# .env (gitignored): turns on GET /api/v1/dev/test-accounts and the seed
DEV_TOOLS_ENABLED=true

make seed      # creates the accounts, or resets them to the file (KYC, vehicle, documents, password)
```

Then restart go-ride-backend. Quick setup and auto sign-in read the accounts from that endpoint. Without it, quick
setup says how to turn it on. To add accounts, add them to the YAML and run `make seed` again.

**Auto sign-in:** `/driver/login?as=<email>` and `/user/login?as=<email>` sign the tab in as that test account.
The password is fetched from the backend, never put in the URL.

To try dispatch by hand: open a driver tab, place it in the simulator, go online; open a rider tab, place it
nearby, pick a destination and book.

Fares are in MYR because cab-request-handler's local `.env` sets `FARE_CITY_CODE=KUL` (see
PROGRESS.md, Phase 3); without it the backend prices in USD.

## Checks

```bash
npm run typecheck
npm run lint
npm test                    # unit tests (Vitest)
npm run smoke:firefox       # needs `npm run dev`, the Go stack and go-ride-postgres
npm run handoff:shots -- "../design_handoff_go_ride/Driver App.dc.html" "08 Job offers"   # render a design screen
```

`smoke:firefox` uses `puppeteer-core` over WebDriver BiDi with
`/Applications/Firefox.app` (override with `FIREFOX_PATH`; `SMOKE_HEADFUL=1` to watch).
It covers per-tab sessions, the simulator map, the driver flow (go online → location ping in
the DB → offer card → seen-ack → accept) and the rider booking (R01 → R04 → both online drivers
get the offer → one accepts, the other sees "taken" → R05 with plate and start PIN → a simulator
move reaches the rider's map), and the trip lifecycle (driver 1 cancels → redispatch to driver 2 →
wrong/right start PIN → R06 → end → pay → collect → rating; then a rider cancel mid-trip), route playback
(Navigate without a simulator; auto-drive to the pickup with every stored ping on the route; the same route in
D09 and R05; the rider's ETA counting down to "Arriving now"; pause; a manual move stopping the drive;
the booked route to the drop-off), and the Phase 5b tools (quick setup opens 3 drivers that sign themselves in,
scatter + online, a booking reaches all three, a layout puts them back). It needs the test accounts seeded with
dev tools on. It resets drivers 1–2 offline (settling any trip left mid-way) and cancels rider1's active trip
before and after running, and takes the drivers it opened offline at the end. Screenshots land in
`test-results/smoke/`; handoff renders in `test-results/handoff/`.
