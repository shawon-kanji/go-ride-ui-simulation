import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useLocationStore } from '../location/location-store';
import { useActivityStore } from './activity';
import { useRealtimeStore } from '../realtime/use-realtime';
import { sessionStores } from '../session/session-store';
import { postBus, subscribeBus } from './bus';
import { getTabId } from './tab-identity';
import type { Role, TabPresence } from './types';

// Rider and driver tabs announce themselves to the simulator: on every change, on a
// heartbeat (so the simulator can mark silent tabs stale), and when asked via `whois`.

const HEARTBEAT_MS = 2_000;

export function useTabPresence(role: Role): void {
  const { pathname } = useLocation();
  const user = sessionStores[role]((s) => s.user);
  const wsState = useRealtimeStore((s) => s.wsState);
  const location = useLocationStore((s) => s.position);
  const locationSource = useLocationStore((s) => s.source);
  const activity = useActivityStore((s) => s.activity);

  useEffect(() => {
    const announce = () => {
      const presence: TabPresence = {
        tabId: getTabId(),
        role,
        path: pathname,
        userId: user?.id ?? null,
        name: user ? `${user.first_name} ${user.last_name}`.trim() : null,
        email: user?.email ?? null,
        wsState,
        location,
        locationSource,
        activity,
        sentAt: Date.now(),
      };
      postBus({ type: 'presence', presence });
    };

    announce();
    const interval = setInterval(announce, HEARTBEAT_MS);
    const unsubscribe = subscribeBus((message) => {
      if (message.type === 'whois') announce();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [role, pathname, user, wsState, location, locationSource, activity]);

  useEffect(() => {
    const sayBye = () => postBus({ type: 'bye', tabId: getTabId() });
    window.addEventListener('pagehide', sayBye);
    return () => {
      window.removeEventListener('pagehide', sayBye);
      sayBye();
    };
  }, []);
}
