import { useEffect } from 'react';
import { create } from 'zustand';

import { postBus, subscribeBus } from '../../shared/tab/bus';
import type { TabPresence } from '../../shared/tab/types';

// The simulator's view of every open rider/driver tab, built only from bus messages.

export const STALE_AFTER_MS = 6_000;

export type RegisteredTab = TabPresence & { lastSeen: number };

/** Short on-map name: first name, or role + short tab id for a signed-out tab. */
export function actorLabel(tab: RegisteredTab): string {
  if (tab.name) return tab.name.split(' ')[0];
  return `${tab.role ?? 'tab'} ${tab.tabId.slice(0, 4)}`;
}

/** Ids of tabs that haven't announced themselves for a while, as one comparable string. */
export function staleKeyOf(tabs: Iterable<RegisteredTab>, now: number): string {
  return [...tabs]
    .filter((tab) => now - tab.lastSeen > STALE_AFTER_MS)
    .map((tab) => tab.tabId)
    .sort()
    .join(',');
}

/** Signed-in driver tabs that are still announcing themselves. */
export function liveDrivers(): RegisteredTab[] {
  const now = Date.now();
  return Object.values(useTabRegistry.getState().tabs).filter(
    (t) => t.role === 'driver' && t.email && now - t.lastSeen <= STALE_AFTER_MS,
  );
}

interface TabRegistryState {
  tabs: Record<string, RegisteredTab>;
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
