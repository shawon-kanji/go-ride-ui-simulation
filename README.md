# Go Ride — web simulator

Browser versions of the Go Ride rider and driver apps, plus a simulator page, for fast
local testing against the real backend. See [PLAN.md](PLAN.md) for the full design and
phases, and [PROGRESS.md](PROGRESS.md) for checkpoints and the next tasks.

| Route | What it is |
|---|---|
| `/user` | Rider app (phone frame, rider theme): where to (R01), confirm pickup (R02), pick a ride (R03), finding a driver (R04), driver on the way (R05), on trip (R06), pay your driver, trip complete + rating |
| `/driver` | Driver app (phone frame, driver theme): home/go online (D06–D07), menu (D03), job offers (D08), trip with start PIN and cash collection (D09), cancel with a reason (D10) |
| `/simulator` | Every open tab on a Google map — select a tab and click the map (or drag its marker) to move its GPS. The search box (top left) jumps to a place; with a tab selected, “Move … here” puts it there. Riders' live trips show pickup/drop-off pins and a link to the assigned driver |
| `/health` | Pings every Go service through the dev proxy |

Every tab is its own device: its own login (in `sessionStorage`), its own websocket
`device_id`. Open as many rider and driver tabs as you need in one browser. Reloading keeps
a tab signed in; closing it signs it out. A tab made with the browser's "Duplicate tab"
starts signed out as a new device.

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

## Test accounts (local DB)

Password for all: `password123`

| Role | Emails |
|---|---|
| Rider | `sim.rider1@goride.test`, `sim.rider2@goride.test` |
| Driver | `sim.driver1@goride.test`, `sim.driver2@goride.test`, `sim.driver3@goride.test` |

The drivers are KYC-approved with one active vehicle each (driver1 Ride, driver2 also Ride XL,
driver3 also Ride Premium) — set directly in the local DB; the SQL is in
[PROGRESS.md](PROGRESS.md). To try dispatch: open a driver tab, place it in the simulator, go
online; open a rider tab, place it nearby, pick a destination and book. Moving the driver in the
simulator moves it on the rider's R05 map.

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
wrong/right start PIN → R06 → end → pay → collect → rating; then a rider cancel mid-trip). It resets
drivers 1–2 offline (settling any trip left mid-way) and cancels rider1's active trip before and after running. Screenshots land in
`test-results/smoke/`; handoff renders in `test-results/handoff/`.
