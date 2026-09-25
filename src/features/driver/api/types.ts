// Driver-side contracts. Hand-maintained mirrors of:
//   go-ride-backend       application/driver, application/vehicle, application/kyc DTOs
//   driver-request-handler internal/api (earnings.go, online_time.go, server.go payloads)
//   location-producers    internal/api/server.go updateLocationRequest
//   websocket-gateway     internal/ws/protocol.go (JobOfferMessage, OfferWithdrawnMessage, AckMessage)
// Copied from go-ride-driver-app/src/api/types.ts where they exist there.

import type { Driver } from '../../../shared/api/types';

export type VehicleCategory = 'normal' | 'luxury';

export interface Vehicle {
  id: string;
  driver_id: string;
  plate_number: string;
  color: string;
  model_name: string;
  seat_count: number;
  category: VehicleCategory;
  is_active: boolean;
}

export type KycStatus = 'not_started' | 'in_review' | 'approved' | 'rejected';
export type DocumentStatus = 'uploaded' | 'approved' | 'rejected';

export type IdentityDocumentType =
  | 'selfie'
  | 'govt_id_front'
  | 'govt_id_back'
  | 'driving_license_front'
  | 'driving_license_back';

export type VehicleDocumentType =
  | 'vehicle_registration'
  | 'vehicle_photo_front'
  | 'vehicle_photo_back'
  | 'vehicle_photo_side'
  | 'vehicle_number_plate';

export type DocumentType = IdentityDocumentType | VehicleDocumentType;

export interface DocumentResponse {
  id: string;
  document_type: DocumentType;
  vehicle_id?: string;
  status: DocumentStatus;
  rejection_reason?: string;
}

export interface KycStatusResponse {
  kyc_status: KycStatus;
  documents: DocumentResponse[];
}

export interface EarningsResponse {
  period: string;
  currency_code?: string;
  total_earnings: number;
  trip_count: number;
  daily?: { date: string; earnings: number; trip_count: number }[];
}

export interface OnlineTimeResponse {
  period: string;
  total_minutes: number;
  daily?: { date: string; online_minutes: number }[];
}

export interface DriverStatsResponse {
  rating_count: number;
  trip_count: number;
  average_rating?: number;
}

/** location-producers decodes with DisallowUnknownFields(): optional keys must be
 *  omitted, never sent as undefined/null. The server computes geohash/S2 itself. */
export interface UpdateLocationPayload {
  driver_id: string;
  latitude: number;
  longitude: number;
  event_time?: string;
  accuracy_m?: number;
  source?: string;
}

export interface UpdateLocationResponse {
  accepted: boolean;
  event_id: string;
  published_at: string;
}

export interface OngoingTripPayload {
  trip_record_id: string;
  request_id: string;
  trip_id: string;
  driver_id: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  assigned_at: string;
  started_at?: string;
  ended_at?: string;
  completed_at?: string;
  final_fare?: number;
  payment_status?: string;
  payment_collected_at?: string;
}

export interface TripRequestPayload {
  request_id: string;
  trip_id: string;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  fare?: { fare_id: string; currency_code: string; total_fare: number };
}

export interface AcceptOfferResponse {
  trip_request: TripRequestPayload;
  ongoing_trip: OngoingTripPayload;
}

export interface CurrentTripResponse {
  driver_id: string;
  has_ongoing_trip: boolean;
  ongoing_trip?: OngoingTripPayload;
  trip_request?: TripRequestPayload;
}

// ---- Websocket (driver socket) ----

export interface JobOfferMessage {
  type: 'job_offer';
  job_offer_id: string;
  request_id: string;
  trip_id: string;
  offer_rank: number;
  offer_version: number;
  rider_name?: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  /** Whole trip's route; absent when the fare used the haversine fallback. */
  trip_distance_km?: number;
  trip_duration_minutes?: number;
  /** This driver's distance/ETA to the pickup. */
  pickup_distance_km: number;
  pickup_eta_minutes: number;
  estimated_earning?: number;
  currency_code?: string;
  expires_at: string;
  correlation_id?: string;
  sent_at: string;
}

/** Keyed by request, not offer: every pending offer for that request is gone. */
export interface OfferWithdrawnMessage {
  type: 'offer_withdrawn';
  request_id: string;
  trip_id: string;
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

export type AckStatus = 'delivered' | 'seen';

export interface AckMessage {
  type: 'ack';
  job_offer_id: string;
  status: AckStatus;
}

export type DriverProfile = Driver;
