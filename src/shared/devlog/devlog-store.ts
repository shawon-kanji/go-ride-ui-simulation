import { create } from 'zustand';

import { postBus } from '../tab/bus';
import { getTabId } from '../tab/tab-identity';
import type { DevLogEntry, DevLogKind, Role } from '../tab/types';

// Every HTTP call, websocket frame and state change in this tab is recorded here for
// the dev panel, and mirrored onto the bus so the simulator can build a merged timeline.

const MAX_ENTRIES = 300;
const SECRET_KEYS = new Set(['password', 'old_password', 'new_password', 'access_token', 'token']);

let currentRole: Role | null = null;

/** Set by the rider/driver layouts so log entries carry the tab's role. */
export function setLogRole(role: Role | null): void {
  currentRole = role;
}

interface DevLogState {
  entries: DevLogEntry[];
  clear: () => void;
}

export const useDevLogStore = create<DevLogState>((set) => ({
  entries: [],
  clear: () => set({ entries: [] }),
}));

export function logEvent(kind: DevLogKind, summary: string, data?: unknown): void {
  const entry: DevLogEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    tabId: getTabId(),
    role: currentRole,
    kind,
    summary,
    data: data === undefined ? undefined : redact(data),
  };
  useDevLogStore.setState((state) => ({
    entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
  }));
  postBus({ type: 'log', entry });
}

/** Deep-copies `value`, replacing secret-looking fields so logs are safe to show. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SECRET_KEYS.has(key) && typeof inner === 'string' ? maskSecret(inner) : redact(inner),
      ]),
    );
  }
  return value;
}

function maskSecret(secret: string): string {
  return secret.length > 12 ? `${secret.slice(0, 6)}…(${secret.length})` : '••••';
}

/** Strips the `token` query param from a websocket URL before it is logged. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]+/, '$1••••');
}
