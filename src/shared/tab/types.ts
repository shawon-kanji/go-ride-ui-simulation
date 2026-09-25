import type { GeoPoint, LocationSource } from '../location/location-store';

export type Role = 'rider' | 'driver';

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
  // Simulator → one tab: move its simulated GPS.
  | { type: 'set-location'; tabId: string; lat: number; lng: number }
  | { type: 'log'; entry: DevLogEntry };
