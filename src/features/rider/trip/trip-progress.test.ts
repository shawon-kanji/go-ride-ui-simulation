import { profileFor } from '../../../shared/route/nav-route';
import { encodePolyline } from '../../../shared/route/polyline';
import { pathOf } from '../../../shared/route/test-paths';
import type { NavRoute } from '../../../shared/tab/types';
import { routeTripProgress, tripProgress } from './trip-progress';

const START = Date.parse('2026-09-26T10:00:00Z');
const trip = {
  startedAt: START,
  route: { distanceKm: 10, durationMinutes: 20 },
  pickup: { lat: 3.139, lng: 101.6869 },
  dropoff: { lat: 3.1579, lng: 101.7116 },
};

describe('tripProgress', () => {
  it('estimates from the booked route and the start time', () => {
    const p = tripProgress(trip, START + 5 * 60_000);
    expect(p.fraction).toBeCloseTo(0.25);
    expect(p.remainingMinutes).toBeCloseTo(15);
    expect(p.remainingKm).toBeCloseTo(7.5);
    expect(p.arrivesAt).toBe(START + 20 * 60_000);
    expect(p.overdue).toBe(false);
  });

  it('stops at the drop-off and flags an overdue trip', () => {
    const p = tripProgress(trip, START + 30 * 60_000);
    expect(p.fraction).toBe(1);
    expect(p.remainingMinutes).toBe(0);
    expect(p.remainingKm).toBe(0);
    expect(p.overdue).toBe(true);
  });

  it('without a route, assumes city speed over the straight line', () => {
    const p = tripProgress({ ...trip, route: undefined }, START);
    // ~3.4 km straight line at 25 km/h ≈ 8 min
    expect(p.remainingKm).toBeGreaterThan(3);
    expect(p.remainingKm).toBeLessThan(4);
    expect(p.remainingMinutes).toBeGreaterThan(7);
    expect(p.remainingMinutes).toBeLessThan(10);
  });

  it('before the start time is known, counts from now', () => {
    const p = tripProgress({ ...trip, startedAt: undefined }, START);
    expect(p.fraction).toBe(0);
    expect(p.arrivesAt).toBe(START + 20 * 60_000);
  });
});

describe('routeTripProgress', () => {
  const T0 = 5_000_000;
  const route: NavRoute = {
    requestId: 'req-1',
    driverId: 'drv-1',
    leg: 'dropoff',
    path: encodePolyline(pathOf([0, 0], [2000, 0])),
    steps: [{ metres: 2000, seconds: 240 }],
    anchor: { atMs: T0, profileT: 0 },
    speedFactor: 2,
    paused: false,
  };
  const total = profileFor(route).totalSeconds;

  it('follows the playback: halfway through the drive time, at ×2', () => {
    const now = T0 + ((total / 2) * 1000) / 2;
    const progress = routeTripProgress(route, now);
    expect(progress.fraction).toBeCloseTo(0.5, 1);
    expect(progress.remainingMinutes).toBeCloseTo(total / 2 / 2 / 60, 2);
    expect(progress.arrivesAt).toBeCloseTo(T0 + (total / 2) * 1000, -2);
    expect(progress.travelled.at(-1)).toEqual(progress.remaining[0]);
  });

  it('holds while paused and ends at the drop-off', () => {
    const paused = routeTripProgress({ ...route, paused: true, anchor: { atMs: T0, profileT: 30 } }, T0 + 600_000);
    expect(paused.remainingMinutes).toBeCloseTo((total - 30) / 2 / 60, 2);
    const done = routeTripProgress(route, T0 + total * 1000);
    expect(done.fraction).toBe(1);
    expect(done.remainingKm).toBe(0);
  });
});
