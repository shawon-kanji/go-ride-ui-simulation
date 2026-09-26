import type {
  CreateCabRequestResponse,
  CurrentTripResponse,
  OngoingTripStatus,
  RiderMessage,
  SearchStatus,
  ServiceType,
  TripHistoryEntry,
} from '../api/types';

// The rider's view of one trip, from booking to the end. Three sources feed it:
//   - the booking response (R04 starts here),
//   - websocket messages (ride_assigned, driver_location, trip_started/ended/completed,
//     trip_cancelled),
//   - GET /cab/current-trip snapshots after a reload or reconnect, and while searching
//     (dispatch timing out a search is never pushed to the rider).
// ride_assigned is pushed once and never replayed, and current-trip has no driver name
// or vehicle — so the trip (with those details) is kept in sessionStorage by the store.

export type TripPhase =
  | 'searching'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_payment'
  | 'completed'
  | 'cancelled'
  | 'timed_out';

export interface TripPlace {
  lat: number;
  lng: number;
  /** Street-level name, when the booking flow knew one. */
  label?: string;
}

export interface TripDriver {
  id: string;
  name?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
}

export interface DriverFix {
  lat: number;
  lng: number;
  /** When the tab received it (epoch ms). */
  at: number;
  distanceKm?: number;
  etaMinutes?: number;
}

export interface RiderTrip {
  requestId: string;
  tripId: string;
  phase: TripPhase;
  /** trip_requests.status while searching. */
  searchStatus?: SearchStatus;
  pickup: TripPlace;
  dropoff: TripPlace;
  serviceType?: ServiceType;
  currency?: string;
  fareTotal?: number;
  requestedAt: number;
  ongoingTripId?: string;
  driver?: TripDriver;
  startPin?: string;
  driverFix?: DriverFix;
  finalFare?: number;
  cancelledBy?: string;
  cancelStage?: string;
  /** The booked quote's route; R06 estimates progress from it (no driver_location after pickup). */
  route?: TripRoute;
  startedAt?: number;
  /** Set while searching again because the assigned driver cancelled before pickup. */
  redispatched?: boolean;
  /** When the phase last changed (epoch ms). */
  phaseAt: number;
}

export interface TripRoute {
  distanceKm?: number;
  durationMinutes?: number;
  /** Google encoded polyline. */
  polyline?: string;
}

export type TripEvent =
  | {
      type: 'requested';
      response: CreateCabRequestResponse;
      pickup: TripPlace;
      dropoff: TripPlace;
      serviceType: ServiceType;
      route?: TripRoute;
      at: number;
    }
  | { type: 'message'; message: RiderMessage; at: number }
  | { type: 'snapshot'; current: CurrentTripResponse; at: number }
  /** How a trip that vanished from current-trip ended, from GET /cab/trips (null: not found). */
  | { type: 'outcome'; requestId: string; entry: TripHistoryEntry | null; at: number }
  | { type: 'cancelled'; requestId: string; stage: string; at: number }
  | { type: 'clear' };

const ACTIVE: ReadonlySet<TripPhase> = new Set(['searching', 'assigned', 'in_progress', 'awaiting_payment']);

export function isActivePhase(phase: TripPhase | undefined): boolean {
  return phase !== undefined && ACTIVE.has(phase);
}

// Phases only move forward; a late or replayed message never drags a trip back.
const PHASE_ORDER: Record<TripPhase, number> = {
  searching: 0,
  assigned: 1,
  in_progress: 2,
  awaiting_payment: 3,
  completed: 4,
  cancelled: 4,
  timed_out: 4,
};

function advance(trip: RiderTrip, phase: TripPhase, at: number, patch: Partial<RiderTrip> = {}): RiderTrip {
  if (!isActivePhase(trip.phase)) return trip; // settled: nothing changes it any more
  if (PHASE_ORDER[phase] < PHASE_ORDER[trip.phase]) return { ...trip, ...patch, phase: trip.phase };
  return { ...trip, ...patch, phase, phaseAt: trip.phase === phase ? trip.phaseAt : at };
}

/**
 * The assigned driver cancelled before pickup: dispatch puts the same request back into
 * the pool (and will reuse the ongoing trip row, with a new PIN, for the next driver).
 * The only way a trip moves backwards.
 */
