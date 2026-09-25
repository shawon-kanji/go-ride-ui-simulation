import { create } from 'zustand';

import { logEvent } from '../../../shared/devlog/devlog-store';
import { tabStorage } from '../../../shared/lib/storage';
import { reduceTrip, type RiderTrip, type TripEvent } from './trip-model';

// The rider tab's trip, kept in sessionStorage: ride_assigned is pushed once and never
// replayed, so a reload would otherwise lose the driver's name, vehicle and plate.

const STORAGE_KEY = 'goride:rider-trip';

interface TripStoreState {
  trip: RiderTrip | null;
  dispatch: (event: TripEvent) => void;
}

export const useTripStore = create<TripStoreState>((set, get) => ({
  trip: tabStorage.getJson<RiderTrip>(STORAGE_KEY),

  dispatch: (event) => {
    const before = get().trip;
    const after = reduceTrip(before, event);
    if (after === before) return;
    set({ trip: after });
    if (after) tabStorage.setJson(STORAGE_KEY, after);
    else tabStorage.remove(STORAGE_KEY);
    if (before?.phase !== after?.phase || before?.requestId !== after?.requestId) {
      logEvent('state', `trip ${before?.phase ?? 'none'} → ${after?.phase ?? 'none'}`, after);
    }
  },
}));

export const dispatchTrip = (event: TripEvent) => useTripStore.getState().dispatch(event);
