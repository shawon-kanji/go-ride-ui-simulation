import { create } from 'zustand';

import type { DriverTripMarker, NavLeg } from '../../../shared/tab/types';
import { useTabRegistry } from '../tab-registry';
import { usePlaybackStore } from './playback-store';
import { bookedLeg, computeDrivingRoute, type LegRoute } from './route-source';

// Starting a drive: find the leg's route for a driver tab and hand it to playback. The
// tab only ever gets GPS fixes — the PIN, End trip and Cash collected stay with the driver.

interface DriveStatusState {
  /** Tabs whose route is being looked up. */
  pending: Record<string, NavLeg>;
  /** Last failure per tab, shown on its playback card. */
  errors: Record<string, string>;
}

export const useDriveStatus = create<DriveStatusState>(() => ({ pending: {}, errors: {} }));

export type DriveResult = { ok: true } | { ok: false; reason: string };

export function legForPhase(phase: DriverTripMarker['phase']): NavLeg | null {
  if (phase === 'to_pickup') return 'pickup';
  if (phase === 'on_trip') return 'dropoff';
  return null;
}

function setStatus(tabId: string, pending: NavLeg | null, error: string | null): void {
  useDriveStatus.setState((state) => {
    const next = { pending: { ...state.pending }, errors: { ...state.errors } };
    if (pending) next.pending[tabId] = pending;
    else delete next.pending[tabId];
    if (error) next.errors[tabId] = error;
    else delete next.errors[tabId];
    return next;
  });
}

export async function driveLeg(tabId: string, leg: NavLeg): Promise<DriveResult> {
  const tabs = useTabRegistry.getState().tabs;
  const tab = tabs[tabId];
  const trip = tab?.driverTrip;
  const fail = (reason: string): DriveResult => {
    setStatus(tabId, null, reason);
    return { ok: false, reason };
  };

  if (!tab || !trip || !tab.userId) return fail('This driver has no trip.');
  if (tab.locationSource !== 'simulated') return fail('This tab uses browser GPS — switch it to Simulated.');
  if (!tab.location) return fail('Place the driver on the map first.');
  if (useDriveStatus.getState().pending[tabId]) return { ok: true };

  setStatus(tabId, leg, null);
  try {
    let route: LegRoute | null = null;
    if (leg === 'dropoff') {
      const rider = Object.values(tabs).find((t) => t.role === 'rider' && t.trip?.requestId === trip.requestId);
      route = bookedLeg(rider?.trip?.routePolyline, rider?.trip?.routeDurationMinutes, tab.location);
    }
    route ??= await computeDrivingRoute(tab.location, leg === 'pickup' ? trip.pickup : trip.dropoff);

    const latest = useTabRegistry.getState().tabs[tabId]?.driverTrip;
    if (latest?.requestId !== trip.requestId) return fail('The trip changed while finding a route.');

    usePlaybackStore.getState().start(tabId, {
      requestId: trip.requestId,
      driverId: tab.userId,
      leg,
      path: route.path,
      steps: route.steps,
    });
    setStatus(tabId, null, null);
    return { ok: true };
  } catch (error) {
    return fail(`No route: ${error instanceof Error ? error.message : String(error)}`);
  }
}
