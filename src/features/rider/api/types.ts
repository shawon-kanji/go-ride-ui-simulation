// Rider-side contracts. Hand-maintained mirrors of:
//   cab-request-handler  internal/api/server.go (fareQuote, createCabRequestResponse,
//                        currentTripResponse), cancel.go, trips.go, rating.go
//   websocket-gateway    internal/ws/protocol.go (rider messages)
// The Expo rider app has no booking code yet, so these come straight from the Go structs.

export type ServiceType = 'RIDE' | 'RIDE_XL' | 'RIDE_PREMIUM';

export interface FareEstimatePayload {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  search_radius_km?: number;
}

export interface FareQuote {
  fare_id: string;
  service_type: ServiceType;
  currency_code: string;
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  surcharge_total: number;
  discount_total: number;
  surge_multiplier: number;
  total_fare: number;
  pricing_version: string;
  /** Absent when the backend fell back to a straight-line estimate. */
  route_distance_km?: number;
  route_duration_minutes?: number;
  /** Google encoded polyline of the driving route. */
  route_polyline?: string;
  locked_at: string;
  expires_at: string;
}

export interface FareEstimateResponse {
  quotes: FareQuote[];
}

export interface CreateCabRequestResponse {
  accepted: boolean;
  request_id: string;
  trip_id: string;
  fare_id?: string;
  status: string;
  correlation_id?: string;
  event_id: string;
  published_at: string;
  currency_code?: string;
  estimated_total_fare?: number;
}

/** trip_requests.status while a search is live (cab-request-handler activeTripRequestStatuses). */
export type SearchStatus = 'search_started' | 'searching' | 'offered' | 'driver_accepted' | 'driver_rejected';

/** ongoing_trips.status while a trip is live (activeOngoingTripStatuses). */
export type OngoingTripStatus = 'assigned' | 'driver_arriving' | 'in_progress' | 'awaiting_payment';

export interface FarePayload {
  fare_id: string;
  currency_code: string;
  base_fare: number;
  distance_fare: number;
  time_fare: number;
  surcharge_total: number;
  discount_total: number;
  surge_multiplier: number;
  total_fare: number;
  pricing_version: string;
  route_distance_km?: number;
  route_duration_minutes?: number;
  route_polyline?: string;
  locked_at: string;
  expires_at?: string;
}

export interface TripRequestPayload {
  request_id: string;
  trip_id: string;
  status: SearchStatus;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  search_radius_km: number;
  requested_at: string;
  fare?: FarePayload;
}

export interface OngoingTripPayload {
  trip_record_id: string;
  request_id: string;
  trip_id: string;
  driver_id: string;
  status: OngoingTripStatus;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  assigned_at: string;
  start_pin?: string;
  started_at?: string;
  ended_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  final_fare?: number;
  payment_status?: string;
  payment_collected_at?: string;
}

/** An assigned trip shows up under ongoing_trip; trip_request only covers the search. */
export interface CurrentTripResponse {
  rider_id: string;
  has_active_request: boolean;
  has_ongoing_trip: boolean;
  trip_request?: TripRequestPayload;
  ongoing_trip?: OngoingTripPayload;
}

/** The schema's fixed enum (go-ride-db-schema ValidCancellationReasons). Free text goes in `note`. */
export type CancellationReason = 'rider_absent' | 'rider_requested' | 'vehicle_problem' | 'unsafe_destination' | 'other';

export interface CancelPayload {
  reason?: CancellationReason;
  note?: string;
}

export interface CancelResponse {
  accepted: boolean;
  request_id: string;
  trip_id: string;
  stage: string;
  request_status: string;
  ongoing_trip_status?: string;
  cancelled_at: string;
  withdrawn_offer_count?: number;
  event_id: string;
  published_at: string;
}

export interface TripHistoryEntry {
  request_id: string;
  trip_id: string;
  /** cancelled / timed_out for searches that ended; completed / cancelled for trips. */
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  requested_at: string;
  completed_at?: string;
  cancelled_at?: string;
  driver_id?: string;
  final_fare?: number;
  currency_code?: string;
}

export interface TripHistoryResponse {
  trips: TripHistoryEntry[];
  next_cursor?: string;
}

export interface RateTripResponse {
  accepted: boolean;
  ongoing_trip_id: string;
  rating: number;
  driver_rating_average: number;
  driver_rating_count: number;
}

// ---- Websocket (rider socket) ----

export interface RideAssignedMessage {
  type: 'ride_assigned';
  request_id: string;
  trip_id: string;
  ongoing_trip_id: string;
  driver_id: string;
  driver_name?: string;
  driver_lat?: number;
  driver_lng?: number;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  start_pin?: string;
  vehicle_color?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  correlation_id?: string;
  sent_at: string;
}

export interface DriverLocationMessage {
  type: 'driver_location';
  trip_id: string;
  ongoing_trip_id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy_m?: number;
  event_time: string;
  /** To the pickup before the trip starts, to the drop-off after. */
  distance_remaining_km: number;
  eta_minutes: number;
  sent_at: string;
}

export interface TripStartedMessage {
  type: 'trip_started';
  request_id: string;
  trip_id: string;
  ongoing_trip_id: string;
  driver_id: string;
  started_at: string;
  vehicle_color?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  sent_at: string;
}

export interface TripEndedMessage {
  type: 'trip_ended';
  request_id: string;
  trip_id: string;
  ongoing_trip_id: string;
  driver_id: string;
  final_fare: number;
  currency_code: string;
  ended_at: string;
  sent_at: string;
}

export interface TripCompletedMessage {
  type: 'trip_completed';
  request_id: string;
  trip_id: string;
  ongoing_trip_id: string;
  driver_id: string;
  final_fare: number;
  currency_code: string;
  payment_collected_at: string;
  sent_at: string;
}

export interface TripCancelledMessage {
  type: 'trip_cancelled';
  request_id: string;
  trip_id: string;
  ongoing_trip_id?: string;
  driver_id?: string;
  stage: string;
  cancelled_by: string;
  cancelled_at: string;
  sent_at: string;
}

export type RiderMessage =
  | RideAssignedMessage
  | DriverLocationMessage
  | TripStartedMessage
  | TripEndedMessage
  | TripCompletedMessage
  | TripCancelledMessage;

const RIDER_MESSAGE_TYPES = new Set<string>([
  'ride_assigned',
  'driver_location',
  'trip_started',
  'trip_ended',
  'trip_completed',
  'trip_cancelled',
]);

export function isRiderMessage(message: { type: string }): message is RiderMessage {
  return RIDER_MESSAGE_TYPES.has(message.type);
}
