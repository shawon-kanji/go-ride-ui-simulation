import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../../shared/api/http-client';
import { driverTripsClient } from '../api/clients';
import { driverKeys } from '../api/queries';
import type { CancellationReason, OngoingTripPayload } from '../api/types';
import { dispatchDriverTrip } from './trip-store';

// D09's actions. Each response is the server's copy of the trip, fed straight into the
// trip store; the current-trip cache is refreshed so the runtime's snapshot agrees.

function useApply() {
  const queryClient = useQueryClient();
  return (trip: OngoingTripPayload, currency?: string) => {
    dispatchDriverTrip({ type: 'server', trip, currency, at: Date.now() });
    void queryClient.invalidateQueries({ queryKey: driverKeys.currentTrip() });
  };
}

export function useStartTripMutation() {
  const apply = useApply();
  return useMutation({
    mutationFn: ({ ongoingTripId, pin }: { ongoingTripId: string; pin: string }) => driverTripsClient.startTrip(ongoingTripId, pin),
    onSuccess: (trip) => apply(trip),
  });
}

export function useEndTripMutation() {
  const apply = useApply();
  return useMutation({
    mutationFn: (ongoingTripId: string) => driverTripsClient.endTrip(ongoingTripId),
    onSuccess: (result) => apply(result.ongoing_trip, result.currency_code),
  });
}

export function useCollectPaymentMutation() {
  const apply = useApply();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ongoingTripId: string) => driverTripsClient.collectPayment(ongoingTripId),
    onSuccess: (result) => {
      apply(result.ongoing_trip, result.currency_code);
      // D06's stat cards: the fare is now money in hand.
      void queryClient.invalidateQueries({ queryKey: driverKeys.earnings('today') });
      void queryClient.invalidateQueries({ queryKey: driverKeys.onlineTime('today') });
    },
  });
}

interface CancelArgs {
  ongoingTripId: string;
  reason: CancellationReason;
  note?: string;
}

export function useCancelDriverTripMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ongoingTripId, reason, note }: CancelArgs) => driverTripsClient.cancelTrip(ongoingTripId, reason, note),
    onSuccess: (result) => {
      dispatchDriverTrip({
        type: 'cancelled-by-me',
        ongoingTripId: result.ongoing_trip.trip_record_id,
        stage: result.stage,
        redispatched: result.redispatch_triggered,
        at: Date.now(),
      });
      void queryClient.invalidateQueries({ queryKey: driverKeys.currentTrip() });
    },
  });
}

/** Readable text for D09's action errors (codes from driver-request-handler). */
export function tripActionError(error: unknown): string | null {
  if (!error) return null;
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  switch (error.code) {
    case 'invalid_start_pin':
      return error.status === 403
        ? 'That PIN doesn’t match — ask the rider to read it again.'
        : 'The PIN is 4 digits.';
    case 'trip_not_startable':
      return 'This trip can’t be started any more.';
    case 'trip_not_endable':
      return 'This trip isn’t in progress.';
    case 'trip_not_collectable':
      return 'End the trip before collecting cash.';
    case 'trip_already_cancelled':
      return 'This trip was already cancelled.';
    case 'trip_not_cancellable':
      return 'This trip can’t be cancelled any more.';
    default:
      return error.message;
  }
}
