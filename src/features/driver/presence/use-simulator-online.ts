import { useEffect } from 'react';

import { ApiError } from '../../../shared/api/http-client';
import { logEvent } from '../../../shared/devlog/devlog-store';
import { useLocationStore } from '../../../shared/location/location-store';
import { postBus, subscribeBus } from '../../../shared/tab/bus';
import { getTabId } from '../../../shared/tab/tab-identity';
import { useSetOnlineMutation } from '../api/queries';
import { kycBlockReason } from '../kyc/kyc-errors';
import { isActiveDriverPhase } from '../trip/trip-model';
import { useDriverTripStore } from '../trip/trip-store';

// The simulator's "Go online / offline" for every driver tab (quick setup). The tab does what
// its own D07 button does — needs a location, then PATCH /driver/online with its own token —
// and answers with the outcome. Going offline mid-trip is refused, as the home screen can't
// be reached then either.

function reasonFor(error: unknown): string {
  const kyc = kycBlockReason(error);
  if (kyc === 'identity') return 'KYC not approved';
  if (kyc === 'vehicle') return 'vehicle documents not approved';
  if (error instanceof ApiError) return error.message || error.code;
  return 'request failed';
}

export function useSimulatorOnlineRequests(): void {
  const { mutateAsync: setOnline } = useSetOnlineMutation();

  useEffect(
    () =>
      subscribeBus((message) => {
        if (message.type !== 'set-online' || message.tabId !== getTabId()) return;
        const answer = (ok: boolean, reason?: string) =>
          postBus({ type: 'set-online-result', tabId: message.tabId, online: message.online, ok, reason });

        if (message.online && !useLocationStore.getState().position) {
          answer(false, 'no location — place it first');
          return;
        }
        if (!message.online && isActiveDriverPhase(useDriverTripStore.getState().trip?.phase)) {
          answer(false, 'on a trip');
          return;
        }
        logEvent('state', `simulator asked to go ${message.online ? 'online' : 'offline'}`);
        setOnline(message.online).then(
          () => answer(true),
          (error: unknown) => answer(false, reasonFor(error)),
        );
      }),
    [setOnline],
  );
}
