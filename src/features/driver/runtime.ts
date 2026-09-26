import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { logEvent } from '../../shared/devlog/devlog-store';
import { useLocationStore } from '../../shared/location/location-store';
import { useRealtimeStore } from '../../shared/realtime/use-realtime';
import { useDriverSession } from '../../shared/session/session-store';
import { useActivityStore } from '../../shared/tab/activity';
import { driverTripsClient, locationClient } from './api/clients';
import { useCurrentTripQuery, useDriverProfileQuery } from './api/queries';
import type { JobOfferMessage, OfferWithdrawnMessage, TripCancelledMessage } from './api/types';
import { countOpen, useOfferStore } from './offers/offer-store';
import { createLocationBroadcaster } from './presence/location-broadcaster';
import { isActiveDriverPhase, type DriverTripPhase } from './trip/trip-model';
import { dispatchDriverTrip, useDriverTripStore } from './trip/trip-store';

// Everything a signed-in driver tab runs regardless of which screen is open — the
// mobile app mounts the same things in its authenticated layout, never in a screen,
// so opening the menu doesn't stop location pings or drop offers.

const broadcaster = createLocationBroadcaster({
  send: (payload) => locationClient.update(payload),
  getDriverId: () => useDriverSession.getState().user?.id ?? null,
  getFix: () => {
    const { position, source } = useLocationStore.getState();
    return { point: position, source };
  },
  subscribeFix: (listener) =>
    useLocationStore.subscribe((state, prev) => {
      if (state.position !== prev.position) listener();
    }),
});

const OFFER_TICK_MS = 500;

/** Starts/stops location pings from the SERVER's is_online flag, so a tab that
 *  reloads while online resumes without any tap. */
function useLocationBroadcastLifecycle(isOnline: boolean | undefined): void {
  useEffect(() => {
    if (isOnline === undefined) return;
    if (isOnline) {
      broadcaster.start();
      logEvent('state', 'location broadcast started');
    } else if (broadcaster.isRunning()) {
      broadcaster.stop();
      logEvent('state', 'location broadcast stopped');
    }
  }, [isOnline]);

  useEffect(() => () => broadcaster.stop(), []);
}

/** Websocket messages → offer cards. Offers replay on reconnect; no polling. */
function useOfferFeed(): void {
  const client = useRealtimeStore((s) => s.client);

  useEffect(() => {
    if (!client) return;
    return client.subscribe((message) => {
      const store = useOfferStore.getState();
      switch (message.type) {
        case 'job_offer':
          store.receive(message as unknown as JobOfferMessage);
          break;
        case 'offer_withdrawn':
          store.withdrawRequest((message as unknown as OfferWithdrawnMessage).request_id);
          break;
        case 'trip_cancelled':
          store.withdrawRequest((message as unknown as TripCancelledMessage).request_id);
          dispatchDriverTrip({ type: 'rider-cancelled', message: message as unknown as TripCancelledMessage, at: Date.now() });
          break;
      }
    });
  }, [client]);

  // Per-offer timers and the brief "Taken / Expired" display.
  const hasOffers = useOfferStore((s) => Object.keys(s.offers).length > 0);
  useEffect(() => {
    if (!hasOffers) return;
    const interval = setInterval(() => {
      const store = useOfferStore.getState();
      store.expireDue();
      store.prune();
    }, OFFER_TICK_MS);
    return () => clearInterval(interval);
  }, [hasOffers]);
}

/** Opens D08 when a new offer arrives, unless the driver is already there. */
function useOpenOffersOnArrival(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const openCount = useOfferStore((s) => countOpen(Object.values(s.offers)));
  const previous = useRef(openCount);

  useEffect(() => {
    const arrived = openCount > previous.current;
    previous.current = openCount;
    if (arrived && pathname !== '/driver/offers' && !pathname.startsWith('/driver/trip')) {
      navigate('/driver/offers');
    }
  }, [openCount, pathname, navigate]);
}

const TRIP_ACTIVITY: Partial<Record<DriverTripPhase, string>> = {
  to_pickup: 'to pickup',
  on_trip: 'on trip',
  collecting: 'collecting cash',
};

function useSimulatorActivity(isOnline: boolean | undefined, isPaused: boolean | undefined, tripPhase: DriverTripPhase | null): void {
  const openCount = useOfferStore((s) => countOpen(Object.values(s.offers)));
  const setActivity = useActivityStore((s) => s.setActivity);

  useEffect(() => {
    if (isOnline === undefined) setActivity(null);
    else if (tripPhase && TRIP_ACTIVITY[tripPhase]) setActivity(TRIP_ACTIVITY[tripPhase]!);
    else if (!isOnline) setActivity('offline');
    else if (isPaused) setActivity('paused');
    else if (openCount > 0) setActivity(`${openCount} ${openCount === 1 ? 'offer' : 'offers'}`);
    else setActivity('online');
  }, [isOnline, isPaused, tripPhase, openCount, setActivity]);

  useEffect(() => () => setActivity(null), [setActivity]);
}

/**
 * current-trip → trip store, on load and after every reconnect (the server doesn't
 * replay trip events). A live local trip the server no longer has ended while we
 * weren't looking; its outcome comes from /driver-trips/trips.
 */
function useTripSync(): void {
  const { data: current, refetch } = useCurrentTripQuery();
  const wsState = useRealtimeStore((s) => s.wsState);

  useEffect(() => {
    if (wsState === 'open') void refetch();
  }, [wsState, refetch]);

  useEffect(() => {
    if (!current) return;
    dispatchDriverTrip({ type: 'snapshot', current, at: Date.now() });
    const trip = useDriverTripStore.getState().trip;
    if (!current.has_ongoing_trip && trip && isActiveDriverPhase(trip.phase)) {
      void driverTripsClient
        .listTrips(10)
        .then((history) => {
          const entry = history.trips.find((t) => t.request_id === trip.requestId) ?? null;
          logEvent('state', `trip ${trip.requestId.slice(0, 8)} ended off-screen: ${entry?.status ?? 'not in history'}`);
          dispatchDriverTrip({ type: 'outcome', requestId: trip.requestId, entry, at: Date.now() });
        })
        .catch((error) => logEvent('error', 'trip history lookup failed', String(error)));
    }
  }, [current]);
}

/** A live trip owns the home screen: /driver and /driver/offers go to D09. The menu stays reachable. */
function useFollowTrip(active: boolean): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (active && (pathname === '/driver' || pathname === '/driver/offers')) navigate('/driver/trip', { replace: true });
  }, [active, pathname, navigate]);
}

export function useDriverRuntime(): void {
  const { data: profile } = useDriverProfileQuery();
  const isOnline = profile?.driver.is_online;
  const isPaused = profile?.driver.is_paused;
  const tripPhase = useDriverTripStore((s) => s.trip?.phase ?? null);
  const onTrip = isActiveDriverPhase(tripPhase ?? undefined);

  useLocationBroadcastLifecycle(isOnline);
  useOfferFeed();
  useOpenOffersOnArrival();
  useTripSync();
  useFollowTrip(onTrip);
  useSimulatorActivity(isOnline, isPaused, onTrip ? tripPhase : null);

  // Offers belong to an online session; going offline or signing out drops them.
  useEffect(() => {
    if (isOnline === false) useOfferStore.getState().clear();
  }, [isOnline]);
  useEffect(() => () => useOfferStore.getState().clear(), []);
}
