# Progress & checkpoints

The working log for this repo. [PLAN.md](PLAN.md) is the design; this file tracks what's done,
what's next at task level, and what was learned along the way. Update it at the end of
every working session and every phase.

**Last updated:** 2026-09-26 · **Current phase:** 4 (not started)

---

## Checkpoints

| Phase | Status | Commit(s) | Verified by |
|---|---|---|---|
| 0 Foundation | ✅ done 2026-09-25 | `224865b`…`be97d54` | Unit tests (18), `smoke:firefox` 14/14 |
| 1 Simulator map + location provider | ✅ done 2026-09-25 | `45ee1ce`, `1660776` | Unit tests (24), `smoke:firefox` 19/19 |
| 2 Driver → receiving offers | ✅ done 2026-09-25 | `05a60d8`…`2b74e76` | Unit tests (77), `smoke:firefox` 26/26 (offer in ~150–250ms) |
| 3 Rider booking happy path | ✅ done 2026-09-26 | `94d6ca1`…`d63c85e` | Unit tests (100), `smoke:firefox` 40/40 (offers to 2 drivers in ~80–110ms, driver move → rider map in <5s) |
| 4 Trip completion + cancellation | ⏳ next | — | — |
| 5 Simulator power features | ☐ | — | — |
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

## Next: Phase 4 — Trip completion and cancellation

**Done when:** the full lifecycle (assigned → started with PIN → ended → cash collected → rated) and both cancel paths
(rider at each stage, driver with redispatch) work end to end in the web screens.

### 4.0 Prep
- [ ] Render D09, D10 (`Driver App.dc.html`) and R06 (`Ride Booking Flow v2.dc.html`) with `npm run handoff:shots`
- [ ] Read driver-request-handler's start/end/collect-payment/cancel handlers for request bodies and error codes
      (PIN mismatch, wrong status); check what `trip_cancelled` the rider gets when the driver cancels at `assigned`
      (driver-request-handler sets `Redispatch: stage == "assigned"` — the same request goes back to dispatch)

### 4.1 Driver D09 (replaces the temporary TripAssignedScreen)
- [ ] Trip card with rider pickup/drop-off names, navigate-to-pickup state, **Start with PIN** (`POST /driver-trips/ongoing-trips/{id}/start`)
- [ ] On trip → **End trip** (`/end`) → cash collection with the final fare → **Cash collected** (`/collect-payment`)
- [ ] D10 cancel sheet with a reason (`/cancel`), enum reasons like the rider's
- [ ] Rebuild from `GET /driver-trips/current-trip` on reload; handle rider `trip_cancelled` on the driver socket

### 4.2 Rider side
- [ ] R06 On trip (replaces TripScreen's `TripStatus` for `in_progress`): route to drop-off, live driver, ETA to drop-off
- [ ] Awaiting payment (fare due, cash) → completed → rating (`POST /cab/trips/{ongoing_trip_id}/rate`, 1–5 + comment)
- [ ] **Reducer change:** a driver cancel that redispatches must move the trip back to `searching` (today `cancelled` is
      final and a later `ride_assigned` for the same request is ignored) — add a test first
- [ ] Rider cancel during `in_progress` (expect `trip_not_cancellable`?) — confirm and show a readable message

### 4.3 Simulator + tests
- [ ] Simulator: driver link switches to pickup → drop-off once the trip starts
- [ ] Unit tests: redispatch in the reducer, D09 state machine
- [ ] Smoke: start with PIN → end → collect → rider rates; driver cancel → rider sees searching again → second driver accepts
- [ ] Commit per sub-area, push, update this file

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
| 2026-09-26 | Simulator place search calls Google Places (New) from the browser key | Simulator has no login, so no backend places proxy; user chose adding Places to the key over borrowing a tab's token |

## Gotchas learned

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
- ~~Currency~~ — resolved 2026-09-26 (MYR via KUL fare configs).
- Rider cancel reasons map to the enum (`rider_requested`/`other`) with the wording in `note`; the backend has no
  rider-specific reasons.
- Simulator actor labels overlap when a rider and driver stand close together.
- D04/D05 screens (verification, vehicles) and D09–D11 not built yet (Phases 4 and 6).
- Car movement along a route (asked for 2026-09-25) stays in Phase 5 as planned; until then move
  drivers by clicking/dragging in the simulator.
