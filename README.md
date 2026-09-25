# Go Ride — web simulator

Browser versions of the Go Ride rider and driver apps, plus a simulator page, for fast
local testing against the real backend. See [PLAN.md](PLAN.md) for the full design and
phases.

| Route | What it is |
|---|---|
| `/user` | Rider app (phone frame, rider theme) |
| `/driver` | Driver app (phone frame, driver theme) |
| `/simulator` | Every open tab, and (from Phase 1) their locations on a map |
| `/health` | Pings every Go service through the dev proxy |

Every tab is its own device: its own login (in `sessionStorage`), its own websocket
`device_id`. Open as many rider and driver tabs as you need in one browser. Reloading keeps
a tab signed in; closing it signs it out. A tab made with the browser's "Duplicate tab"
starts signed out as a new device.

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

## Checks

```bash
npm run typecheck
npm run lint
npm test                    # unit tests (Vitest)
npm run smoke:firefox       # needs `npm run dev`; drives the installed Firefox headless
```

`smoke:firefox` uses `puppeteer-core` over WebDriver BiDi with
`/Applications/Firefox.app` (override with `FIREFOX_PATH`; `SMOKE_HEADFUL=1` to watch).
Screenshots land in `test-results/smoke/`.
