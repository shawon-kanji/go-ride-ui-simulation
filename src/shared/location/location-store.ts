import { create } from 'zustand';

import { logEvent } from '../devlog/devlog-store';
import { tabStorage } from '../lib/storage';

// The tab's "GPS". Screens read the position from here and never call geolocation
// directly, so the simulator can move a tab around. Two sources:
//   - simulated (default): positions arrive from the simulator over the bus
//   - browser: navigator.geolocation.watchPosition
// Source and last simulated fix are kept in sessionStorage so a reload stays put.

export type LocationSource = 'simulated' | 'browser';

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Metres; browser fixes only. */
  accuracyM?: number;
}

interface StoredLocation {
  source: LocationSource;
  simulated: GeoPoint | null;
}

interface LocationState {
  source: LocationSource;
  position: GeoPoint | null;
  updatedAt: number | null;
  /** Last simulated fix, restored when switching back from the browser source. */
  simulated: GeoPoint | null;
  browserError: string | null;
  setSource: (source: LocationSource) => void;
  applySimulated: (point: GeoPoint) => void;
  applyBrowserFix: (point: GeoPoint) => void;
  setBrowserError: (message: string | null) => void;
}

const STORAGE_KEY = 'goride:location';

function persist(state: Pick<LocationState, 'source' | 'simulated'>): void {
  tabStorage.setJson(STORAGE_KEY, { source: state.source, simulated: state.simulated } satisfies StoredLocation);
}

export function formatPoint(point: GeoPoint): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

export function createLocationStore() {
  const stored = tabStorage.getJson<StoredLocation>(STORAGE_KEY);
  const source = stored?.source ?? 'simulated';
  const simulated = stored?.simulated ?? null;

  return create<LocationState>((set, get) => ({
    source,
    simulated,
    position: source === 'simulated' ? simulated : null,
    updatedAt: source === 'simulated' && simulated ? Date.now() : null,
    browserError: null,

    setSource: (next) => {
      if (next === get().source) return;
      const { simulated: lastSimulated } = get();
      set({
        source: next,
        position: next === 'simulated' ? lastSimulated : null,
        updatedAt: next === 'simulated' && lastSimulated ? Date.now() : null,
        browserError: null,
      });
      persist(get());
      logEvent('location', `source → ${next}`);
    },

    applySimulated: (point) => {
      set({ simulated: point });
      if (get().source === 'simulated') {
        set({ position: point, updatedAt: Date.now() });
        logEvent('location', `simulated ${formatPoint(point)}`, point);
      }
      persist(get());
    },

    applyBrowserFix: (point) => {
      if (get().source !== 'browser') return;
      set({ position: point, updatedAt: Date.now(), browserError: null });
      logEvent('location', `browser ${formatPoint(point)} ±${Math.round(point.accuracyM ?? 0)}m`, point);
    },

    setBrowserError: (message) => set({ browserError: message }),
  }));
}

export const useLocationStore = createLocationStore();
