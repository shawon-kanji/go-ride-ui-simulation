import { tabStorage } from '../lib/storage';

// A tabId names one simulated device. It is used as the websocket `device_id` (the
// gateway keys connections user_id → device_id, so two tabs signed in as the same
// driver don't replace each other) and as the tab's address on the simulator bus.
// It lives in sessionStorage so a reload keeps the same device.

const TAB_ID_KEY = 'goride:tab-id';

let current: string | null = null;

export function getTabId(): string {
  if (current) return current;
  const stored = tabStorage.get(TAB_ID_KEY);
  if (stored) {
    current = stored;
    return stored;
  }
  return regenerateTabId();
}

export function regenerateTabId(): string {
  current = crypto.randomUUID();
  tabStorage.set(TAB_ID_KEY, current);
  return current;
}

/** Short form for labels and logs. */
export function shortTabId(tabId: string = getTabId()): string {
  return tabId.slice(0, 4);
}
