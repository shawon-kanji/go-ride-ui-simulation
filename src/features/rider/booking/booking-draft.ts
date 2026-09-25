import { create } from 'zustand';

import { tabStorage } from '../../../shared/lib/storage';
import type { TripPlace } from '../trip/trip-model';

// What the rider has picked so far in R01 → R02 → R03. Kept per tab so a reload in
// the middle of booking stays on the same screen with the same places.

const STORAGE_KEY = 'goride:booking-draft';

export interface DraftPlace extends TripPlace {
  /** Second line under the label, e.g. the rest of the address. */
  detail?: string;
}

interface BookingDraft {
  dropoff: DraftPlace | null;
  pickup: DraftPlace | null;
}

interface BookingDraftState extends BookingDraft {
  setDropoff: (place: DraftPlace) => void;
  setPickup: (place: DraftPlace) => void;
  reset: () => void;
}

const stored = tabStorage.getJson<BookingDraft>(STORAGE_KEY);

export const useBookingDraft = create<BookingDraftState>((set, get) => {
  const persist = () => tabStorage.setJson(STORAGE_KEY, { dropoff: get().dropoff, pickup: get().pickup });
  return {
    dropoff: stored?.dropoff ?? null,
    pickup: stored?.pickup ?? null,
    setDropoff: (dropoff) => {
      set({ dropoff });
      persist();
    },
    setPickup: (pickup) => {
      set({ pickup });
      persist();
    },
    reset: () => {
      set({ dropoff: null, pickup: null });
      tabStorage.remove(STORAGE_KEY);
    },
  };
});
