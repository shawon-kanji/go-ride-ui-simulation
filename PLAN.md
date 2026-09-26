# Go Ride Web — rider app, driver app and simulator

A browser version of the rider and driver apps plus a map-based simulator, built for fast
learning and testing of the ride lifecycle against the real backend. The Android apps stay
as they are; this is a second client, not a replacement.

## Goals

- **Fast loop** — Vite HMR instead of emulator builds.
- **Many actors in one browser** — one tab per rider or driver, each with its own login.
- **Looks like the app** — phone-width screens that match `design_handoff_go_ride`
  (R01–R07, D01–D11) and the Expo apps' tokens and components.
- **Spoofable location** — the simulator is a fake GPS for every open tab.
- **Visible internals** — every API call, websocket frame and trip-state change shows in a log.
- **Real contracts** — the web apps call the same endpoints as the mobile apps, with each
  actor's own JWT. The simulator never impersonates anyone.

## Non-goals

- Production web app, SEO, auth persistence across tabs.
- Background location, push notifications (FCM), offline behaviour.
- Backend changes. The plan works against the services as they are today (see "Networking").

---

## 1. Shape of the app

One Vite app in `go-ride-ui-simulation/`, three routes, all on the same origin:

```
/user/*        rider app       — phone frame, green rider theme
/driver/*      driver app      — phone frame, indigo driver theme
/simulator     control panel   — full-width map + tab list + event timeline
```

One origin matters for two reasons: `BroadcastChannel` only works between same-origin tabs,
and a single Vite dev proxy can front every backend service (so no CORS).

### Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + React 19 + TypeScript | Same React version as the Expo apps |
| Routing | React Router | Nested routes per role, like expo-router groups |
| Server state | TanStack Query | Same as the apps — hooks port almost as-is |
| Client state | Zustand | Same as the apps |
| Forms | react-hook-form + zod | Schemas copied from `src/features/*/schemas.ts` |
| Styling | Tailwind CSS | Reuse `theme/colors.js` + `tailwind.config.js` from the apps (NativeWind uses the same config) |
| Icons | `lucide-react` | Driver app uses `lucide-react-native`; handoff says Lucide |
| Font | Plus Jakarta Sans (400–800) | Handoff type spec |
| Map | Google Maps JS via `@vis.gl/react-google-maps` | Matches the apps; uses the localhost browser key (see Decisions) |
| Tests | Vitest + Testing Library, Playwright for multi-tab E2E | |

### Folder layout

```
src/
  app/                 routes: user/, driver/, simulator/
  shared/
    api/               http client, per-service clients, types (copied from the Expo apps)
    session/           per-tab session store (sessionStorage)
    tab/               tab identity + BroadcastChannel bus
    location/          LocationProvider (simulated | browser)
    realtime/          websocket client with reconnect + typed messages
    devlog/            event log store + publisher
    ui/                Button, Card, Badge, Banner, Stepper, TextInput, Select,
                       ConfirmDialog, EmptyState, SegmentedControl, Sheet, PhoneFrame
    map/               MapView, markers, route polyline
  features/
    rider/             auth, places, booking, trip, profile
    driver/            auth, presence, offers, trip, vehicles, kyc, profile
    simulator/         registry, playback, timeline, inspector
  theme/
    rider.ts           handoff rider tokens
    driver.ts          copied from go-ride-driver-app/src/theme
```

---

## 2. Per-tab sessions

**Rule:** a login belongs to a tab, not to the browser.

- Token and user profile live in **`sessionStorage`** under `goride:session:<role>`.
  `sessionStorage` is per-tab and survives a reload, so refresh keeps you logged in;
  closing the tab ends the session.
