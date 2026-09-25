import { create } from 'zustand';

// A short, human-readable status the tab shows on the simulator ("online",
// "2 offers", "on trip" …). Screens/runtimes set it; presence heartbeats carry it.

interface ActivityState {
  activity: string | null;
  setActivity: (activity: string | null) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activity: null,
  setActivity: (activity) => set({ activity }),
}));
