import { distanceKm } from '../../../shared/lib/format';
import type { RiderTrip } from './trip-model';

// R06's progress is an estimate: websocket-gateway stops driver_location at trip start,
// so the rider only knows when the trip started and the route that was booked. Without
// a route (the fare used the straight-line fallback) it assumes city speed.

const CITY_SPEED_KMH = 25;

export interface TripProgress {
  /** 0 → 1 along the booked route. */
  fraction: number;
  remainingMinutes: number;
  remainingKm: number;
  /** Estimated arrival (epoch ms). */
  arrivesAt: number;
  /** Past the booked duration — traffic, or the driver hasn't ended the trip yet. */
  overdue: boolean;
}

export function tripProgress(trip: Pick<RiderTrip, 'startedAt' | 'route' | 'pickup' | 'dropoff'>, now: number): TripProgress {
  const straight = distanceKm(trip.pickup, trip.dropoff);
  const totalKm = trip.route?.distanceKm ?? straight;
  const totalMinutes = trip.route?.durationMinutes ?? (totalKm / CITY_SPEED_KMH) * 60;
  const startedAt = trip.startedAt ?? now;
  const elapsedMinutes = Math.max(0, (now - startedAt) / 60_000);
  const fraction = totalMinutes > 0 ? Math.min(1, elapsedMinutes / totalMinutes) : 1;
  return {
    fraction,
    remainingMinutes: Math.max(0, totalMinutes - elapsedMinutes),
    remainingKm: totalKm * (1 - fraction),
    arrivesAt: startedAt + totalMinutes * 60_000,
    overdue: elapsedMinutes > totalMinutes,
  };
}
