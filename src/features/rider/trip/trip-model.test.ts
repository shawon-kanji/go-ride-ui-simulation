import type {
  CreateCabRequestResponse,
  CurrentTripResponse,
  DriverLocationMessage,
  RideAssignedMessage,
  RiderMessage,
} from '../api/types';
import { isActivePhase, reduceTrip, screenForTrip, type RiderTrip, type TripEvent } from './trip-model';

const T0 = Date.parse('2026-09-25T10:00:00Z');
const PICKUP = { lat: 3.139, lng: 101.6869, label: 'Menara KL' };
const DROPOFF = { lat: 3.1579, lng: 101.7116, label: 'KLCC' };

const booked: CreateCabRequestResponse = {
  accepted: true,
  request_id: 'req-1',
  trip_id: 'trip-1',
  fare_id: 'fare-1',
  status: 'search_started',
  event_id: 'evt-1',
  published_at: '2026-09-25T10:00:00Z',
  currency_code: 'MYR',
  estimated_total_fare: 24.3,
};

const assigned: RideAssignedMessage = {
  type: 'ride_assigned',
  request_id: 'req-1',
  trip_id: 'trip-1',
  ongoing_trip_id: 'ot-1',
  driver_id: 'drv-1',
  driver_name: 'Sim Driver',
  driver_lat: 3.14,
  driver_lng: 101.69,
  pickup_lat: PICKUP.lat,
  pickup_lng: PICKUP.lng,
  dropoff_lat: DROPOFF.lat,
  dropoff_lng: DROPOFF.lng,
  start_pin: '4417',
  vehicle_color: 'White',
  vehicle_plate: 'SIM1001',
  vehicle_model: 'Perodua Myvi',
  sent_at: '2026-09-25T10:00:10Z',
};

const location = (lat: number, overrides: Partial<DriverLocationMessage> = {}): DriverLocationMessage => ({
  type: 'driver_location',
  trip_id: 'trip-1',
  ongoing_trip_id: 'ot-1',
  driver_id: 'drv-1',
  latitude: lat,
  longitude: 101.69,
  event_time: '2026-09-25T10:00:20Z',
  distance_remaining_km: 1.2,
  eta_minutes: 3,
  sent_at: '2026-09-25T10:00:20Z',
  ...overrides,
});

const message = (m: RiderMessage, at = T0 + 1_000): TripEvent => ({ type: 'message', message: m, at });
const base = { request_id: 'req-1', trip_id: 'trip-1', ongoing_trip_id: 'ot-1', driver_id: 'drv-1', sent_at: '' };

function run(...events: TripEvent[]): RiderTrip | null {
  return events.reduce<RiderTrip | null>((trip, event) => reduceTrip(trip, event), null);
}

const requested: TripEvent = { type: 'requested', response: booked, pickup: PICKUP, dropoff: DROPOFF, serviceType: 'RIDE', at: T0 };