- A `tabId` (UUID) is also kept in `sessionStorage`. It is used as:
  - the websocket `device_id` (the gateway keys connections `user_id → device_id`, so two
    tabs logged in as the same driver don't kick each other), and
  - the tab's address on the simulator bus.
- **Duplicate-tab guard.** Chrome's "Duplicate tab" copies `sessionStorage`. On boot each tab
  announces its `tabId` on the bus; if another live tab answers with the same id, the newer
  tab gets a fresh `tabId` and its session is cleared (you log in again).
- One `session-store` module owns reads/writes, so switching to pure in-memory storage later
  is a one-file change.
- **Expiry.** Tokens last 60 minutes with no refresh. Decode `exp` (reuse `lib/jwt.ts`), show
  the same `SessionExpiryBanner` the apps use, and on a 401 clear the session and route to
  login — same behaviour as `http-client.ts` in the apps.
- Nothing is written to `localStorage` except per-browser UI preferences (e.g. simulator
  panel layout).

---

## 3. Networking — Vite proxy instead of CORS

None of the Go HTTP services set CORS headers, and the websocket gateway accepts any origin
(`CheckOrigin: true`). So the browser talks only to the Vite dev server, and Vite proxies
by path. Most specific prefixes first:

| Path prefix | Target (local default) | Service |
|---|---|---|
| `/api/v1/cab` | `:8082` | cab-request-handler (rider trips) |
| `/api/v1/driver-trips` | `:8084` | driver-request-handler |
| `/api/v1/location` | `:8081` | location-producers |
| `/api/v1/ws` (with `ws: true`) | `:8083` | websocket-gateway |
| `/api/v1` | `:8080` | go-ride-backend (auth, profile, driver, vehicles, KYC, places) |

Targets come from `.env` (`VITE_PROXY_BACKEND=http://localhost:8080`, …) so the same app can
point at the kind cluster or at services run by `scripts/run-all.sh`. Client code only ever
uses relative paths like `/api/v1/cab/fare-estimate`.

### Endpoints used

| Area | Endpoints |
|---|---|
| Rider auth/profile | `POST /api/v1/auth/signup`, `/auth/login`, `GET /me`, `PATCH /profile` |
| Driver auth/profile | `POST /api/v1/driver/auth/signup`, `/driver/auth/login`, `GET /driver/profile`, `PATCH /driver/online`, `PATCH /driver/pause` |
| Vehicles / KYC | `/api/v1/driver/vehicles…`, `/api/v1/driver/kyc/…` |
| Places | `GET /api/v1/places/autocomplete`, `/places/:place_id`, `/places/reverse-geocode` |
| Rider trip | `POST /api/v1/cab/fare-estimate`, `POST /request-cab`, `POST /request-cab/{id}/cancel`, `GET /current-trip`, `GET /trips`, `POST /trips/{id}/rate` |
| Driver trip | `POST /api/v1/driver-trips/job-offers/{id}/accept`, `/ongoing-trips/{id}/start|end|collect-payment|cancel`, `GET /current-trip`, `/trips`, `/earnings`, `/online-time`, `/stats` |
| Location | `POST /api/v1/location/update-location` (strict body — `DisallowUnknownFields`) |
| Realtime | `GET /api/v1/ws/driver?token=…&device_id=…`, `/api/v1/ws/rider?…` |

### Websocket client

- One connection per tab, opened after login, closed on logout.
- Exponential backoff reconnect; connection state (`connecting / open / closed`) is shown in
  the dev panel and published to the simulator.
- Typed messages from `websocket-gateway/internal/ws/protocol.go`:
  driver ← `job_offer`, `offer_withdrawn`, `trip_cancelled`;
  rider ← `ride_assigned`, `driver_location`, `trip_started`, `trip_ended`,
  `trip_completed`, `trip_cancelled`.
- Driver sends an `ack {job_offer_id, status: "seen"}` when an offer is rendered.
- Offers replay on reconnect, so there's no polling for offers. For trip state, the rider
  and driver fall back to `GET /current-trip` after a reconnect or reload (the backend's own
  reliability model).

---

## 4. Phone-frame UI that matches the app

- `PhoneFrame` renders the app at **396 px content width** inside a simple rounded device
  shape (428 × 908 like the handoff), centred on a neutral page. Below ~480 px viewport
  width the frame disappears and the app fills the screen. The handoff's
  `android-frame.jsx` bezel is presentation-only and is not ported.
- A collapsible **dev panel** sits beside the frame (not inside it), so the phone UI stays
  faithful. It shows: tab id, user, token expiry countdown, WS state, location source and
  this tab's event log.
- **Two themes.** Rider uses the handoff rider tokens (brand `#00a04a`, sheet radius 26,
  card 18, sheet and floating-control shadows). Driver uses
  `go-ride-driver-app/src/theme/colors.js` as the source of truth (primary `#4f46e5`,
  radii 12/16). Both are exposed as Tailwind theme extensions, the way NativeWind consumes
  them in the apps.
- **Components.** Re-create the apps' component set with the same props and variants
  (`Button`, `Card`, `Badge`, `Banner`, `Stepper`, `TextInput`, `Select`, `ConfirmDialog`,
  `EmptyState`, `SegmentedControl`, `ScreenHeader`, `SectionCard`), swapping RN primitives for
  DOM elements. Add a `BottomSheet` for the map-over-sheet layouts.
- **Type & spacing.** Handoff scale (11–52 px), display numbers at 800 weight with
  −0.02/−0.03 em tracking, uppercase eyebrows, 4 px spacing base, 44 px minimum hit target.
- **Visual check.** Open each `.dc.html` screen next to the web screen at the same width
  (search `data-screen-label="…"` in the handoff) and compare before marking a screen done.

### Screens

| Rider | Driver |
|---|---|
| Login / Sign up (from `go-ride-user-app`) | D01 Sign in, D02 Sign up |
| R01 Where to | D03 Menu |
| R02 Confirm pickup | D04 Verification hub |
| R03 Pick a ride | D05 Vehicles |
| R04 Finding a driver | D06 Go online (home) |
| R05 Driver on the way | D07 Confirm online (sheet) |
| R06 On trip | D08 Job offers |
| R07 Rider profile | D09 Trip & cash collection |
| Trip complete + rating | D10 Cancel with a reason (sheet) |
| | D11 Profile & earnings |

Behaviour rules from the handoff carry over unchanged: going online always passes through
D07; offers are accept-only with per-offer countdowns and first-wins expiry; cancellation
always asks for a reason; cash only; surface `KYC_NOT_APPROVED` / `VEHICLE_NOT_VERIFIED`
as readable blockers, never a raw 403.

---

## 5. Location spoofing

### LocationProvider

Every rider and driver tab gets its position from a `LocationProvider` with two sources:

- **`simulated`** (default) — position is set by the simulator; last value kept in
  `sessionStorage` so a reload doesn't lose it.
- **`browser`** — `navigator.geolocation.watchPosition`.

The dev panel switches between them. Screens never call geolocation directly.

### Driver broadcasting

When the driver is online, the tab posts to `/api/v1/location/update-location` with **its own
token**, using the same throttle rules as
`go-ride-driver-app/src/features/presence/location-broadcaster.ts`
(movement ≥ 10 s apart, heartbeat every 60 s). Port that module and its tests rather than
rewriting it. During route playback the movement throttle still applies, so dispatch sees
realistic ping rates.

### Rider

The provider's position is the rider's "current location" in R01/R02 (pickup default,
re-centre button).

---

## 6. Simulator

### Tab bus (BroadcastChannel `goride-sim`)

Tabs → simulator:

| Message | Payload |
|---|---|
| `hello` / `heartbeat` (every 2 s) / `bye` | `tabId, role, userId, name, location, locationSource, wsState, online, tripState` |
| `log` | one event-log entry (see below) |

Simulator → tab:

| Message | Payload |
|---|---|
| `set-location` | `tabId, lat, lng` |
| `play-route` | `tabId, path[], speedKmh` |
| `stop-route` | `tabId` |
| `whois` | — (everyone replies with `hello`) |

A tab missing three heartbeats is shown as stale; `bye` is sent on `pagehide`.

### Features

1. **Live map of every tab** — rider and driver markers coloured by role and state (offline,
   online, offered, on trip). Pickup and drop-off pins for active trips.
2. **Place actors** — select a tab in the list, then click the map to move it; markers are
   draggable.
3. **Route playback** — drive a selected driver along a path at a chosen speed:
   - *To pickup* / *to drop-off* for a driver on a trip (path from the Directions API, or a
     straight-line fallback);
   - a freehand path drawn by clicking waypoints.
   Playback runs in the simulator and streams `set-location` ticks; the driver tab does the
   actual API calls.
4. **Quick setup** — "open N driver tabs" (`window.open('/driver')`), scatter online drivers
   around a point, save and load named layouts (positions per user email).
5. **Event timeline** — merged, filterable log from all tabs: HTTP (method, path, status,
   latency), WS in/out (type + payload), location pings, trip-state transitions.
   Colour-coded by tab; click an entry to see the full JSON.
6. **Trip inspector** — pick a trip id and see its state machine
   (Searching → Offered → Assigned → InProgress → AwaitingPayment → Completed/Cancelled) with
   timestamps, which drivers were offered, and who won the accept race.

The simulator has no login and makes no backend calls of its own, except map services
(tiles, directions).

---

## 7. Event log format

Shared by the dev panel and the simulator timeline:

```ts
type DevLogEntry = {
  id: string;
  at: number;              // epoch ms
  tabId: string;
  role: 'rider' | 'driver';
  kind: 'http' | 'ws-in' | 'ws-out' | 'location' | 'state' | 'error';
  summary: string;         // "POST /cab/request-cab 201 142ms"
  data?: unknown;          // request/response or message body; tokens redacted
};
```

Written by the http client, the WS client and the location broadcaster. Kept in a capped
ring buffer (e.g. last 500) per tab.

---

## 8. Build phases

Each phase ends with something you can run and click through.

### Phase 0 — Foundation ✅ (2026-09-25; `npm run smoke:firefox` 14/14)
- Vite + TS + Tailwind + fonts + lucide; ESLint/Prettier matching the apps.
- Proxy config and `.env.example`; health page that pings every `/healthz`.
- Theme tokens (rider, driver), `PhoneFrame`, base UI components.
- Tab identity, per-tab session store, duplicate-tab guard.
- HTTP client (port of `http-client.ts` + dev-log hook), WS client, BroadcastChannel bus.
- **Done when:** two tabs can each log in as different users, reload keeps each login, and
  the health page is green.

### Phase 1 — Simulator skeleton + location provider ✅ (2026-09-25; map click → tab in <20ms)
- Simulator route with map, tab list, click-to-place, drag markers.
- `LocationProvider` (simulated/browser) in both apps; dev panel.
- **Done when:** moving a marker in the simulator updates the tab's position within a second.

### Phase 2 — Driver path to "receiving offers" ✅ (2026-09-25; offer reaches the driver tab in ~150–250ms)
- D01/D02 auth, D03 menu, D06 home, D07 confirm-online sheet, pause.
- Location broadcaster port; WS connect; D08 offers with countdowns, ack, accept,
  expired/taken states, `offer_withdrawn`.
- Drivers are made eligible by editing the local DB (see Decisions §3).
- **Done when:** an online driver tab, placed in the simulator, shows up in dispatch.

### Phase 3 — Rider booking happy path ✅ (2026-09-26; two drivers offered in ~100ms, rider sees driver move)
- Login/signup, R01 (places autocomplete via backend proxy), R02 confirm pickup (map pin +
  reverse geocode), R03 tiers from `fare-estimate`, R04 `request-cab` + searching state +
  cancel, R05 `ride_assigned` + live `driver_location` + start PIN.
- **Done when:** a rider request produces offers in 2+ driver tabs, one accepts, the other's
  card goes to "taken", and the rider sees the driver moving.

### Phase 4 — Trip completion and cancellation
- Driver D09: start with PIN, end, cash collected; D10 cancel with reason.
- Rider R06 on trip, `trip_ended` / `trip_completed`, rating; rider cancel at each stage.
- Driver cancel → redispatch visible to the rider.
- **Done when:** the full lifecycle and both cancel paths work end to end.

### Phase 5 — Simulator power features
- Route playback (to pickup/drop-off, drawn paths, speed), quick setup, saved layouts.
- Merged event timeline with filters; trip inspector.
- **Done when:** one click drives the assigned driver to pickup and the rider's ETA counts down.

### Phase 6 — Remaining screens
- R07 rider profile (edit, change password); D11 profile & earnings (`/earnings`, `/stats`,
  `/trips`); D05 vehicles (register, activate gating); D04 verification hub and uploads.
- **Done when:** every handoff screen has a web counterpart that passes the visual check.

### Tests along the way
- Vitest: session store, duplicate-tab guard, bus protocol, WS reconnect, location
  throttle (ported tests), offer countdown/expiry reducer, trip-state reducer.
- Playwright (Phase 4+): one browser context, several pages — log in a rider and two
  drivers, place them via the simulator page, book, accept, complete. This also proves the
  per-tab session isolation.

---

## 9. Decisions

1. **Folder:** stays `go-ride-ui-simulation/`.
2. **Map key — done.** Browser key "Go Ride Simulator Browser Key (localhost)" in GCP project
   `go-ride-dev-504212` (key id `52b9aa5c-f166-48c9-ae36-32b1b4fb8915`). Referrers
   `http://localhost:5173/*`, `http://127.0.0.1:5173/*` (explicit ports — Google rejected
   the dev server under the `localhost:*` wildcard alone), plus `http://localhost:*/*`,
   `http://127.0.0.1:*/*`, `http://localhost/*`; APIs Maps JavaScript, Directions,
   Routes, and Places API (New) for the simulator's search box (added 2026-09-26). Stored in `go-ride-ui-simulation/.env` as `VITE_GOOGLE_MAPS_API_KEY` (gitignored).
   Places autocomplete, place details and reverse geocode go through the backend's
   `/api/v1/places` proxy for the rider and driver apps; only the simulator's search (no login) uses Places on the browser key.
3. **Test data — use the local DB directly, no seed script.** Riders and drivers can be
   created through the web app (real API) or inserted straight into the local Postgres
   (`go-ride-postgres` container, db `go_ride`); inserted passwords must be bcrypt hashes the
   backend's login accepts. Data is added or changed whenever development or a test needs
   it. To let a driver go online:
   - `drivers.kyc_status = 'approved'`;
   - one `vehicles` row per driver (`category` `normal`/`luxury`), `is_active = true`;
   - current `driver_documents` rows for the 5 identity documents and the vehicle documents
     with `status = 'approved'` (`file_url` a placeholder).

   Before running this, check the exact "vehicle verified" rule in go-ride-backend's KYC and
   vehicle-activation code, so the SQL matches what the API checks. Reset stuck state the
   same way when needed (e.g. `is_online`/`is_paused`, stale `ongoing_trips`). Local dev DB
   only. D04 upload screens still come last in Phase 6; they need a CORS rule on the
   MinIO bucket.
4. **Add to `scripts/run-all.sh`?** Default: **yes, `npm run dev` alongside the services**.