function redispatch(trip: RiderTrip, at: number): RiderTrip {
  if (trip.phase !== 'assigned') return trip;
  return {
    ...trip,
    phase: 'searching',
    searchStatus: 'searching',
    driver: undefined,
    startPin: undefined,
    driverFix: undefined,
    ongoingTripId: undefined,
    redispatched: true,
    phaseAt: at,
  };
}

function ongoingPhase(status: OngoingTripStatus): TripPhase {
  switch (status) {
    case 'in_progress':
      return 'in_progress';
    case 'awaiting_payment':
      return 'awaiting_payment';
    default:
      return 'assigned';
  }
}

function sameTrip(trip: RiderTrip | null, requestId: string | undefined, tripId?: string): trip is RiderTrip {
  if (!trip) return false;
  return (requestId !== undefined && trip.requestId === requestId) || (tripId !== undefined && trip.tripId === tripId);
}

function applyMessage(trip: RiderTrip | null, message: RiderMessage, at: number): RiderTrip | null {
  switch (message.type) {
    case 'ride_assigned': {
      const driver: TripDriver = {
        id: message.driver_id,
        name: message.driver_name,
        vehicleModel: message.vehicle_model,
        vehicleColor: message.vehicle_color,
        vehiclePlate: message.vehicle_plate,
      };
      const fix: DriverFix | undefined =
        message.driver_lat !== undefined && message.driver_lng !== undefined
          ? { lat: message.driver_lat, lng: message.driver_lng, at }
          : undefined;
      const base: RiderTrip = sameTrip(trip, message.request_id, message.trip_id)
        ? trip
        : {
            requestId: message.request_id,
            tripId: message.trip_id,
            phase: 'assigned',
            pickup: { lat: message.pickup_lat, lng: message.pickup_lng },
            dropoff: { lat: message.dropoff_lat, lng: message.dropoff_lng },
            requestedAt: at,
            phaseAt: at,
          };
      const sameDriver = base.driver?.id === message.driver_id;
      return advance(base, 'assigned', at, {
        ongoingTripId: message.ongoing_trip_id,
        driver,
        startPin: message.start_pin ?? (sameDriver ? base.startPin : undefined),
        driverFix: (sameDriver ? base.driverFix : undefined) ?? fix,
        searchStatus: undefined,
        redispatched: false,
      });
    }

    case 'driver_location': {
      if (!trip || trip.tripId !== message.trip_id) return trip;
      if (trip.phase !== 'assigned' && trip.phase !== 'in_progress') return trip;
      return {
        ...trip,
        ongoingTripId: trip.ongoingTripId ?? message.ongoing_trip_id,
        driverFix: {
          lat: message.latitude,
          lng: message.longitude,
          at,
          distanceKm: message.distance_remaining_km,
          etaMinutes: message.eta_minutes,
        },
      };
    }

    case 'trip_started':
      if (!sameTrip(trip, message.request_id, message.trip_id)) return trip;
      return advance(trip, 'in_progress', at, {
        startedAt: Date.parse(message.started_at) || at,
        driver: {
          ...(trip.driver ?? { id: message.driver_id }),
          vehicleModel: message.vehicle_model ?? trip.driver?.vehicleModel,
          vehicleColor: message.vehicle_color ?? trip.driver?.vehicleColor,
          vehiclePlate: message.vehicle_plate ?? trip.driver?.vehiclePlate,
        },
      });

    case 'trip_ended':
      if (!sameTrip(trip, message.request_id, message.trip_id)) return trip;
      return advance(trip, 'awaiting_payment', at, { finalFare: message.final_fare, currency: message.currency_code });

    case 'trip_completed':
      if (!sameTrip(trip, message.request_id, message.trip_id)) return trip;
      return advance(trip, 'completed', at, { finalFare: message.final_fare, currency: message.currency_code });

    case 'trip_cancelled':
      if (!sameTrip(trip, message.request_id, message.trip_id)) return trip;
      if (message.cancelled_by === 'driver' && message.stage === 'assigned') return redispatch(trip, at);
      return advance(trip, 'cancelled', at, { cancelledBy: message.cancelled_by, cancelStage: message.stage });
  }
}

