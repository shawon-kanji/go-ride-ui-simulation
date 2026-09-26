import { create } from 'zustand';

import { logEvent } from '../../../shared/devlog/devlog-store';
import { tabStorage } from '../../../shared/lib/storage';
import { sessionStores } from '../../../shared/session/session-store';
import { reduceDriverTrip, type DriverTrip, type DriverTripEvent } from './trip-model';

// The driver tab's trip, kept in sessionStorage: current-trip has no rider name, so a
// reload would otherwise lose it.

const STORAGE_KEY = 'goride:driver-trip';

interface DriverTripStoreState {
  trip: DriverTrip | null;
  dispatch: (event: DriverTripEvent) => void;
}

export const useDriverTripStore = create<DriverTripStoreState>((set, get) => ({
  trip: tabStorage.getJson<DriverTrip>(STORAGE_KEY),

  dispatch: (event) => {
    const before = get().trip;
    const after = reduceDriverTrip(before, event);
    if (after === before) return;
    set({ trip: after });
    if (after) tabStorage.setJson(STORAGE_KEY, after);
    else tabStorage.remove(STORAGE_KEY);
    if (before?.phase !== after?.phase || before?.ongoingTripId !== after?.ongoingTripId) {
      logEvent('state', `trip ${before?.phase ?? 'none'} → ${after?.phase ?? 'none'}`, after);
    }
  },
}));

export const dispatchDriverTrip = (event: DriverTripEvent) => useDriverTripStore.getState().dispatch(event);

// The trip belongs to whoever is signed in to this tab.
sessionStores.driver.subscribe((state, prev) => {
  if (prev.token && !state.token) dispatchDriverTrip({ type: 'clear' });
});
