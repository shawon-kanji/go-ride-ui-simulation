import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { logEvent } from '../../shared/devlog/devlog-store';
import { useLocationStore } from '../../shared/location/location-store';
import { useRealtimeStore } from '../../shared/realtime/use-realtime';
import { useDriverSession } from '../../shared/session/session-store';
import { useActivityStore } from '../../shared/tab/activity';
import { locationClient } from './api/clients';
import { useCurrentTripQuery, useDriverProfileQuery } from './api/queries';
import type { JobOfferMessage, OfferWithdrawnMessage, TripCancelledMessage } from './api/types';
import { countOpen, useOfferStore } from './offers/offer-store';
import { createLocationBroadcaster } from './presence/location-broadcaster';

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

function useSimulatorActivity(isOnline: boolean | undefined, isPaused: boolean | undefined, onTrip: boolean): void {
  const openCount = useOfferStore((s) => countOpen(Object.values(s.offers)));
  const setActivity = useActivityStore((s) => s.setActivity);

  useEffect(() => {
    if (isOnline === undefined) setActivity(null);
    else if (onTrip) setActivity('on trip');
    else if (!isOnline) setActivity('offline');
    else if (isPaused) setActivity('paused');
    else if (openCount > 0) setActivity(`${openCount} ${openCount === 1 ? 'offer' : 'offers'}`);
    else setActivity('online');
  }, [isOnline, isPaused, onTrip, openCount, setActivity]);

  useEffect(() => () => setActivity(null), [setActivity]);
}

export function useDriverRuntime(): void {
  const { data: profile } = useDriverProfileQuery();
  const isOnline = profile?.driver.is_online;
  const isPaused = profile?.driver.is_paused;
  const { data: currentTrip } = useCurrentTripQuery();
  const onTrip = currentTrip?.has_ongoing_trip === true;

  useLocationBroadcastLifecycle(isOnline);
  useOfferFeed();
  useOpenOffersOnArrival();
  useSimulatorActivity(isOnline, isPaused, onTrip);

  // Offers belong to an online session; going offline or signing out drops them.
  useEffect(() => {
    if (isOnline === false) useOfferStore.getState().clear();
  }, [isOnline]);
  useEffect(() => () => useOfferStore.getState().clear(), []);
}
