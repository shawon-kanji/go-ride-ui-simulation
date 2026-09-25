import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiError } from '../../../shared/api/http-client';
import { logEvent } from '../../../shared/devlog/devlog-store';
import { driverTripsClient } from '../api/clients';
import { driverKeys } from '../api/queries';
import type { CurrentTripResponse } from '../api/types';
import { useOfferStore } from './offer-store';

// Accept is plain HTTP (first-wins is decided by driver-request-handler under a row
// lock); the websocket only tells the losers afterwards via offer_withdrawn.
//   200 → this driver won: drop the other cards, open the trip
//   409 offer_not_winnable → someone else won, or the TTL passed
//   404 offer_not_found    → gone

export function useAcceptOffer() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const accept = async (jobOfferId: string) => {
    const store = useOfferStore.getState();
    const card = store.offers[jobOfferId];
    if (!card || card.state !== 'live') return;

    setError(null);
    store.setState(jobOfferId, 'accepting');
    try {
      const result = await driverTripsClient.acceptOffer(jobOfferId);
      useOfferStore.getState().setState(jobOfferId, 'accepted');
      logEvent('state', `accepted offer ${jobOfferId.slice(0, 8)} → trip ${result.ongoing_trip.trip_id.slice(0, 8)}`);
      queryClient.setQueryData<CurrentTripResponse>(driverKeys.currentTrip(), {
        driver_id: result.ongoing_trip.driver_id,
        has_ongoing_trip: true,
        ongoing_trip: result.ongoing_trip,
        trip_request: result.trip_request,
      });
      // One trip at a time: the other offers are moot now.
      useOfferStore.getState().clear();
      navigate('/driver/trip');
    } catch (err) {
      const latest = useOfferStore.getState();
      if (err instanceof ApiError && err.status === 409) {
        const expired = Date.parse(card.offer.expires_at) <= Date.now();
        latest.setState(jobOfferId, expired ? 'expired' : 'taken');
      } else if (err instanceof ApiError && err.status === 404) {
        latest.setState(jobOfferId, 'expired');
      } else {
        latest.setState(jobOfferId, 'live');
        setError(err instanceof ApiError ? err.message : "Couldn't accept the offer. Try again.");
      }
    }
  };

  return { accept, error, clearError: () => setError(null) };
}
