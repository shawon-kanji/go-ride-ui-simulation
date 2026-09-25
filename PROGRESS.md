# Progress & checkpoints

The working log for this repo. [PLAN.md](PLAN.md) is the design; this file tracks what's done,
what's next at task level, and what was learned along the way. Update it at the end of
every working session and every phase.

**Last updated:** 2026-09-25 · **Current phase:** 2 (not started)

---

## Checkpoints

| Phase | Status | Commit(s) | Verified by |
|---|---|---|---|
| 0 Foundation | ✅ done 2026-09-25 | `224865b`…`be97d54` | Unit tests (18), `smoke:firefox` 14/14 |
| 1 Simulator map + location provider | ✅ done 2026-09-25 | `45ee1ce`, `1660776` | Unit tests (24), `smoke:firefox` 19/19 |
| 2 Driver → receiving offers | ⏳ next | — | — |
| 3 Rider booking happy path | ☐ | — | — |
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

## Next: Phase 2 — Driver path to "receiving offers"

**Done when:** an online driver tab, placed in the simulator, is picked by dispatch — a rider
request made nearby (via curl until Phase 3) shows up as an offer card in that driver's tab.

### 2.1 Test data (local DB, no seed script)
- [ ] Read go-ride-backend's gating rules first: KYC status derivation, vehicle "verified"
      rule, and what `PATCH /api/v1/driver/online` checks (`KYC_NOT_APPROVED`,
      `VEHICLE_NOT_VERIFIED`)
- [ ] For `sim.driver1`–`3`: `drivers.kyc_status='approved'`; 5 identity `driver_documents`
      approved; one `vehicles` row each (`is_active=true`, category normal/luxury) with 5
      approved vehicle documents; `account_status` as the backend requires
- [ ] Record the exact SQL used in this file (below) so it can be re-run

### 2.2 API clients + types (port from go-ride-driver-app/src/api)
- [ ] `driver-client`: `GET /driver/profile`, `PATCH /driver/online`, `PATCH /driver/pause`
- [ ] `vehicles-client`: `GET /driver/vehicles`; `kyc-client`: `GET /driver/kyc/status`
- [ ] `driver-trips-client`: `GET /current-trip`, `/stats`, `/earnings`, `/online-time`; `POST /job-offers/{id}/accept`
- [ ] `location-client`: `POST /location/update-location` (strict body — omit unknown/undefined keys)
- [ ] Types: Vehicle, KycStatusResponse, DocumentResponse, Earnings/OnlineTime, job offer message (from `websocket-gateway/internal/ws/protocol.go`)

### 2.3 Gating logic (port with tests)
- [ ] `features/presence/gating.ts` (`deriveOnlineGate`, identity checked before vehicle — matches backend 403 precedence)
- [ ] `features/kyc/verification-summary.ts` (`summariseTrack`, `describeVerificationBlockers`)
- [ ] Port their `.test.ts` files to Vitest

### 2.4 Screens (match `Driver App.dc.html`, search `data-screen-label`)
- [ ] D06 Go online (home): map with own position, profile chip, stat cards (today's earnings / online time), blocker card, `Go online` (disabled + route to blocker when gated)
- [ ] D07 Confirm online sheet: active vehicle card, "All 5 documents approved" strip, location note, `Switch vehicle` / `Go online` — going online **always** passes through here
- [ ] D03 Menu: header, verification + vehicles rows with counts, log out
- [ ] Online state: header/pill, `Pause` / resume, `Go offline`
- [ ] Replace the Phase 0 signed-in placeholder with D06

### 2.5 Location broadcasting
- [ ] Port `location-broadcaster.ts` (10s movement throttle, 25m min distance, 60s heartbeat) + tests, reading from the location store instead of expo-location
- [ ] Lifecycle: start on online, stop on offline/pause/logout/tab close
- [ ] Log each ping as a `location` dev-log entry

### 2.6 Job offers (D08) — new in web; the Expo driver app has no socket client yet
- [ ] Offer store: `job_offer` → card with its own `expires_at` countdown; `offer_withdrawn` → removed/"taken"; expiry → dimmed "Expired"
- [ ] Send `ack {job_offer_id, status: "seen"}` when a card renders (check the exact ack shape in `protocol.go` / `AckMessage`)
- [ ] `Accept` → `POST /driver-trips/job-offers/{id}/accept`; 409/taken → "Taken by another driver"; success → current trip (Phase 4 screen, placeholder for now)
- [ ] No decline button (backend has no reject endpoint); offers replay on reconnect, no polling

### 2.7 Simulator + tests
- [ ] Presence carries driver `online`/`paused`; simulator marker/list shows it
- [ ] Unit tests: gating, broadcaster throttle, offer store (expiry, withdrawn, accept race)
- [ ] Smoke: driver goes online → `driver_locations` row updates → curl a `request-cab` as a rider near the driver → offer card appears in the driver tab
- [ ] Commit per sub-area; push; update this file

---

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
- **Duplicate tab** copies `sessionStorage` in both Chrome and Firefox — handled by the guard.

## Environment checkpoint

- Web app: `npm run dev` → http://localhost:5173
- Go stack: `scripts/run-all.sh` (workspace root) — 8 processes incl. `dispatch-consumer`
  and `location-consumers`; logs in `../logs/`. Infra: `go-ride-infra/local` docker compose.
  If Kafka/Postgres go down, the consumers exit — restart the stack.
- Test accounts (password `password123`): riders `sim.rider1|2@goride.test`, drivers
  `sim.driver1|2|3@goride.test`. Drivers are **not** KYC-approved yet (Phase 2.1).
- Maps key: GCP project `go-ride-dev-504212`, key id `52b9aa5c-f166-48c9-ae36-32b1b4fb8915`,
  value only in `.env` (gitignored).

## Known issues / follow-ups

- `location-consumers` health endpoint on `:8085` didn't answer (the consumer itself is running) — check its config if needed.
- Home page and simulator use a few literal rider/driver hex colours outside the themed phone frame.
