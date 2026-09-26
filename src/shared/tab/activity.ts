import { create } from 'zustand';

import type { TripMarker } from './types';

// What the tab shows the simulator besides its position: a short, human-readable
// status ("online", "2 offers", "searching" …) and, for a rider with a live trip, the
// trip's pins. Screens/runtimes set these; presence heartbeats carry them.

interface ActivityState {
  activity: string | null;
  trip: TripMarker | null;
  setActivity: (activity: string | null) => void;
  setTrip: (trip: TripMarker | null) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activity: null,
  trip: null,
  setActivity: (activity) => set({ activity }),
  setTrip: (trip) => set({ trip }),
}));
