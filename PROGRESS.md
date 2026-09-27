# Progress & checkpoints

The working log for this repo. [PLAN.md](PLAN.md) is the design; this file tracks what's done,
what's next at task level, and what was learned along the way. Update it at the end of
every working session and every phase.

**Last updated:** 2026-09-27 · **Current phase:** 5b next (5 done 2026-09-27)

---

## Checkpoints

| Phase | Status | Commit(s) | Verified by |
|---|---|---|---|
| 0 Foundation | ✅ done 2026-09-25 | `224865b`…`be97d54` | Unit tests (18), `smoke:firefox` 14/14 |
| 1 Simulator map + location provider | ✅ done 2026-09-25 | `45ee1ce`, `1660776` | Unit tests (24), `smoke:firefox` 19/19 |
| 2 Driver → receiving offers | ✅ done 2026-09-25 | `05a60d8`…`2b74e76` | Unit tests (77), `smoke:firefox` 26/26 (offer in ~150–250ms) |
| 3 Rider booking happy path | ✅ done 2026-09-26 | `94d6ca1`…`d63c85e` | Unit tests (100), `smoke:firefox` 40/40 (offers to 2 drivers in ~80–110ms, driver move → rider map in <5s) |
| 4 Trip completion + cancellation | ✅ done 2026-09-26 | `356510e`…`b38e57c` | Unit tests (122), `smoke:firefox` 58/58 (full lifecycle, redispatch, rider cancel mid-trip) |
| 5 Realistic driving (route playback) | ✅ done 2026-09-27 | `ac2b40c`…`9adf579` | Unit tests (184), `smoke:firefox` 75/75 (both legs driven, every stored ping ≤25 m from the route — measured 0.0 m) |
| 5b Simulator tools (setup, layouts, timeline, inspector) | ⏳ next | — | — |
| 6 Remaining screens | ☐ | — | — |

### Phase 0 — Foundation ✅
- [x] Vite + React 19 + TS + Tailwind 4 + fonts + lucide; ESLint
- [x] Dev proxy to all 5 Go services (incl. websocket upgrade) — no CORS changes
- [x] Theme tokens (driver from `colors.js`, rider from handoff); `primary` swaps under `data-theme="rider"`
- [x] PhoneFrame (396px content), shared components ported from the driver app
- [x] Per-tab sessions in `sessionStorage`, duplicate-tab guard, token-expiry sign-out
- [x] HTTP client (error normalisation, 401 → sign out), websocket client (backoff), dev log + dev panel
- [x] Login / signup for both roles, temporary signed-in screen, `/health`, `/simulator` tab list
- [x] Firefox smoke test (`npm run smoke:firefox`)

### Phase 1 — Simulator map + location provider ✅
- [x] Location store: `simulated` (default, persisted per tab) / `browser` (watchPosition)
- [x] Bus `set-location` command; presence carries position + source
- [x] Dev panel location row with source switch; signed-in screen shows current fix
- [x] Simulator: Google map (opens on Kuala Lumpur), tab list by role, click-to-place, draggable markers, locate button, Esc to deselect, error boundary around the map
- [x] Smoke: map click reaches the tab in <20ms, survives reload, no Maps key errors
- [ ] Not auto-tested: dragging a marker (check manually)

---

### Phase 2 — Driver → receiving offers ✅
- [x] 2.1 Test data via local DB (SQL below): `sim.driver1`–`3` KYC-approved, one active vehicle each
      (driver1 Myvi 4-seat normal → RIDE; driver2 Innova 7-seat → RIDE/RIDE_XL; driver3 E-Class luxury → RIDE/RIDE_PREMIUM),
      5 identity + 5 vehicle documents approved. Verified `PATCH /driver/online` → 200.
- [x] 2.2 Driver API layer: types from backend/driver-request-handler/location-producers/ws protocol; clients + query hooks
- [x] 2.3 Ported `deriveOnlineGate`, verification summary, `kycBlockReason`, haversine + their tests (30)
- [x] 2.4 Screens: D06 home (map, chip, stat cards, verification card, blockers, **online block** — app addition), D07 confirm online, D03 menu, D08 job offers, temporary assigned-trip screen
- [x] 2.5 Location broadcaster (app rules + 5s tick for heartbeats), lifecycle from server `is_online`
- [x] 2.6 Offer store + D08: per-offer TTL, `offer_withdrawn`/`trip_cancelled` by request, seen-ack, first-wins accept (409 → taken, 404 → expired), place names via reverse geocode
- [x] 2.7 Simulator shows driver status; smoke covers online → ping → offer (~150–250ms) → ack → accept
- [x] Fix found on the way: duplicate-tab guard now defends during boot (`5ed6ef4`)

<details><summary>SQL used for 2.1 (idempotent; re-run if drivers are recreated)</summary>

```sql
BEGIN;
WITH spec(email, plate, color, model, seats, category) AS (VALUES
  ('sim.driver1@goride.test', 'SIM1001', 'White',  'Perodua Myvi',     4, 'normal'),
  ('sim.driver2@goride.test', 'SIM2002', 'Silver', 'Toyota Innova',    7, 'normal'),
  ('sim.driver3@goride.test', 'SIM3003', 'Black',  'Mercedes E-Class', 4, 'luxury'))
INSERT INTO vehicles (driver_id, plate_number, color, model_name, seat_count, category, is_active)
SELECT d.id, s.plate, s.color, s.model, s.seats, s.category, true
FROM spec s JOIN drivers d ON d.email = s.email
ON CONFLICT (plate_number) DO UPDATE SET is_active = true;

UPDATE drivers SET kyc_status = 'approved', updated_at = now() WHERE email LIKE 'sim.driver%@goride.test';

INSERT INTO driver_documents (driver_id, vehicle_id, document_type, file_url, status, is_current)
SELECT d.id, NULL, t, 'sim://placeholder/' || t, 'approved', true
FROM drivers d CROSS JOIN unnest(ARRAY['selfie','govt_id_front','govt_id_back','driving_license_front','driving_license_back']) AS t
WHERE d.email LIKE 'sim.driver%@goride.test'
  AND NOT EXISTS (SELECT 1 FROM driver_documents x WHERE x.driver_id = d.id AND x.document_type = t AND x.is_current);

INSERT INTO driver_documents (driver_id, vehicle_id, document_type, file_url, status, is_current)
SELECT d.id, v.id, t, 'sim://placeholder/' || t, 'approved', true
FROM drivers d JOIN vehicles v ON v.driver_id = d.id AND v.is_active
CROSS JOIN unnest(ARRAY['vehicle_registration','vehicle_photo_front','vehicle_photo_back','vehicle_photo_side','vehicle_number_plate']) AS t
WHERE d.email LIKE 'sim.driver%@goride.test'
  AND NOT EXISTS (SELECT 1 FROM driver_documents x WHERE x.vehicle_id = v.id AND x.document_type = t AND x.is_current);
COMMIT;
```
Run with `docker exec -i go-ride-postgres psql -U postgres -d go_ride -v ON_ERROR_STOP=1 < file.sql`.
</details>

