import { useEffect } from 'react';
import { create } from 'zustand';

import { tabStorage } from '../lib/storage';
import { subscribeBus } from '../tab/bus';
import type { BusMessage, NavLeg, NavRoute } from '../tab/types';

// The routes the simulator shares with this tab, per leg of its current trip. A tab takes
// a route only for its own trip *and* its current driver: a redispatch keeps the request
// id but changes the driver, and the old driver's route must not show. Kept in
// sessionStorage so a reload still draws the route.

const STORAGE_KEY = 'goride:nav-routes';

/** Which routes this tab wants: its trip's request, driven by this driver. */
export interface NavRouteMatch {
  requestId: string;
  driverId: string;
}

export type NavRoutes = Partial<Record<NavLeg, NavRoute>>;

const matches = (match: NavRouteMatch | null, requestId: string, driverId: string) =>
  match !== null && match.requestId === requestId && match.driverId === driverId;

export function reduceNavRoutes(routes: NavRoutes, match: NavRouteMatch | null, message: BusMessage): NavRoutes {
  if (message.type === 'nav-route') {
    const { route } = message;
    if (!matches(match, route.requestId, route.driverId)) return routes;
    return { ...routes, [route.leg]: route };
  }
  if (message.type === 'nav-route-clear') {
    if (!matches(match, message.requestId, message.driverId) || !routes[message.leg]) return routes;
    const next = { ...routes };
    delete next[message.leg];
    return next;
  }
  return routes;
}

/** Routes still wanted after the trip (or its driver) changed. */
export function keepMatching(routes: NavRoutes, match: NavRouteMatch | null): NavRoutes {
  const next: NavRoutes = {};
  for (const route of Object.values(routes)) {
    if (route && matches(match, route.requestId, route.driverId)) next[route.leg] = route;
  }
  return next;
}

interface NavRouteState {
  match: NavRouteMatch | null;
  routes: NavRoutes;
  setMatch: (match: NavRouteMatch | null) => void;
  receive: (message: BusMessage) => void;
}

interface Stored {
  match: NavRouteMatch | null;
  routes: NavRoutes;
}

export function createNavRouteStore() {
  const stored = tabStorage.getJson<Stored>(STORAGE_KEY);
  const persist = (state: Stored) => {
    if (state.match || Object.keys(state.routes).length > 0) {
      tabStorage.setJson(STORAGE_KEY, { match: state.match, routes: state.routes } satisfies Stored);
    } else {
      tabStorage.remove(STORAGE_KEY);
    }
  };

  return create<NavRouteState>((set, get) => ({
    match: stored?.match ?? null,
    routes: stored?.routes ?? {},

    setMatch: (match) => {
      const current = get().match;
      if (current?.requestId === match?.requestId && current?.driverId === match?.driverId) return;
      set({ match, routes: keepMatching(get().routes, match) });
      persist(get());
    },

    receive: (message) => {
      const routes = reduceNavRoutes(get().routes, get().match, message);
      if (routes === get().routes) return;
      set({ routes });
      persist(get());
    },
  }));
}

export const useNavRouteStore = createNavRouteStore();

/** Mount once in the rider/driver runtime with the tab's current trip + driver (null: no trip). */
export function useNavRouteFeed(requestId: string | null | undefined, driverId: string | null | undefined): void {
  useEffect(() => {
    useNavRouteStore.getState().setMatch(requestId && driverId ? { requestId, driverId } : null);
  }, [requestId, driverId]);

  useEffect(() => subscribeBus((message) => useNavRouteStore.getState().receive(message)), []);
}

export const useNavRoute = (leg: NavLeg): NavRoute | null => useNavRouteStore((s) => s.routes[leg] ?? null);
