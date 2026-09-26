import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { logEvent } from '../../shared/devlog/devlog-store';
import { useRealtimeStore } from '../../shared/realtime/use-realtime';
import { useActivityStore } from '../../shared/tab/activity';
import { cabClient } from './api/clients';
import { isRiderMessage } from './api/types';
import { isActivePhase, screenForTrip, type RiderTrip } from './trip/trip-model';
import { dispatchTrip, useTripStore } from './trip/trip-store';

// Everything a signed-in rider tab runs whatever screen is open: the websocket feed
// into the trip store, re-reading the trip over HTTP (on load, after every reconnect,
// and every few seconds while searching), the simulator status, and sending the tab to
// the screen its trip belongs on.

const SEARCH_POLL_MS = 4_000;

/** GET /cab/current-trip → snapshot; if a live local trip is gone, ask history how it ended. */
async function syncTrip(reason: string): Promise<void> {
  try {
    const current = await cabClient.getCurrentTrip();
    dispatchTrip({ type: 'snapshot', current, at: Date.now() });

    const trip = useTripStore.getState().trip;
    const serverHasIt = current.has_active_request || current.has_ongoing_trip;
    if (trip && isActivePhase(trip.phase) && !serverHasIt) {
      const history = await cabClient.listTrips(10);
      const entry = history.trips.find((t) => t.request_id === trip.requestId) ?? null;
      logEvent('state', `trip ${trip.requestId.slice(0, 8)} ended off-screen: ${entry?.status ?? 'not in history'}`);
      dispatchTrip({ type: 'outcome', requestId: trip.requestId, entry, at: Date.now() });
    }
  } catch (error) {
    logEvent('error', `trip sync (${reason}) failed`, String(error));
  }
}

function useTripFeed(): void {
  const client = useRealtimeStore((s) => s.client);
  const wsState = useRealtimeStore((s) => s.wsState);

  useEffect(() => {
    if (!client) return;
    return client.subscribe((message) => {
      if (isRiderMessage(message)) dispatchTrip({ type: 'message', message, at: Date.now() });
    });
  }, [client]);

  // Nothing is replayed to riders, so every (re)connect re-reads the trip over HTTP.
  useEffect(() => {
    if (wsState === 'open') void syncTrip('connected');
  }, [wsState]);

  const searching = useTripStore((s) => s.trip?.phase === 'searching');
  useEffect(() => {
    if (!searching) return;
    const interval = setInterval(() => void syncTrip('searching'), SEARCH_POLL_MS);
    return () => clearInterval(interval);
  }, [searching]);
}

const ACTIVITY: Record<RiderTrip['phase'], string> = {
  searching: 'searching',
  assigned: 'driver on the way',
  in_progress: 'on trip',
  awaiting_payment: 'paying',
  completed: 'trip done',
  cancelled: 'cancelled',
  timed_out: 'no driver found',
};

function useSimulatorActivity(): void {
  const trip = useTripStore((s) => s.trip);
  const { setActivity, setTrip } = useActivityStore.getState();

  useEffect(() => {
    setActivity(trip ? ACTIVITY[trip.phase] : null);
    setTrip(
      trip && isActivePhase(trip.phase)
        ? {
            phase: trip.phase,
            pickup: { lat: trip.pickup.lat, lng: trip.pickup.lng },
            dropoff: { lat: trip.dropoff.lat, lng: trip.dropoff.lng },
            driverId: trip.driver?.id ?? null,
            driverFix: trip.driverFix ? { lat: trip.driverFix.lat, lng: trip.driverFix.lng } : null,
          }
        : null,
    );
  }, [trip, setActivity, setTrip]);

  useEffect(
    () => () => {
      setActivity(null);
      setTrip(null);
    },
    [setActivity, setTrip],
  );
}

/** A live trip always owns the screen: searching → R04, assigned onwards → R05. */
function useFollowTrip(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const target = useTripStore((s) => screenForTrip(s.trip));

  useEffect(() => {
    if (target && pathname !== `/user/${target}`) navigate(`/user/${target}`, { replace: true });
  }, [target, pathname, navigate]);
}

export function useRiderRuntime(): void {
  useTripFeed();
  useSimulatorActivity();
  useFollowTrip();
}
