import { useEffect } from 'react';
import { create } from 'zustand';

import { sessionStores } from '../session/session-store';
import { getTabId } from '../tab/tab-identity';
import type { Role, WsState } from '../tab/types';
import { RealtimeClient } from './realtime-client';

// The tab's websocket lives here so any screen can subscribe to messages without
// owning the connection. The rider/driver layout mounts useRealtimeConnection once.

const PATHS: Record<Role, string> = {
  rider: '/api/v1/ws/rider',
  driver: '/api/v1/ws/driver',
};

interface RealtimeState {
  client: RealtimeClient | null;
  wsState: WsState;
}

export const useRealtimeStore = create<RealtimeState>(() => ({
  client: null,
  wsState: 'idle',
}));

/** Keeps a websocket open for `role` while that role has a session in this tab. */
export function useRealtimeConnection(role: Role): void {
  const token = sessionStores[role]((s) => s.token);

  useEffect(() => {
    if (!token) return;
    const client = new RealtimeClient({
      path: PATHS[role],
      token,
      deviceId: getTabId(),
      onStateChange: (wsState) => useRealtimeStore.setState({ wsState }),
    });
    useRealtimeStore.setState({ client });
    client.connect();
    return () => {
      client.disconnect();
      useRealtimeStore.setState({ client: null, wsState: 'idle' });
    };
  }, [role, token]);
}
