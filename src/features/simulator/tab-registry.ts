import { useEffect } from 'react';
import { create } from 'zustand';

import { postBus, subscribeBus } from '../../shared/tab/bus';
import type { TabPresence } from '../../shared/tab/types';

// The simulator's view of every open rider/driver tab, built only from bus messages.

export const STALE_AFTER_MS = 6_000;

interface TabRegistryState {
  tabs: Record<string, TabPresence & { lastSeen: number }>;
}

export const useTabRegistry = create<TabRegistryState>(() => ({ tabs: {} }));

/** Mount once on the simulator page: listens to the bus and asks tabs to announce. */
export function useTabRegistryFeed(): void {
  useEffect(() => {
    const unsubscribe = subscribeBus((message) => {
      if (message.type === 'presence') {
        useTabRegistry.setState((state) => ({
          tabs: { ...state.tabs, [message.presence.tabId]: { ...message.presence, lastSeen: Date.now() } },
        }));
      } else if (message.type === 'bye') {
        useTabRegistry.setState((state) => {
          const tabs = { ...state.tabs };
          delete tabs[message.tabId];
          return { tabs };
        });
      }
    });
    postBus({ type: 'whois' });
    return unsubscribe;
  }, []);
}
