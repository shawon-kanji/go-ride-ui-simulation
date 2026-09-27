import { create } from 'zustand';

import { tabStorage } from '../../../shared/lib/storage';
import { positionOnRoute, profileFor, profileTimeAt } from '../../../shared/route/nav-route';
import { postBus } from '../../../shared/tab/bus';
import type { BusMessage, NavLeg, NavRoute, SpeedFactor } from '../../../shared/tab/types';
import { createWorkerTicker, type CreateTicker, type Ticker } from './ticker';

// Route playback: the simulator drives a driver tab along a route by sending it GPS fixes.
// The car's position always comes from the wall clock (profile time = anchor + elapsed ×
// speed), so a late tick jumps along the road, never off it. Every change of speed or
// pause re-anchors and re-shares the route (nav-route) with the driver's and rider's tabs.
//
//   driving → paused (by hand) | held (the tab went quiet or reloaded) | arrived
// A held playback resumes by itself when its tab is back. Kept in sessionStorage: the
// simulator can reload mid-drive and pick up exactly where the car is.

export type PlaybackStatus = 'driving' | 'paused' | 'held' | 'arrived';

export interface Playback {
  tabId: string;
  route: NavRoute;
  status: PlaybackStatus;
}

export type LegToDrive = Pick<NavRoute, 'requestId' | 'driverId' | 'leg' | 'path' | 'steps'>;

interface PlaybackState {
  playbacks: Record<string, Playback>;
  start: (tabId: string, leg: LegToDrive, speedFactor?: SpeedFactor) => void;
  pause: (tabId: string) => void;
  resume: (tabId: string) => void;
  setSpeed: (tabId: string, speedFactor: SpeedFactor) => void;
  /** Stop and un-share the route (a manual move, the trip ended, or the stop button). */
  stop: (tabId: string) => void;
  hold: (tabId: string) => void;
  release: (tabId: string) => void;
  /** Send the car's current position to every driving tab. */
  tick: () => void;
  /** Re-send every shared route (a tab just appeared or reloaded). */
  republish: () => void;
}

export interface PlaybackDeps {
  now: () => number;
  post: (message: BusMessage) => void;
  createTicker: CreateTicker;
}

const STORAGE_KEY = 'goride:sim-playbacks';

/** Pin the route's current profile time to `now`, so a speed or pause change starts from where the car is. */
function reanchor(route: NavRoute, now: number, patch: Partial<Pick<NavRoute, 'paused' | 'speedFactor'>>): NavRoute {
  const total = profileFor(route).totalSeconds;
  const profileT = Math.min(total, profileTimeAt(route, now));
  return { ...route, ...patch, anchor: { atMs: now, profileT } };
}

export function createPlaybackStore({ now, post, createTicker }: PlaybackDeps) {
  const stored = tabStorage.getJson<Record<string, Playback>>(STORAGE_KEY) ?? {};

  const store = create<PlaybackState>((set, get) => {
    const update = (tabId: string, change: (p: Playback) => Playback | null) => {
      const current = get().playbacks[tabId];
      if (!current) return;
      const next = change(current);
      if (!next || next === current) return;
      set({ playbacks: { ...get().playbacks, [tabId]: next } });
      if (next.route !== current.route) post({ type: 'nav-route', route: next.route });
    };

    const clearShared = (route: NavRoute) =>
      post({ type: 'nav-route-clear', requestId: route.requestId, driverId: route.driverId, leg: route.leg });

    return {
      playbacks: stored,

      start: (tabId, leg, speedFactor) => {
        const previous = get().playbacks[tabId];
        if (previous && (previous.route.leg !== leg.leg || previous.route.requestId !== leg.requestId)) {
          clearShared(previous.route);
        }
        const route: NavRoute = {
          ...leg,
          anchor: { atMs: now(), profileT: 0 },
          speedFactor: speedFactor ?? previous?.route.speedFactor ?? 1,
          paused: false,
        };
        set({ playbacks: { ...get().playbacks, [tabId]: { tabId, route, status: 'driving' } } });
        post({ type: 'nav-route', route });
      },

      pause: (tabId) =>
        update(tabId, (p) => {
          if (p.status === 'driving') return { ...p, status: 'paused', route: reanchor(p.route, now(), { paused: true }) };
          if (p.status === 'held') return { ...p, status: 'paused' };
          return p;
        }),

      resume: (tabId) =>
        update(tabId, (p) =>
          p.status === 'paused' || p.status === 'held'
            ? { ...p, status: 'driving', route: reanchor(p.route, now(), { paused: false }) }
            : p,
        ),

      setSpeed: (tabId, speedFactor) =>
        update(tabId, (p) => (p.route.speedFactor === speedFactor ? p : { ...p, route: reanchor(p.route, now(), { speedFactor }) })),

      stop: (tabId) => {
        const current = get().playbacks[tabId];
        if (!current) return;
        const playbacks = { ...get().playbacks };
        delete playbacks[tabId];
        set({ playbacks });
        clearShared(current.route);
      },

      hold: (tabId) =>
        update(tabId, (p) =>
          p.status === 'driving' ? { ...p, status: 'held', route: reanchor(p.route, now(), { paused: true }) } : p,
        ),

      release: (tabId) =>
        update(tabId, (p) =>
          p.status === 'held' ? { ...p, status: 'driving', route: reanchor(p.route, now(), { paused: false }) } : p,
        ),

      tick: () => {
        const at = now();
        for (const playback of Object.values(get().playbacks)) {
          if (playback.status !== 'driving') continue;
          const position = positionOnRoute(playback.route, at);
          post({
            type: 'set-location',
            tabId: playback.tabId,
            lat: position.lat,
            lng: position.lng,
            heading: Math.round(position.heading),
            playback: true,
          });
          if (position.done) {
            update(playback.tabId, (p) => ({ ...p, status: 'arrived', route: reanchor(p.route, at, { paused: true }) }));
          }
        }
      },

      republish: () => {
        for (const playback of Object.values(get().playbacks)) post({ type: 'nav-route', route: playback.route });
      },
    };
  });

  // Tick only while something is driving; persist every change.
  let ticker: Ticker | null = null;
  const sync = (state: PlaybackState) => {
    const driving = Object.values(state.playbacks).some((p) => p.status === 'driving');
    if (driving && !ticker) ticker = createTicker(() => store.getState().tick());
    if (!driving && ticker) {
      ticker.stop();
      ticker = null;
    }
    if (Object.keys(state.playbacks).length > 0) tabStorage.setJson(STORAGE_KEY, state.playbacks);
    else tabStorage.remove(STORAGE_KEY);
  };
  store.subscribe((state, prev) => {
    if (state.playbacks !== prev.playbacks) sync(state);
  });
  sync(store.getState());

  return store;
}

export const usePlaybackStore = createPlaybackStore({ now: Date.now, post: postBus, createTicker: createWorkerTicker });

export const legLabel = (leg: NavLeg) => (leg === 'pickup' ? 'To pickup' : 'To drop-off');
