import type {
  CurrentTripResponse,
  DriverTripHistoryEntry,
  JobOfferMessage,
  OngoingTripPayload,
  OngoingTripStatus,
  TripCancelledMessage,
} from '../api/types';

// The driver's view of the trip they accepted, from accept to cash collected (D09).
// Sources: the accept response (plus the offer card, which is the only place the rider's
// name ever appears), every trip action's response, GET /driver-trips/current-trip
// snapshots, and trip_cancelled on the driver socket when the rider cancels.
// The server only allows start (PIN) → end → collect-payment, in that order.

export type DriverTripPhase = 'to_pickup' | 'on_trip' | 'collecting' | 'completed' | 'cancelled';

export interface DriverTrip {
  /** ongoing_trip.trip_record_id — the id every trip action takes. */
  ongoingTripId: string;
  requestId: string;
  tripId: string;
  phase: DriverTripPhase;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  riderName?: string;
  fareTotal?: number;
  currency?: string;
  /** Whole trip's route from the offer, when the fare used a real route. */
  tripDistanceKm?: number;
  tripDurationMinutes?: number;
  assignedAt: number;
  startedAt?: number;
  endedAt?: number;
  completedAt?: number;
  finalFare?: number;
  cancelledBy?: string;
  cancelStage?: string;
  /** A cancel before pickup sends the request back into dispatch. */
  redispatched?: boolean;
  phaseAt: number;
}

export type DriverTripEvent =
  | { type: 'accepted'; trip: OngoingTripPayload; fare?: { total_fare: number; currency_code: string }; offer?: JobOfferMessage; at: number }
  /** Any start/end/collect response: the server's copy of the trip after the action. */
  | { type: 'server'; trip: OngoingTripPayload; currency?: string; at: number }
  | { type: 'snapshot'; current: CurrentTripResponse; at: number }
  | { type: 'outcome'; requestId: string; entry: DriverTripHistoryEntry | null; at: number }
  | { type: 'cancelled-by-me'; ongoingTripId: string; stage: string; redispatched: boolean; at: number }
  /** trip_cancelled on the driver socket: the rider cancelled, or the echo of our own cancel. */
  | { type: 'server-cancelled'; message: TripCancelledMessage; at: number }
  | { type: 'clear' };

const ORDER: Record<DriverTripPhase, number> = { to_pickup: 0, on_trip: 1, collecting: 2, completed: 3, cancelled: 3 };

export function isActiveDriverPhase(phase: DriverTripPhase | undefined): boolean {
  return phase === 'to_pickup' || phase === 'on_trip' || phase === 'collecting';
}

export function phaseForStatus(status: OngoingTripStatus): DriverTripPhase {
  switch (status) {
    case 'in_progress':
      return 'on_trip';
    case 'awaiting_payment':
      return 'collecting';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'to_pickup';
  }
}

const ms = (iso: string | undefined) => (iso ? Date.parse(iso) || undefined : undefined);

/** Forward-only: a late or repeated response never moves a trip back, and a settled trip stays settled. */
function advance(trip: DriverTrip, phase: DriverTripPhase, at: number, patch: Partial<DriverTrip> = {}): DriverTrip {
  if (!isActiveDriverPhase(trip.phase)) return trip;
  if (ORDER[phase] < ORDER[trip.phase]) return { ...trip, ...patch, phase: trip.phase };
  return { ...trip, ...patch, phase, phaseAt: trip.phase === phase ? trip.phaseAt : at };
}

function fromPayload(p: OngoingTripPayload, at: number): DriverTrip {
  return {
    ongoingTripId: p.trip_record_id,
    requestId: p.request_id,
    tripId: p.trip_id,
    phase: 'to_pickup',
    pickup: { lat: p.pickup_lat, lng: p.pickup_lng },
    dropoff: { lat: p.dropoff_lat, lng: p.dropoff_lng },
    assignedAt: ms(p.assigned_at) ?? at,
    phaseAt: at,
  };
}

/** Timestamps and fare from a server payload, keeping what we already know. */
function payloadPatch(trip: DriverTrip, p: OngoingTripPayload): Partial<DriverTrip> {
  return {
    startedAt: ms(p.started_at) ?? trip.startedAt,
    endedAt: ms(p.ended_at) ?? trip.endedAt,
    completedAt: ms(p.completed_at) ?? trip.completedAt,
    finalFare: p.final_fare ?? trip.finalFare,
  };
}

function applyServer(trip: DriverTrip | null, p: OngoingTripPayload, at: number, currency?: string): DriverTrip {
  // Redispatch reuses the ongoing_trips row, so the id alone doesn't identify *our* trip.
  const base = trip && trip.ongoingTripId === p.trip_record_id && trip.requestId === p.request_id ? trip : fromPayload(p, at);
  const patch = payloadPatch(base, p);
  if (currency) patch.currency = currency;
  return advance(base, phaseForStatus(p.status), at, patch);
}

export function reduceDriverTrip(trip: DriverTrip | null, event: DriverTripEvent): DriverTrip | null {
  switch (event.type) {
    case 'accepted': {
      const next = applyServer(null, event.trip, event.at);
      return {
        ...next,
        riderName: event.offer?.rider_name,
        fareTotal: event.fare?.total_fare ?? event.offer?.estimated_earning,
        currency: event.fare?.currency_code ?? event.offer?.currency_code,
        tripDistanceKm: event.offer?.trip_distance_km,
        tripDurationMinutes: event.offer?.trip_duration_minutes,
      };
    }

    case 'server':
      return applyServer(trip, event.trip, event.at, event.currency);

    case 'snapshot': {
      const ongoing = event.current.ongoing_trip;
      if (!ongoing) return trip; // nothing live: the runtime asks history how it ended
      const next = applyServer(trip, ongoing, event.at, event.current.trip_request?.fare?.currency_code);
      const fare = event.current.trip_request?.fare;
      return fare && next.fareTotal === undefined ? { ...next, fareTotal: fare.total_fare } : next;
    }

    case 'outcome':
      if (!trip || trip.requestId !== event.requestId || !isActiveDriverPhase(trip.phase)) return trip;
      if (event.entry?.status === 'completed') {
        return advance(trip, 'completed', event.at, { finalFare: event.entry.final_fare ?? trip.finalFare });
      }
      return advance(trip, 'cancelled', event.at);

    case 'cancelled-by-me':
      if (!trip || trip.ongoingTripId !== event.ongoingTripId) return trip;
      return advance(trip, 'cancelled', event.at, {
        cancelledBy: 'driver',
        cancelStage: event.stage,
        redispatched: event.redispatched,
      });

    case 'server-cancelled': {
      const m = event.message;
      if (!trip || trip.requestId !== m.request_id) return trip;
      // Our own cancel echoes back here, sometimes before the HTTP response. A driver
      // cancel before pickup is always redispatched (driver-request-handler).
      const ours = m.cancelled_by === 'driver';
      return advance(trip, 'cancelled', event.at, {
        cancelledBy: m.cancelled_by,
        cancelStage: m.stage,
        redispatched: ours && m.stage === 'assigned',
      });
    }

    case 'clear':
      return null;
  }
}
