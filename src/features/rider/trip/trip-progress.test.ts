import { tripProgress } from './trip-progress';

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