---

### Extra (2026-09-26, asked outside the phase plan)
- [x] Simulator search box: Places (New) autocomplete biased to the visible map, keyboard navigation, result pin with
      "Move <tab> here". Smoke checks that results come back

### Phase 3 — Rider booking happy path ✅
- [x] 3.0 Rendered R01–R07 (`npm run handoff:shots`). **Currency → MYR** (see Decisions): cab-request-handler's
      local `.env` now has `FARE_CITY_CODE=KUL`, `FARE_CURRENCY_CODE=MYR`; added the missing KUL `RIDE_XL` row (SQL below)
- [x] 3.1 Rider API layer (`features/rider/api`): types from cab-request-handler + gateway rider messages, `cabClient`
      (fare-estimate, request-cab with `Idempotency-Key`, cancel, current-trip, trips, rate). Places moved to
      `shared/places` (both roles, own token); `apiRequest` gained a `headers` option
- [x] 3.2 Trip reducer (`trip/trip-model.ts`, forward-only phases) + store persisted in `sessionStorage`
      (`goride:rider-trip`) so driver/vehicle/PIN survive a reload; runtime syncs `current-trip` on every (re)connect and
      every 4s while searching, looks up vanished trips in `/cab/trips`; follows the trip to R04/R05; simulator activity
- [x] 3.3 Screens: R01 Where to (Recent from `/cab/trips` + reverse geocode, Suggested KL places, autocomplete while
      typing, Saved empty), R02 confirm pickup (fixed centre pin; `?for=dropoff` = "Choose on map"), R03 three tiers with
      route polyline, breakdown, 15-min quote countdown + Refresh, R04 search steps from `trip_requests.status`,
      "no driver found" with Try again, R05 driver/vehicle/plate/start PIN/live marker + ETA. Account sheet (log out)
      stands in for R07. Cancel sheet requires a reason on R04 and R05
- [x] 3.4 Simulator draws each rider's pickup/drop-off and a dashed link from the assigned driver; unit tests for the
      reducer, quote expiry, idempotency-key reuse; smoke covers the full booking (see Checkpoints)
