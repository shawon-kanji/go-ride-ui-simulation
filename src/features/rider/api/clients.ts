import { apiRequest } from '../../../shared/api/http-client';
import type {
  CancelPayload,
  CancelResponse,
  CreateCabRequestResponse,
  CurrentTripResponse,
  FareEstimatePayload,
  FareEstimateResponse,
  RateTripResponse,
  TripHistoryResponse,
} from './types';

// Every call sends the rider session's token. /api/v1/cab/* is proxied by Vite to
// cab-request-handler; places go through the shared client (go-ride-backend).

const auth = 'rider' as const;

export const cabClient = {
  fareEstimate: (payload: FareEstimatePayload) =>
    apiRequest<FareEstimateResponse>('/api/v1/cab/fare-estimate', { method: 'POST', body: payload, auth }),
  /** The Idempotency-Key makes a retried tap return the same request instead of a second one. */
  requestCab: (fareId: string, idempotencyKey: string) =>
    apiRequest<CreateCabRequestResponse>('/api/v1/cab/request-cab', {
      method: 'POST',
      body: { fare_id: fareId },
      headers: { 'Idempotency-Key': idempotencyKey },
      auth,
    }),
  cancel: (requestId: string, payload: CancelPayload) =>
    apiRequest<CancelResponse>(`/api/v1/cab/request-cab/${requestId}/cancel`, { method: 'POST', body: payload, auth }),
  getCurrentTrip: () => apiRequest<CurrentTripResponse>('/api/v1/cab/current-trip', { auth }),
  listTrips: (limit = 20) => apiRequest<TripHistoryResponse>('/api/v1/cab/trips', { query: { limit }, auth }),
  rateTrip: (ongoingTripId: string, rating: number, comment?: string) =>
    apiRequest<RateTripResponse>(`/api/v1/cab/trips/${ongoingTripId}/rate`, {
      method: 'POST',
      body: comment ? { rating, comment } : { rating },
      auth,
    }),
};
