import { useCallback, useEffect, useRef, useState } from 'react';

import { postBus, subscribeBus } from '../../../shared/tab/bus';
import { getTabId } from '../../../shared/tab/tab-identity';
import type { NavLeg } from '../../../shared/tab/types';

// D09's Navigate button: ask the simulator to drive this tab along the current leg. The
// simulator answers straight away; no answer means no simulator is open.

const ACK_TIMEOUT_MS = 1_500;

type DriveRequestState = { status: 'idle' | 'waiting' | 'accepted' } | { status: 'failed'; message: string };

export function useDriveRequest() {
  const [state, setState] = useState<DriveRequestState>({ status: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = subscribeBus((message) => {
      if (message.type !== 'drive-ack' || message.tabId !== getTabId()) return;
      clearTimeout(timer.current);
      setState(
        message.ok
          ? { status: 'accepted' }
          : { status: 'failed', message: message.reason ?? 'The simulator couldn’t drive this trip.' },
      );
    });
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, []);

  const request = useCallback((requestId: string, leg: NavLeg) => {
    setState({ status: 'waiting' });
    postBus({ type: 'drive-request', tabId: getTabId(), requestId, leg });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState({ status: 'failed', message: 'Open the simulator to drive.' }), ACK_TIMEOUT_MS);
  }, []);

  return { state, request };
}
