import { create } from 'zustand';

import { haversineMeters } from '../../../shared/lib/geo';
import type { GeoPoint, LocationSource } from '../../../shared/location/location-store';
import type { UpdateLocationPayload } from '../api/types';

// Port of go-ride-driver-app's features/presence/location-broadcaster.ts, keeping its
// send rules (derived from trip-dispatch-worker's 300s freshness window):
//   - movement: at most one ping per 10s, and only after moving ≥ 25m
//   - heartbeat: at least one ping per 60s, even when parked
// One difference: the app evaluates only when the OS delivers a new GPS fix. A
// simulated driver standing still produces no fixes at all, so this version also
// re-evaluates on a 5s tick — that keeps the heartbeat going and sends a throttled
// movement as soon as the 10s floor allows.

export const MOVEMENT_MIN_INTERVAL_MS = 10_000;
export const HEARTBEAT_MAX_INTERVAL_MS = 60_000;
export const MIN_DISTANCE_METERS = 25;
export const TICK_MS = 5_000;

export interface SendDecisionInput {
  now: number;
  lastSentAt: number;
  lastSentPoint: GeoPoint | null;
  point: GeoPoint;
}

export function shouldSend({ now, lastSentAt, lastSentPoint, point }: SendDecisionInput): boolean {
  const movedFar =
    lastSentPoint === null ||
    haversineMeters(
      { latitude: lastSentPoint.lat, longitude: lastSentPoint.lng },
      { latitude: point.lat, longitude: point.lng },
    ) >= MIN_DISTANCE_METERS;
  const throttleOk = now - lastSentAt >= MOVEMENT_MIN_INTERVAL_MS;
  const dueForHeartbeat = now - lastSentAt >= HEARTBEAT_MAX_INTERVAL_MS;
  return (movedFar && throttleOk) || dueForHeartbeat;
}

/** Build the payload by conditional assignment — location-producers rejects unknown
 *  or null keys (DisallowUnknownFields). */
export function buildPayload(driverId: string, point: GeoPoint, source: LocationSource, now: number): UpdateLocationPayload {
  const payload: UpdateLocationPayload = {
    driver_id: driverId,
    latitude: point.lat,
    longitude: point.lng,
    event_time: new Date(now).toISOString(),
    source: source === 'simulated' ? 'web_simulated' : 'web_browser',
  };
  if (typeof point.accuracyM === 'number') payload.accuracy_m = point.accuracyM;
  return payload;
}

interface BroadcastStatus {
  broadcasting: boolean;
  lastSentAt: number | null;
  lastSentPoint: GeoPoint | null;
  sentCount: number;
  lastError: string | null;
}

const IDLE: BroadcastStatus = {
  broadcasting: false,
  lastSentAt: null,
  lastSentPoint: null,
  sentCount: 0,
  lastError: null,
};

/** Read-only view of the broadcaster for the UI and dev panel. */
export const useBroadcastStatus = create<BroadcastStatus>(() => ({ ...IDLE }));

export interface BroadcasterDeps {
  send: (payload: UpdateLocationPayload) => Promise<unknown>;
  getDriverId: () => string | null;
  getFix: () => { point: GeoPoint | null; source: LocationSource };
  /** Calls `listener` whenever the tab's position changes; returns an unsubscribe. */
  subscribeFix: (listener: () => void) => () => void;
  now?: () => number;
}

export interface LocationBroadcaster {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createLocationBroadcaster(deps: BroadcasterDeps): LocationBroadcaster {
  const now = deps.now ?? Date.now;
  let running = false;
  let lastSentAt = -Infinity;
  let lastSentPoint: GeoPoint | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const evaluate = () => {
    if (!running) return;
    const { point, source } = deps.getFix();
    const driverId = deps.getDriverId();
    if (!point || !driverId) return;

    const at = now();
    if (!shouldSend({ now: at, lastSentAt, lastSentPoint, point })) return;

    lastSentAt = at;
    lastSentPoint = point;
    useBroadcastStatus.setState((state) => ({
      lastSentAt: at,
      lastSentPoint: point,
      sentCount: state.sentCount + 1,
    }));

    // Best effort: a failed ping never stops the broadcaster.
    deps.send(buildPayload(driverId, point, source, at)).then(
      () => useBroadcastStatus.setState({ lastError: null }),
      (error: unknown) =>
        useBroadcastStatus.setState({ lastError: error instanceof Error ? error.message : String(error) }),
    );
  };

  return {
    start() {
      if (running) return;
      running = true;
      lastSentAt = -Infinity;
      lastSentPoint = null;
      useBroadcastStatus.setState({ ...IDLE, broadcasting: true });
      unsubscribe = deps.subscribeFix(evaluate);
      timer = setInterval(evaluate, TICK_MS);
      evaluate();
    },
    stop() {
      if (!running) return;
      running = false;
      unsubscribe?.();
      unsubscribe = null;
      if (timer) clearInterval(timer);
      timer = null;
      useBroadcastStatus.setState({ broadcasting: false });
    },
    isRunning: () => running,
  };
}
