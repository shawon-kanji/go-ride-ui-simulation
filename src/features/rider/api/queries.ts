import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { ApiError } from '../../../shared/api/http-client';
import { idempotencyKeyForFare } from '../booking/quotes';
import { dispatchTrip } from '../trip/trip-store';
import type { TripPlace } from '../trip/trip-model';
import { cabClient } from './clients';
import type { CancellationReason, FareQuote } from './types';

// Query keys are prefixed with 'rider' so they never mix with a driver session's cache.
export const riderKeys = {
  all: ['rider'] as const,
  fareEstimate: (pickup: TripPlace, dropoff: TripPlace) =>
    [...riderKeys.all, 'fare-estimate', pickup.lat, pickup.lng, dropoff.lat, dropoff.lng] as const,
  trips: () => [...riderKeys.all, 'trips'] as const,
};

/**
 * R03's three tiers. Every call locks new quotes in trip_fares, so it isn't refetched
 * on focus or remount — only when the rider asks (quotes expired → Refresh prices).
 */
export function useFareEstimateQuery(pickup: TripPlace | null, dropoff: TripPlace | null) {
  return useQuery({
    queryKey: pickup && dropoff ? riderKeys.fareEstimate(pickup, dropoff) : [...riderKeys.all, 'fare-estimate', 'none'],
    queryFn: () =>
      cabClient.fareEstimate({
        pickup_lat: pickup!.lat,
        pickup_lng: pickup!.lng,
        dropoff_lat: dropoff!.lat,
        dropoff_lng: dropoff!.lng,
      }),
    enabled: pickup !== null && dropoff !== null,
    staleTime: Infinity,
    retry: false,
  });
}

export function useRecentTripsQuery() {
  return useQuery({ queryKey: riderKeys.trips(), queryFn: () => cabClient.listTrips(20), staleTime: 60_000 });
}

interface BookArgs {
  quote: FareQuote;
  pickup: TripPlace;
  dropoff: TripPlace;
}

/** request-cab with one Idempotency-Key per quote, so tapping Book again is safe. */
export function useRequestCabMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quote }: BookArgs) => cabClient.requestCab(quote.fare_id, idempotencyKeyForFare(quote.fare_id)),
    onSuccess: (response, { quote, pickup, dropoff }) => {
      // The booked quote is spent, and its siblings belong to a finished decision.
      queryClient.removeQueries({ queryKey: [...riderKeys.all, 'fare-estimate'] });
      dispatchTrip({ type: 'requested', response, pickup, dropoff, serviceType: quote.service_type, at: Date.now() });
    },
  });
}

interface CancelArgs {
  requestId: string;
  reason: CancellationReason;
  note?: string;
}

/**
 * Cancel, then home. Done in the hook's own callbacks, which still run after the sheet
 * unmounts — the trip turning "cancelled" swaps the screen underneath it.
 */
export function useCancelTripMutation() {
  const navigate = useNavigate();
  const finish = (requestId: string, stage: string) => {
    dispatchTrip({ type: 'cancelled', requestId, stage, at: Date.now() });
    dispatchTrip({ type: 'clear' });
    navigate('/user', { replace: true });
  };
  return useMutation({
    mutationFn: ({ requestId, reason, note }: CancelArgs) => cabClient.cancel(requestId, note ? { reason, note } : { reason }),
    onSuccess: (response) => finish(response.request_id, response.stage),
    onError: (error, { requestId }) => {
      // Someone got there first (the driver, or another tab): it's over either way.
      if (error instanceof ApiError && error.code === 'trip_already_cancelled') finish(requestId, 'unknown');
    },
  });
}
