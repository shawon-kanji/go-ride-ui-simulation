import type { GeoPoint, LocationSource } from '../location/location-store';
import type { RouteStep } from '../route/profile';

export type Role = 'rider' | 'driver';

/** A rider's live trip as the simulator draws it: pins plus the assigned driver. */
export interface TripMarker {
  phase: string;
  pickup: GeoPoint;
  dropoff: GeoPoint;
  /** Assigned driver's user id — the simulator links it to that driver's tab. */
  driverId: string | null;
  /** Last position the rider was told about (driver_location). */
  driverFix: GeoPoint | null;
  requestId: string;
  /** The booked route (encoded polyline) the simulator drives after pickup. */
  routePolyline?: string;
  routeDurationMinutes?: number;
}

/** A driver's live trip, so the simulator knows where to drive it. */
export interface DriverTripMarker {
  requestId: string;
  ongoingTripId: string;
  phase: 'to_pickup' | 'on_trip' | 'collecting';
  pickup: GeoPoint;
  dropoff: GeoPoint;
}

export type NavLeg = 'pickup' | 'dropoff';

export const SPEED_FACTORS = [1, 2, 5, 10] as const;
export type SpeedFactor = (typeof SPEED_FACTORS)[number];

/**
 * A route the simulator is driving a driver along, shared with that driver's tab and the
 * rider's (dev-only: the backend has no route for either). Both rebuild the same movement
 * profile from path + steps; the anchor pins profile time to wall-clock time.
 */
export interface NavRoute {
  requestId: string;
  driverId: string;
  leg: NavLeg;
  /** Encoded polyline. */
  path: string;
  steps: RouteStep[];
  /** Profile time (s) at wall-clock time atMs. */
  anchor: { atMs: number; profileT: number };
  speedFactor: SpeedFactor;
  paused: boolean;
}

export type WsState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/** What each rider/driver tab tells the simulator about itself. */
export interface TabPresence {
  tabId: string;
  role: Role | null;
  path: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  wsState: WsState;
  location: GeoPoint | null;
  locationSource: LocationSource;
  /** Short status for the simulator, e.g. "online", "paused", "2 offers". */
  activity: string | null;
  trip?: TripMarker | null;
  driverTrip?: DriverTripMarker | null;
  sentAt: number;
}

export type DevLogKind = 'http' | 'ws-in' | 'ws-out' | 'ws-state' | 'location' | 'state' | 'error';

export interface DevLogEntry {
  id: string;
  at: number;
  tabId: string;
  role: Role | null;
  kind: DevLogKind;
  /** One line, e.g. "POST /api/v1/cab/request-cab 201 142ms". */
  summary: string;
  /** Request/response or message body. Secrets are redacted before this is set. */
  data?: unknown;
}

/** Messages on the same-origin BroadcastChannel shared by every tab. */
export type BusMessage =
  // Duplicate-tab guard: a booting tab claims its tabId; a tab holding the same id that
  // booted earlier answers with a conflict addressed to the claimant's bootId.
  | { type: 'tab-claim'; tabId: string; bootId: string; bootedAt: number }
  | { type: 'tab-conflict'; tabId: string; bootId: string }
  // Presence: sent on change and as a heartbeat; `whois` asks every tab to re-announce.
  | { type: 'presence'; presence: TabPresence }
  | { type: 'bye'; tabId: string }
  | { type: 'whois' }
  // Simulator → one tab: move its simulated GPS. `playback` marks route playback fixes
  // (several a second), which the tab logs sparingly.
  | { type: 'set-location'; tabId: string; lat: number; lng: number; heading?: number; playback?: true }
  // Simulator → the driver's and rider's tabs: the route being driven, or that it's gone.
  | { type: 'nav-route'; route: NavRoute }
  | { type: 'nav-route-clear'; requestId: string; driverId: string; leg: NavLeg }
  // Driver tab → simulator: "drive me there" (D09 Navigate), and the simulator's answer.
  | { type: 'drive-request'; tabId: string; requestId: string; leg: NavLeg }
  | { type: 'drive-ack'; tabId: string; ok: boolean; reason?: string }
  // Simulator → one driver tab: go online/offline, as its own D07 button would (the tab checks
  // it has a location, then calls the API with its own token), and the tab's answer.
  | { type: 'set-online'; tabId: string; online: boolean }
  | { type: 'set-online-result'; tabId: string; online: boolean; ok: boolean; reason?: string }
  | { type: 'log'; entry: DevLogEntry };