function applySnapshot(trip: RiderTrip | null, current: CurrentTripResponse, at: number): RiderTrip | null {
  const ongoing = current.ongoing_trip;
  if (ongoing) {
    const known = sameTrip(trip, ongoing.request_id, ongoing.trip_id);
    const base: RiderTrip = known
      ? trip
      : {
          requestId: ongoing.request_id,
          tripId: ongoing.trip_id,
          phase: 'assigned',
          pickup: { lat: ongoing.pickup_lat, lng: ongoing.pickup_lng },
          dropoff: { lat: ongoing.dropoff_lat, lng: ongoing.dropoff_lng },
          requestedAt: Date.parse(ongoing.assigned_at) || at,
          phaseAt: at,
        };
    return advance(base, ongoingPhase(ongoing.status), at, {
      startedAt: (ongoing.started_at ? Date.parse(ongoing.started_at) : undefined) || base.startedAt,
      ongoingTripId: ongoing.trip_record_id,
      startPin: ongoing.start_pin ?? base.startPin,
      driver: base.driver?.id === ongoing.driver_id ? base.driver : { id: ongoing.driver_id },
      finalFare: ongoing.final_fare ?? base.finalFare,
      searchStatus: undefined,
    });
  }

  const request = current.trip_request;
  if (request) {
    if (sameTrip(trip, request.request_id, request.trip_id)) {
      if (trip.phase === 'searching') return { ...trip, searchStatus: request.status };
      // We missed a driver cancel (reload, reconnect): the request is back in dispatch.
      if (trip.phase === 'assigned') return { ...redispatch(trip, at), searchStatus: request.status };
      return trip;
    }
    return {
      requestId: request.request_id,
      tripId: request.trip_id,
      phase: 'searching',
      searchStatus: request.status,
      pickup: { lat: request.pickup_lat, lng: request.pickup_lng },
      dropoff: { lat: request.dropoff_lat, lng: request.dropoff_lng },
      currency: request.fare?.currency_code,
      fareTotal: request.fare?.total_fare,
      requestedAt: Date.parse(request.requested_at) || at,
      phaseAt: at,
    };
  }

  // Nothing live on the server. An active local trip ended while we weren't looking;
  // the runtime looks up how (an 'outcome' event) rather than guessing here.
  return trip;
}

function applyOutcome(trip: RiderTrip | null, requestId: string, entry: TripHistoryEntry | null, at: number): RiderTrip | null {
  if (!trip || trip.requestId !== requestId || !isActivePhase(trip.phase)) return trip;
  switch (entry?.status) {
    case 'completed':
      return advance(trip, 'completed', at, { finalFare: entry.final_fare ?? trip.finalFare });
    case 'timed_out':
      return advance(trip, 'timed_out', at);
    default:
      // cancelled — or not in history at all, which means it's gone either way.
      return advance(trip, 'cancelled', at);
  }
}

export function reduceTrip(trip: RiderTrip | null, event: TripEvent): RiderTrip | null {
  switch (event.type) {
    case 'requested':
      return {
        requestId: event.response.request_id,
        tripId: event.response.trip_id,
        phase: 'searching',
        searchStatus: event.response.status as SearchStatus,
        pickup: event.pickup,
        dropoff: event.dropoff,
        serviceType: event.serviceType,
        route: event.route,
        currency: event.response.currency_code,
        fareTotal: event.response.estimated_total_fare,
        requestedAt: event.at,
        phaseAt: event.at,
      };
    case 'message':
      return applyMessage(trip, event.message, event.at);
    case 'snapshot':
      return applySnapshot(trip, event.current, event.at);
    case 'outcome':
      return applyOutcome(trip, event.requestId, event.entry, event.at);
    case 'cancelled':
      if (!trip || trip.requestId !== event.requestId) return trip;
      return advance(trip, 'cancelled', event.at, { cancelledBy: 'rider', cancelStage: event.stage });
    case 'clear':
      return null;
  }
}

/** The screen a trip belongs on, relative to /user. */
export function screenForTrip(trip: RiderTrip | null): 'finding' | 'trip' | null {
  if (!trip) return null;
  if (trip.phase === 'searching') return 'finding';
  if (isActivePhase(trip.phase)) return 'trip';
  return null;
}
