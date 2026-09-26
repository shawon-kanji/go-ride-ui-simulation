import type { JobOfferMessage, OngoingTripPayload, OngoingTripStatus, TripCancelledMessage } from '../api/types';
import { isActiveDriverPhase, reduceDriverTrip, type DriverTrip, type DriverTripEvent } from './trip-model';

const T0 = Date.parse('2026-09-26T10:00:00Z');

const payload = (status: OngoingTripStatus, extra: Partial<OngoingTripPayload> = {}): OngoingTripPayload => ({
  trip_record_id: 'ot-1',
  request_id: 'req-1',
  trip_id: 'trip-1',
  driver_id: 'drv-1',
  status,
  pickup_lat: 3.139,
  pickup_lng: 101.6869,
  dropoff_lat: 3.1579,
  dropoff_lng: 101.7116,
  assigned_at: '2026-09-26T10:00:00Z',
  ...extra,
});

const offer = {
  type: 'job_offer',
  job_offer_id: 'jo-1',
  request_id: 'req-1',
  trip_id: 'trip-1',
  rider_name: 'Riya Sen',
  estimated_earning: 19.44,
  currency_code: 'MYR',
  trip_distance_km: 8.7,
  trip_duration_minutes: 12,
} as JobOfferMessage;

const accepted: DriverTripEvent = {
  type: 'accepted',
  trip: payload('assigned'),
  fare: { total_fare: 24.3, currency_code: 'MYR' },
  offer,
  at: T0,
};

const server = (status: OngoingTripStatus, extra: Partial<OngoingTripPayload> = {}, at = T0 + 1_000): DriverTripEvent => ({
  type: 'server',
  trip: payload(status, extra),
  at,
});

function run(...events: DriverTripEvent[]): DriverTrip | null {
  return events.reduce<DriverTrip | null>((trip, event) => reduceDriverTrip(trip, event), null);
}

describe('reduceDriverTrip', () => {
  it('starts heading to the pickup, keeping the rider name and fare from the offer', () => {
    expect(run(accepted)).toMatchObject({
      ongoingTripId: 'ot-1',
      phase: 'to_pickup',
      riderName: 'Riya Sen',
      fareTotal: 24.3,
      currency: 'MYR',
      tripDurationMinutes: 12,
    });
  });

  it('follows start → end → collect from the server responses', () => {
    const onTrip = run(accepted, server('in_progress', { started_at: '2026-09-26T10:05:00Z' }));
    expect(onTrip).toMatchObject({ phase: 'on_trip', startedAt: Date.parse('2026-09-26T10:05:00Z') });

    const collecting = reduceDriverTrip(onTrip, server('awaiting_payment', { final_fare: 24.3, ended_at: '2026-09-26T10:20:00Z' }));
    expect(collecting).toMatchObject({ phase: 'collecting', finalFare: 24.3, riderName: 'Riya Sen' });

    const done = reduceDriverTrip(collecting, server('completed', { final_fare: 24.3 }));
    expect(done?.phase).toBe('completed');
    expect(isActiveDriverPhase(done?.phase)).toBe(false);
  });

  it('never goes backwards on a stale response', () => {
    const onTrip = run(accepted, server('in_progress'));
    expect(reduceDriverTrip(onTrip, server('assigned'))?.phase).toBe('on_trip');
  });

  it('a snapshot after reload rebuilds the trip (without the rider name, which only the offer had)', () => {
    const trip = run({
      type: 'snapshot',
      current: {
        driver_id: 'drv-1',
        has_ongoing_trip: true,
        ongoing_trip: payload('in_progress'),
        trip_request: {
          request_id: 'req-1',
          trip_id: 'trip-1',
          status: 'assigned',
          pickup_lat: 0,
          pickup_lng: 0,
          dropoff_lat: 0,
          dropoff_lng: 0,
          fare: { fare_id: 'f', currency_code: 'MYR', total_fare: 24.3 },
        },
      },
      at: T0,
    });
    expect(trip).toMatchObject({ phase: 'on_trip', fareTotal: 24.3, currency: 'MYR' });
    expect(trip?.riderName).toBeUndefined();
  });

  it('a snapshot of the same trip keeps what the tab already knew', () => {
    const trip = run(accepted, { type: 'snapshot', current: { driver_id: 'drv-1', has_ongoing_trip: true, ongoing_trip: payload('assigned') }, at: T0 + 1 });
    expect(trip?.riderName).toBe('Riya Sen');
  });

  it('the rider cancelling ends the trip with who and at which stage', () => {
    const message: TripCancelledMessage = {
      type: 'trip_cancelled',
      request_id: 'req-1',
      trip_id: 'trip-1',
      stage: 'assigned',
      cancelled_by: 'rider',
      cancelled_at: '',
      sent_at: '',
    };
    expect(run(accepted, { type: 'server-cancelled', message, at: T0 + 5 })).toMatchObject({
      phase: 'cancelled',
      cancelledBy: 'rider',
      cancelStage: 'assigned',
    });
  });

  it('our own cancel records the redispatch and a later echo does not overwrite it', () => {
    const cancelled = run(accepted, { type: 'cancelled-by-me', ongoingTripId: 'ot-1', stage: 'assigned', redispatched: true, at: T0 + 5 });
    expect(cancelled).toMatchObject({ phase: 'cancelled', cancelledBy: 'driver', redispatched: true });
    const echo = reduceDriverTrip(cancelled, {
      type: 'server-cancelled',
      message: { type: 'trip_cancelled', request_id: 'req-1', trip_id: 'trip-1', stage: 'assigned', cancelled_by: 'driver', cancelled_at: '', sent_at: '' },
      at: T0 + 6,
    });
    expect(echo).toBe(cancelled);
  });

  it('the echo of our own cancel can arrive first and still records the redispatch', () => {
    const trip = run(accepted, {
      type: 'server-cancelled',
      message: { type: 'trip_cancelled', request_id: 'req-1', trip_id: 'trip-1', stage: 'assigned', cancelled_by: 'driver', cancelled_at: '', sent_at: '' },
      at: T0 + 5,
    });
    expect(trip).toMatchObject({ phase: 'cancelled', cancelledBy: 'driver', redispatched: true });
  });

  it('a vanished trip takes its outcome from history', () => {
    const entry = { request_id: 'req-1', trip_id: 'trip-1', rider_id: 'r', status: 'completed' as const, pickup_lat: 0, pickup_lng: 0, dropoff_lat: 0, dropoff_lng: 0, assigned_at: '', final_fare: 24.3 };
    expect(run(accepted, { type: 'outcome', requestId: 'req-1', entry, at: T0 })).toMatchObject({ phase: 'completed', finalFare: 24.3 });
    expect(run(accepted, { type: 'outcome', requestId: 'req-1', entry: null, at: T0 })?.phase).toBe('cancelled');
  });

  it('a redispatched request reusing the ongoing trip row is a new trip for a new driver tab', () => {
    const old = run(accepted, { type: 'cancelled-by-me', ongoingTripId: 'ot-1', stage: 'assigned', redispatched: true, at: T0 + 5 });
    // Same row id, but this is a fresh accept in (say) another driver's tab reusing the stored state.
    const next = reduceDriverTrip(old, { ...accepted, at: T0 + 10 });
    expect(next).toMatchObject({ phase: 'to_pickup', ongoingTripId: 'ot-1' });
  });

  it('clear forgets the trip', () => {
    expect(run(accepted, { type: 'clear' })).toBeNull();
  });
});
