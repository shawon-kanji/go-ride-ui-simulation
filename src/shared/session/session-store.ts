import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { decodeJwtExpiryMs } from '../lib/jwt';
import { tabStorage } from '../lib/storage';
import type { Role } from '../tab/types';

// One session per role per tab. Stored in sessionStorage, so:
//   - each tab can be signed in as a different rider/driver in the same browser,
//   - a reload keeps the tab signed in,
//   - closing the tab ends the session.
// The mobile apps keep the token in the device keystore instead; everything else about
// the session (60-minute JWT, no refresh, 401 clears it) is the same.

export interface SessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface StoredSession {
  token: string;
  user: SessionUser;
}

export interface SessionState {
  token: string | null;
  tokenExpiresAt: number | null;
  user: SessionUser | null;
  sessionExpiredReason: string | null;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: (reason?: string) => void;
  consumeSessionExpiredReason: () => string | null;
}

export type SessionStore = UseBoundStore<StoreApi<SessionState>>;

export const SESSION_ENDED_MESSAGE = 'Your session ended. Please log in again.';

export function sessionStorageKey(role: Role): string {
  return `goride:session:${role}`;
}

export function createSessionStore(role: Role): SessionStore {
  const key = sessionStorageKey(role);

  // sessionStorage is synchronous, so hydrate at creation — no 'unknown' boot state.
  const stored = tabStorage.getJson<StoredSession>(key);
  const storedExpiry = stored ? decodeJwtExpiryMs(stored.token) : null;
  const storedIsLive = !!stored && !!storedExpiry && storedExpiry > Date.now();
  if (stored && !storedIsLive) tabStorage.remove(key);

  return create<SessionState>((set, get) => ({
    token: storedIsLive ? stored.token : null,
    tokenExpiresAt: storedIsLive ? storedExpiry : null,
    user: storedIsLive ? stored.user : null,
    sessionExpiredReason: stored && !storedIsLive ? SESSION_ENDED_MESSAGE : null,

    setSession: (token, user) => {
      const summary: SessionUser = {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      };
      tabStorage.setJson(key, { token, user: summary } satisfies StoredSession);
      set({
        token,
        tokenExpiresAt: decodeJwtExpiryMs(token),
        user: summary,
        sessionExpiredReason: null,
      });
    },

    clearSession: (reason) => {
      tabStorage.remove(key);
      set({
        token: null,
        tokenExpiresAt: null,
        user: null,
        sessionExpiredReason: reason ?? get().sessionExpiredReason,
      });
    },

    consumeSessionExpiredReason: () => {
      const reason = get().sessionExpiredReason;
      if (reason) set({ sessionExpiredReason: null });
      return reason;
    },
  }));
}

export const useRiderSession = createSessionStore('rider');
export const useDriverSession = createSessionStore('driver');

export const sessionStores: Record<Role, SessionStore> = {
  rider: useRiderSession,
  driver: useDriverSession,
};
