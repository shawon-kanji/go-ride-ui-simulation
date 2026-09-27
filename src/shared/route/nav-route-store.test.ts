import type { NavRoute } from '../tab/types';
import { encodePolyline } from './polyline';
import { profileFor, profileTimeAt, splitRoute } from './nav-route';
import { createNavRouteStore, keepMatching, reduceNavRoutes } from './nav-route-store';
import { pathOf } from './test-paths';

const route = (patch: Partial<NavRoute> = {}): NavRoute => ({
  requestId: 'req-1',
  driverId: 'drv-a',
  leg: 'pickup',
  path: encodePolyline(pathOf([0, 0], [500, 0])),
  steps: [{ metres: 500, seconds: 60 }],
  anchor: { atMs: 1_000_000, profileT: 0 },
  speedFactor: 1,
  paused: false,
  ...patch,
});
const MATCH = { requestId: 'req-1', driverId: 'drv-a' };

describe('reduceNavRoutes', () => {
  it('takes a route for this trip and driver, per leg', () => {
    let routes = reduceNavRoutes({}, MATCH, { type: 'nav-route', route: route() });
    routes = reduceNavRoutes(routes, MATCH, { type: 'nav-route', route: route({ leg: 'dropoff' }) });
    expect(Object.keys(routes).sort()).toEqual(['dropoff', 'pickup']);
  });

  it('replaces a leg’s route when it is re-sent (speed change, pause)', () => {
    const first = reduceNavRoutes({}, MATCH, { type: 'nav-route', route: route() });
    const next = reduceNavRoutes(first, MATCH, { type: 'nav-route', route: route({ speedFactor: 5 }) });
    expect(next.pickup?.speedFactor).toBe(5);
  });

  it('ignores other trips, other drivers (redispatch) and tabs with no trip', () => {
    const empty = {};
    expect(reduceNavRoutes(empty, MATCH, { type: 'nav-route', route: route({ requestId: 'req-2' }) })).toBe(empty);
    expect(reduceNavRoutes(empty, MATCH, { type: 'nav-route', route: route({ driverId: 'drv-b' }) })).toBe(empty);
    expect(reduceNavRoutes(empty, null, { type: 'nav-route', route: route() })).toBe(empty);
  });

  it('clears one leg, only for the matching trip and driver', () => {
    const routes = reduceNavRoutes({}, MATCH, { type: 'nav-route', route: route() });
    const clear = { type: 'nav-route-clear', requestId: 'req-1', driverId: 'drv-a', leg: 'pickup' } as const;
    expect(reduceNavRoutes(routes, MATCH, { ...clear, driverId: 'drv-b' })).toBe(routes);
    expect(reduceNavRoutes(routes, MATCH, clear)).toEqual({});
  });

  it('drops routes that no longer match after the trip or driver changes', () => {
    const routes = { pickup: route(), dropoff: route({ leg: 'dropoff' }) };
    expect(keepMatching(routes, MATCH)).toEqual(routes);
    expect(keepMatching(routes, { requestId: 'req-1', driverId: 'drv-b' })).toEqual({});
    expect(keepMatching(routes, null)).toEqual({});
  });
});

describe('nav-route store', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('keeps routes across a reload and drops them when the trip ends', () => {
    const store = createNavRouteStore();
    store.getState().setMatch(MATCH);
    store.getState().receive({ type: 'nav-route', route: route() });

    const reloaded = createNavRouteStore();
    expect(reloaded.getState().routes.pickup?.requestId).toBe('req-1');

    reloaded.getState().setMatch(null);
    expect(reloaded.getState().routes).toEqual({});
    expect(createNavRouteStore().getState().routes).toEqual({});
  });
});

describe('profileTimeAt', () => {
  it('runs from the anchor at the speed factor, and holds while paused', () => {
    const r = route({ anchor: { atMs: 10_000, profileT: 20 }, speedFactor: 5 });
    expect(profileTimeAt(r, 10_000)).toBe(20);
    expect(profileTimeAt(r, 12_000)).toBe(30);
    expect(profileTimeAt({ ...r, paused: true }, 60_000)).toBe(20);
  });

  it('builds a route’s profile once', () => {
    const moved = route({ anchor: { atMs: 0, profileT: 5 }, speedFactor: 10 });
    expect(profileFor(route())).toBe(profileFor(moved));
  });
});

describe('splitRoute', () => {
  it('cuts the route where the car is', () => {
    const profile = profileFor(route());
    const { travelled, remaining } = splitRoute(profile, 123);
    expect(travelled[0]).toEqual(profile.points[0]);
    expect(remaining.at(-1)).toEqual(profile.points.at(-1));
    expect(travelled.at(-1)).toEqual(remaining[0]);
    expect(travelled.length + remaining.length).toBe(profile.points.length + 2);
  });

  it('handles both ends', () => {
    const profile = profileFor(route());
    const atStart = splitRoute(profile, 0);
    expect(atStart.remaining[0]).toEqual(profile.points[0]);
    expect(atStart.remaining.at(-1)).toEqual(profile.points.at(-1));
    const atEnd = splitRoute(profile, profile.totalMetres);
    expect(atEnd.travelled.at(-1)).toEqual(profile.points.at(-1));
    expect(atEnd.remaining).toHaveLength(1);
  });
});
