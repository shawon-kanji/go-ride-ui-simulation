# Progress & checkpoints

The working log for this repo. [PLAN.md](PLAN.md) is the design; this file tracks what's done,
what's next at task level, and what was learned along the way. Update it at the end of
every working session and every phase.

**Last updated:** 2026-09-25 · **Current phase:** 3 (not started)

---

## Checkpoints

| Phase | Status | Commit(s) | Verified by |
|---|---|---|---|
| 0 Foundation | ✅ done 2026-09-25 | `224865b`…`be97d54` | Unit tests (18), `smoke:firefox` 14/14 |
| 1 Simulator map + location provider | ✅ done 2026-09-25 | `45ee1ce`, `1660776` | Unit tests (24), `smoke:firefox` 19/19 |
| 2 Driver → receiving offers | ✅ done 2026-09-25 | `05a60d8`…`2b74e76` | Unit tests (77), `smoke:firefox` 26/26 (offer in ~150–250ms) |
| 3 Rider booking happy path | ⏳ next | — | — |
| 4 Trip completion + cancellation | ☐ | — | — |
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

## Next: Phase 3 — Rider booking happy path

**Done when:** a rider books through the web screens (R01 → R04), a driver tab placed nearby
gets the offer and accepts, and the rider sees R05 with the driver, vehicle, plate, start PIN
and the driver's position moving when the simulator moves the driver.

### 3.0 Prep
- [ ] Render R01–R07 with `npm run handoff:shots -- "../design_handoff_go_ride/Ride Booking Flow v2.dc.html" "01 Where to" …`
- [ ] Decide the currency question (see Known issues: backend picks the USD fare config)

### 3.1 Rider API layer (`features/rider/api`)
- [ ] Types from cab-request-handler (`fareQuote`, `createCabRequestResponse`, `currentTripResponse`, cancel response) and websocket-gateway rider messages (`ride_assigned`, `driver_location`, `trip_started`, `trip_ended`, `trip_completed`, `trip_cancelled`)
- [ ] Clients: `POST /cab/fare-estimate` (returns `quotes[]` for RIDE / RIDE_XL / RIDE_PREMIUM, each with `expires_at`), `POST /cab/request-cab` (`{fare_id}` + `Idempotency-Key` header), `POST /cab/request-cab/{id}/cancel` (reason ∈ rider_absent, rider_requested, vehicle_problem, unsafe_destination, other), `GET /cab/current-trip`, `GET /cab/trips`, `POST /cab/trips/{id}/rate`
- [ ] Places: `GET /places/autocomplete?input&lat&lng`, `GET /places/:place_id`, `GET /places/reverse-geocode` (auth required, either role)

### 3.2 Rider runtime
- [ ] Trip state store (`search_started → offered → driver_accepted → assigned → in_progress → completed/cancelled`) fed by ws messages; on reload/reconnect, rebuild from `GET /cab/current-trip` (ongoing trip reports its request under `ongoing_trip`)
- [ ] Rider's own position = pickup default; simulator activity (searching / driver on the way / on trip)

### 3.3 Screens (match `Ride Booking Flow v2.dc.html`; rider theme)
- [ ] R01 Where to: lilac header, search field with `Later` chip, promo strip, sheet with Recent / Suggested / Saved (Recent from `/cab/trips`, Suggested from autocomplete), "Choose on map" pill
- [ ] R02 Confirm pickup: full-bleed map, pickup pill, pin with "Nearest entrance" callout, reverse-geocoded place, confirm
- [ ] R03 Pick a ride: three tiers from fare-estimate with fare breakdown and quote validity; surge shown but no surge UI
- [ ] R04 Finding a driver: request-cab, searching animation, cancel (reason required)
- [ ] R05 Driver on the way: driver + vehicle + plate, start PIN, live `driver_location` on the map with distance/ETA
- [ ] Replace the rider signed-in placeholder with R01

### 3.4 Simulator + tests
- [ ] Simulator draws each rider's pickup/drop-off pins and the assigned driver link
- [ ] Unit tests: trip state reducer, quote expiry, idempotency key reuse on retry
- [ ] Smoke: rider books via UI → driver accepts → rider sees R05 + PIN → moving the driver in the simulator updates the rider's map
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

## Gotchas learned

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
- Smoke test resets driver1 offline and cancels rider1's active trip before and after it runs.
- `npm run handoff:shots -- <dc.html> "<screen label>"…` renders design screens for comparison.
- Maps key: GCP project `go-ride-dev-504212`, key id `52b9aa5c-f166-48c9-ae36-32b1b4fb8915`,
  value only in `.env` (gitignored).

## Known issues / follow-ups

- `location-consumers` health endpoint on `:8085` didn't answer (the consumer itself is running) — check its config if needed.
- Home page and simulator use a few literal rider/driver hex colours outside the themed phone frame.
- **Currency:** fare-estimate returns USD — `fare_configs` has both USD and MYR rows and the backend
  picks USD. The design assumes RM (MYR). UI shows whatever the backend sends; decide in Phase 3.0.
- D04/D05 screens (verification, vehicles) and D09–D11 not built yet (Phases 4 and 6).
- Car movement along a route (asked for 2026-09-25) stays in Phase 5 as planned; until then move
  drivers by clicking/dragging in the simulator.