- [ ] Not auto-tested: R04 cancel through the UI (same hook as R05's, which is tested); "no driver found" screen
      (needs every driver offline for the whole dispatch retry window, ~1 min)

<details><summary>SQL used for 3.0 (idempotent)</summary>

```sql
INSERT INTO fare_configs (city_code, service_type, currency_code, base_fare, per_km_rate, per_minute_rate, minimum_fare, booking_fee, priority, metadata)
SELECT 'KUL', 'RIDE_XL', 'MYR', 6.50, 2.30, 0.45, 10.00, 1.50, 100,
       '{"label": "kul-ride-xl-sim", "region": "klang-valley", "country": "MY", "seed_version": "sim"}'
WHERE NOT EXISTS (SELECT 1 FROM fare_configs WHERE city_code='KUL' AND service_type='RIDE_XL' AND is_active);
```
Plus, in `go-ride-kafka-consumers/services/cab-request-handler/.env` (gitignored): `FARE_CITY_CODE=KUL`,
`FARE_CURRENCY_CODE=MYR`. Restart cab-request-handler after changing it.
</details>

---

### Phase 4 — Trip completion and cancellation ✅

**Done when**, all through the web screens:
1. **Happy path:** the driver enters the rider's start PIN (a wrong PIN is rejected), the trip starts, and the rider
   sees R06. The driver ends the trip, the rider sees the fare due, and the driver marks the cash collected. The rider
   sees the trip complete and rates the driver. The driver's D06 earnings go up.
2. **Rider cancels** at each stage that allows it: searching, driver on the way, on trip.
3. **Driver cancels before pickup:** the rider sees "finding you another driver", a second driver gets the offer
   (the first doesn't), accepts, and the rider sees the new driver, plate and PIN. A driver cancelling mid-trip ends
   the trip for the rider.

#### 4.0 Research (2026-09-26)
Designs rendered to `test-results/handoff/`: `09-Trip-in-progress.png`, `10-Cancel-trip.png`, `06-On-trip.png`.
Nothing in the Expo driver app to port (its trips client covers earnings/online time only).

**Backend state machine** (driver-request-handler `internal/offers/service.go`, cab-request-handler):

| `ongoing_trips.status` | Action | Endpoint (body) | → status | Rider gets |
|---|---|---|---|---|
| `assigned` | Driver starts with PIN | `POST /api/v1/driver-trips/ongoing-trips/{id}/start` `{start_pin}` | `in_progress` | `trip_started` |
| `in_progress` | Driver ends | `…/{id}/end` (no body) | `awaiting_payment`, `final_fare` = locked quote total | `trip_ended {final_fare, currency_code}` |
| `awaiting_payment` | Driver collects cash | `…/{id}/collect-payment` (no body) | `completed` | `trip_completed` |
| `assigned` / `in_progress` | Driver cancels | `…/{id}/cancel` `{reason, note?}` (reason **required**) | `cancelled` | `trip_cancelled {cancelled_by: "driver", stage}` |
| `assigned` / `in_progress` | Rider cancels | `POST /api/v1/cab/request-cab/{request_id}/cancel` | `cancelled` | — (driver gets `trip_cancelled`) |
| `completed` | Rider rates | `POST /api/v1/cab/trips/{ongoing_trip_id}/rate` `{rating 1–5, comment?}` | — | — |

`{id}` is `ongoing_trip.trip_record_id`. `driver_arriving` exists in the schema but nothing sets it.

**Error codes to map to readable text:**
- start: 400 `invalid_start_pin` (not 4 digits), **403 `invalid_start_pin` (wrong PIN)**, 409 `trip_not_startable`
- end: 409 `trip_not_endable`
- collect: 409 `trip_not_collectable`
- driver cancel: 400 `invalid_cancellation_reason`, 409 `trip_already_cancelled` / `trip_not_cancellable`
- rider cancel: 409 `trip_not_cancellable` during `awaiting_payment`
- rate: 409 `trip_not_completed` / `trip_already_rated`, 400 `invalid_rating`
- all: 404 `trip_not_found`, 403 `trip_forbidden`

**Redispatch** (trip-dispatch-worker `HandleDriverCancellation`):
- A driver cancel at stage `assigned` resets the **same request** to `searching` (attempt count 0) and dispatches
  again straight away. The cancelling driver is excluded.
- The rider gets `trip_cancelled (cancelled_by: driver, stage: assigned)`. `current-trip` then shows `trip_request`
  with status `searching`. Later a `ride_assigned` arrives for the same `request_id`.
- **The `ongoing_trips` row is reused**: same `ongoing_trip_id`, new driver, **new start PIN**.
- A driver cancel at `in_progress` does not redispatch; the trip is over for the rider.

**Gaps found:**
- **No live driver position after pickup.** The gateway stops `driver_location` at `trip_started` ("pings are about
  to stop"; `tripstart/notifier.go` clears the active trip). R06 therefore **estimates** progress from `started_at`
  and the booked route (duration, distance, polyline), which must now be kept on the rider trip at booking.
  Recorded under Known issues; no backend change planned.
- The driver's `current-trip` has **no rider name and no start PIN**; the PIN is by design, since the rider reads it
  out. The rider name only arrives on `job_offer.rider_name`, so the driver tab keeps it with its trip in
  `sessionStorage`, like the rider tab does with `ride_assigned`.
- **Design gaps** (design them in-app, as with D06's online block):
  - D09 draws only the on-trip state, with both `Cash collected` and `End trip` visible. The backend needs End first,
    then Collect.
  - Not designed: driver heading to pickup + PIN entry; rider "pay your driver"; trip complete + rating; "your driver
    cancelled, finding another".
- R06's "Trip shared with 2 contacts" and "Add a stop", and D09's call and Navigate buttons, have no backend. Keep
  them visible but inactive. Navigate becomes "drive there" in Phase 5.

#### 4.1 Driver trip model (`features/driver/trip/`)
- [x] Types + `driverTripsClient`: `startTrip(id, pin)`, `endTrip(id)`, `collectPayment(id)`, `cancelTrip(id, reason, note?)`
- [x] Trip reducer + store, persisted in `goride:driver-trip`
  - Sources: the accept response, `current-trip` snapshots, and `trip_cancelled` on the driver socket
  - Phases: `to_pickup` (`assigned`) → `on_trip` → `collecting` (`awaiting_payment`) → `completed`, or `cancelled`
    (`by rider` / `by me`)
  - Keeps the rider name (from the accepted offer card), pickup/drop-off labels, fare and currency, `started_at`
- [x] Mutations update the store and the `current-trip` cache. Collect also invalidates earnings, online time and stats
      so D06's stat cards refresh.
- [x] Runtime: sync `current-trip` on load and reconnect; rider cancel → phase `cancelled by rider`; simulator activity
      `to pickup` / `on trip` / `collecting cash`; the offer feed stays quiet while on a trip.
- [x] Unit tests: reducer (each transition, rider cancel, reload from snapshot, settled trips ignore late messages)

#### 4.2 D09 + D10 (replace `TripAssignedScreen`, route `/driver/trip`)
- [x] **To pickup** (designed in-app): map with the driver and pickup and a line between them; rider row (initials,
      name, pickup label); "At the pickup? Enter the rider's PIN" as four digit boxes, then `Start trip`.
      A wrong PIN shows "That PIN doesn't match — ask the rider to read it again"; `Cancel trip` opens D10.
- [x] **On trip** (D09 design): "On trip · N min left" pill, Navigate (inactive); rider row; green collection block
      with "COLLECT ON ARRIVAL" and the fare; `End trip` primary, `Cash collected` disabled until ended; footer
      "Started HH:MM · fare locked, no surge added" and `Cancel trip`.
- [x] **Collecting:** same block, `End trip` done, `Cash collected` enabled.
- [x] **Completed:** "RM X collected" → `Back to map` (still online). **Cancelled by rider:** banner + `Back to map`.
- [x] **D10 sheet:** five reasons in design order, mapped to the enum (rider absent → `rider_absent`, rider asked →
      `rider_requested`, vehicle problem, wrong/unsafe destination, something else → `other`); optional note;
      `Keep trip` / danger `Cancel trip`, disabled until a reason is picked. The copy differs before pickup
      ("the trip goes back into dispatch") and mid-trip. Afterwards → D06.
- [x] Offer arrival must not pull a driver off D09 (already true for `/driver/trip*`; keep it that way).

#### 4.3 Rider side
- [x] **Reducer, test first:** `trip_cancelled {cancelled_by: driver, stage: assigned}` sets the trip back to
      `searching`. It clears the driver, PIN, fix and `ongoingTripId` and sets `redispatched: true`. A later
      `ride_assigned` for the same request gives `assigned` with the new driver and PIN; the PIN must replace the old
      one, not keep it via `??`. A driver cancel at `in_progress` stays final.
- [x] Keep `routeDistanceKm`, `routeDurationMinutes` and `routePolyline` from the booked quote on the trip.
- [x] R04 when `redispatched`: "Your driver cancelled — finding you another".
- [x] **R06 On trip** (design), replacing `TripStatus` for `in_progress`:
  - map with the route polyline and drop-off (no live car: estimated)
  - "On route" pill; ARRIVING clock = `started_at` + route duration; min/km left and progress bar from elapsed time
  - compact driver row with plate
  - `Cancel trip` (rider, stage `in_progress`, reasons mapped to the enum); "Trip shared" / "Add a stop" inactive
- [x] **Pay your driver** (`awaiting_payment`, designed in-app): "You've arrived — pay RM X in cash to <driver>", waiting
      for the driver to confirm, no cancel.
- [x] **Trip complete + rating** (designed in-app): fare paid; 1–5 stars + optional comment → rate → `Done`.
      `Skip` → `Done`. `trip_already_rated` → `Done`. Clears the trip and the booking draft.
- [x] **Driver ended the trip mid-way** (`cancelled`, `in_progress`, by driver): a final screen with `Done`.

#### 4.4 Simulator + tests
- [x] Simulator link follows the phase: driver → pickup before the start, driver → drop-off after it.
- [x] Unit tests: rider redispatch, driver trip reducer, R06 time-based progress maths.
- [x] Smoke, happy path:
  - wrong PIN rejected, right PIN → R06
  - End → rider sees the fare due; Collect → rider rates
  - `/cab/trips` shows the trip `completed`; the driver's today earnings include the fare
- [x] Smoke, redispatch: two drivers online; driver 1 accepts then cancels with a reason. The rider's R04 says
      "finding another". Driver 2 is offered (driver 1 is not), accepts, and the rider's R05 shows `SIM2002` with a
      new PIN.
- [x] Smoke, rider cancel from R06 (mid-trip) → the driver's D09 shows the rider cancelled.
- [x] Commit per sub-area, push, update this file.

**Found while testing:**
- Dispatch re-offers a redispatched request by **resetting the same `driver_job_offers` row**: same `job_offer_id`,
  new expiry, `offer_version` always 1. The driver offer store now revives a settled card when its offer comes
  back with a later expiry (`abd4614`).
- The driver's own cancel echoes on the socket (`trip_cancelled`, `cancelled_by: driver`) and can beat the HTTP
  response; the echo records the redispatch itself.
- Offers live 15s: tests must accept a redispatched offer before checking anything slow on the rider side.

**Not auto-tested:** R04 "finding you another" copy (the smoke test checks the `assigned → searching` transition in the
rider's dev log instead, since the screen can last well under a second); "Your driver ended the trip" (driver cancel
mid-trip); the rider's `trip_already_rated` path.


---

### Phase 5 — Realistic driving (simulator route playback) ✅

**Goal:** the simulator drives a driver tab like a real car. The car follows real roads at road-appropriate speeds,
with no straight-line hops and no teleport to the destination. The driver app and the rider app both show **the same
route**.

**Done when:**
1. One click, or auto-drive, moves the assigned driver along real roads to the pickup. Every location ping the
   backend stores lies on that route.
2. D09 and R05 draw the identical route. The rider's car glides along it between pings, and both apps' ETAs count
   down together.
3. After the start with the PIN, the same happens to the drop-off along the booked route (R03's and R06's route).
4. The playback controls work: speed, pause, stop.

Quick setup, saved layouts, the event timeline and the trip inspector (the rest of PLAN §6) move to **Phase 5b**,
after this.

### 5.0 Research ✅ (2026-09-26)
**Where routes come from today:**
- **Pickup → drop-off:** cab-request-handler calls the legacy **Directions API** (server key) once at fare-estimate
  and stores `overview_polyline` in `trip_fares.route_polyline`. The rider has it (quote, `current-trip.fare`); the
  driver never gets it (`driver-request-handler`'s fare payload has only id/currency/total).
- **Driver → pickup (approach):** no route exists anywhere in the backend.
- **Rider ETA before pickup:** websocket-gateway sends `eta_minutes = straight-line km / 30 km/h`
  (`tracking/notifier.go`, `FALLBACK_AVG_SPEED_KPH`). Real roads are very different: a spot ~400 m away was **3.3 km /
  5 min** by road (one-way streets).
- **After the start:** no `driver_location` at all (Phase 4 finding).

**Browser routing works:** the browser key allows `routes.googleapis.com`, and the project has the Routes API enabled.
Checked with `computeRoutes`, `TRAFFIC_UNAWARE`: legs → steps with `distanceMeters`, `staticDuration` and a road path.
Step speeds varied from 21 km/h (side streets) to 64 km/h (highway), which is enough for a realistic speed profile.
The Maps JS equivalent is `google.maps.routes.Route.computeRoutes` (the `routes` library, via vis.gl
`useMapsLibrary('routes')`, `fields: ['path', 'legs', 'distanceMeters', 'staticDurationMillis']`).

**Driver ping cadence** (location broadcaster, ported rules): movement ping at most every 10s and only after ≥25 m;
heartbeat 60s. So the backend, and therefore the rider, sees the car every ~10s. That's realistic; the rider app should
animate between pings rather than jump.

**Background tabs:** browsers throttle timers in hidden tabs to 1/s, and Chrome's intensive throttling drops chained
timers to 1/min after 5 min hidden. The simulator is often hidden while you watch a phone tab, so playback must
**derive the position from the wall clock** (a late tick jumps *along the road*, never off it), and tick from a
**dedicated Worker**, whose timers aren't throttled the same way. The driver tab's broadcaster is event-driven (bus
message → location store → ping), so it's unaffected.

### Design
**Route per leg, computed once, by the simulator** (the fake GPS is also the car's sat-nav):

| Leg | Path | Speeds |
|---|---|---|
| To pickup | `computeRoutes(driver position → pickup)` from the browser | Per step (`distanceMeters / staticDuration`) |
| To drop-off | The **booked** `route_polyline` (exactly what R03/R06 showed the rider) | Route average (booked duration ÷ distance) |

Fallbacks: no booked polyline → `computeRoutes(pickup → drop-off)`; Routes API failure → an error in the simulator,
never a straight line.

**Movement profile** (pure module, unit-tested):
- Densify the path to ≤10 m segments; each segment's target speed comes from its step.
- Slow for corners: a turn angle >60° caps the speed at ~15 km/h, >30° at ~25 km/h, applied over the ~30 m before it.
- Acceleration ≤1.5 m/s², braking ≤2.5 m/s²; start and end at 0.
- The result is a timeline: `positionAt(t) → {lat, lng, heading, metresDone, speed}`. At ×1 its total time is close to
  Google's `staticDuration`.

**Playback** (simulator):
- Wall-clock based, `simTime = (now − anchor) × speedFactor`.
- The Worker ticks at ~4 Hz and posts the existing `set-location {tabId, lat, lng}` (plus an optional `heading`).
  The driver tab does all backend calls itself, as today.
- Speed ×1 / ×2 / ×5 / ×10; pause, resume, stop.
- Stops at the destination, if the tab is moved by hand (click/drag), or when the tab goes stale.

**Same route in both apps: over the bus, not the backend.** The backend has no route for the approach leg and none
for the driver, and we don't change the backend. So the simulator publishes:

```
nav-route  { requestId, leg: 'pickup'|'dropoff', path (encoded polyline), steps[{metres, seconds}],
             anchor: {atMs, metres}, speedFactor, paused }
nav-route-clear { requestId, leg }
```

- The driver and rider tabs take it only when `requestId` matches their trip, store it per trip + leg in
  `sessionStorage`, and it's re-sent on `whois` so a reloaded tab gets it back.
- It's dev-only data like the fake GPS itself. The production fix is a backend change (route in `ride_assigned` /
  driver `current-trip`), recorded under Known issues.
- The rider's **position** still comes only from the backend (`driver_location`). The shared route is geometry plus
  timing, never a live position. The one exception is R06, where the backend sends nothing, so the rider estimates the
  car's position along the route from the anchor and speed factor.

**What each app shows:**
- **D09:** travelled part grey, remaining part indigo (as in the design), from the car snapped onto the route. The ETA
  pill is the remaining profile time, not straight-line. The car icon rotates with the heading.
- **R05:**
  - the approach route, remaining part from the latest `driver_location` snapped to the route
  - the car **glides** between pings along the route, tweened over the ping gap (~10s) instead of hopping
  - ETA and km come from the remaining route and step durations; the gateway's straight-line numbers are only a
    fallback when there's no route
- **R06:** the booked route with an estimated car moving along it (the anchor and speed factor keep it in step with
  the real playback).
- **Simulator:** the route on its map, a per-driver playback card (leg, progress, speed, pause/stop), and the car
  following it.

**Auto-drive:**
- A simulator toggle: when a driver accepts, drive to the pickup; when the trip starts, drive to the drop-off.
- D09's **Navigate** button sends `drive-request` on the bus. If no simulator is open, it says "Open the simulator
  to drive".
- The simulator only moves GPS. The PIN, End trip and Cash collected stay manual in the driver tab (no impersonation).

**Presence additions:** the driver tab announces its trip (requestId, phase, pickup, drop-off). The rider's trip marker
gains `requestId` and the booked `routePolyline`, so the simulator can build leg 2.

### Build plan (2026-09-27)
Refinements to the design above, found by reading the code before building:

| # | Finding in the code | Plan change |
|---|---|---|
| R1 | The rider and driver apps need the same movement profile to draw progress, ETA and R06's car | The engine lives in **`src/shared/route/`**, not `features/simulator/drive/`. Both sides rebuild the identical profile from `path + steps`, so `nav-route` carries no per-tick data |
| R2 | Every `logEvent` is also posted on the bus (`devlog-store`), and `applySimulated` logs each fix | At 4 Hz × N drivers the dev log and bus flood. `set-location` gains `playback: true`; the location store logs playback fixes at most once per 5 s |
| R3 | Redispatch reuses the `requestId` (Gotchas) | `nav-route` also carries `driverId`; the rider accepts a route only when it matches `trip.driver.id` |
| R4 | A driver-tab reload sends `bye`, then a fresh presence | Stale tab or `bye` → **pause** playback (anchor held), auto-resume when the same `tabId` announces again. A manual move (click/drag/search) still **stops** it. This differs from the design above, which said stale → stop |
| R5 | A reloaded app tab has nothing to ask for routes; `whois` comes only from the simulator | Tabs persist routes in `sessionStorage`; the simulator also re-sends active `nav-route`s when a tab's first presence arrives (new tab or after `bye`) |
| R6 | The simulator keeps no state across its own reload | Active playbacks (route, anchor, speed, paused) persist in the simulator's `sessionStorage`. Playback is wall-clock based, so it resumes exactly where it would be |
| R7 | The driver presence has only an `activity` string, no trip | Add `driverTrip?: {requestId, ongoingTripId, phase, pickup, dropoff}` to `TabPresence` (set via the activity store from the driver runtime) |
| R8 | D09's Navigate button can't tell whether a simulator is open | `drive-request` → the simulator answers `drive-ack {tabId, ok, reason?}`. No ack in 1.5 s → "Open the simulator to drive" |
| R9 | The booked polyline starts at the pickup, but the driver may enter the PIN some distance away | Leg 2 uses the booked polyline if the driver is ≤100 m from its start; otherwise `computeRoutes(driver → drop-off)` (the rider then sees that route instead) |
| R10 | The Routes JS library's field names were checked only against REST (`staticDuration`), not `google.maps.routes.Route` | A short spike before 5.2 confirms `computeRoutes` fields in the JS library (`path`, `legs[].steps[].distanceMeters / staticDurationMillis / path`) |

**Protocol additions** (`shared/tab/types.ts`):
```ts
// GeoPoint gains heading?: number (degrees, simulated only)
| { type: 'set-location'; tabId; lat; lng; heading?: number; playback?: true }
| { type: 'nav-route'; route: NavRoute }
| { type: 'nav-route-clear'; requestId: string; driverId: string; leg: 'pickup' | 'dropoff' }
| { type: 'drive-request'; tabId: string; requestId: string; leg: 'pickup' | 'dropoff' }
| { type: 'drive-ack'; tabId: string; ok: boolean; reason?: string }

interface NavRoute {
  requestId: string; driverId: string; leg: 'pickup' | 'dropoff';
  path: string;                                  // encoded polyline
  steps: { metres: number; seconds: number }[];  // one step for the booked leg
  anchor: { atMs: number; profileT: number };    // profile time (s) at wall time atMs
  speedFactor: 1 | 2 | 5 | 10; paused: boolean;
}
// position at wall time w: profile.positionAt(anchor.profileT + (paused ? 0 : (w - anchor.atMs) / 1000 * speedFactor))
```
Every speed change, pause, resume or reload re-anchors and re-sends `nav-route`.

**Commit sequence.** Each commit is green on `npm run typecheck && npm run lint && npm test`.

1. **`feat(route): route engine`** — `shared/route/`: `polyline.ts` (decode/encode), `geometry.ts` (haversine
   reuse, bearing, turn angle, densify ≤10 m), `profile.ts` (`buildProfile(path, steps)` → `{totalSeconds,
   totalMetres, positionAt(t), timeAtMetres(m)}`), `snap.ts` (`snapToRoute(point, hintMetres?)`, preferring the
   match ahead of the hint so one-way loops don't snap backwards). Speed per segment from its step, corner caps
   (>60° → 15 km/h, >30° → 25 km/h over the 30 m before), accel ≤1.5 m/s², brake ≤2.5 m/s², start and end at 0.
   The booked leg's single cruise speed is calibrated so the total is within ±5% of the booked duration.
   *Tests:* Google's sample string round-trips; on-path at every t; monotonic; ends at the destination with speed 0;
   corner slowdown; accel limits; total within ±15% of the steps' sum; snapping incl. an out-and-back path.
2. **`feat(tab): nav-route protocol and presence`** — the protocol above; `heading` + quiet playback logging in the
   location store; `driverTrip` presence (R7); rider `TripMarker` gains `requestId`, `routePolyline`,
   `routeDurationMinutes`; `shared/route/nav-route-store.ts` (per `requestId+leg`, `sessionStorage`, driver match
   from R3, clear on trip end). *Tests:* store accept/ignore/replace/clear; location store logging throttle.
3. **Spike (no commit)** — R10: call `Route.computeRoutes` from the simulator page and log the response shape.
   Adjust `route-source.ts` below if the fields differ.
4. **`feat(simulator): playback controller`** — `features/simulator/drive/`: `route-source.ts` (leg 1
   `computeRoutes(driver → pickup)`, `TRAFFIC_UNAWARE`; leg 2 booked polyline or R9 fallback; errors surface, never
   a straight line), `ticker.worker.ts` (posts a tick at 4 Hz; no state), `playback-store.ts` (zustand; per driver
   tab: route, profile, anchor, speed, paused, status; start/pause/resume/setSpeed/stop; each tick → `set-location`
   with heading; arrival → stop at the exact end point; persistence R6; stale/bye → pause, return → resume (R4)).
   `moveTab` stops that tab's playback. *Tests:* with an injected clock and ticker: pause holds the position, ×10
   finishes in 1/10 of the time, a late tick lands on the route, arrival stops, a manual move stops and clears.
5. **`feat(simulator): drive UI and auto-drive`** — the route polyline on the simulator map (travelled grey,
   remaining indigo; replaces TripOverlay's dashed link while a route exists); a playback card under each driver
   on a trip in the tab list (leg, % and km left, ETA, ×1/2/5/10, pause/resume, stop, "Drive to pickup / drop-off"
   when idle); an auto-drive toggle (`localStorage`) that starts leg 1 on `to_pickup` and leg 2 on `on_trip`; `drive-request` → `drive-ack`;
   trip cancelled/completed → stop + `nav-route-clear`; re-send on first presence (R5).
   **Checkpoint:** drive a real trip by hand and check every new `driver_locations` row is ≤25 m from the route (SQL).
6. **`feat(driver): D09 follows the shared route`** — travelled/remaining polyline from the car snapped onto the
   route; ETA pill from the remaining profile time (straight-line only without a route); car rotates with
   `heading`; Navigate → `drive-request`, with the "Open the simulator" message on no ack.
7. **`feat(rider): R05 and R06 follow the shared route`** — R05: remaining route from the latest `driver_location`
   snapped (hint = previous snap); the car tweens along the route from the previous snap to the new one over the
   measured ping gap (it trails the real car by ≤ one ping, and never moves backwards); ETA = remaining profile time
   from the snap, minus time since the ping; "Arriving now" under 60 m; the gateway's `eta_minutes` only without a
   route. R06: the car at `positionAt` from the anchor (label stays "estimated"); `tripProgress` takes the profile
   when a route exists, the current formula otherwise.
8. **`test: smoke Phase 5`** — extend `smoke-firefox.mjs`: auto-drive on, ×10; place driver 1 ~1 km from the pickup.
   Checks: the car reaches the pickup by itself; every new `driver_locations` row for the trip is ≤25 m from the
   route; D09 and R05 hold the same encoded path (`data-route` attribute); the rider's ETA never increases and
   reaches "Arriving now"; PIN → it drives to the drop-off along the booked polyline; end + collect as before.
   A second pass: pause holds the position for 5 s; a manual move stops playback and clears the route on both apps.
9. **`docs: record Phase 5 checkpoint`** — tick tasks, commits, decisions (R1–R10), gotchas, push.

**Risks.**
- Routes API quota or cost from repeated smoke runs: one leg-1 call per run, and leg 2 reuses the booked polyline.
- The Routes JS library may not be in the loaded Maps bundle version; the spike (step 3) catches this. REST
  `routes.googleapis.com` with the browser key is the fallback (already verified).
- A Firefox Worker in a hidden tab: verify in the smoke test that playback keeps moving while the simulator page is
  in the background.

### Tasks
- [x] 1 Route engine (`shared/route/`) + tests
- [x] 2 Protocol, presence additions, nav-route store, quiet playback logging + tests
- [x] 3 Spike: Routes JS library response shape — works as planned (see Gotchas)
- [x] 4 Playback controller (route sources, worker ticker, playback store, persistence) + tests
- [x] 5 Simulator drive UI, auto-drive, drive-request/ack — **checkpoint passed 2026-09-27:** auto-drive at ×10,
      2.7 km road route for 850 m straight, 7 stored pings all on the route (max 0.0 m), same route in both tabs,
      car stops 43 m from the pickup pin (nearest road point)
- [x] 6 D09 shared route, route ETA, rotating car, Navigate
- [x] 7 R05 route + tween + route ETA; R06 car on the booked route
- [x] 8 Smoke test additions — `smoke:firefox` 75/75
- [x] 9 Checkpoint docs, commit, push

**Built (2026-09-27):**
- `src/shared/route/` — polyline, geometry, movement profile, snapping, `nav-route` helpers and the per-tab
  nav-route store (both apps)
- `src/features/simulator/drive/` — route sources, worker ticker, playback store, supervisor (hold/re-share),
  automation (auto-drive, trip-over cleanup, `drive-request`), playback card, route overlay
- D09, R05, R06 draw the shared route; D09 Navigate asks the simulator to drive
- Not in the smoke test: "×10 finishes proportionally faster" (covered by `playback-store.test.ts` instead)

## Next: Phase 5b — the rest of PLAN §6
Quick setup (open N driver tabs, scatter online drivers), saved layouts, merged event timeline with filters, trip
inspector. Not planned at task level yet: start with a short plan, as for Phase 5.

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-09-25 | One Vite app, three routes (`/user`, `/driver`, `/simulator`) | Same origin needed for BroadcastChannel and one dev proxy |
| 2026-09-25 | Session per tab in `sessionStorage` | Many users in one browser; reload keeps the login |
| 2026-09-25 | Vite proxy, not backend CORS | No backend changes |
| 2026-09-25 | Simulator is a fake GPS only; tabs call APIs with their own token | Keeps backend traffic realistic, no impersonation |
| 2026-09-25 | Test data via direct local-DB edits, no seed script | User preference |
| 2026-09-25 | Repo private on GitHub (other go-ride repos are public) | Publishing can't be undone; flip with `gh repo edit … --visibility public` |
| 2026-09-25 | Rider login reuses the D01 layout in the rider theme | Handoff has no rider sign-in screen |
| 2026-09-25 | Web broadcaster adds a 5s evaluation tick to the app's rules | Simulated drivers produce no new fixes while parked; heartbeat must still fire |
| 2026-09-25 | D07 checks "tab has a location" instead of OS permission | Web equivalent of the permission gate; dispatch can't match a driver with no location |
| 2026-09-25 | D06 online state (status, pause, offers waiting) designed in-app | Handoff only designs the offline state |
| 2026-09-25 | D08 place names via backend reverse-geocode; no category pill | Offer message has only coordinates and no service type |
| 2026-09-25 | Menu rows for verification/vehicles/profile shown but not navigable | Those screens are Phase 6 |
| 2026-09-26 | Fares in **MYR**: cab-request-handler local `.env` `FARE_CITY_CODE=KUL` + KUL `RIDE_XL` row | Design shows RM; KUL rows already existed in MYR. No code change, only local config + data |
| 2026-09-26 | Rider trip kept in `sessionStorage`, rebuilt from `current-trip` | `ride_assigned` is never replayed and `current-trip` has no driver name/vehicle |
| 2026-09-26 | Poll `current-trip` every 4s while searching | Dispatch timeouts are never pushed to the rider |
| 2026-09-26 | R01 Suggested = fixed list of KL places | Fast test bookings; autocomplete covers everything else |
| 2026-09-26 | R01's back arrow → account button + sheet (log out) | R01 is the rider home; R07 profile is Phase 6 |
| 2026-09-26 | R04 steps follow `trip_requests.status`, not per-driver rows | Riders aren't told which drivers are offered |
| 2026-09-26 | Call/Message/Share, Later, For me, promo shown but inert | No backend support; kept for visual fidelity |
| 2026-09-26 | D09 sequences End trip → Cash collected (design shows both at once) | The server only allows start → end → collect |
| 2026-09-26 | Driver "heading to pickup + PIN", rider "pay your driver", "trip complete + rating", "finding you another" designed in-app | Not in the handoff |
| 2026-09-26 | R06 progress is estimated from the booked route + `started_at` | Gateway stops `driver_location` at trip start |
| 2026-09-26 | Driver tab keeps the rider's name with its trip in `sessionStorage` | Only `job_offer.rider_name` carries it |
| 2026-09-26 | Phase 5 = realistic driving; setup/layouts/timeline/inspector → Phase 5b | User priority: real-road driving, same route in both apps |
| 2026-09-26 | Route computed once per leg by the simulator (Routes API for the approach, booked polyline for the trip) | Backend has no approach route and gives none to the driver |
| 2026-09-26 | Route shared to both apps over the bus; rider position still only from `driver_location` | No backend changes; the shared route is geometry + timing, not a live position |
| 2026-09-26 | Playback position from wall clock, ticks from a Worker | Hidden tabs throttle timers (1/s, or 1/min after 5 min in Chrome) |
| 2026-09-27 | Route engine in `src/shared/route/`, used by the simulator and both apps | Both sides rebuild the identical profile from path + steps; the bus carries no per-tick data |
| 2026-09-27 | A playback **holds** (not stops) while its driver tab is gone or silent, and resumes when it's back | A driver-tab reload says `bye` then re-announces; stopping would end the drive |
| 2026-09-27 | Routes are matched on request **and** driver | Redispatch keeps the request id |
| 2026-09-27 | Playbacks persist in the simulator's `sessionStorage`; routes are re-shared on a tab's first presence | Wall-clock playback resumes exactly after a simulator reload; reloaded app tabs get their route back |
| 2026-09-27 | Drop-off leg uses the booked polyline only if the driver is ≤100 m from its start, else a fresh route | The PIN can be entered away from the pickup |
| 2026-09-27 | Snapping keeps one match per pass along the route and picks the pass nearest the hint (the route's timing) | A "prefer ahead of the hint" rule dragged reports forward when the hint was ahead of the car |
| 2026-09-27 | R05's car trails the real car by ≤ one location report (glides between the last two) | Rider position still comes only from the backend; no extrapolation |
| 2026-09-27 | Car heading shown as a pointer outside the upright car badge | The handoff's badge is a side-view car; rotating it would turn it upside down |
| 2026-09-26 | Simulator place search calls Google Places (New) from the browser key | Simulator has no login, so no backend places proxy; user chose adding Places to the key over borrowing a tab's token |

## Gotchas learned

- **Firefox doesn't run `requestAnimationFrame` in background tabs**, and puppeteer's `waitForFunction` /
  `waitForSelector` poll on it by default — a wait on a background page stalls for 20–40s. Pass `polling: 500` or
  bring the page to the front.
- **"Arriving now" lags arrival by up to ~25s:** the driver's last ping comes ≤15s after the car stops (10s floor,
  5s evaluation tick), then R05 glides to it over the ping gap.
- **Simulator "Show on map" centres the map on the tab's marker** — a test click at the map centre hits the marker,
  not the map.

- **`driver_locations` is one row per driver** (unique `driver_id`, upserted), not a history. To check every ping,
  poll the row (≤2 Hz) during the drive — pings are ≥10s apart, so each change is one ping.

- **Routes JS library** (`google.maps.importLibrary('routes')` → `Route.computeRoutes`, checked 2026-09-27 in
  Firefox, ~200ms): `route.path` is an array of `LatLngAltitude` (numeric `lat`/`lng`), **not** an encoded string;
  `legs[0].steps[]` have `distanceMeters`, `staticDurationMillis`, `path`. Request `fields: ['path', 'legs',
  'distanceMeters', 'staticDurationMillis']`, `routingPreference: 'TRAFFIC_UNAWARE'`. KLCC → Bukit Bintang is 1.3 km
  straight but 4.46 km / 12 min by road.

- **Maps key APIs:** the browser key allows Maps JS, Directions, Routes and (since 2026-09-26) Places API (New) for
  the simulator's search. `gcloud services api-keys update` replaces restrictions — pass the referrers and every
  `--api-target` again. Changes take ~1 min to apply.
- **Maps key referrers:** Google rejected `http://localhost:5173` under `http://localhost:*/*`
  alone; the key now also lists `http://localhost:5173/*` and `http://127.0.0.1:5173/*`.
  A new dev port needs adding (`gcloud services api-keys update 52b9aa5c-…`); changes take a
  minute or so to propagate.
- **Tailwind 4 vs Google Maps CSS:** Tailwind utilities live in a cascade layer; Google's
  unlayered CSS wins inside the map. Style marker content (colour, font) inline.
- **Firefox `innerText`** applies `text-transform` ("SIGNED IN"); use `textContent` in tests.
- **Error shapes:** go-ride-backend returns `{code, message}`, kafka-consumers services
  `{error, message}` — the HTTP client normalises both.
- **StrictMode** opens and immediately closes a first websocket in dev — harmless.
- **Duplicate tab** copies `sessionStorage` in both Chrome and Firefox — handled by the guard,
  which must defend the id from the first moment of boot (fixed in `5ed6ef4`).
- **Rider cancel reason is an enum** (`rider_absent|rider_requested|vehicle_problem|unsafe_destination|other`);
  free text goes in `note`. A bad reason is a 400 and the trip stays assigned — which then
  keeps that driver out of dispatch (drivers with an ongoing trip are excluded).
- **`GET /cab/current-trip`**: an ongoing trip's request id is under `ongoing_trip`, not `trip_request`.
- **`offer_withdrawn` has no job_offer_id** — it names the request; mark every card for that request.
- **Ack shape:** `{type: "ack", job_offer_id, status: "seen"}`; anything else is ignored by the gateway.
- **StrictMode + one-shot effects:** read "already done" flags from the store inside the effect,
  not from props — the re-run sees a stale prop (caused a double ack).
- **zsh:** don't name a shell variable `path` — it's tied to `PATH`.
- **Rider messages aren't replayed** — only driver offers are. Sync over HTTP after every reconnect.
- **Timeouts aren't pushed**: a search that times out just disappears from `current-trip`; `/cab/trips` has
  `status: timed_out`.
- **Dispatch fans out** to the nearest 10 eligible drivers at once (`NEAREST_DRIVERS_LIMIT`), offer TTL 15s.
- **TanStack `mutate(…, {onSuccess})` callbacks are dropped if the component unmounts** first; put must-run
  follow-ups (clear trip + navigate) in the `useMutation` options instead.
- **"Where to?" is a placeholder**, not text — tests wait for "Choose on map" to know R01 is up.
- **`@types/google.maps`** must be listed in tsconfig `types` to use `google.maps.*` in our code.
- **Redispatch reuses rows**: the rider's `ongoing_trips` row (same `ongoing_trip_id`, new driver + PIN) *and* each
  re-offered driver's `driver_job_offers` row (same `job_offer_id`, new expiry).
- **Driver-cancel echo:** a driver's own cancel also arrives as `trip_cancelled` on their socket, sometimes first.
- **Redispatch reuses the `ongoing_trips` row** (same `ongoing_trip_id`, new driver, new PIN) — key driver details by
  driver id, not by trip id.
- **Driver-trip actions are in a strict order**: start (PIN) → end → collect-payment. There's no "collect before end".
- **Dispatch eligibility** (trip-dispatch-worker): `is_online AND NOT is_paused`, active vehicle,
  location `recorded_at` within 300s, within 20→30 km, tier (RIDE any / RIDE_XL ≥6 seats /
  RIDE_PREMIUM luxury), no ongoing trip, didn't cancel this request before.

## Environment checkpoint

- Web app: `npm run dev` → http://localhost:5173
- Go stack: `scripts/run-all.sh` (workspace root) — 8 processes incl. `dispatch-consumer`
  and `location-consumers`; logs in `../logs/`. Infra: `go-ride-infra/local` docker compose.
  If Kafka/Postgres go down, the consumers exit — restart the stack.
- Test accounts (password `password123`): riders `sim.rider1|2@goride.test`, drivers
  `sim.driver1|2|3@goride.test` — drivers are KYC-approved with active vehicles (Phase 2.1).
- Smoke test resets drivers 1–2 offline and cancels rider1's active trip before and after it runs.
- cab-request-handler prices in MYR only because of its local `.env` (see Phase 3 SQL block) — a fresh checkout
  falls back to `DEFAULT`/USD.
- `npm run handoff:shots -- <dc.html> "<screen label>"…` renders design screens for comparison.
- Maps key: GCP project `go-ride-dev-504212`, key id `52b9aa5c-f166-48c9-ae36-32b1b4fb8915`,
  value only in `.env` (gitignored).

## Known issues / follow-ups

- `location-consumers` health endpoint on `:8085` didn't answer (the consumer itself is running) — check its config if needed.
- Home page and simulator use a few literal rider/driver hex colours outside the themed phone frame.
- **No driver position after pickup:** websocket-gateway stops `driver_location` at `trip_started`, so R06 shows
  estimated progress (route duration from `started_at`) rather than a live car. A backend change (keep the stream
  until `trip_ended`, retargeted to the drop-off) would fix it; not planned.
- **Rider ETA before pickup is straight-line ÷ 30 km/h** (websocket-gateway `tracking/notifier.go`) and ignores roads;
  R05 uses the shared route when the simulator drives the car (Phase 5), the gateway's value otherwise.
- **No route reaches the driver, and none exists for the approach leg** in the backend; the simulator shares its
  route over the bus (dev-only, Phase 5). Backend follow-up if wanted: include a route polyline in `ride_assigned`
  and the driver's `current-trip`.
- At ×5/×10 the rider's car trails the real one by up to one ping (10s × speed, e.g. 1.5 km at ×10), and R06 can
  show "0 min" left; at ×1 both are realistic.
- A driven car stops at the road point nearest the pickup/drop-off pin (~40 m away in tests), not on the pin.
- ~~Currency~~ — resolved 2026-09-26 (MYR via KUL fare configs).
- Rider cancel reasons map to the enum (`rider_requested`/`other`) with the wording in `note`; the backend has no
  rider-specific reasons.
- Simulator actor labels overlap when a rider and driver stand close together.
- D04/D05 screens (verification, vehicles) and D09–D11 not built yet (Phases 4 and 6).
- ~~Car movement along a route~~ — done in Phase 5 (2026-09-27).