describe('reduceTrip', () => {
  it('starts searching from the booking response', () => {
    const trip = run(requested);
    expect(trip).toMatchObject({
      requestId: 'req-1',
      phase: 'searching',
      searchStatus: 'search_started',
      fareTotal: 24.3,
      currency: 'MYR',
      pickup: PICKUP,
    });
    expect(screenForTrip(trip)).toBe('finding');
  });

  it('ride_assigned fills in the driver, vehicle and start PIN', () => {
    const trip = run(requested, message(assigned));
    expect(trip?.phase).toBe('assigned');
    expect(trip?.driver).toEqual({
      id: 'drv-1',
      name: 'Sim Driver',
      vehicleModel: 'Perodua Myvi',
      vehicleColor: 'White',
      vehiclePlate: 'SIM1001',
    });
    expect(trip?.startPin).toBe('4417');
    expect(trip?.driverFix).toMatchObject({ lat: 3.14, lng: 101.69 });
    expect(trip?.pickup.label).toBe('Menara KL'); // labels from booking survive
    expect(screenForTrip(trip)).toBe('trip');
  });

  it('driver_location moves the driver and carries distance/ETA', () => {
    const trip = run(requested, message(assigned), message(location(3.145), T0 + 5_000));
    expect(trip?.driverFix).toEqual({ lat: 3.145, lng: 101.69, at: T0 + 5_000, distanceKm: 1.2, etaMinutes: 3 });
  });

  it('ignores driver_location for another trip or before assignment', () => {
    expect(run(requested, message(location(3.2)))?.driverFix).toBeUndefined();
    const other = run(requested, message(assigned), message(location(3.2, { trip_id: 'trip-9' })));
    expect(other?.driverFix?.lat).toBe(3.14);
  });

  it('moves through started → ended → completed and keeps the final fare', () => {
    const trip = run(
      requested,
      message(assigned),
      message({ ...base, type: 'trip_started', started_at: '' }),
      message({ ...base, type: 'trip_ended', final_fare: 26.1, currency_code: 'MYR', ended_at: '' }),
    );
    expect(trip?.phase).toBe('awaiting_payment');
    expect(trip?.finalFare).toBe(26.1);
    const done = reduceTrip(trip, message({ ...base, type: 'trip_completed', final_fare: 26.1, currency_code: 'MYR', payment_collected_at: '' }));
    expect(done?.phase).toBe('completed');
    expect(isActivePhase(done?.phase)).toBe(false);
    expect(screenForTrip(done)).toBeNull();
  });

  it('never goes backwards: a late ride_assigned after trip_started keeps in_progress', () => {
    const trip = run(requested, message(assigned), message({ ...base, type: 'trip_started', started_at: '' }), message(assigned));
    expect(trip?.phase).toBe('in_progress');
  });

  it('a settled trip ignores later messages', () => {
    const cancelled = run(requested, { type: 'cancelled', requestId: 'req-1', stage: 'searching', at: T0 + 2_000 });
    expect(cancelled?.phase).toBe('cancelled');
    expect(cancelled?.cancelledBy).toBe('rider');
    expect(reduceTrip(cancelled, message(assigned))).toBe(cancelled);
  });

  it('trip_cancelled from the server (e.g. this rider in another tab) ends the trip', () => {
    const trip = run(
      requested,
      message(assigned),
      message({
        type: 'trip_cancelled',
        request_id: 'req-1',
        trip_id: 'trip-1',
        stage: 'assigned',
        cancelled_by: 'rider',
        cancelled_at: '',
        sent_at: '',
      }),
    );
    expect(trip).toMatchObject({ phase: 'cancelled', cancelledBy: 'rider', cancelStage: 'assigned' });
  });

  describe('driver cancels and the request is redispatched', () => {
    const driverCancel = (stage: string): TripEvent =>
      message({
        type: 'trip_cancelled',
        request_id: 'req-1',
        trip_id: 'trip-1',
        ongoing_trip_id: 'ot-1',
        driver_id: 'drv-1',
        stage,
        cancelled_by: 'driver',
        cancelled_at: '',
        sent_at: '',
      });

    it('before pickup, goes back to searching and forgets the old driver', () => {
      const trip = run(requested, message(assigned), message(location(3.145)), driverCancel('assigned'));
      expect(trip).toMatchObject({ phase: 'searching', searchStatus: 'searching', redispatched: true });
      expect(trip?.driver).toBeUndefined();
      expect(trip?.startPin).toBeUndefined();
      expect(trip?.driverFix).toBeUndefined();
      expect(trip?.ongoingTripId).toBeUndefined();
      expect(trip?.pickup.label).toBe('Menara KL');
      expect(screenForTrip(trip)).toBe('finding');
    });

    it('the next ride_assigned brings the new driver and a new PIN', () => {
      const second: RideAssignedMessage = {
        ...assigned,
        driver_id: 'drv-2',
        driver_name: 'Meera Iyer',
        vehicle_plate: 'SIM2002',
        start_pin: '9001',
        driver_lat: undefined,
        driver_lng: undefined,
      };
      const trip = run(requested, message(assigned), driverCancel('assigned'), message(second));
      expect(trip).toMatchObject({ phase: 'assigned', startPin: '9001', driver: { id: 'drv-2', vehiclePlate: 'SIM2002' } });
      expect(trip?.driverFix).toBeUndefined(); // not the old driver's position
      expect(trip?.redispatched).toBe(false);
    });

    it('mid-trip, the trip is over', () => {
      const started: TripEvent = message({ ...base, type: 'trip_started', started_at: '' });
      const trip = run(requested, message(assigned), started, driverCancel('in_progress'));
      expect(trip).toMatchObject({ phase: 'cancelled', cancelledBy: 'driver', cancelStage: 'in_progress' });
    });

    it('a reload that missed the message notices the request searching again', () => {
      const searchingAgain: CurrentTripResponse = {
        rider_id: 'rider-1',
        has_active_request: true,
        has_ongoing_trip: false,
        trip_request: {
          request_id: 'req-1',
          trip_id: 'trip-1',
          status: 'searching',
          pickup_lat: PICKUP.lat,
          pickup_lng: PICKUP.lng,
          dropoff_lat: DROPOFF.lat,
          dropoff_lng: DROPOFF.lng,
          search_radius_km: 20,
          requested_at: '2026-09-25T10:00:00Z',
        },
      };
      const trip = run(requested, message(assigned), { type: 'snapshot', current: searchingAgain, at: T0 + 9_000 });
      expect(trip).toMatchObject({ phase: 'searching', redispatched: true });
      expect(trip?.driver).toBeUndefined();
    });
  });

  it('keeps the booked route and the start time for R06', () => {
    const withRoute: TripEvent = { ...requested, route: { distanceKm: 8.7, durationMinutes: 12, polyline: 'abc' } } as TripEvent;
    const trip = run(withRoute, message(assigned), message({ ...base, type: 'trip_started', started_at: '2026-09-25T10:05:00Z' }));
    expect(trip).toMatchObject({
      phase: 'in_progress',
      route: { distanceKm: 8.7, durationMinutes: 12, polyline: 'abc' },
      startedAt: Date.parse('2026-09-25T10:05:00Z'),
    });
  });

  describe('snapshots from GET /cab/current-trip', () => {
    const searching: CurrentTripResponse = {
      rider_id: 'rider-1',
      has_active_request: true,
      has_ongoing_trip: false,
      trip_request: {
        request_id: 'req-1',
        trip_id: 'trip-1',
        status: 'offered',
        pickup_lat: PICKUP.lat,
        pickup_lng: PICKUP.lng,
        dropoff_lat: DROPOFF.lat,
        dropoff_lng: DROPOFF.lng,
        search_radius_km: 20,
        requested_at: '2026-09-25T10:00:00Z',
      },
    };

    const ongoing: CurrentTripResponse = {
      rider_id: 'rider-1',
      has_active_request: false,
      has_ongoing_trip: true,
      ongoing_trip: {
        trip_record_id: 'ot-1',
        request_id: 'req-1',
        trip_id: 'trip-1',
        driver_id: 'drv-1',
        status: 'driver_arriving',
        pickup_lat: PICKUP.lat,
        pickup_lng: PICKUP.lng,
        dropoff_lat: DROPOFF.lat,
        dropoff_lng: DROPOFF.lng,
        assigned_at: '2026-09-25T10:00:10Z',
        start_pin: '4417',
      },
    };

    it('updates the search status of the same request', () => {
      const trip = run(requested, { type: 'snapshot', current: searching, at: T0 + 3_000 });
      expect(trip).toMatchObject({ phase: 'searching', searchStatus: 'offered', pickup: PICKUP });
    });

    it('rebuilds a search after a reload with nothing stored', () => {
      const trip = run({ type: 'snapshot', current: searching, at: T0 });
      expect(trip).toMatchObject({ requestId: 'req-1', phase: 'searching', searchStatus: 'offered' });
    });

    it('catches a missed ride_assigned: ongoing_trip means assigned, with the PIN', () => {
      const trip = run(requested, { type: 'snapshot', current: ongoing, at: T0 + 3_000 });
      expect(trip).toMatchObject({ phase: 'assigned', startPin: '4417', ongoingTripId: 'ot-1', driver: { id: 'drv-1' } });
    });

    it('keeps stored driver details when the snapshot names the same driver', () => {
      const trip = run(requested, message(assigned), { type: 'snapshot', current: ongoing, at: T0 + 3_000 });
      expect(trip?.driver?.name).toBe('Sim Driver');
      expect(trip?.driver?.vehiclePlate).toBe('SIM1001');
    });

    it('leaves an active trip alone when the server has nothing (the outcome decides)', () => {
      const empty: CurrentTripResponse = { rider_id: 'rider-1', has_active_request: false, has_ongoing_trip: false };
      const before = run(requested);
      expect(reduceTrip(before, { type: 'snapshot', current: empty, at: T0 + 3_000 })).toBe(before);
    });
  });

  describe('outcome of a trip that vanished', () => {
    const entry = (status: string) => ({
      request_id: 'req-1',
      trip_id: 'trip-1',
      status,
      pickup_lat: 0,
      pickup_lng: 0,
      dropoff_lat: 0,
      dropoff_lng: 0,
      requested_at: '',
    });

    it('timed_out ends the search as timed out', () => {
      expect(run(requested, { type: 'outcome', requestId: 'req-1', entry: entry('timed_out'), at: T0 })?.phase).toBe('timed_out');
    });

    it('missing from history counts as cancelled', () => {
      expect(run(requested, { type: 'outcome', requestId: 'req-1', entry: null, at: T0 })?.phase).toBe('cancelled');
    });

    it('is ignored for a different request', () => {
      expect(run(requested, { type: 'outcome', requestId: 'req-9', entry: entry('timed_out'), at: T0 })?.phase).toBe('searching');
    });
  });

  it('clear forgets the trip', () => {
    expect(run(requested, { type: 'clear' })).toBeNull();
  });
});
